#!/usr/bin/env node
/**
 * Copy the site's resource directory (src/data/directorySeed.ts) into EspoCRM
 * as Accounts, and add them to an outreach Target List for mass-email
 * campaigns. See crm/README.md.
 *
 *   npm run crm:sync                    # preview only: shows what would change
 *   npm run crm:sync -- --apply         # write to EspoCRM
 *   npm run crm:sync -- --country=US,CA # only these countries (ISO codes)
 *
 * Safe to re-run: organizations are matched by name. Existing accounts only get
 * fields that are empty in the CRM filled in; nothing you edited there is
 * overwritten. The directory has no email addresses: add a contact email to
 * each account in EspoCRM before emailing it.
 *
 * Environment (or .env):
 *   ESPOCRM_URL          e.g. https://crm.lowvisionnavigator.org
 *   ESPOCRM_API_KEY      API key of an EspoCRM API User (Administration > API Users)
 *   ESPOCRM_TARGET_LIST  optional, default "Low Vision Navigator outreach"
 */

import { build } from 'esbuild';
import { crmClient, syncDirectory } from '../server/crm.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loading so `npm run crm:sync` works without extra flags.
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const countryArg = args.find((a) => a.startsWith('--country='));
const COUNTRIES = countryArg ? new Set(countryArg.split('=')[1].toUpperCase().split(',').filter(Boolean)) : null;

const BASE = (process.env.ESPOCRM_URL || '').replace(/\/+$/, '');
const KEY = process.env.ESPOCRM_API_KEY || '';
const LIST_NAME = process.env.ESPOCRM_TARGET_LIST || 'Low Vision Navigator outreach';
if (!BASE || !KEY) {
  console.error('Set ESPOCRM_URL and ESPOCRM_API_KEY (see crm/README.md).');
  process.exit(1);
}

// ── load the directory (TypeScript source) ─────────────────────────────────

async function loadDirectory() {
  const out = await build({
    entryPoints: [resolve(root, 'src/data/directorySeed.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = out.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return mod.directorySeedData;
}

// ── main ──────────────────────────────────────────────────────────────────

const all = await loadDirectory();
const orgs = COUNTRIES ? all.filter((r) => COUNTRIES.has(r.country)) : all;
console.log(`${APPLY ? 'Syncing' : 'Preview (no changes; add --apply to write)'}: ${orgs.length} organizations → ${BASE}`);

let result;
try {
  result = await syncDirectory({ crm: crmClient({ url: BASE, apiKey: KEY }), orgs, apply: APPLY, listName: LIST_NAME });
} catch (err) {
  const hint =
    err.status === 401 || err.status === 403
      ? 'EspoCRM rejected the API key. Check ESPOCRM_API_KEY and that the API User is active with access to Accounts and Target Lists.'
      : err.status
        ? err.message
        : `Could not reach ${BASE} (${err.cause?.code || err.message}). Check ESPOCRM_URL.`;
  console.error(`Error: ${hint}`);
  process.exit(1);
}

const { stats, failures } = result;
console.log(`Target list "${LIST_NAME}": ${stats.listCreated ? (APPLY ? 'created' : 'would be created') : 'found'}`);
console.log(
  `${APPLY ? '' : 'Would have: '}created ${stats.created}, filled in ${stats.updated}, unchanged ${stats.unchanged}` +
    (APPLY ? `, on target list ${stats.linked}` : '') +
    `, failed ${stats.failed}`,
);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures.slice(0, 20)) console.log(`  - ${f}`);
  if (failures.length > 20) console.log(`  …and ${failures.length - 20} more`);
  process.exitCode = 1;
}
