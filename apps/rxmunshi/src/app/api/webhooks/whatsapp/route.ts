import { verifySignature } from '@/server/whatsapp';
import { json, serviceClient } from '@/server/guard';
import { parseReply } from '@/core/refills';

export const runtime = 'nodejs';

/** Meta subscription handshake. */
export function GET(req: Request) {
  const u = new URL(req.url);
  const ok = u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('forbidden', { status: 403 });
}

interface WaMessage {
  from: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string } };
}

/**
 * A patient replied. Only YES / NO / STOP are acted on; everything else is
 * logged as data. The update reaches the dashboard through Supabase Realtime.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) return new Response('bad signature', { status: 401 });
  const db = serviceClient();
  if (!db) return json({ error: 'service role not configured' }, 503);
  let payload: { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const messages = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  let handled = 0;
  for (const m of messages.slice(0, 50)) {
    const text = (m.text?.body ?? m.button?.text ?? m.button?.payload ?? m.interactive?.button_reply?.title ?? '').slice(0, 500);
    const phone = m.from.replace(/\D/g, '');
    const { data: patients } = await db.from('chronic_patients').select('id, shop_id').eq('whatsapp_phone', phone);
    for (const p of patients ?? []) {
      const intent = parseReply(text);
      await db.from('messages').insert({ shop_id: p.shop_id, to_kind: 'patient', to_id: p.id, to_phone: phone, direction: 'in', body: text, lane: 'cloud' });
      if (intent === 'yes') await db.from('chronic_patients').update({ refill_status: 'confirmed', last_reply: 'YES' }).eq('id', p.id);
      else if (intent === 'no') await db.from('chronic_patients').update({ refill_status: 'declined', last_reply: 'NO' }).eq('id', p.id);
      else if (intent === 'stop') {
        await db.from('consent_log').update({ withdrawn_at: new Date().toISOString() }).eq('patient_id', p.id).is('withdrawn_at', null);
        await db.from('chronic_patients').update({ dpdp_opt_in: false, refill_status: 'none', last_reply: 'STOP' }).eq('id', p.id);
      }
      await db.from('audit_events').insert({ shop_id: p.shop_id, actor: 'whatsapp', action: 'refill.reply', entity: 'chronic_patients', entity_id: p.id, details: { intent: intent ?? 'unrecognised' } });
      handled++;
    }
  }
  return json({ ok: true, handled });
}
