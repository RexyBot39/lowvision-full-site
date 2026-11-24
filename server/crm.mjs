/**
 * EspoCRM access for the website server (admin CRM tab, directory sync).
 * Uses ESPOCRM_URL and ESPOCRM_API_KEY, the same variables as email
 * notifications (server/notify.mjs). The key never reaches the browser.
 */

export const crmConfig = {
  url: (process.env.ESPOCRM_URL ?? '').trim().replace(/\/+$/, ''),
  apiKey: (process.env.ESPOCRM_API_KEY ?? '').trim(),
  targetList: (process.env.ESPOCRM_TARGET_LIST ?? '').trim() || 'Low Vision Navigator outreach',
};
export const crmEnabled = () => !!(crmConfig.url && crmConfig.apiKey);

export class CrmError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Create a client. Pass url/key explicitly (scripts) or use the server's environment. */
export function crmClient({ url = crmConfig.url, apiKey = crmConfig.apiKey } = {}) {
  async function call(method, path, body) {
    const r = await fetch(`${url}/api/v1/${path}`, {
      method,
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) {
      const reason = r.headers.get('x-status-reason') || text.slice(0, 200) || r.statusText;
      throw new CrmError(`CRM ${method} ${path.split('?')[0]} → ${r.status}${reason ? `: ${reason}` : ''}`, r.status);
    }
    return text ? JSON.parse(text) : null;
  }
  return {
    url,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
    put: (path, body) => call('PUT', path, body),
  };
}

export function whereEquals(attribute, value, i = 0) {
  const q = new URLSearchParams();
  q.set(`where[${i}][type]`, 'equals');
  q.set(`where[${i}][attribute]`, attribute);
  q.set(`where[${i}][value]`, value);
  return q.toString();
}

/** Link into the EspoCRM web app, e.g. crmLink('Account', id). */
export const crmLink = (scope, id) => `${crmConfig.url}/#${scope}${id ? `/view/${id}` : ''}`;

// ── directory → CRM sync (shared by the admin button and scripts/crm-sync.mjs) ─

export const ACCOUNT_FIELDS = [
  'id', 'name', 'website', 'phoneNumber', 'emailAddress', 'description',
  'billingAddressStreet', 'billingAddressCity', 'billingAddressState', 'billingAddressPostalCode', 'billingAddressCountry',
];

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function directoryToAccount(r) {
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

export async function findTargetList(crm, name = crmConfig.targetList) {
  const res = await crm.get(`TargetList?select=id,name&maxSize=1&${whereEquals('name', name)}`);
  return res?.list?.[0] ?? null;
}

/**
 * Copy directory organizations into the CRM as Accounts on the outreach list.
 * apply=false only reports what would change. Never throws per organization;
 * failures are collected.
 */
export async function syncDirectory({ crm, orgs, apply, listName = crmConfig.targetList, onProgress }) {
  let list = await findTargetList(crm, listName);
  const listCreated = !list;
  if (!list && apply) {
    list = await crm.post('TargetList', {
      name: listName,
      description: 'Organizations from the Low Vision Navigator directory, for outreach about lowvisionnavigator.org.',
    });
  }

  const stats = { total: orgs.length, created: 0, updated: 0, unchanged: 0, linked: 0, failed: 0, listCreated, listName };
  const failures = [];

  async function writeAccount(method, path, data) {
    try {
      return await (method === 'POST' ? crm.post(path, data) : crm.put(path, data));
    } catch (err) {
      // EspoCRM can reject phone numbers it can't parse: save without, keep the number in the description.
      if (err.status === 400 && data.phoneNumber) {
        const { phoneNumber, ...rest } = data;
        rest.description = [rest.description, `Phone: ${phoneNumber}`].filter(Boolean).join('\n');
        return method === 'POST' ? crm.post(path, rest) : crm.put(path, rest);
      }
      throw err;
    }
  }

  async function one(r) {
    const wanted = directoryToAccount(r);
    const found = await crm.get(`Account?select=${ACCOUNT_FIELDS.join(',')}&maxSize=1&${whereEquals('name', wanted.name)}`);
    const existing = found?.list?.[0] ?? null;
    let id = existing?.id ?? null;
    if (!existing) {
      stats.created++;
      if (apply) id = (await writeAccount('POST', 'Account', wanted)).id;
    } else {
      const patch = missingFields(existing, wanted);
      if (Object.keys(patch).length) {
        stats.updated++;
        if (apply) await writeAccount('PUT', `Account/${id}`, patch);
      } else {
        stats.unchanged++;
      }
    }
    if (apply && id && list?.id) {
      await crm.post(`TargetList/${list.id}/accounts`, { id });
      stats.linked++;
    }
  }

  const queue = [...orgs];
  let done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const r = queue.shift();
        try {
          await one(r);
        } catch (err) {
          stats.failed++;
          failures.push(`${r.organizationName}: ${err.message}`);
        }
        done++;
        onProgress?.(done, orgs.length);
      }
    }),
  );
  return { stats, failures };
}
