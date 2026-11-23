/**
 * POST /api/chat: the AI assistant, as an Express handler.
 *
 * The assistant itself lives in server/chat/handler.ts (TypeScript, written
 * against the web-standard Request/Response). `npm run build` bundles it to
 * dist-node/chat.mjs; this file loads that bundle and bridges Express's
 * request/response to it, streaming the answer back as it is generated.
 */

import { Readable } from 'node:stream';

let handlerPromise;
function loadHandler() {
  handlerPromise ??= import('../dist-node/chat.mjs')
    .then((m) => m.handleChat)
    .catch((err) => {
      handlerPromise = undefined; // allow a retry after `npm run build`
      throw err;
    });
  return handlerPromise;
}

export async function chatRoute(req, res) {
  let handleChat;
  try {
    handleChat = await loadHandler();
  } catch (err) {
    console.error('[chat] assistant bundle missing — run `npm run build`', err);
    return res.status(503).json({ error: 'The assistant is not available right now.' });
  }

  // 'close' fires when the visitor disconnects (or after we finish).
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  // Build the URL from the public host so the handler's same-origin check
  // compares against what the browser sent (req.protocol honours
  // X-Forwarded-Proto because the app sets 'trust proxy').
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
    duplex: 'half',
    signal: controller.signal,
  });

  const response = await handleChat(request, {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    CHAT_MODEL: process.env.CHAT_MODEL,
    CHAT_EFFORT: process.env.CHAT_EFFORT,
  });

  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.flushHeaders();

  if (!response.body) return res.end();
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    /* visitor disconnected */
  } finally {
    res.end();
  }
}
