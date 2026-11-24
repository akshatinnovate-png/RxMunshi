// Supabase Edge Function (Deno): the 08:00 IST daily job.
// For every shop: write the morning digest (expiry 90/60/30 crossings, value at
// risk, refills due) and send approved WhatsApp refill templates to patients
// with an active DPDP consent whose medicines run out within 3 days.
// Invoked by pg_cron (see migrations/20261124000002_daily_job.sql).
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const WA_TEMPLATE = Deno.env.get('WHATSAPP_REFILL_TEMPLATE') ?? 'refill_reminder_v1';
const LEAD_DAYS = 3;

function todayIST(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  return new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}

async function sendTemplate(phone: string, lang: 'hi' | 'en', name: string, meds: string, date: string) {
  if (!WA_TOKEN || !WA_PHONE_ID) return { ok: false, reason: 'whatsapp not configured' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: WA_TEMPLATE,
        language: { code: lang === 'hi' ? 'hi' : 'en' },
        components: [{ type: 'body', parameters: [name, meds, date].map((text) => ({ type: 'text', text })) }],
      },
    }),
  });
  return { ok: res.ok, reason: res.ok ? '' : `HTTP ${res.status}` };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorised', { status: 401 });
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const today = todayIST();
  const { data: shops, error } = await db.from('shops').select('id, name');
  if (error) return new Response(error.message, { status: 500 });

  const report: unknown[] = [];
  for (const shop of shops ?? []) {
    const { data: batches } = await db
      .from('inventory_batches')
      .select('id, medicine_name, batch_no, expiry_date, qty, cost_inr')
      .eq('shop_id', shop.id)
      .eq('status', 'active')
      .gt('qty', 0)
      .lte('expiry_date', addDays(today, 90));
    const crossings = (batches ?? [])
      .map((b) => ({ ...b, days: Math.round((Date.parse(b.expiry_date) - Date.parse(today)) / 86_400_000) }))
      .filter((b) => b.days === 90 || b.days === 60 || b.days === 30 || b.days < 0);
    const valueAtRisk = (batches ?? []).reduce((s, b) => s + b.qty * Number(b.cost_inr), 0);

    const { data: due } = await db
      .from('chronic_patients')
      .select('id, patient_name, whatsapp_phone, medicine_summary, next_refill_date, preferred_lang, dpdp_opt_in, refill_status, consent_log(withdrawn_at)')
      .eq('shop_id', shop.id)
      .eq('dpdp_opt_in', true)
      .in('refill_status', ['none', 'due'])
      .lte('next_refill_date', addDays(today, LEAD_DAYS));

    const sent: string[] = [];
    for (const p of due ?? []) {
      const consents = (p as { consent_log: { withdrawn_at: string | null }[] }).consent_log ?? [];
      if (!consents.some((c) => !c.withdrawn_at)) continue; // DPDP: no active consent, no message
      const r = await sendTemplate(p.whatsapp_phone, p.preferred_lang, p.patient_name.split(' ')[0], p.medicine_summary, p.next_refill_date);
      if (!r.ok) {
        await db.from('chronic_patients').update({ refill_status: 'due' }).eq('id', p.id);
        continue;
      }
      await db.from('chronic_patients').update({ refill_status: 'nudged', last_nudged_at: new Date().toISOString() }).eq('id', p.id);
      await db.from('messages').insert({ shop_id: shop.id, to_kind: 'patient', to_id: p.id, to_phone: p.whatsapp_phone, direction: 'out', body: `template:${WA_TEMPLATE}`, lane: 'cloud' });
      sent.push(p.id);
    }

    const body = { crossings, value_at_risk_inr: Math.round(valueAtRisk), refills_due: (due ?? []).length, nudges_sent: sent.length };
    await db.from('digests').upsert({ shop_id: shop.id, for_date: today, body }, { onConflict: 'shop_id,for_date' });
    await db.from('audit_events').insert({ shop_id: shop.id, actor: 'system:08:00', action: 'daily.run', entity: 'digests', details: body });
    report.push({ shop: shop.id, ...body });
  }
  return Response.json({ date: today, shops: report });
});
