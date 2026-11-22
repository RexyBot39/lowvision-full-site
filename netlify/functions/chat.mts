/** Netlify Functions entry for the assistant. The logic lives in server/chat/handler.ts. */
import type { Config } from '@netlify/functions';
import { handleChat } from '../../server/chat/handler.ts';

export default (req: Request) =>
  handleChat(req, {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    CHAT_MODEL: process.env.CHAT_MODEL,
    CHAT_EFFORT: process.env.CHAT_EFFORT,
  });

export const config: Config = {
  path: '/api/chat',
  method: 'POST',
};
