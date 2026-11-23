/**
 * Public endpoints that don't need an account:
 *
 *   POST /api/contact   — contact form; saves the message to Postgres.
 *   POST /api/event     — privacy-friendly page-view counter (see below).
 *   GET  /api/admin/*   — read contact messages and analytics; requires
 *                         `Authorization: Bearer $ADMIN_TOKEN`.
 *
 * Analytics design: the browser sends only the page path (no query string or
 * hash) and, on the first page of a visit, the referring site's hostname. The
 * server adds one to a per-day counter for that (path, referrer) pair. Nothing
 * that identifies a person is stored: no cookies, IP addresses, user agents,
 * or per-visit rows. Visitors who send Do Not Track or Global Privacy Control
 * aren't counted at all.
 */

import express from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.mjs';

export const publicApiRouter = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CONTACT_TYPES = ['incorrect-listing', 'suggest', 'help', 'accessibility', 'other'];
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;
const PATH_RE = /^\/[a-z0-9\-/._~]*$/i;

const json = express.json({ limit: '20kb' });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Same CSRF rule as the account API: state-changing requests must be JSON.
function requireJson(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected application/json' });
  next();
}

// Small per-IP rate limiter (in memory; the IP is never stored anywhere else).
function makeLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, e] of hits) if (e.start < cutoff) hits.delete(k);
  }, 60 * 1000).unref();
  return (req, res, next) => {
    const now = Date.now();
    const e = hits.get(req.ip) ?? { count: 0, start: now };
    if (now - e.start > windowMs) { e.count = 0; e.start = now; }
    e.count += 1;
    hits.set(req.ip, e);
    if (e.count > max) {
      return res.status(429).json({ error: 'Too many messages. Please wait a while and try again.' });
    }
    next();
  };
}

// ── contact form ───────────────────────────────────────────────────────────

publicApiRouter.post('/contact', requireJson, makeLimiter(10, 60 * 60 * 1000), json, wrap(async (req, res) => {
  const body = req.body ?? {};
  // Honeypot: a field hidden from people. Bots fill it in; pretend success.
  if (typeof body.website === 'string' && body.website.trim()) return res.status(201).json({ ok: true });

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const type = String(body.type ?? '');
  const message = String(body.message ?? '').trim();

  const errors = {};
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'A valid email is required.';
  if (!CONTACT_TYPES.includes(type)) errors.type = 'Please select a message type.';
  if (!message) errors.message = 'Message is required.';
  else if (message.length > 5000) errors.message = 'Message must be 5,000 characters or fewer.';
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }

  if (!db) {
    return res.status(503).json({ error: 'The contact form is unavailable right now. Please try again later.' });
  }
  await db.query(
    'INSERT INTO contact_messages (name, email, type, message) VALUES ($1, $2, $3, $4)',
    [name, email, type, message],
  );
  res.status(201).json({ ok: true });
}));

// ── analytics ──────────────────────────────────────────────────────────────

function referrerHost(value, ownHost) {
  if (typeof value !== 'string' || !value) return '';
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === ownHost.replace(/^www\./, '')) return '';
    return host.slice(0, 100);
  } catch {
    return '';
  }
}

publicApiRouter.post('/event', requireJson, makeLimiter(300, 10 * 60 * 1000), json, wrap(async (req, res) => {
  res.status(204).end(); // respond first; the browser never waits on analytics
  if (!db) return;
  if (req.get('DNT') === '1' || req.get('Sec-GPC') === '1') return;
  if (BOT_RE.test(req.get('User-Agent') ?? '')) return;

  const rawPath = String(req.body?.path ?? '').split(/[?#]/)[0];
  if (!PATH_RE.test(rawPath) || rawPath.length > 200 || rawPath.startsWith('/api/')) return;
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const referrer = referrerHost(req.body?.referrer, req.hostname ?? '');

  await db.query(
    `INSERT INTO page_views (day, path, referrer, views) VALUES (CURRENT_DATE, $1, $2, 1)
     ON CONFLICT (day, path, referrer) DO UPDATE SET views = page_views.views + 1`,
    [path, referrer],
  );
}));

// ── admin (read-only) ──────────────────────────────────────────────────────

const sha256 = (s) => createHash('sha256').update(s).digest();

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const given = (req.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Compare hashes so lengths always match for timingSafeEqual.
  if (!expected || expected.length < 16 || !given || !timingSafeEqual(sha256(given), sha256(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  res.set('Cache-Control', 'no-store');
  next();
}

publicApiRouter.get('/admin/contact-messages', requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const { rows } = await db.query(
    'SELECT id, name, email, type, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  res.json({ messages: rows });
}));

publicApiRouter.get('/admin/stats', requireAdmin, wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = `CURRENT_DATE - ($1::int - 1)`;
  const [daily, pages, referrers] = await Promise.all([
    db.query(`SELECT day, SUM(views)::int AS views FROM page_views WHERE day >= ${since} GROUP BY day ORDER BY day`, [days]),
    db.query(`SELECT path, SUM(views)::int AS views FROM page_views WHERE day >= ${since} GROUP BY path ORDER BY views DESC LIMIT 50`, [days]),
    db.query(`SELECT referrer, SUM(views)::int AS views FROM page_views WHERE day >= ${since} AND referrer <> '' GROUP BY referrer ORDER BY views DESC LIMIT 25`, [days]),
  ]);
  res.json({ days, daily: daily.rows, topPages: pages.rows, topReferrers: referrers.rows });
}));

publicApiRouter.use((err, _req, res, _next) => {
  console.error('[public-api]', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
