# Low Vision Navigator

React + Vite site, prerendered at build time, served by a small Node/Express
server (`server/`) that also provides email/password accounts and saved-plan
sync backed by Postgres, and an accessible AI assistant (OpenAI GPT-6 Luna) at
`/assistant`. Everything runs on Railway.

## Deploying on Railway

1. In the Railway project, add a **Postgres** service (+ New → Database → PostgreSQL).
2. Add this GitHub repo as a service (+ New → GitHub Repo). It builds from `Dockerfile`.
3. On the web service, add the variables `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   and `OPENAI_API_KEY` (for the assistant; optional `CHAT_MODEL`, default
   `gpt-6-luna`, and `CHAT_EFFORT`: `low` | `medium` | `high`).
   For the admin dashboard, set `ADMIN_EMAILS` (and optionally the PostHog
   variables; see below).
4. Settings → Networking → Generate Domain (or add `lowvisionnavigator.org`).

Tables are created automatically on startup. Health check: `/healthz`.

## Admin dashboard (`/admin`)

Sign in with an account whose email is listed in `ADMIN_EMAILS`; an **Admin
Dashboard** link then appears in the account menu. It has two tabs:

- **Analytics**: page views, visitors, top pages, referrers, devices,
  countries, and intake/assistant/contact events for the last 7, 30 or 90
  days, compared with the previous period.
- **SEO**: Google rankings from DataForSEO (see below).
- **Messages**: contact-form submissions, with reply links and
  new/handled status.

Server code: `server/admin-api.mjs` (`/api/admin/*`). Scripts can call the
same endpoints with `Authorization: Bearer $ADMIN_TOKEN`.

## Analytics (PostHog)

`src/lib/analytics.ts` asks the server which provider to use:

- **PostHog** when `POSTHOG_PROJECT_KEY` is set. Set up to protect privacy:
  cookieless mode, no person profiles, no autocapture, session recording,
  surveys or feature flags. Query strings are stripped from every URL, and
  Do Not Track / Global Privacy Control visitors are never tracked. Events go
  through this server's `/ingest` proxy (`server/posthog.mjs`), so the site's
  CSP stays `connect-src 'self'` and ad blockers don't drop them.
  Custom events: `intake_started`, `intake_completed`, `contact_submitted`
  (category only) and `assistant_question` (never the text).
- **Built-in counter** otherwise: daily page counts in the `page_views` table
  (path and referrer host only).

### Connecting PostHog

1. In PostHog → Project settings:
   - **turn on cookieless server hash mode.** Without it, PostHog ignores
     cookieless events.
   - **turn on "Discard client IP data"**, which the Privacy page promises.
2. Copy the **Project API key** (`phc_…`) and the **project ID** (the number in
   the project URL).
3. Create a **personal API key** (`phx_…`) with the `query:read` scope.
4. On the Railway web service, set `POSTHOG_PROJECT_KEY`, `POSTHOG_PROJECT_ID`,
   `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_REGION` (`us` or `eu`), then redeploy.

The startup log shows which mode is active, e.g.
`[analytics] collection: PostHog; admin reports: PostHog`. Dashboard queries
are cached for 5 minutes. If PostHog can't be reached, the dashboard falls back
to the built-in counter and says so.

## SEO data (DataForSEO)

`server/seo.mjs` pulls data from DataForSEO. DataForSEO charges per request,
so the dashboard never calls it directly: the server takes a **snapshot**,
stores it in the `seo_snapshots` table, and the SEO tab reads the stored
snapshots. Each snapshot includes:

- **Ranked keywords** (`dataforseo_labs/google/ranked_keywords/live`): every
  keyword the site ranks for, with Google position, search volume, estimated
  visits and ranking page. These feed the keyword table, the position
  breakdown, top pages, and new/improved/declined/lost keywords between
  snapshots.
- **Competitors** (`dataforseo_labs/google/competitors_domain/live`).
- **Backlinks summary** (`backlinks/summary/live`). This needs DataForSEO's
  separate Backlinks subscription; without it this part is skipped and the
  rest of the snapshot is still saved.

Snapshots are taken when an admin clicks **Fetch fresh data** (at most one
every 10 minutes) and automatically every `SEO_AUTO_REFRESH_DAYS` days
(default 7; `0` turns it off). A snapshot usually costs $0.05–$0.20, and the
cost of each one is shown in the snapshot history. Each snapshot's raw
DataForSEO responses can be downloaded as JSON from the dashboard.

Setup: set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` (the API credentials
from DataForSEO's API Access page) on the web service. The other `SEO_*`
variables are optional (see `.env.example`).

## Accounts: forgot password and Sign in with Google

- **Forgot password:** `/forgot-password` emails a single-use reset link that expires in 1 hour, sent through the CRM like the other notifications. It needs [email notifications](#email-notifications) to be on. Only a hash of the token is stored, the page never reveals whether an account exists, and a reset signs the person out on their other devices.
- **Sign in with Google:** a "Continue with Google" button on `/login`, shown only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. It signs into the account with the same email if there is one (Google must have verified that email), otherwise it creates one. Setup:
  1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the **OAuth consent screen** (External; app name, support email, the site's domain), then **Create credentials → OAuth client ID → Web application**.
  2. Add the authorized redirect URI `https://lowvisionnavigator.org/api/auth/google/callback`.
  3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the website service and redeploy.

  People who signed up with Google can add a password later with "Forgot password?".

## Email notifications

Professionals get emails about their directory listing (received, approved, changes needed, removed). Admins get emails for listings to review and new contact messages. They're sent **through EspoCRM** (`server/notify.mjs`), queued in the `email_outbox` table and retried if the CRM is unavailable. Setup and status are in `/admin` → Messages; the steps are in [`crm/README.md`](crm/README.md#5-website-email-notifications).

## Contact form

`POST /api/contact` (`server/public-api.mjs`) saves messages to the
`contact_messages` table. Spam protection is a honeypot field plus a per-IP
limit of 10 messages an hour. Read and triage them on the dashboard's
**Messages** tab.

## Outreach CRM (EspoCRM)

`crm/` deploys [EspoCRM](https://github.com/espocrm/espocrm) as a separate
Railway service (with its own MySQL database) for emailing organizations about
the site. `npm run crm:sync` loads the resource directory into it as Accounts
on an outreach Target List. Setup, sending email, and campaign steps are in
[`crm/README.md`](crm/README.md).

## AI assistant

- `server/chat/handler.ts`: the assistant (OpenAI Responses API, site search
  tools, web search). `npm run build` bundles it to `dist-node/chat.mjs`, and
  `server/chat-route.mjs` serves it at `POST /api/chat`.
- `scripts/build-chat-knowledge.mjs`: after prerendering, extracts every page's
  text into `server/chat/site-pages.json`, the assistant's site knowledge.
- `src/components/chat/`: the accessible chat UI (dialog on every page, plus
  the `/assistant` page).

## Local development

```bash
npm install
cp .env.example .env   # set DATABASE_URL to a local Postgres
npm run dev:server     # API on :3000 (reads .env)
npm run dev            # Vite on :5173, proxies /api to :3000
```

Production build: `npm run build && npm start`.
