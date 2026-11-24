/**
 * Public endpoints that don't need an account:
 *
 *   POST /api/contact   — contact form; saves the message to Postgres.
 *   POST /api/event     — privacy-friendly page-view counter (see below).
 *   GET  /api/analytics-config — tells the browser which analytics to load.
 *
 * Admin reads live in server/admin-api.mjs.
 *
 * When PostHog is configured (server/posthog.mjs), the browser sends events
 * there instead and /api/event is unused. Otherwise, the built-in counter: the browser sends only the page path (no query string or
 * hash) and, on the first page of a visit, the referring site's hostname. The
 * server adds one to a per-day counter for that (path, referrer) pair. Nothing
 * that identifies a person is stored: no cookies, IP addresses, user agents,
 * or per-visit rows. Visitors who send Do Not Track or Global Privacy Control
 * aren't counted at all.
 */

import express from 'express';
import { db } from './db.mjs';
import { posthog, collectionEnabled } from './posthog.mjs';
import { notify, notifyConfig } from './notify.mjs';

export const publicApiRouter = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CONTACT_TYPES = ['incorrect-listing', 'suggest', 'help', 'accessibility', 'other'];
const CONTACT_TYPE_LABELS = {
  'incorrect-listing': 'Incorrect listing',
  suggest: 'Suggest a resource',
  help: 'Help finding services',
  accessibility: 'Accessibility issue',
  other: 'Other',
};
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
  void notify('adminContactMessage', notifyConfig.adminEmails, { name, email, type: CONTACT_TYPE_LABELS[type] ?? type, message });
}));

// ── analytics ──────────────────────────────────────────────────────────────

publicApiRouter.get('/analytics-config', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  if (collectionEnabled()) {
    return res.json({ provider: 'posthog', key: posthog.projectKey, apiHost: '/ingest', uiHost: posthog.appHost });
  }
  res.json({ provider: 'builtin' });
});

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

publicApiRouter.use((err, _req, res, _next) => {
  console.error('[public-api]', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
