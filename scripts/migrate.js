import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations.');
}

const migrationPath = process.argv[2] || 'db/migrations/20260526_vercel_neon_storage.postgres.sql';
const sql = await readFile(migrationPath, 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  await pool.query(sql);
  console.log(`Migration applied: ${migrationPath}`);
} finally {
  await pool.end();
}
