import pg from 'pg';

const url = process.env.DATABASE_URL;

export const db = url
  ? new pg.Pool({
      connectionString: url,
      // Railway's private network (postgres.railway.internal) doesn't use TLS;
      // set PGSSLMODE=require when connecting over the public proxy URL.
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    })
  : null;

export async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS plans (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contact_messages (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx ON contact_messages(created_at DESC);
    -- Privacy-friendly analytics: daily counters only. No cookies, IP addresses,
    -- user agents, or per-visit rows are ever stored.
    CREATE TABLE IF NOT EXISTS page_views (
      day      DATE NOT NULL,
      path     TEXT NOT NULL,
      referrer TEXT NOT NULL DEFAULT '',
      views    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, path, referrer)
    );
  `);
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
}
