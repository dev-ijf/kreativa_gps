import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

loadEnvFile();

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || '';
}

function shouldUseSsl(connectionString = '') {
  const host = process.env.PGHOST || '';
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
  const config = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  };
  if (shouldUseSsl()) config.ssl = { rejectUnauthorized: false };
  return config;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const pool = new Pool(createPoolConfig());

const admins = [
  {
    username: 'superadmin',
    email: 'superadmin@kreativaglobal.sch.id',
    password: 'Admin@GPS2026!',
    name: 'Super Admin',
    role: 'superadmin'
  },
  {
    username: 'admin',
    email: 'admin@kreativaglobal.sch.id',
    password: 'Admin@GPS2026!',
    name: 'Admin GPS',
    role: 'admin'
  }
];

try {
  for (const admin of admins) {
    const passwordHash = hashPassword(admin.password);
    await pool.query(
      `INSERT INTO admins (username, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE
         SET email = EXCLUDED.email,
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             updated_at = NOW()`,
      [admin.username, admin.email, passwordHash, admin.name, admin.role]
    );
    console.log(`  ✓ Seeded admin: ${admin.username} (${admin.role})`);
  }
  console.log('\nSeeding complete.');
} finally {
  await pool.end();
}
