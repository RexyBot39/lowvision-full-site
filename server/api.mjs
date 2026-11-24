import express from 'express';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.mjs';
import { notify, notifyEnabled } from './notify.mjs';

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
  const [scheme, saltHex, keyHex] = String(stored ?? '').split('$');
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

/** Accounts whose email is listed in ADMIN_EMAILS (comma-separated) can open /admin. */
export function isAdminEmail(email) {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && admins.includes(String(email).toLowerCase());
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, isAdmin: isAdminEmail(u.email) });

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

export async function loadUser(req, _res, next) {
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
  res.json({
    configured: !!db,
    user: req.user ? publicUser(req.user) : null,
    providers: { google: googleEnabled() },
    passwordResetByEmail: notifyEnabled(),
  });
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


// ── forgot / reset password ────────────────────────────────────────────────

const RESET_MINUTES = 60;
const resetRequests = new Map(); // email -> { n, start }: at most 3 emails an hour per address
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, e] of resetRequests) if (e.start < cutoff) resetRequests.delete(k);
}, 10 * 60 * 1000).unref();

const siteUrl = () =>
  (process.env.SITE_URL || `https://${process.env.CANONICAL_HOST || 'lowvisionnavigator.org'}`).replace(/\/+$/, '');

apiRouter.post('/auth/forgot', rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  // Same answer whether or not the account exists, so this can't be used to find out who has one.
  res.json({ ok: true, emailEnabled: notifyEnabled() });

  const now = Date.now();
  const e = resetRequests.get(email) ?? { n: 0, start: now };
  if (now - e.start > 60 * 60 * 1000) { e.n = 0; e.start = now; }
  e.n += 1;
  resetRequests.set(email, e);
  if (e.n > 3) return;

  try {
    const { rows } = await db.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return;
    if (!notifyEnabled()) {
      console.warn('[auth] Password reset requested, but email notifications are off.');
      return;
    }
    const token = randomBytes(32).toString('base64url');
    await db.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await db.query(
      `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${RESET_MINUTES} minutes')`,
      [sha256(token), user.id],
    );
    await notify('passwordReset', user.email, {
      name: user.name,
      link: `${siteUrl()}/reset-password?token=${token}`,
      minutes: RESET_MINUTES,
    });
  } catch (err) {
    console.error('[auth] password reset request failed', err);
  }
}));

apiRouter.post('/auth/reset', rateLimit, wrap(async (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });
  const invalid = () => res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  if (!token || token.length > 100) return invalid();

  // Claim the token atomically so it can only be used once.
  const { rows } = await db.query(
    `UPDATE password_resets SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sha256(token)],
  );
  if (!rows[0]) return invalid();
  const userId = rows[0].user_id;
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId]);
  // Sign out everywhere else, then sign in here.
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await createSession(res, req, userId);
  const { rows: u } = await db.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
  res.json({ user: publicUser(u[0]) });
}));

// ── sign in with Google (OpenID Connect, authorization code + PKCE) ────────

const GOOGLE_CLIENT_ID = () => (process.env.GOOGLE_CLIENT_ID ?? '').trim();
const GOOGLE_CLIENT_SECRET = () => (process.env.GOOGLE_CLIENT_SECRET ?? '').trim();
export const googleEnabled = () => !!(db && GOOGLE_CLIENT_ID() && GOOGLE_CLIENT_SECRET());
const OAUTH_COOKIE = 'lvn_oauth';
// Overridable only so the flow can be tested against a mock; leave unset in production.
const GOOGLE_AUTH_URL = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const OAUTH_COOKIE_PATH = '/api/auth/google';

/** Only same-site paths, never "//host" or "/\host". */
const safeRedirect = (v) => {
  const s = String(v ?? '');
  return /^\/(?![/\\])/.test(s) && !/[\r\n]/.test(s) ? s : '/';
};
const googleRedirectUri = (req) =>
  (process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`).trim();
const loginError = (res, code, redirectTo = '/') =>
  res.redirect(303, `/login?error=${code}&redirectTo=${encodeURIComponent(redirectTo)}`);

apiRouter.get('/auth/google/start', (req, res) => {
  const redirectTo = safeRedirect(req.query.redirectTo);
  if (!googleEnabled()) return loginError(res, 'google_unavailable', redirectTo);
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, verifier, redirectTo })).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax', // sent on Google's top-level redirect back to us
    secure: req.secure,
    maxAge: 10 * 60 * 1000,
    path: OAUTH_COOKIE_PATH,
  });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID(),
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  res.redirect(302, `${GOOGLE_AUTH_URL()}?${params}`);
});

apiRouter.get('/auth/google/callback', wrap(async (req, res) => {
  let saved = null;
  try {
    saved = JSON.parse(Buffer.from(readCookie(req, OAUTH_COOKIE) ?? '', 'base64url').toString());
  } catch { /* handled below */ }
  res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
  const redirectTo = safeRedirect(saved?.redirectTo);

  if (req.query.error) return loginError(res, 'google_cancelled', redirectTo);
  if (!googleEnabled()) return loginError(res, 'google_unavailable', redirectTo);
  if (!saved?.state || typeof req.query.state !== 'string' || req.query.state !== saved.state || typeof req.query.code !== 'string') {
    return loginError(res, 'google_failed', redirectTo);
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: GOOGLE_CLIENT_ID(),
        client_secret: GOOGLE_CLIENT_SECRET(),
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.id_token) throw new Error(`token exchange failed: ${tokenRes.status} ${tokens.error ?? ''}`);

    // The ID token came straight from Google's token endpoint over TLS with our
    // client secret, so checking its claims (not its signature) is sufficient.
    const claims = JSON.parse(Buffer.from(String(tokens.id_token).split('.')[1] ?? '', 'base64url').toString());
    const issuerOk = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
    if (!issuerOk || claims.aud !== GOOGLE_CLIENT_ID() || !claims.sub || Number(claims.exp) * 1000 < Date.now()) {
      throw new Error('invalid ID token claims');
    }
    if (claims.email_verified !== true || !EMAIL_RE.test(String(claims.email ?? ''))) {
      return loginError(res, 'google_unverified', redirectTo);
    }
    const email = String(claims.email).toLowerCase();
    const name = String(claims.name || email.split('@')[0]).slice(0, 100);

    // Same Google account → same user. Otherwise link to an existing account with
    // the same (Google-verified) email, or create a new account.
    let { rows } = await db.query('SELECT id FROM users WHERE google_sub = $1', [claims.sub]);
    if (!rows[0]) {
      ({ rows } = await db.query(
        'UPDATE users SET google_sub = $1 WHERE email = $2 AND google_sub IS NULL RETURNING id',
        [claims.sub, email],
      ));
    }
    if (!rows[0]) {
      ({ rows } = await db.query(
        // "!google" is not a valid password hash, so password sign-in stays off
        // until the person sets one with "Forgot password?".
        `INSERT INTO users (email, name, password_hash, google_sub) VALUES ($1, $2, '!google', $3)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [email, name, claims.sub],
      ));
    }
    if (!rows[0]) return loginError(res, 'google_conflict', redirectTo);
    await createSession(res, req, rows[0].id);
    res.redirect(303, redirectTo);
  } catch (err) {
    console.error('[auth] Google sign-in failed:', err.message);
    loginError(res, 'google_failed', redirectTo);
  }
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
