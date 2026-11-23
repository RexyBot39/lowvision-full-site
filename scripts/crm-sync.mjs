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

// ── EspoCRM API ────────────────────────────────────────────────────────────

async function espo(method, path, body) {
  const r = await fetch(`${BASE}/api/v1/${path}`, {
    method,
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  if (!r.ok) {
    const reason = r.headers.get('x-status-reason') || text.slice(0, 300);
    const err = new Error(`${method} ${path} → ${r.status}${reason ? `: ${reason}` : ''}`);
    err.status = r.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

function whereEquals(attribute, value) {
  const q = new URLSearchParams();
  q.set('where[0][type]', 'equals');
  q.set('where[0][attribute]', attribute);
  q.set('where[0][value]', value);
  return q.toString();
}

const ACCOUNT_FIELDS = [
  'id', 'name', 'website', 'phoneNumber', 'description',
  'billingAddressStreet', 'billingAddressCity', 'billingAddressState', 'billingAddressPostalCode', 'billingAddressCountry',
];

async function findAccount(name) {
  const res = await espo('GET', `Account?select=${ACCOUNT_FIELDS.join(',')}&maxSize=1&${whereEquals('name', name)}`);
  return res?.list?.[0] ?? null;
}

async function findOrCreateTargetList() {
  const res = await espo('GET', `TargetList?select=id,name&maxSize=1&${whereEquals('name', LIST_NAME)}`);
  if (res?.list?.[0]) return { id: res.list[0].id, created: false };
  if (!APPLY) return { id: null, created: true };
  const created = await espo('POST', 'TargetList', {
    name: LIST_NAME,
    description: 'Organizations from the Low Vision Navigator directory, for outreach about lowvisionnavigator.org.',
  });
  return { id: created.id, created: true };
}

// ── mapping ────────────────────────────────────────────────────────────────

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function toAccount(r) {
  const hasStreet = /\d/.test(r.address || '');
  const lines = [
    `From the Low Vision Navigator directory (id: ${r.id}).`,
    r.serviceTypes?.length ? `Services: ${r.serviceTypes.join(', ')}.` : '',
    r.sourceType ? `Organization type: ${r.sourceType}.` : '',
    !hasStreet && r.address ? `Location: ${r.address}.` : '',
  ].filter(Boolean);
  return {
    name: r.organizationName,
    website: r.website || null,
    phoneNumber: r.phone || null,
    billingAddressStreet: hasStreet ? r.address : null,
    billingAddressCity: r.city || null,
    billingAddressState: r.state || null,
    billingAddressPostalCode: r.zip || null,
    billingAddressCountry: r.country ? countryNames.of(r.country) ?? r.country : null,
    description: lines.join('\n'),
  };
}

/** Only fields that are empty in the CRM, so manual edits there are never overwritten. */
function missingFields(existing, wanted) {
  const patch = {};
  for (const [k, v] of Object.entries(wanted)) {
    if (k === 'name' || v == null || v === '') continue;
    if (existing[k] == null || existing[k] === '') patch[k] = v;
  }
  return patch;
}

/** EspoCRM can reject phone numbers it can't parse; retry without, keeping the number in the description. */
async function writeAccount(method, path, data) {
  try {
    return await espo(method, path, data);
  } catch (err) {
    if (err.status === 400 && data.phoneNumber) {
      const { phoneNumber, ...rest } = data;
      rest.description = [rest.description, `Phone: ${phoneNumber}`].filter(Boolean).join('\n');
      return await espo(method, path, rest);
    }
    throw err;
  }
}

// ── main ───────────────────────────────────────────────────────────────────

const all = await loadDirectory();
const orgs = COUNTRIES ? all.filter((r) => COUNTRIES.has(r.country)) : all;
console.log(`${APPLY ? 'Syncing' : 'Preview (no changes; add --apply to write)'}: ${orgs.length} organizations → ${BASE}`);

let list;
try {
  list = await findOrCreateTargetList();
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
console.log(`Target list "${LIST_NAME}": ${list.created ? (APPLY ? 'created' : 'would be created') : 'found'}`);

const stats = { created: 0, updated: 0, unchanged: 0, linked: 0, failed: 0 };
const failures = [];

async function syncOne(r) {
  const wanted = toAccount(r);
  const existing = await findAccount(wanted.name);
  let id = existing?.id ?? null;
  if (!existing) {
    stats.created++;
    if (APPLY) id = (await writeAccount('POST', 'Account', wanted)).id;
  } else {
    const patch = missingFields(existing, wanted);
    if (Object.keys(patch).length) {
      stats.updated++;
      if (APPLY) await writeAccount('PUT', `Account/${id}`, patch);
    } else {
      stats.unchanged++;
    }
  }
  if (APPLY && id && list.id) {
    // Linking an account that's already on the list is harmless.
    await espo('POST', `TargetList/${list.id}/accounts`, { id });
    stats.linked++;
  }
}

// A few requests at a time, to be gentle with a small CRM server.
const queue = [...orgs];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const r = queue.shift();
      try {
        await syncOne(r);
      } catch (err) {
        stats.failed++;
        failures.push(`${r.organizationName}: ${err.message}`);
      }
    }
  }),
);

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
