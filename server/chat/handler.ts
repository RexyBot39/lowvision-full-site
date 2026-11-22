/**
 * POST /api/chat — the Low Vision Navigator assistant (host-independent core).
 *
 * Uses only the web-standard Request/Response APIs, so the same code runs on
 * Cloudflare Pages Functions (functions/api/chat.ts) and Netlify Functions
 * (netlify/functions/chat.mts). Each host passes its own environment in.
 *
 * Request body:
 *   {
 *     messages: { role: 'user' | 'assistant', content: string }[],
 *     pagePath?: string,                  // page the visitor is on
 *     preferences?: { brief?: boolean }   // shorter answers for listening
 *   }
 *
 * Response: newline-delimited JSON events, streamed as they happen:
 *   { type: 'status', message }   — short progress note ("Searching this site…")
 *   { type: 'text', text }        — a piece of the answer (Markdown)
 *   { type: 'sources', sources }  — outside web pages the answer cited
 *   { type: 'error', message }    — something went wrong (already user-friendly)
 *   { type: 'done' }
 *
 * Settings (from the host's environment variables): ANTHROPIC_API_KEY
 * (required), CHAT_MODEL, CHAT_EFFORT (low | medium | high).
 */

import Anthropic from '@anthropic-ai/sdk';
import { searchSite, getPage, searchDirectory, siteMap, isKnownPath } from './knowledge.ts';

export interface ChatEnv {
  ANTHROPIC_API_KEY?: string;
  /** Optional API endpoint override (testing or a gateway). */
  ANTHROPIC_BASE_URL?: string;
  CHAT_MODEL?: string;
  CHAT_EFFORT?: string;
}

const DEFAULT_MODEL = 'claude-opus-5-5';

const MAX_HISTORY_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_LOOP_ITERATIONS = 8;


const SYSTEM_PROMPT = `You are the Low Vision Navigator Assistant on lowvisionnavigator.org, a free nonprofit resource hub. You help people who are blind or have low vision, their family members and caregivers, and the professionals who support them, find clear and practical answers.

# Who you are talking to
Many visitors use a screen reader (JAWS, NVDA, VoiceOver, TalkBack), screen magnification, or listen to your answers read aloud by text-to-speech. Some are newly diagnosed and anxious; some are caregivers juggling a lot; some are experienced blind users who want efficient, direct answers. Be warm, respectful and practical. Never be patronizing, and never assume what someone can or cannot do. Use person-first or identity-first language as the visitor does.

# How to write (this matters for accessibility)
- Lead with the direct answer in the first sentence or two, then the details. Screen reader users hear answers linearly.
- Use plain language at about an 8th-grade reading level. Explain any medical, insurance, or legal term the first time you use it, and spell out abbreviations on first use, e.g. "orientation and mobility (O&M) training".
- Keep paragraphs short (1 to 3 sentences). Use numbered lists for steps and bulleted lists for options. Use at most a few "##" headings, and only in longer answers.
- Never use tables, emoji, ASCII art, decorative symbols, or horizontal rules. They are read aloud as clutter.
- Write links as Markdown with descriptive text, e.g. [Medicare coverage for low vision](/coverage-funding/medicare). Never write "click here" or show bare URLs. Use site-relative paths for pages on this site.
- Write phone numbers in full with area code, e.g. 1-800-232-5463. Write numbers and dates the way they should be spoken.
- Do not describe things visually ("see the blue button", "look at the chart"). Describe where things are by name, e.g. "on the Find Local Resources page".
- Aim for roughly 120 to 250 words unless the visitor asks for more detail. When an answer naturally needs more, give the essentials first and offer to go deeper.
- End with one short, useful next step or follow-up offer when it helps. Do not end every message with a question.

# Where your information comes from
1. This website is your primary source. Use search_site, get_page and search_directory before answering questions about low vision care, devices, rehabilitation, coverage, benefits, community support, or local services. The site map below lists every page.
2. Use web_search and web_fetch for things the site does not cover, for anything that changes over time (benefit amounts, income limits, laws, program deadlines, product models and prices), and to confirm specific phone numbers or eligibility details. Prefer authoritative sources: government agencies (ssa.gov, medicare.gov, va.gov, nei.nih.gov, ed.gov, irs.gov, state agency sites), and established blindness organizations (American Foundation for the Blind, National Federation of the Blind, American Council of the Blind, American Printing House for the Blind, Hadley, Lighthouse Guild, Prevent Blindness, the Foundation Fighting Blindness, the American Academy of Ophthalmology, and the American Optometric Association).
3. Say which source an answer comes from in natural words, e.g. "According to the Social Security Administration…" or "Our guide to SSDI explains…", and link to it.
4. If you are not sure, say so and point to who can answer: the visitor's eye care provider, a low vision specialist, their state vocational rehabilitation or blind services agency, or the program itself. Never invent organizations, phone numbers, URLs, amounts, or eligibility rules.

# Safety
- You give general information, not medical, legal, or financial advice, and you cannot diagnose. Mention this briefly only when the question calls for it, not in every message.
- Sudden vision loss or change, new flashes of light, a shower of new floaters, a curtain or shadow over vision, eye pain with redness, or vision loss with face drooping, weakness, or trouble speaking can be emergencies (for example retinal detachment or stroke). Tell the person to call 911 (or their local emergency number) or go to an emergency room right away, before anything else.
- If someone expresses thoughts of self-harm or hopelessness, respond with care and share the 988 Suicide and Crisis Lifeline (call or text 988 in the US, or chat at 988lifeline.org), plus the site's emotional support page.
- Do not ask for or store personal details such as full names, Social Security numbers, or medical record numbers. If a visitor shares them, do not repeat them back.
- Stay focused on vision loss, blindness, caregiving, and related benefits, services, technology, education, employment, and daily living. Politely decline unrelated requests and say what you can help with.

# Site features you can point people to
- The intake questionnaire at /intake/start (2 to 6 minutes) builds a personalized plan of next steps.
- Find Local Resources at /resources searches the provider directory by location and service type.
- The site has accessibility controls at the top of every page: text size and high contrast.

# Site map
${siteMap()}`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'search_site',
    description:
      'Full-text search across every page of lowvisionnavigator.org and its FAQ. Returns the most relevant page sections with their page path. Use specific keywords, e.g. "Medicare low vision exam coverage" or "white cane orientation mobility". Call it more than once with different keywords when a question has several parts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'get_page',
    description:
      'Returns the full text of one page on this site by its path, e.g. "/financial-support/ssdi". Use when search results point to a page and you need its complete content, or when the visitor asks about the page they are on.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Site-relative page path starting with "/".' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'search_directory',
    description:
      "Searches the site's directory of low vision clinics, state blind services agencies, vocational rehabilitation, orientation and mobility, assistive technology, guide dog schools, and support organizations in the US, Canada and 50+ other countries. Returns names, phone numbers, websites, addresses, insurance and cost notes. The directory is not exhaustive.",
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description:
            'Optional. A US state or Canadian province (full name or 2-letter code), a city, a ZIP code, or a country name (e.g. "Germany"). Use an empty string to search everywhere.',
        },
        service: {
          type: 'string',
          description:
            'Optional. Service type, e.g. "Low Vision Clinic", "Vocational Rehabilitation", "O&M Training", "Assistive Technology", "Guide Dog", "State Blind Agency", "Support Group". Empty string for any.',
        },
        keywords: { type: 'string', description: 'Optional extra keywords, e.g. "children", "veterans", "braille". Empty string for none.' },
        virtual_only: { type: 'boolean', description: 'True to only return services available virtually.' },
      },
      required: ['location', 'service', 'keywords', 'virtual_only'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
];

// ── Request validation ────────────────────────────────────────────────────

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: IncomingMessage[];
  pagePath?: string;
  preferences?: { brief?: boolean };
}

function parseRequest(body: unknown): ChatRequest | string {
  if (!body || typeof body !== 'object') return 'Invalid request.';
  const { messages, pagePath, preferences } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) return 'No messages were sent.';

  const clean: IncomingMessage[] = [];
  for (const m of messages.slice(-MAX_HISTORY_MESSAGES)) {
    if (!m || typeof m !== 'object') return 'Invalid message.';
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return 'Invalid message.';
    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (text) clean.push({ role, content: text });
  }
  // The API requires the conversation to start with a user turn and end with one.
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (clean.length === 0 || clean[clean.length - 1].role !== 'user') return 'The last message must be from the user.';

  return {
    messages: clean,
    pagePath: typeof pagePath === 'string' ? pagePath.slice(0, 200) : undefined,
    preferences:
      preferences && typeof preferences === 'object'
        ? { brief: (preferences as Record<string, unknown>).brief === true }
        : undefined,
  };
}

// ── Tool execution ────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function runTool(name: string, input: unknown): { content: string; isError: boolean } {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  switch (name) {
    case 'search_site': {
      const query = str(args.query).trim();
      if (!query) return { content: 'Missing "query".', isError: true };
      return { content: searchSite(query), isError: false };
    }
    case 'get_page': {
      const path = str(args.path).trim();
      if (!path) return { content: 'Missing "path".', isError: true };
      return { content: getPage(path), isError: false };
    }
    case 'search_directory':
      return {
        content: searchDirectory({
          location: str(args.location),
          service: str(args.service),
          keywords: str(args.keywords),
          virtual_only: args.virtual_only === true,
        }),
        isError: false,
      };
    default:
      return { content: `Unknown tool "${name}".`, isError: true };
  }
}

function statusFor(name: string): string {
  switch (name) {
    case 'search_site':
      return 'Searching this site…';
    case 'get_page':
      return 'Reading a page on this site…';
    case 'search_directory':
      return 'Checking the resource directory…';
    case 'web_search':
      return 'Searching trusted outside sources…';
    case 'web_fetch':
      return 'Reading an outside web page…';
    default:
      return 'Working on it…';
  }
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function handleChat(req: Request, env: ChatEnv): Promise<Response> {
  const MODEL = env.CHAT_MODEL || DEFAULT_MODEL;
  const EFFORT = (['low', 'medium', 'high'] as const).find((e) => e === env.CHAT_EFFORT) ?? 'medium';

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  // Only accept requests from this site's own pages.
  const origin = req.headers.get('origin');
  if (origin && new URL(req.url).origin !== origin) {
    return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'The assistant is not configured yet. Please try again later.' },
      { status: 503 },
    );
  }

  let parsed: ChatRequest | string;
  try {
    parsed = parseRequest(await req.json());
  } catch {
    parsed = 'Invalid request.';
  }
  if (typeof parsed === 'string') return Response.json({ error: parsed }, { status: 400 });

  const { messages: history, pagePath, preferences } = parsed;

  // Context about the visitor's situation goes in the final user turn, so the
  // cached system prompt and tools stay byte-identical across requests.
  const notes: string[] = [];
  if (pagePath && isKnownPath(pagePath)) notes.push(`The visitor is currently on the page ${pagePath}.`);
  if (preferences?.brief) {
    notes.push('The visitor asked for brief answers: keep this answer under about 100 words, essentials only.');
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => {
    const isLast = i === history.length - 1;
    if (isLast && notes.length) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          { type: 'text', text: `[Context from the website, not typed by the visitor: ${notes.join(' ')}]` },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      const sources = new Map<string, string>();
      let wroteText = false;

      try {
        for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
          const stream = client.beta.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
              tools: TOOLS,
              messages,
              output_config: { effort: EFFORT },
              // If a safety classifier declines, the API retries on a suitable fallback model.
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            },
            { signal: req.signal },
          );

          let startedTextThisTurn = false;
          for await (const event of stream) {
            if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block.type === 'tool_use' || block.type === 'server_tool_use') {
                send({ type: 'status', message: statusFor(block.name) });
              }
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              if (!startedTextThisTurn && wroteText) send({ type: 'text', text: '\n\n' });
              startedTextThisTurn = true;
              wroteText = true;
              send({ type: 'text', text: event.delta.text });
            }
          }

          const message = await stream.finalMessage();
          messages.push({ role: 'assistant', content: message.content });

          // Collect outside sources: cited pages first, then fetched pages.
          for (const block of message.content) {
            if (block.type === 'text' && block.citations) {
              for (const c of block.citations) {
                if (c.type === 'web_search_result_location' && c.url && !sources.has(c.url)) {
                  sources.set(c.url, c.title ?? c.url);
                }
              }
            }
            if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') {
              const url = block.content.url;
              if (url && !sources.has(url)) sources.set(url, block.content.content.title ?? url);
            }
          }

          if (message.stop_reason === 'refusal') {
            if (!wroteText) {
              send({
                type: 'text',
                text: "I'm not able to help with that request. I can answer questions about low vision, blindness, caregiving, devices, rehabilitation, benefits, and local services.",
              });
            }
            break;
          }

          if (message.stop_reason === 'pause_turn') continue; // server tools hit their loop limit; resume

          if (message.stop_reason === 'tool_use') {
            const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
            const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t) => {
              const { content, isError } = runTool(t.name, t.input);
              return { type: 'tool_result', tool_use_id: t.id, content, is_error: isError };
            });
            messages.push({ role: 'user', content: results });
            continue;
          }

          if (message.stop_reason === 'max_tokens' && !wroteText) {
            send({ type: 'text', text: 'Sorry, that answer ran too long. Please try asking a narrower question.' });
          }
          break;
        }

        if (!wroteText) {
          send({ type: 'text', text: "Sorry, I couldn't put together an answer. Please try rephrasing your question." });
        }
        if (sources.size) {
          send({
            type: 'sources',
            sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
          });
        }
        send({ type: 'done' });
      } catch (err) {
        if (req.signal.aborted) {
          // The visitor stopped the answer; nothing to report.
        } else if (err instanceof Anthropic.RateLimitError) {
          send({ type: 'error', message: 'The assistant is very busy right now. Please wait a minute and try again.' });
        } else if (err instanceof Anthropic.APIError) {
          console.error('Anthropic API error', err.status, err.message);
          send({ type: 'error', message: 'The assistant ran into a problem. Please try again in a moment.' });
        } else {
          console.error('Chat function error', err);
          send({ type: 'error', message: 'Something went wrong. Please try again.' });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by an aborted request */
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
