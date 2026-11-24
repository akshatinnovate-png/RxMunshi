import { BILL_SCHEMA, firstText, generate, OCR_RULES } from '@/server/gemini';
import { currentUser, json, rateLimited, readUpload } from '@/server/guard';
import { sanitizeBill } from '@/core/ocr';
import { todayIST } from '@/core/util';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** POST multipart {file}: a wholesaler bill photo or PDF → structured lines (Gemini vision, strict JSON). */
export async function POST(req: Request) {
  if (rateLimited(req, 'scan', 20)) return json({ error: 'Too many scans, wait a minute.' }, 429);
  if (!(await currentUser(req))) return json({ error: 'Sign in first.' }, 401);
  const up = await readUpload(req);
  if ('error' in up) return json({ error: up.error }, up.status);
  const started = Date.now();
  const r = await generate({
    systemInstruction: { parts: [{ text: OCR_RULES }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: up },
          { text: 'Read this wholesaler invoice. One line per medicine batch. Rate is per pack before GST. Free quantity goes in free_qty.' },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: BILL_SCHEMA },
  });
  if (!r.ok) return json({ error: r.error, fallback: r.status === 503 }, r.status);
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstText(r.json));
  } catch {
    return json({ error: 'The model did not return JSON.' }, 502);
  }
  return json({ read: sanitizeBill(parsed, todayIST()), ms: Date.now() - started, usage: r.json.usageMetadata ?? null });
}
