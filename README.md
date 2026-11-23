# Low Vision Navigator

React + Vite site, prerendered at build time, served by a small Node/Express
server (`server/`) that also provides email/password accounts and saved-plan
sync backed by Postgres. Everything runs on Railway.

## Deploying on Railway

1. In the Railway project, add a **Postgres** service (+ New → Database → PostgreSQL).
2. Add this GitHub repo as a service (+ New → GitHub Repo). It builds from `Dockerfile`.
3. On the web service, add the variable `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
4. Settings → Networking → Generate Domain (or add `lowvisionnavigator.org`).

Tables are created automatically on startup. Health check: `/healthz`.

## Local development

```bash
npm install
cp .env.example .env   # set DATABASE_URL to a local Postgres
npm run dev:server     # API on :3000 (reads .env)
npm run dev            # Vite on :5173, proxies /api to :3000
```

Production build: `npm run build && npm start`.
