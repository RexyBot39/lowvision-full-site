/**
 * CRM tab of the admin dashboard, mounted at /api/admin/crm (admin-only; the
 * auth and CSRF checks run in admin-api.mjs before this router).
 *
 *   GET  /status                      setup check, permissions, counts
 *   GET  /accounts?q=&offset=         outreach organizations (search, 25 per page)
 *   GET  /accounts/:id                one organization with its contacts
 *   PUT  /accounts/:id                edit email, phone, website, description
 *   POST /accounts/:id/contacts       add a contact person (also added to the outreach list)
 *   GET  /campaigns                   recent campaigns with sent/opened/clicked stats
 *   POST /sync                        { apply, countries? } directory → CRM
 *   POST /messages/:id/lead           save a contact-form message as a CRM Lead
 */

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.mjs';
import { crmClient, crmConfig, crmEnabled, crmLink, findTargetList, syncDirectory, ACCOUNT_FIELDS } from './crm.mjs';

export const crmAdminRouter = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ID_RE = /^[A-Za-z0-9]{1,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

crmAdminRouter.use((req, res, next) => {
  if (!crmEnabled()) {
    if (req.path === '/status') return res.json({ configured: false, problems: ['Set ESPOCRM_URL and ESPOCRM_API_KEY on the website service.'] });
    return res.status(400).json({ error: 'The CRM isn\'t connected. Set ESPOCRM_URL and ESPOCRM_API_KEY on the website service.' });
  }
  req.crm = crmClient();
  next();
});

// ── status ─────────────────────────────────────────────────────────────────

const NEEDED = {
  Account: { label: 'Accounts', actions: ['read', 'create', 'edit'] },
  Contact: { label: 'Contacts', actions: ['read', 'create', 'edit'] },
  TargetList: { label: 'Target Lists', actions: ['read', 'create', 'edit'] },
  Campaign: { label: 'Campaigns', actions: ['read'] },
  Lead: { label: 'Leads', actions: ['create'] },
  Email: { label: 'Emails', actions: ['create'] },
};

function allowed(entry, action) {
  if (entry === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  const v = entry[action];
  return v === 'yes' || v === 'all' || v === 'team' || v === 'own';
}

const total = async (crm, path) => (await crm.get(path))?.total ?? 0;

crmAdminRouter.get('/status', wrap(async (req, res) => {
  const crm = req.crm;
  let me;
  try {
    me = await crm.get('App/user');
  } catch (err) {
    const problem = err.status === 401
      ? 'The CRM rejected ESPOCRM_API_KEY. Check the key and that the API user is active.'
      : `Could not reach the CRM at ${crmConfig.url} (${err.message}).`;
    return res.json({ configured: true, reachable: false, crmUrl: crmConfig.url, problems: [problem] });
  }
  const table = me?.acl?.table ?? {};
  const missing = Object.entries(NEEDED)
    .map(([scope, { label, actions }]) => ({ label, lacking: actions.filter((a) => !allowed(table[scope], a)) }))
    .filter((m) => m.lacking.length);
  const problems = [];
  if (missing.length) {
    problems.push(
      `The CRM API user's role is missing: ${missing.map((m) => `${m.label} (${m.lacking.join(', ')})`).join('; ')}. ` +
      'In EspoCRM: Administration → Roles, update the role, and make sure it is assigned to the API user.',
    );
  }
  const can = (scope, action) => allowed(table[scope], action);
  const [accounts, contacts, campaigns, list] = await Promise.all([
    can('Account', 'read') ? total(crm, 'Account?maxSize=1&select=id').catch(() => null) : null,
    can('Contact', 'read') ? total(crm, 'Contact?maxSize=1&select=id').catch(() => null) : null,
    can('Campaign', 'read') ? total(crm, 'Campaign?maxSize=1&select=id').catch(() => null) : null,
    can('TargetList', 'read') ? findTargetList(crm).catch(() => null) : null,
  ]);
  let listMembers = null;
  if (list?.id) {
    const [a, c] = await Promise.all([
      total(crm, `TargetList/${list.id}/accounts?maxSize=1&select=id`).catch(() => null),
      total(crm, `TargetList/${list.id}/contacts?maxSize=1&select=id`).catch(() => null),
    ]);
    listMembers = { accounts: a, contacts: c };
  }
  res.json({
    configured: true,
    reachable: true,
    crmUrl: crmConfig.url,
    apiUser: me?.user?.userName ?? null,
    version: me?.settings?.version ?? null,
    problems,
    counts: { accounts, contacts, campaigns },
    outreachList: list ? { id: list.id, name: list.name, link: crmLink('TargetList', list.id), members: listMembers } : { name: crmConfig.targetList, missing: true },
    links: { home: `${crmConfig.url}/`, campaigns: crmLink('Campaign'), accounts: crmLink('Account') },
  });
}));

// ── organizations (Accounts) ───────────────────────────────────────────────

crmAdminRouter.get('/accounts', wrap(async (req, res) => {
  const q = str(req.query.q, 100);
  const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 100000));
  const params = new URLSearchParams({
    select: ACCOUNT_FIELDS.join(','),
    maxSize: '25',
    offset: String(offset),
    orderBy: 'name',
    order: 'asc',
  });
  if (q) params.set('textFilter', q);
  const r = await req.crm.get(`Account?${params}`);
  res.json({
    total: r?.total ?? 0,
    offset,
    accounts: (r?.list ?? []).map((a) => ({ ...a, link: crmLink('Account', a.id) })),
  });
}));

crmAdminRouter.get('/accounts/:id', wrap(async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const [account, contacts] = await Promise.all([
    req.crm.get(`Account/${id}`),
    req.crm.get(`Account/${id}/contacts?select=id,firstName,lastName,title,emailAddress,phoneNumber&maxSize=50&orderBy=lastName`),
  ]);
  res.json({
    account: { ...pick(account, ACCOUNT_FIELDS), link: crmLink('Account', id) },
    contacts: (contacts?.list ?? []).map((c) => ({ ...c, link: crmLink('Contact', c.id) })),
  });
}));

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o[k]]));

crmAdminRouter.put('/accounts/:id', wrap(async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const b = req.body ?? {};
  const patch = {};
  if ('emailAddress' in b) {
    const e = str(b.emailAddress, 254).toLowerCase();
    if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: 'Enter a valid email address, or leave it blank.' });
    patch.emailAddress = e || null;
  }
  if ('phoneNumber' in b) patch.phoneNumber = str(b.phoneNumber, 40) || null;
  if ('website' in b) patch.website = str(b.website, 200) || null;
  if ('description' in b) patch.description = String(b.description ?? '').slice(0, 5000);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
  const account = await req.crm.put(`Account/${id}`, patch);
  res.json({ account: { ...pick(account, ACCOUNT_FIELDS), link: crmLink('Account', id) } });
}));

crmAdminRouter.post('/accounts/:id/contacts', wrap(async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const b = req.body ?? {};
  const contact = {
    firstName: str(b.firstName, 100),
    lastName: str(b.lastName, 100),
    title: str(b.title, 100),
    emailAddress: str(b.emailAddress, 254).toLowerCase(),
    phoneNumber: str(b.phoneNumber, 40),
    accountId: id,
  };
  if (!contact.lastName && !contact.firstName) return res.status(400).json({ error: 'Enter a name.' });
  if (!contact.lastName) { contact.lastName = contact.firstName; contact.firstName = ''; }
  if (!EMAIL_RE.test(contact.emailAddress)) return res.status(400).json({ error: 'Enter a valid email address.' });
  for (const k of Object.keys(contact)) if (contact[k] === '') delete contact[k];

  const created = await req.crm.post('Contact', contact);
  // Put the person on the outreach list too, so campaigns reach them.
  let addedToList = false;
  const list = await findTargetList(req.crm).catch(() => null);
  if (list?.id) {
    await req.crm.post(`TargetList/${list.id}/contacts`, { id: created.id }).then(() => { addedToList = true; }).catch(() => {});
  }
  res.status(201).json({ contact: { ...pick(created, ['id', 'firstName', 'lastName', 'title', 'emailAddress', 'phoneNumber']), link: crmLink('Contact', created.id) }, addedToList });
}));

// ── campaigns ──────────────────────────────────────────────────────────────

const STAT_FIELDS = ['sentCount', 'openedCount', 'clickedCount', 'optedOutCount', 'bouncedCount'];

crmAdminRouter.get('/campaigns', wrap(async (req, res) => {
  const r = await req.crm.get('Campaign?select=id,name,status,type,startDate,endDate,createdAt&maxSize=20&orderBy=createdAt&order=desc');
  // Stats are only calculated when a single campaign is read.
  const campaigns = await Promise.all(
    (r?.list ?? []).map(async (c) => {
      const full = await req.crm.get(`Campaign/${c.id}`).catch(() => ({}));
      return { ...c, ...pick(full, STAT_FIELDS), link: crmLink('Campaign', c.id) };
    }),
  );
  res.json({ total: r?.total ?? 0, campaigns });
}));

// ── directory → CRM sync ───────────────────────────────────────────────────

const DIRECTORY_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist-node', 'directory.json');
let syncing = null;

crmAdminRouter.post('/sync', wrap(async (req, res) => {
  if (!existsSync(DIRECTORY_FILE)) return res.status(500).json({ error: 'Directory data is missing. Run npm run build.' });
  if (syncing) return res.status(409).json({ error: 'A sync is already running. Please wait.' });
  const apply = req.body?.apply === true;
  const countries = Array.isArray(req.body?.countries)
    ? new Set(req.body.countries.map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))
    : null;
  const all = JSON.parse(readFileSync(DIRECTORY_FILE, 'utf8'));
  const orgs = countries?.size ? all.filter((r) => countries.has(r.country)) : all;
  syncing = syncDirectory({ crm: req.crm, orgs, apply });
  try {
    const { stats, failures } = await syncing;
    res.json({ apply, stats, failures: failures.slice(0, 20), moreFailures: Math.max(0, failures.length - 20) });
  } finally {
    syncing = null;
  }
}));

// ── contact-form message → Lead ────────────────────────────────────────────

crmAdminRouter.post('/messages/:id/lead', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !db) return res.status(400).json({ error: 'Invalid id' });
  const { rows } = await db.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
  const m = rows[0];
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (m.crm_lead_id) return res.json({ leadId: m.crm_lead_id, link: crmLink('Lead', m.crm_lead_id), existing: true });

  const parts = String(m.name).trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.pop() : parts[0];
  const firstName = parts.length ? parts.join(' ') : undefined;
  const lead = await req.crm.post('Lead', {
    ...(firstName ? { firstName } : {}),
    lastName,
    emailAddress: m.email,
    source: 'Web Site',
    description: `Contact form message (${m.type}) received ${new Date(m.created_at).toISOString().slice(0, 10)}:\n\n${m.message}`,
  });
  await db.query('UPDATE contact_messages SET crm_lead_id = $1 WHERE id = $2', [lead.id, id]);
  res.status(201).json({ leadId: lead.id, link: crmLink('Lead', lead.id) });
}));

crmAdminRouter.use((err, _req, res, next) => {
  if (err?.status && !res.headersSent) {
    // A CRM error: pass its message through (it never contains the API key).
    const code = err.status === 401 || err.status === 403 ? 502 : err.status >= 500 ? 502 : err.status;
    return res.status(code).json({ error: err.status === 403 ? `The CRM refused this action (missing permission). ${err.message}` : err.message });
  }
  next(err);
});
