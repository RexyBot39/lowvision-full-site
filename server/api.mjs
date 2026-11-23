import express from 'express';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.mjs';

const scrypt = promisify(scryptCb);
const COOKIE = 'lvn_session';
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '100kb' }));

// ── helpers ────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(key, expected);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

async function createSession(res, req, userId) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId],
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

// Simple in-memory rate limiter for auth endpoints (per IP).
const attempts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = attempts.get(req.ip) ?? { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count += 1;
  attempts.set(req.ip, entry);
  if (entry.count > 20) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  next();
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [ip, e] of attempts) if (e.start < cutoff) attempts.delete(ip);
}, 60 * 1000).unref();

// ── middleware ─────────────────────────────────────────────────────────────

// Accounts need the database.
apiRouter.use((req, res, next) => {
  if (!db && req.path !== '/auth/me') {
    return res.status(503).json({ error: 'Accounts are not available right now.' });
  }
  next();
});

// CSRF: state-changing requests must be JSON (cross-site forms can't send that
// without a CORS preflight, which we never approve). The cookie is also SameSite=Lax.
apiRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Expected application/json' });
  }
  next();
});

async function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token && db) {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    req.user = rows[0] ?? null;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

apiRouter.use(wrap(loadUser));

// ── auth ───────────────────────────────────────────────────────────────────

apiRouter.get('/auth/me', (req, res) => {
  res.json({ configured: !!db, user: req.user ? publicUser(req.user) : null });
});

apiRouter.post('/auth/signup', rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  const password = String(req.body?.password ?? '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });

  const hash = await hashPassword(password);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, name`,
    [email, name, hash],
  );
  if (!rows[0]) return res.status(409).json({ error: 'An account with this email already exists.' });
  await createSession(res, req, rows[0].id);
  res.status(201).json({ user: publicUser(rows[0]) });
}));

apiRouter.post('/auth/login', rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const { rows } = await db.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  await createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
}));

apiRouter.post('/auth/logout', wrap(async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

// ── saved plan ─────────────────────────────────────────────────────────────

apiRouter.get('/plan', requireUser, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT data, updated_at FROM plans WHERE user_id = $1', [req.user.id]);
  res.json({ plan: rows[0]?.data ?? null, updatedAt: rows[0]?.updated_at ?? null });
}));

apiRouter.put('/plan', requireUser, wrap(async (req, res) => {
  const plan = req.body?.plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  await db.query(
    `INSERT INTO plans (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [req.user.id, plan],
  );
  res.json({ ok: true });
}));

apiRouter.delete('/plan', requireUser, wrap(async (req, res) => {
  await db.query('DELETE FROM plans WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));

apiRouter.use((_req, res) => res.status(404).json({ error: 'Not found' }));

apiRouter.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
