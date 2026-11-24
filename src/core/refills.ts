// Chronic-patient refills, gated by DPDP Act 2023 consent.
import type { Consent, ISODate, Lang, Patient, Shop } from './types';
import { addDays, daysBetween } from './util';

export const NUDGE_LEAD_DAYS = 3;

export function hasActiveConsent(p: Patient, consents: Consent[]): boolean {
  return p.dpdp_opt_in && consents.some((c) => c.patient_id === p.id && !c.withdrawn_at);
}

export function daysToRefill(p: Patient, today: ISODate) {
  return daysBetween(today, p.next_refill_date);
}

/** Patients whose medicines run out within the lead time and who have not answered yet. */
export function refillsDue(patients: Patient[], today: ISODate, lead = NUDGE_LEAD_DAYS): Patient[] {
  return patients
    .filter((p) => daysToRefill(p, today) <= lead && ['none', 'due', 'nudged'].includes(p.refill_status))
    .sort((a, b) => (a.next_refill_date < b.next_refill_date ? -1 : 1));
}

export function nudgeable(patients: Patient[], consents: Consent[], today: ISODate): Patient[] {
  return refillsDue(patients, today).filter((p) => p.refill_status !== 'nudged' && hasActiveConsent(p, consents));
}

export function refillMessage(p: Patient, shop: Pick<Shop, 'name' | 'phone'>, lang: Lang = p.preferred_lang): string {
  const first = p.patient_name.split(' ')[0];
  if (lang === 'hi') {
    return (
      `नमस्ते ${first} जी, ${shop.name} से। आपकी दवाइयाँ (${p.medicine_summary}) ` +
      `${new Date(p.next_refill_date).toLocaleDateString('hi-IN', { day: 'numeric', month: 'long' })} तक खत्म हो जाएँगी। ` +
      `तैयार रखें? जवाब दें: YES / NO. संदेश बंद करने के लिए STOP लिखें।`
    );
  }
  return (
    `Namaste ${first} ji, from ${shop.name}. Your medicines (${p.medicine_summary}) run out around ` +
    `${new Date(p.next_refill_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. ` +
    `Shall we keep them ready? Reply YES or NO. Reply STOP to opt out.`
  );
}

export type ReplyIntent = 'yes' | 'no' | 'stop' | null;

/** Only these intents are accepted from inbound messages: text is data, never instructions. */
export function parseReply(text: string): ReplyIntent {
  const s = text.trim().toLowerCase().replace(/[.!?।]+$/g, '');
  if (/^(stop|band karo|band|unsubscribe|बंद|बंद करो|रोकें)$/.test(s)) return 'stop';
  if (/^(yes|y|ha|haan|han|haa|ji|ji haan|ok|okay|हाँ|हां|हा|जी|जी हाँ)$/.test(s)) return 'yes';
  if (/^(no|n|nahi|nahin|na|नहीं|ना)$/.test(s)) return 'no';
  return null;
}

/** After the patient collects, the next refill date moves on by one cycle. */
export function nextCycle(p: Patient, today: ISODate): ISODate {
  return addDays(today > p.next_refill_date ? today : p.next_refill_date, p.refill_cycle_days);
}

export function refillRevenueAtStake(patients: Patient[], today: ISODate) {
  return refillsDue(patients, today).reduce((s, p) => s + p.monthly_bill_inr, 0);
}
