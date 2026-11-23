# Outreach CRM (EspoCRM)

[EspoCRM](https://github.com/espocrm/espocrm) runs as its **own Railway service**, separate from the website. It's a PHP application with its own MySQL database. Use it to keep track of the organizations in the site's directory and email them about Low Vision Navigator.

- `crm/Dockerfile`: the official `espocrm/espocrm` image (pinned to 10.1.4), plus `railway-entrypoint.sh`, which adapts it to Railway:
  - keeps EspoCRM's three data folders on one Railway volume
  - runs the background job daemon (it sends mass email) in the same container
  - listens on Railway's `PORT`
- `scripts/crm-sync.mjs` (`npm run crm:sync`): copies the directory's 214 organizations into EspoCRM as Accounts and adds them to an outreach Target List.

## 1. Deploy on Railway

In the same Railway project as the website:

1. **Database:** + New → Database → **MySQL**.
2. **Service:** + New → GitHub Repo → this repository. Then, in the new service's **Settings**:
   - **Root Directory:** `/crm`. Railway then builds `crm/Dockerfile` and reads `crm/railway.json`. Only changes under `crm/` redeploy it.
   - **Volume:** right-click the service → Attach Volume, mount path **`/persist`**. Without it, everything in the CRM is lost on every redeploy.
3. **Variables** on the CRM service (`${{MySQL.…}}` are Railway reference variables):

   | Variable | Value |
   |---|---|
   | `ESPOCRM_DATABASE_PLATFORM` | `Mysql` |
   | `ESPOCRM_DATABASE_HOST` | `${{MySQL.MYSQLHOST}}` |
   | `ESPOCRM_DATABASE_PORT` | `${{MySQL.MYSQLPORT}}` |
   | `ESPOCRM_DATABASE_NAME` | `${{MySQL.MYSQLDATABASE}}` |
   | `ESPOCRM_DATABASE_USER` | `${{MySQL.MYSQLUSER}}` |
   | `ESPOCRM_DATABASE_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
   | `ESPOCRM_ADMIN_USERNAME` | your admin username (not `admin`) |
   | `ESPOCRM_ADMIN_PASSWORD` | a long, unique password |
   | `ESPOCRM_SITE_URL` | `https://crm.lowvisionnavigator.org` (or the Railway domain) |
   | `ESPOCRM_TIME_ZONE` | optional, e.g. `America/New_York` |

4. **Domain:** Settings → Networking → Generate Domain, or add a custom domain such as `crm.lowvisionnavigator.org`. Then make `ESPOCRM_SITE_URL` match it.
5. Deploy. The first start installs EspoCRM (about a minute). The log shows `Installation completed successfully` and then `EspoCRM is ready; starting the job daemon`. Sign in with the admin username and password.

The admin username and password are only read on the **first** install. If the variables weren't set yet at that moment, EspoCRM used its defaults: username `admin`, password `password`. Change those immediately.

**Can't sign in? Reset the admin account:**
1. Set `ESPOCRM_ADMIN_USERNAME` and `ESPOCRM_ADMIN_PASSWORD` to what you want, and add `ESPOCRM_RESET_ADMIN=true`.
2. Redeploy. About a minute after start, the deploy log shows `Password set for admin user "…"`.
3. Sign in, then remove `ESPOCRM_RESET_ADMIN`.

The reset creates the user if it doesn't exist and sets its password. It runs once per username and password pair, so leaving the switch on won't undo a password you later change inside EspoCRM. The password is never written to the logs.

**Upgrading:** change the version in `crm/Dockerfile` (tags at https://hub.docker.com/r/espocrm/espocrm/tags), commit, and deploy. EspoCRM migrates the database on start. Back up first: Railway volumes and the MySQL service both support backups.

## 2. Set up sending email

EspoCRM sends through an SMTP provider. A transactional provider (Brevo, Postmark, SendGrid, Amazon SES, Mailgun…) gets far better delivery than a personal mailbox.

1. In the provider, verify the sending domain and add the **SPF, DKIM and DMARC** DNS records it gives you. Consider a subdomain such as `mail.lowvisionnavigator.org`, so outreach doesn't affect the main domain's reputation.
2. In EspoCRM: **Administration → Outbound Emails**. Enter the provider's SMTP server, port and credentials, and the From address. Send a test email.
3. Railway only allows outgoing SMTP on some plans. If the test email times out, check your plan, or use the provider's alternative port if it has one (several offer 2525).

## 3. Load the directory into the CRM

1. In EspoCRM, **Administration → API Users → Create**: authentication method **API Key**, with a role that can create and edit Accounts and Target Lists. Copy the API key.
2. Locally, in `.env` (never commit it):

   ```
   ESPOCRM_URL=https://crm.lowvisionnavigator.org
   ESPOCRM_API_KEY=…
   ```
3. Preview, then apply:

   ```bash
   npm run crm:sync
   npm run crm:sync -- --apply
   ```

   Use `--country=US,CA` to limit it to some countries.

The script matches organizations by name, so you can re-run it whenever the directory changes. New organizations are added. For existing ones it only fills in fields that are empty in the CRM, so your edits there are never overwritten.

**The directory has no email addresses.** Before emailing an organization, open its Account in EspoCRM and add a contact email. A named contact (Contacts → linked to the Account) usually beats a generic `info@` address.

## 4. Send the outreach email

1. **Campaigns → Create Campaign**, type **Email**, target list **"Low Vision Navigator outreach"**.
2. Create an **Email Template**. EspoCRM adds an unsubscribe link to campaign emails; keep it.
3. In the campaign, add a **Mass Email** with the template, the outbound address and a send time. The job daemon sends it in batches. Opens, clicks, bounces and unsubscribes appear on the campaign.

**Rules for unsolicited email:**
- **US (CAN-SPAM):** a clear subject, a postal address in the email, and a working unsubscribe that's honoured.
- **Canada (CASL):** emailing an organization's publicly listed business address is generally allowed only when the message relates to their work.
- **EU:** many EU countries restrict unsolicited email, even to organizations.

The directory includes EU organizations, so start with `--country=US,CA` or check local rules first. This isn't legal advice.
