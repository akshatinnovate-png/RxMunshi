import { currentUser, json, rateLimited } from '@/server/guard';

export const runtime = 'nodejs';

/** Sends a WhatsApp text through the Meta Cloud API (live mode, signed-in members only). */
export async function POST(req: Request) {
  if (rateLimited(req, 'wa', 60)) return json({ error: 'Too many messages.' }, 429);
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return json({ error: 'WhatsApp Cloud API is not configured; use wa.me links.' }, 503);
  const user = await currentUser(req);
  if (!user || user === 'demo') return json({ error: 'Sign in first.' }, 401);
  const body = (await req.json().catch(() => null)) as { to?: string; text?: string } | null;
  const to = String(body?.to ?? '').replace(/\D/g, '');
  const text = String(body?.text ?? '').slice(0, 1000);
  if (to.length < 10 || !text) return json({ error: 'Need a phone number and text.' }, 400);
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) return json({ error: `WhatsApp HTTP ${res.status}` }, 502);
  return json({ ok: true });
}
