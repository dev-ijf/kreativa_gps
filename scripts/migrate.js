import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

loadEnvFile();

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
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

  if (!process.env.PGHOST && !process.env.PGDATABASE) {
    throw new Error('Database connection is required to run migrations.');
  }

  const config = {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || 5432),
    database: process.env.PGDATABASE || process.env.POSTGRES_DATABASE,
    user: process.env.PGUSER || process.env.POSTGRES_USER,
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD
  };

  if (shouldUseSsl()) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

const migrationPath = process.argv[2] || 'db/migrations/20260526_vercel_neon_storage.postgres.sql';
const sql = await readFile(migrationPath, 'utf8');
const pool = new Pool(createPoolConfig());

try {
  await pool.query(sql);
  console.log(`Migration applied: ${migrationPath}`);
} finally {
  await pool.end();
}
