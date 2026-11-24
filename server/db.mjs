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
    -- SEO snapshots from DataForSEO (server/seo.mjs). raw keeps the API responses.
    CREATE TABLE IF NOT EXISTS seo_snapshots (
      id            SERIAL PRIMARY KEY,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      target        TEXT NOT NULL,
      location_code INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      trigger       TEXT NOT NULL,
      cost          NUMERIC(12, 6) NOT NULL DEFAULT 0,
      summary       JSONB NOT NULL,
      data          JSONB NOT NULL,
      raw           JSONB NOT NULL,
      errors        JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS seo_snapshots_target_created_idx ON seo_snapshots(target, created_at DESC);
    -- Professional directory (server/directory-api.mjs). One listing per
    -- account. "data" is the latest submission; "published" is the version
    -- an admin approved, which is what the public sees.
    CREATE TABLE IF NOT EXISTS professional_listings (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
      data          JSONB NOT NULL,
      published     JSONB,
      owner_hidden  BOOLEAN NOT NULL DEFAULT false,
      review_note   TEXT,
      submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS professional_listings_status_idx ON professional_listings(status);
    -- Email notifications waiting to be sent through EspoCRM (server/notify.mjs).
    CREATE TABLE IF NOT EXISTS email_outbox (
      id              SERIAL PRIMARY KEY,
      kind            TEXT NOT NULL,
      to_addresses    TEXT NOT NULL,
      reply_to        TEXT,
      subject         TEXT NOT NULL,
      html            TEXT NOT NULL,
      text_body       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      crm_email_id    TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at         TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox(status, next_attempt_at);
  `);
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
}
