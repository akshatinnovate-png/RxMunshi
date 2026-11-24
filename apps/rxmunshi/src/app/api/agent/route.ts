import { generate, type GeminiContent } from '@/server/gemini';
import { currentUser, json, rateLimited } from '@/server/guard';
import { SYSTEM_PROMPT, toolDeclarations } from '@/core/agent';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * One step of Munshi's loop. The browser runs the tools against the shop's
 * records (they live there in Demo mode, and behind RLS in live mode) and sends
 * the results back; this route only talks to Gemini.
 */
export async function POST(req: Request) {
  if (rateLimited(req, 'agent', 40)) return json({ error: 'Too many requests, wait a minute.' }, 429);
  if (!(await currentUser(req))) return json({ error: 'Sign in first.' }, 401);
  const body = (await req.json().catch(() => null)) as { contents?: GeminiContent[]; today?: string; shop?: string } | null;
  const contents = Array.isArray(body?.contents) ? body!.contents.slice(-16) : [];
  if (!contents.length) return json({ error: 'No conversation.' }, 400);
  if (JSON.stringify(contents).length > 60_000) return json({ error: 'Conversation too long.' }, 413);
  const r = await generate({
    systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\nToday is ${body?.today ?? ''} (IST). Shop: ${String(body?.shop ?? '').slice(0, 80)}.` }] },
    contents,
    tools: [{ functionDeclarations: toolDeclarations() }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.2 },
  });
  if (!r.ok) return json({ error: r.error, fallback: true }, r.status);
  const content = r.json.candidates?.[0]?.content ?? { role: 'model', parts: [] };
  return json({ content, usage: r.json.usageMetadata ?? null });
}
