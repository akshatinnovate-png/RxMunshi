import { firstText, generate, OCR_RULES, RX_SCHEMA } from '@/server/gemini';
import { currentUser, json, rateLimited, readUpload } from '@/server/guard';
import { sanitizeRx } from '@/core/ocr';
import { todayIST } from '@/core/util';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** POST multipart {file}: a prescription → prescriber, patient and lines. */
export async function POST(req: Request) {
  if (rateLimited(req, 'scan', 20)) return json({ error: 'Too many scans, wait a minute.' }, 429);
  if (!(await currentUser(req))) return json({ error: 'Sign in first.' }, 401);
  const up = await readUpload(req);
  if ('error' in up) return json({ error: up.error }, up.status);
  const r = await generate({
    systemInstruction: { parts: [{ text: OCR_RULES }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: up },
          { text: 'Read this prescription: prescriber name, address and registration number; patient name and address; each medicine with dose and number of packs (strips) to supply.' },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RX_SCHEMA },
  });
  if (!r.ok) return json({ error: r.error, fallback: r.status === 503 }, r.status);
  try {
    return json({ read: sanitizeRx(JSON.parse(firstText(r.json)), todayIST()) });
  } catch {
    return json({ error: 'The model did not return JSON.' }, 502);
  }
}
