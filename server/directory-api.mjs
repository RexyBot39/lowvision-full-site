/**
 * Professional directory, mounted at /api/directory.
 *
 * Public (no account needed):
 *   GET  /professionals?specialty=&q=&region=&telehealth=1&age=&payment=
 *   GET  /professionals/:id
 *   GET  /summary                      listing counts per specialty
 *
 * Signed-in professionals manage their own listing (one per account):
 *   GET    /my-listing
 *   PUT    /my-listing                 { listing } → submitted for review
 *   POST   /my-listing/visibility      { hidden: boolean }
 *   DELETE /my-listing
 *
 * Moderation: nothing is public until an admin approves it (admin-api.mjs).
 * Edits to an approved listing are reviewed too; the approved version stays
 * public meanwhile. License details are never returned by the public API.
 */

import express from 'express';
import { db } from './db.mjs';
import { loadUser } from './api.mjs';
import { PROFESSION_SLUGS, SERVICE_MODE_KEYS, AGE_GROUP_KEYS, PAYMENT_KEYS } from './professions.mjs';

export const directoryRouter = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

directoryRouter.use((req, res, next) => {
  if (!db) return res.status(503).json({ error: 'The directory is unavailable right now.' });
  next();
});
directoryRouter.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Expected application/json' });
  }
  next();
});
directoryRouter.use(express.json({ limit: '30kb' }));
directoryRouter.use(wrap(loadUser));

// ── validation ─────────────────────────────────────────────────────────────

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const text = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, max);
const pick = (v, allowed) => (Array.isArray(v) ? allowed.filter((k) => v.includes(k)) : []);

function normalizeWebsite(v) {
  const s = str(v, 200);
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Returns { listing, errors }. Keys are always built in the same order so versions compare as strings. */
export function validateListing(input = {}) {
  const errors = {};
  const website = normalizeWebsite(input.website);
  const listing = {
    fullName: str(input.fullName, 100),
    credentials: str(input.credentials, 100),
    specialties: pick(input.specialties, PROFESSION_SLUGS),
    practiceName: str(input.practiceName, 150),
    street: str(input.street, 200),
    city: str(input.city, 100),
    region: str(input.region, 100),
    postalCode: str(input.postalCode, 20),
    country: str(input.country, 60) || 'United States',
    serviceArea: str(input.serviceArea, 200),
    phone: str(input.phone, 40),
    publicEmail: str(input.publicEmail, 254).toLowerCase(),
    website: website ?? '',
    serviceModes: pick(input.serviceModes, SERVICE_MODE_KEYS),
    ageGroups: pick(input.ageGroups, AGE_GROUP_KEYS),
    payment: pick(input.payment, PAYMENT_KEYS),
    languages: str(input.languages, 200),
    bio: text(input.bio, 1500),
    licenseInfo: str(input.licenseInfo, 200),
  };

  if (!listing.fullName) errors.fullName = 'Enter your name.';
  if (listing.specialties.length === 0) errors.specialties = 'Choose at least one profession.';
  if (Array.isArray(input.specialties) && input.specialties.length > 3) errors.specialties = 'Choose up to 3 professions.';
  if (!listing.city) errors.city = 'Enter a city.';
  if (!listing.region) errors.region = 'Enter a state or province.';
  if (listing.serviceModes.length === 0) errors.serviceModes = 'Choose at least one way you see clients.';
  if (listing.publicEmail && !EMAIL_RE.test(listing.publicEmail)) errors.publicEmail = 'Enter a valid email address, or leave it blank.';
  if (website === null) errors.website = 'Enter a valid website address, or leave it blank.';
  if (!listing.phone && !listing.publicEmail && !listing.website) errors.contact = 'Add at least one way to contact you: phone, email or website.';
  if (!listing.licenseInfo) errors.licenseInfo = 'Enter your license or certification details so we can verify them.';
  if (input.attest !== true) errors.attest = 'Please confirm the statement.';
  return { listing, errors };
}

/** JSON with sorted keys, so versions compare equal regardless of key order (JSONB doesn't keep it). */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** What the public sees: the approved version, without private fields. */
function publicView(row) {
  const { licenseInfo: _private, ...rest } = row.published;
  return { id: row.id, ...rest, updatedAt: row.reviewed_at };
}

// ── public ─────────────────────────────────────────────────────────────────

const PUBLIC_WHERE = `published IS NOT NULL AND status <> 'removed' AND owner_hidden = false`;

directoryRouter.get('/professionals', wrap(async (req, res) => {
  const where = [PUBLIC_WHERE];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };

  const specialty = String(req.query.specialty ?? '');
  if (PROFESSION_SLUGS.includes(specialty)) add(`published->'specialties' ? $?`, specialty);
  const region = str(req.query.region, 100);
  if (region) add(`lower(published->>'region') = lower($?)`, region);
  if (req.query.telehealth === '1') add(`published->'serviceModes' ? $?`, 'telehealth');
  const age = String(req.query.age ?? '');
  if (AGE_GROUP_KEYS.includes(age)) add(`published->'ageGroups' ? $?`, age);
  const payment = String(req.query.payment ?? '');
  if (PAYMENT_KEYS.includes(payment)) add(`published->'payment' ? $?`, payment);
  const q = str(req.query.q, 100);
  if (q) {
    add(
      `concat_ws(' ', published->>'fullName', published->>'practiceName', published->>'credentials', published->>'city',
         published->>'region', published->>'postalCode', published->>'serviceArea', published->>'bio', published->>'languages') ILIKE $?`,
      `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
    );
  }

  const { rows } = await db.query(
    `SELECT id, published, reviewed_at FROM professional_listings WHERE ${where.join(' AND ')}
     ORDER BY lower(published->>'fullName') LIMIT 500`,
    params,
  );
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ professionals: rows.map(publicView) });
}));

directoryRouter.get('/professionals/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Not found' });
  const { rows } = await db.query(`SELECT id, published, reviewed_at FROM professional_listings WHERE id = $1 AND ${PUBLIC_WHERE}`, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'This listing is not available.' });
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ professional: publicView(rows[0]) });
}));

directoryRouter.get('/summary', wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT s AS slug, count(*)::int AS n FROM professional_listings, jsonb_array_elements_text(published->'specialties') AS s
     WHERE ${PUBLIC_WHERE} GROUP BY s`,
  );
  const total = await db.query(`SELECT count(*)::int AS n FROM professional_listings WHERE ${PUBLIC_WHERE}`);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ counts: Object.fromEntries(rows.map((r) => [r.slug, r.n])), total: total.rows[0].n });
}));

// ── the signed-in professional's own listing ───────────────────────────────

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to manage your listing.' });
  next();
}

function ownView(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    listing: row.data,
    isPublic: !!row.published && row.status !== 'removed' && !row.owner_hidden,
    hasPublishedVersion: !!row.published,
    ownerHidden: row.owner_hidden,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  };
}

const saveLimits = new Map();
function saveRateLimit(req, res, next) {
  const now = Date.now();
  const e = saveLimits.get(req.user.id) ?? { n: 0, start: now };
  if (now - e.start > 60 * 60 * 1000) { e.n = 0; e.start = now; }
  e.n += 1;
  saveLimits.set(req.user.id, e);
  if (e.n > 20) return res.status(429).json({ error: 'Too many changes in a short time. Please try again later.' });
  next();
}

directoryRouter.get('/my-listing', requireUser, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM professional_listings WHERE user_id = $1', [req.user.id]);
  res.set('Cache-Control', 'no-store');
  res.json({ listing: ownView(rows[0]) });
}));

directoryRouter.put('/my-listing', requireUser, saveRateLimit, wrap(async (req, res) => {
  const { listing, errors } = validateListing({ ...(req.body?.listing ?? {}), attest: req.body?.attest });
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
  }
  const { rows: existing } = await db.query('SELECT * FROM professional_listings WHERE user_id = $1', [req.user.id]);
  const row = existing[0];
  if (row?.status === 'removed') {
    return res.status(403).json({ error: 'This listing was removed by Low Vision Navigator. Please contact us if you think this was a mistake.' });
  }

  // Saving exactly what was already approved needs no new review.
  const unchanged = !!row?.published && stableStringify(row.published) === stableStringify(listing);
  const status = unchanged ? 'approved' : 'pending';
  const { rows } = await db.query(
    `INSERT INTO professional_listings (user_id, status, data, submitted_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data,
       submitted_at = now(), review_note = CASE WHEN EXCLUDED.status = 'approved' THEN professional_listings.review_note ELSE NULL END
     RETURNING *`,
    [req.user.id, status, listing],
  );
  res.json({ listing: ownView(rows[0]) });
}));

directoryRouter.post('/my-listing/visibility', requireUser, wrap(async (req, res) => {
  const hidden = req.body?.hidden === true;
  const { rows } = await db.query(
    'UPDATE professional_listings SET owner_hidden = $1 WHERE user_id = $2 RETURNING *',
    [hidden, req.user.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'You have no listing yet.' });
  res.json({ listing: ownView(rows[0]) });
}));

directoryRouter.delete('/my-listing', requireUser, wrap(async (req, res) => {
  await db.query('DELETE FROM professional_listings WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));

directoryRouter.use((_req, res) => res.status(404).json({ error: 'Not found' }));
directoryRouter.use((err, _req, res, _next) => {
  console.error('[directory]', err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
