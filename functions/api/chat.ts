/**
 * Cloudflare Pages Functions entry for the assistant: serves POST /api/chat.
 * The logic lives in server/chat/handler.ts.
 *
 * Set ANTHROPIC_API_KEY (as a secret) in Cloudflare → Workers & Pages →
 * lowvision-full-site → Settings → Variables and Secrets.
 */
import { handleChat, type ChatEnv } from '../../server/chat/handler';

interface PagesContext {
  request: Request;
  env: ChatEnv;
}

export const onRequestPost = (context: PagesContext) => handleChat(context.request, context.env);
