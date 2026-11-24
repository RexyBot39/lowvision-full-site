/**
 * Email notifications, sent through EspoCRM (crm/).
 *
 * The website never talks to an SMTP server itself. It creates an Email record
 * in EspoCRM with status "Sending" (POST /api/v1/Email), and EspoCRM sends it
 * with its system outbound SMTP settings. Each email also stays in the CRM.
 *
 * Emails are queued in Postgres (email_outbox) and retried with backoff, so a
 * CRM restart or SMTP hiccup doesn't lose them.
 *
 * EspoCRM requirements (checked by checkNotifySetup):
 *   - The API user's role allows creating Emails.
 *   - Administration > Outbound Emails: SMTP configured, a system "From"
 *     address set, and "Is Shared" enabled so non-admin users may send from it.
 *   - NOTIFY_FROM equals that system "From" address.
 *
 * Environment (website service):
 *   ESPOCRM_URL          e.g. https://crm.lowvisionnavigator.org
 *   ESPOCRM_API_KEY      key of the EspoCRM API user
 *   NOTIFY_FROM          the CRM's system outbound address, e.g. hello@lowvisionnavigator.org
 *   NOTIFY_ADMIN_EMAILS  who gets admin alerts (comma-separated); defaults to ADMIN_EMAILS
 *   SITE_URL             links in emails; defaults to https://$CANONICAL_HOST
 */

import { db } from './db.mjs';

const RETRY_MINUTES = [1, 5, 15, 60, 180]; // after attempt 1, 2, ...; then give up
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

const env = (k) => (process.env[k] ?? '').trim();
const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);

export const notifyConfig = {
  crmUrl: env('ESPOCRM_URL').replace(/\/+$/, ''),
  apiKey: env('ESPOCRM_API_KEY'),
  from: env('NOTIFY_FROM'),
  adminEmails: list(env('NOTIFY_ADMIN_EMAILS') || env('ADMIN_EMAILS')),
  siteUrl: (env('SITE_URL') || `https://${env('CANONICAL_HOST') || 'lowvisionnavigator.org'}`).replace(/\/+$/, ''),
};

export const notifyEnabled = () => !!(db && notifyConfig.crmUrl && notifyConfig.apiKey && notifyConfig.from);

// ── templates ──────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = (path) => `${notifyConfig.siteUrl}${path}`;

/** A simple, accessible email: large readable text, real links, plain-text twin. */
function layout({ heading, paragraphs, button, footerNote }) {
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-size:15px;font-weight:bold;color:#02294d">Low Vision Navigator</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:17px;line-height:1.55">${p.html ?? esc(p)}</p>`).join('\n')}
${button ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(button.label)}</a></p>` : ''}
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280">${esc(footerNote ?? 'You received this email because of activity on your Low Vision Navigator account.')}</p>
</div></body></html>`;
  const text = [
    heading,
    '',
    ...paragraphs.map((p) => p.text ?? p),
    ...(button ? ['', `${button.label}: ${button.href}`] : []),
    '',
    '--',
    'Low Vision Navigator',
    footerNote ?? 'You received this email because of activity on your Low Vision Navigator account.',
  ].join('\n');
  return { html, text };
}

const quote = (s) => ({ html: `<span style="display:block;border-left:4px solid #d1d5db;padding:4px 12px;white-space:pre-line">${esc(s)}</span>`, text: `> ${String(s).replace(/\n/g, '\n> ')}` });
const MANAGE = '/professionals/list-your-practice/manage';

export const templates = {
  listingSubmitted: ({ name, isEdit }) => ({
    subject: isEdit ? 'We received your listing changes' : 'We received your Low Vision Navigator listing',
    ...layout({
      heading: isEdit ? 'Your changes are in review' : 'Thanks for listing your practice',
      paragraphs: [
        `Hi ${name},`,
        isEdit
          ? 'We received the changes to your Find a Professional listing. Your previously approved listing stays visible while we review them.'
          : 'We received your listing for the Find a Professional directory. We review every listing and check the license or certification you provided, usually within a few business days.',
        "We'll email you when the review is done. You can also check the status anytime.",
      ],
      button: { label: 'View your listing', href: url(MANAGE) },
    }),
  }),

  listingApproved: ({ name, id }) => ({
    subject: 'Your Low Vision Navigator listing is live',
    ...layout({
      heading: 'Your listing is approved',
      paragraphs: [
        `Hi ${name},`,
        'Your listing is now live in the Find a Professional directory, under each profession you chose.',
        'You can edit, hide or delete it anytime from your listing page.',
      ],
      button: { label: 'See your public listing', href: url(`/find-a-professional/p/${id}`) },
    }),
  }),

  listingChangesRequested: ({ name, note, hasPublished }) => ({
    subject: 'Your Low Vision Navigator listing needs changes',
    ...layout({
      heading: 'A few changes are needed',
      paragraphs: [
        `Hi ${name},`,
        hasPublished
          ? "We reviewed the latest changes to your listing and couldn't approve them yet. Your previously approved listing is still visible."
          : "We reviewed your listing and couldn't approve it yet.",
        'Note from our reviewer:',
        quote(note),
        'Please update your listing and resubmit it.',
      ],
      button: { label: 'Update your listing', href: url(MANAGE) },
    }),
  }),

  listingRemoved: ({ name, note }) => ({
    subject: 'Your Low Vision Navigator listing was removed',
    ...layout({
      heading: 'Your listing was removed',
      paragraphs: [
        `Hi ${name},`,
        'Your listing has been removed from the Find a Professional directory.',
        'Note from our reviewer:',
        quote(note),
        'If you think this was a mistake, please contact us.',
      ],
      button: { label: 'Contact us', href: url('/about/contact') },
    }),
  }),

  adminListingToReview: ({ name, professions, isEdit, accountEmail }) => ({
    subject: `${isEdit ? 'Listing changes' : 'New listing'} to review: ${name}`,
    ...layout({
      heading: isEdit ? 'Listing changes to review' : 'New listing to review',
      paragraphs: [`${name} (${professions})`, `Account: ${accountEmail}`, 'Verify the license or certification before approving.'],
      button: { label: 'Review in the admin dashboard', href: url('/admin?tab=listings') },
      footerNote: 'Admin alert from the Low Vision Navigator website.',
    }),
  }),

  adminContactMessage: ({ name, email, type, message }) => ({
    subject: `New contact message (${type}) from ${name}`,
    replyTo: email,
    ...layout({
      heading: 'New contact form message',
      paragraphs: [`From: ${name} <${email}>`, `Type: ${type}`, quote(message), 'Reply to this email to answer them directly.'],
      button: { label: 'Open messages in the admin dashboard', href: url('/admin?tab=messages') },
      footerNote: 'Admin alert from the Low Vision Navigator website.',
    }),
  }),

  passwordReset: ({ name, link, minutes }) => ({
    subject: 'Reset your Low Vision Navigator password',
    ...layout({
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${name},`,
        `Someone asked to reset the password for your Low Vision Navigator account. Use the button below to choose a new one. The link works once and expires in ${minutes} minutes.`,
        "If you didn't ask for this, you can ignore this email. Your password won't change.",
      ],
      button: { label: 'Choose a new password', href: link },
      footerNote: 'For your security, Low Vision Navigator will never ask for your password by email.',
    }),
  }),

  test: ({ to }) => ({
    subject: 'Test email from Low Vision Navigator',
    ...layout({
      heading: 'Email notifications are working',
      paragraphs: [`This test was sent to ${to} through your CRM. Notifications for listings and contact messages will arrive the same way.`],
      footerNote: 'Test sent from the admin dashboard.',
    }),
  }),
};

// ── queue ──────────────────────────────────────────────────────────────────

let warnedDisabled = false;

/**
 * Queue an email and try to send it right away. Never throws: a notification
 * problem must not break the action that triggered it.
 */
export async function notify(kind, to, data) {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).map((s) => String(s ?? '').trim()).filter(Boolean);
    if (!recipients.length) return;
    if (!notifyEnabled()) {
      if (!warnedDisabled) {
        console.warn('[notify] Email notifications are off (set ESPOCRM_URL, ESPOCRM_API_KEY and NOTIFY_FROM).');
        warnedDisabled = true;
      }
      return;
    }
    const t = templates[kind](data);
    await db.query(
      `INSERT INTO email_outbox (kind, to_addresses, reply_to, subject, html, text_body) VALUES ($1, $2, $3, $4, $5, $6)`,
      [kind, recipients.join(';'), t.replyTo ?? null, t.subject.replace(/[\r\n]+/g, ' ').slice(0, 250), t.html, t.text],
    );
    void processOutbox();
  } catch (err) {
    console.error('[notify] could not queue', kind, err.message);
  }
}

/** Send one email via EspoCRM. Returns the CRM Email id. */
async function sendViaCrm(row) {
  const r = await fetch(`${notifyConfig.crmUrl}/api/v1/Email`, {
    method: 'POST',
    headers: { 'X-Api-Key': notifyConfig.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      status: 'Sending',
      from: notifyConfig.from,
      to: row.to_addresses,
      ...(row.reply_to ? { replyTo: row.reply_to } : {}),
      name: row.subject,
      subject: row.subject,
      isHtml: true,
      body: row.html,
      bodyPlain: row.text_body,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const textBody = await r.text();
  if (!r.ok) {
    const reason = r.headers.get('x-status-reason') || textBody.slice(0, 200) || r.statusText;
    throw new Error(`CRM ${r.status}: ${reason}`);
  }
  let json = null;
  try { json = JSON.parse(textBody); } catch { /* ignore */ }
  if (json?.status && json.status !== 'Sent') throw new Error(`CRM saved the email with status "${json.status}"`);
  return json?.id ?? null;
}

let processing = null;
let runAgain = false;

/** Send everything that's due. Safe to call often; runs one batch at a time. */
export function processOutbox() {
  if (!notifyEnabled()) return Promise.resolve();
  if (processing) {
    runAgain = true; // an email was queued mid-batch: go again right after
    return processing;
  }
  processing = (async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()
         ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`,
      );
      for (const row of rows) {
        try {
          const crmId = await sendViaCrm(row);
          await client.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, crm_email_id = $2, last_error = NULL WHERE id = $1`, [row.id, crmId]);
        } catch (err) {
          const attempts = row.attempts + 1;
          // A test is a live check: report it once rather than retrying in the background.
          const giveUp = attempts >= MAX_ATTEMPTS || row.kind === 'test';
          await client.query(
            `UPDATE email_outbox SET attempts = $2, last_error = $3, status = $4,
               next_attempt_at = now() + ($5::int * interval '1 minute') WHERE id = $1`,
            [row.id, attempts, String(err.message).slice(0, 500), giveUp ? 'failed' : 'pending', RETRY_MINUTES[attempts - 1] ?? 0],
          );
          console.warn(`[notify] ${row.kind} to ${row.to_addresses} failed (attempt ${attempts}${giveUp ? ', giving up' : ''}): ${err.message}`);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[notify] outbox error', err.message);
    } finally {
      client.release();
    }
  })().finally(() => {
    processing = null;
    if (runAgain) {
      runAgain = false;
      void processOutbox();
    }
  });
  return processing;
}

export function startOutboxWorker() {
  if (!notifyEnabled()) {
    console.log('[notify] Email notifications are off (set ESPOCRM_URL, ESPOCRM_API_KEY and NOTIFY_FROM to turn them on).');
    return;
  }
  console.log(`[notify] Email notifications on, sent through ${notifyConfig.crmUrl} from ${notifyConfig.from}`);
  setInterval(() => void processOutbox(), 60 * 1000).unref();
  void processOutbox();
}

// ── setup check (admin dashboard) ──────────────────────────────────────────

let setupCache = null;

/** Problems that would stop EspoCRM from sending, in plain language. Cached 5 minutes. */
export async function checkNotifySetup({ fresh = false } = {}) {
  const missing = [];
  if (!notifyConfig.crmUrl) missing.push('ESPOCRM_URL');
  if (!notifyConfig.apiKey) missing.push('ESPOCRM_API_KEY');
  if (!notifyConfig.from) missing.push('NOTIFY_FROM');
  if (missing.length) return { configured: false, problems: [`Set ${missing.join(', ')} on the website service.`] };
  if (!fresh && setupCache && Date.now() - setupCache.at < 5 * 60 * 1000) return setupCache.value;

  const problems = [];
  try {
    const r = await fetch(`${notifyConfig.crmUrl}/api/v1/App/user`, {
      headers: { 'X-Api-Key': notifyConfig.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401) problems.push('The CRM rejected ESPOCRM_API_KEY. Check the key and that the API user is active.');
    else if (!r.ok) problems.push(`The CRM answered ${r.status} when checking the API user.`);
    else {
      const j = await r.json();
      const emailAcl = j.acl?.table?.Email;
      const canCreate = emailAcl === true || emailAcl?.create === 'yes';
      if (!canCreate) problems.push('The CRM API user can\'t create Emails. In EspoCRM: Administration → Roles → give the API user\'s role "Email: create yes, read own, edit own", and make sure the role is assigned to the API user.');
      if (j.settings && j.settings.outboundEmailIsShared === false) {
        problems.push('The CRM\'s system email address isn\'t shared. In EspoCRM: Administration → Outbound Emails → tick "Is Shared" so API users can send from it.');
      }
    }
  } catch (err) {
    problems.push(`Could not reach the CRM at ${notifyConfig.crmUrl} (${err.message}).`);
  }
  const value = { configured: true, problems };
  setupCache = { at: Date.now(), value };
  return value;
}
