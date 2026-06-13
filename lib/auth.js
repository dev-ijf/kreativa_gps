import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';

const SESSION_MAX_AGE = 8 * 60 * 60;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || 'change-me';
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.DATABASE_URL_UNPOOLED
    || '';
}

function shouldUseSsl(connectionString = '') {
  const host = process.env.PGHOST || process.env.POSTGRES_HOST || '';
  return process.env.PGSSLMODE === 'require'
    || connectionString.includes('sslmode=require')
    || connectionString.includes('neon.tech')
    || host.includes('neon.tech');
}

function createPoolConfig() {
  const connectionString = getDatabaseUrl();
  if (connectionString) {
    return shouldUseSsl(connectionString)
      ? { connectionString, ssl: { rejectUnauthorized: false } }
      : { connectionString };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ...(shouldUseSsl() ? { ssl: { rejectUnauthorized: false } } : {})
  };
}

function getPool() {
  if (!globalThis.__authPool) {
    globalThis.__authPool = new Pool(createPoolConfig());
  }
  return globalThis.__authPool;
}

function base64UrlEncode(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signAdminJwt(payload) {
  const secret = getSessionSecret();
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + SESSION_MAX_AGE };
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(claims);
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyAdminJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const secret = getSessionSecret();
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(body));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(part => {
    const [k, ...v] = part.split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export function getSessionFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie);
  return verifyAdminJwt(cookies.admin_session);
}

export function setSessionCookie(response, token) {
  response.setHeader('Set-Cookie',
    `admin_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`);
}

export function clearSessionCookie(response) {
  response.setHeader('Set-Cookie',
    'admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

export function requireAuth(request, response) {
  const session = getSessionFromRequest(request);
  if (!session) {
    response.statusCode = 401;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Authentication required.' }));
    return null;
  }
  return session;
}

export function getRedirectUri(request) {
  const protocol = (request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${protocol}://${host}/api/auth/callback`;
}

export function isGoogleOAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function getGoogleAuthUrl(redirectUri) {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google OAuth is not configured.');
  }

  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code, redirectUri) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return null;

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  return userRes.json();
}

export async function findAdminByEmail(email) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, username, email, name, role, is_active FROM admins WHERE LOWER(email) = $1 LIMIT 1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

export async function listAdmins(searchParams = new URLSearchParams()) {
  const pool = getPool();
  const search = (searchParams.get('search') || '').trim();
  const role = (searchParams.get('role') || '').trim();
  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length} OR name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT id, username, email, name, role, is_active, created_at, updated_at
     FROM admins
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC`,
    params
  );
  return result.rows.map(toAdminRow);
}

export async function getAdmin(id) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, username, email, name, role, is_active, created_at, updated_at
     FROM admins WHERE id::text = $1::text LIMIT 1`,
    [id]
  );
  return result.rows[0] ? toAdminRow(result.rows[0]) : null;
}

export async function createAdmin(payload) {
  const { scryptSync, randomBytes: rb } = await import('node:crypto');
  const salt = rb(16).toString('hex');
  const hash = scryptSync(payload.password.trim(), salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO admins (username, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, name, role, is_active, created_at, updated_at`,
    [
      payload.username.trim(),
      payload.email.trim(),
      passwordHash,
      payload.name.trim(),
      payload.role?.trim() || 'admin'
    ]
  );
  return toAdminRow(result.rows[0]);
}

export async function updateAdmin(id, payload) {
  const pool = getPool();
  const sets = [];
  const values = [];

  if (payload.username !== undefined) {
    values.push(payload.username.trim());
    sets.push(`username = $${values.length}`);
  }
  if (payload.email !== undefined) {
    values.push(payload.email.trim());
    sets.push(`email = $${values.length}`);
  }
  if (payload.name !== undefined) {
    values.push(payload.name.trim());
    sets.push(`name = $${values.length}`);
  }
  if (payload.password) {
    const { scryptSync, randomBytes: rb } = await import('node:crypto');
    const salt = rb(16).toString('hex');
    const hash = scryptSync(payload.password.trim(), salt, 64).toString('hex');
    values.push(`${salt}:${hash}`);
    sets.push(`password_hash = $${values.length}`);
  }
  if (payload.role !== undefined) {
    values.push(payload.role.trim());
    sets.push(`role = $${values.length}`);
  }
  if (payload.isActive !== undefined) {
    values.push(Boolean(payload.isActive));
    sets.push(`is_active = $${values.length}`);
  }

  if (!sets.length) return getAdmin(id);

  values.push(id);
  const result = await pool.query(
    `UPDATE admins SET ${sets.join(', ')}
     WHERE id::text = $${values.length}::text
     RETURNING id, username, email, name, role, is_active, created_at, updated_at`,
    values
  );
  return result.rows[0] ? toAdminRow(result.rows[0]) : null;
}

export async function deleteAdmin(id) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM admins WHERE id::text = $1::text', [id]);
  return result.rowCount > 0;
}

function toAdminRow(row) {
  return {
    id: String(row.id),
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
