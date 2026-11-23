/**
 * Admin API, mounted at /api/admin. Used by the /admin dashboard.
 *
 * Access: a signed-in account whose email is in ADMIN_EMAILS, or a request with
 * `Authorization: Bearer $ADMIN_TOKEN` (for scripts and curl).
 *
 *   GET   /api/admin/analytics?days=30       PostHog data, or the built-in counter
 *   GET   /api/admin/contact-messages?status=new|handled|all&limit=100
 *   PATCH /api/admin/contact-messages/:id    { status: "new" | "handled" }
 */

import express from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.mjs';
import { loadUser, isAdminEmail } from './api.mjs';
import { posthog, posthogOverview, reportingEnabled, collectionEnabled, TRACKED_EVENTS } from './posthog.mjs';

export const adminRouter = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => createHash('sha256').update(s).digest();

function tokenMatches(req) {
  const expected = process.env.ADMIN_TOKEN;
  const given = (req.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Compare hashes so lengths always match for timingSafeEqual.
  return !!expected && expected.length >= 16 && !!given && timingSafeEqual(sha256(given), sha256(expected));
}

adminRouter.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  next();
});
adminRouter.use(wrap(loadUser));
adminRouter.use((req, res, next) => {
  if (tokenMatches(req) || (req.user && isAdminEmail(req.user.email))) return next();
  return res.status(req.user ? 403 : 401).json({ error: req.user ? 'This account is not an admin.' : 'Not signed in' });
});

// CSRF: same rule as the account API.
adminRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Expected application/json' });
  }
  next();
});
adminRouter.use(express.json({ limit: '10kb' }));

const clampDays = (v) => Math.min(Math.max(Math.trunc(Number(v)) || 30, 1), 365);

// ── analytics ──────────────────────────────────────────────────────────────

async function builtinOverview(days) {
  const empty = { views: 0, visitors: 0 };
  if (!db) {
    return { source: 'builtin', days, generatedAt: new Date().toISOString(), totals: empty, previous: empty,
      daily: [], topPages: [], topReferrers: [], devices: [], countries: [], events: null };
  }
  const cur = `day > CURRENT_DATE - $1::int`;
  const prev = `day > CURRENT_DATE - 2 * $1::int AND day <= CURRENT_DATE - $1::int`;
  const [t, p, daily, pages, refs] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(views), 0)::int AS v FROM page_views WHERE ${cur}`, [days]),
    db.query(`SELECT COALESCE(SUM(views), 0)::int AS v FROM page_views WHERE ${prev}`, [days]),
    db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(views)::int AS views FROM page_views WHERE ${cur} GROUP BY day ORDER BY day`, [days]),
    db.query(`SELECT path AS key, SUM(views)::int AS views FROM page_views WHERE ${cur} GROUP BY path ORDER BY views DESC LIMIT 25`, [days]),
    db.query(`SELECT referrer AS key, SUM(views)::int AS views FROM page_views WHERE ${cur} AND referrer <> '' GROUP BY referrer ORDER BY views DESC LIMIT 10`, [days]),
  ]);
  // The built-in counter has no visitor identity at all, so visitors are unknown (null).
  const noVisitors = (rows) => rows.map((r) => ({ ...r, visitors: null }));
  return {
    source: 'builtin',
    days,
    generatedAt: new Date().toISOString(),
    totals: { views: t.rows[0].v, visitors: null },
    previous: { views: p.rows[0].v, visitors: null },
    daily: daily.rows.map((r) => ({ ...r, visitors: null })),
    topPages: noVisitors(pages.rows),
    topReferrers: noVisitors(refs.rows),
    devices: [],
    countries: [],
    events: null,
  };
}

adminRouter.get('/analytics', wrap(async (req, res) => {
  const days = clampDays(req.query.days);
  const status = {
    collecting: collectionEnabled() ? 'posthog' : 'builtin',
    reporting: reportingEnabled() ? 'posthog' : 'builtin',
    posthogUrl: reportingEnabled() ? `${posthog.appHost}/project/${encodeURIComponent(posthog.projectId)}` : null,
    trackedEvents: TRACKED_EVENTS,
  };
  if (reportingEnabled()) {
    try {
      return res.json({ ...(await posthogOverview(days)), status });
    } catch (err) {
      console.error('[admin] PostHog query failed', err);
      const fallback = await builtinOverview(days);
      return res.json({ ...fallback, status, warning: 'Could not reach PostHog, so this shows the built-in counter instead. Check POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY.' });
    }
  }
  res.json({ ...(await builtinOverview(days)), status });
}));

// ── contact messages ───────────────────────────────────────────────────────

adminRouter.get('/contact-messages', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const status = ['new', 'handled'].includes(req.query.status) ? req.query.status : null;
  const [{ rows }, counts] = await Promise.all([
    db.query(
      `SELECT id, name, email, type, message, status, created_at FROM contact_messages
       WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT $2`,
      [status, limit],
    ),
    db.query(`SELECT status, count(*)::int AS n FROM contact_messages GROUP BY status`),
  ]);
  const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  res.json({ messages: rows, counts: { new: byStatus.new ?? 0, handled: byStatus.handled ?? 0 } });
}));

adminRouter.patch('/contact-messages/:id', wrap(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured' });
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !['new', 'handled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { rowCount } = await db.query('UPDATE contact_messages SET status = $1 WHERE id = $2', [status, id]);
  if (!rowCount) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

adminRouter.use((_req, res) => res.status(404).json({ error: 'Not found' }));

adminRouter.use((err, _req, res, _next) => {
  console.error('[admin]', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong.' });
});
