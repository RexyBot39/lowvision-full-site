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
4. Settings → Networking → Generate Domain (or add `lowvisionnavigator.org`).

Tables are created automatically on startup. Health check: `/healthz`.

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
