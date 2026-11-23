/**
 * Low Vision Navigator — production server for Railway.
 *
 * - Serves the prerendered Vite build in ../dist (with SPA fallback).
 * - Provides /api for email/password accounts and saved plans, backed by
 *   Railway Postgres (DATABASE_URL). Without DATABASE_URL the site still
 *   serves, and the API reports accounts as unavailable.
 * - Serves the AI assistant at POST /api/chat (OPENAI_API_KEY; see
 *   server/chat-route.mjs). It does not need the database.
 */

import express from 'express';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate } from './db.mjs';
import { apiRouter } from './api.mjs';
import { chatRoute } from './chat-route.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const CANONICAL_HOST = process.env.CANONICAL_HOST || 'lowvisionnavigator.org';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Railway terminates TLS in front of us

// www → apex redirect
app.use((req, res, next) => {
  if (req.hostname === `www.${CANONICAL_HOST}`) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }
  next();
});

// Security headers (same policy the site used on Netlify, minus Supabase).
// The microphone is allowed for this site only: the assistant's voice input needs it.
app.use((_req, res, next) => {
  res.set({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
  });
  next();
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));
// Before apiRouter: that router needs the database and parses JSON bodies,
// while the assistant reads its own body and works without a database.
app.post('/api/chat', (req, res, next) => chatRoute(req, res).catch(next));
app.use('/api', apiRouter);

// Static files. Hashed assets are cached forever; HTML is always revalidated.
app.use(
  express.static(distDir, {
    index: false,
    redirect: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${join('dist', 'assets')}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('robots.txt') || filePath.endsWith('sitemap.xml')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

// Prerendered routes live at /<route>/index.html; anything else gets the SPA shell.
app.get('*', (req, res) => {
  // A missing hashed asset is a real 404, not a page.
  if (req.path.startsWith('/assets/')) return res.status(404).end();
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch {
    return res.status(400).end();
  }
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(distDir, safePath, 'index.html');
  const file =
    candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(distDir, 'index.html');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(file);
});

async function start() {
  if (db) {
    await migrate();
    console.log('[db] connected and migrated');
  } else {
    console.warn('[db] DATABASE_URL is not set — accounts and plan sync are disabled');
  }
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
