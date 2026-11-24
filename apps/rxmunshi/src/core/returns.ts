// F3 · Expiry Money-Back Engine: return windows, the best action per batch,
// credit-note chasing and money recovered.
import type { Batch, CreditNote, Dispense, ISODate, Patient, Wholesaler } from './types';
import { bucketOf, daysToExpiry, onShelf } from './expiry';
import { addDays, daysBetween, normName, round2, sum } from './util';

/** Wholesalers usually accept expiry returns from ~90 days before expiry until N days after. */
export const RETURN_OPENS_DAYS_BEFORE = 90;

export function returnWindow(b: Batch, w: Wholesaler | undefined) {
  const opens = addDays(b.expiry_date, -RETURN_OPENS_DAYS_BEFORE);
  const closes = addDays(b.expiry_date, w?.return_window_days ?? 0);
  return { opens, closes };
}

export function claimAmount(b: Pick<Batch, 'qty' | 'cost_inr'>, w: Wholesaler | undefined, qty = b.qty): number {
  const pct = w?.credit_pct ?? 100;
  return round2(qty * b.cost_inr * (pct / 100));
}

/** Packs per day sold over the last `days` days for a medicine. */
export function velocity(name: string, dispenses: Dispense[], today: ISODate, days = 30): number {
  const from = addDays(today, -days);
  const n = normName(name);
  const sold = sum(
    dispenses.filter((d) => d.sold_at.slice(0, 10) >= from && normName(d.medicine_name) === n),
    (d) => d.qty,
  );
  return sold / days;
}

/** Packs committed by opted-in chronic patients whose refill falls within `horizon` days. */
export function committedDemand(name: string, patients: Patient[], today: ISODate, horizon: number): number {
  const n = normName(name);
  let packs = 0;
  for (const p of patients) {
    if (!p.dpdp_opt_in || p.refill_status === 'declined') continue;
    const until = addDays(today, horizon);
    // count every refill cycle that lands inside the horizon
    let next = p.next_refill_date;
    while (next <= until) {
      if (next >= today) for (const m of p.medicines) if (normName(m.name) === n) packs += m.packs_per_cycle;
      next = addDays(next, Math.max(1, p.refill_cycle_days));
    }
  }
  return packs;
}

export type ReturnAction = 'return_now' | 'sell_first' | 'watch' | 'window_missed' | 'return_soon';

export interface BatchAdvice {
  batch: Batch;
  action: ReturnAction;
  label: string;
  reason: string;
  packs_unsold: number; // expected unsold at expiry
  rupees: number; // claim value if returned (or loss if missed)
  window_opens: ISODate;
  window_closes: ISODate;
  days_to_close: number;
}

export function adviseBatch(
  b: Batch,
  w: Wholesaler | undefined,
  dispenses: Dispense[],
  patients: Patient[],
  today: ISODate,
): BatchAdvice {
  const { opens, closes } = returnWindow(b, w);
  const daysLeft = Math.max(0, daysToExpiry(b, today));
  const vel = velocity(b.medicine_name, dispenses, today);
  const committed = committedDemand(b.medicine_name, patients, today, daysLeft);
  // keep a safety margin: we sell only until ~7 days before expiry
  const sellable = Math.floor(vel * Math.max(0, daysLeft - 7)) + committed;
  const unsold = Math.max(0, b.qty - sellable);
  const daysToClose = daysBetween(today, closes);
  const base = { batch: b, window_opens: opens, window_closes: closes, days_to_close: daysToClose, packs_unsold: unsold };

  if (daysToClose < 0) {
    return {
      ...base,
      action: 'window_missed',
      label: 'WINDOW MISSED',
      reason: `Return window closed ${-daysToClose} days ago. Segregate as expired stock.`,
      rupees: round2(b.qty * b.cost_inr),
    };
  }
  if (bucketOf(b, today) === 'expired' || (today >= opens && unsold > 0 && (daysToClose <= 45 || daysLeft <= 30))) {
    return {
      ...base,
      packs_unsold: bucketOf(b, today) === 'expired' ? b.qty : unsold,
      action: 'return_now',
      label: 'RETURN NOW',
      reason:
        bucketOf(b, today) === 'expired'
          ? `Expired. Window closes in ${daysToClose} days.`
          : `${unsold} of ${b.qty} packs will not sell before expiry. Window closes in ${daysToClose} days.`,
      rupees: claimAmount(b, w, bucketOf(b, today) === 'expired' ? b.qty : unsold),
    };
  }
  if (unsold === 0 && daysLeft <= 90) {
    return {
      ...base,
      action: 'sell_first',
      label: 'SELL FIRST',
      reason: `Sells through before expiry (${vel.toFixed(1)}/day${committed ? `, ${committed} committed by refill patients` : ''}). Dispense this batch first.`,
      rupees: 0,
    };
  }
  if (today >= opens && unsold > 0) {
    return {
      ...base,
      action: 'return_soon',
      label: 'PLAN RETURN',
      reason: `${unsold} packs likely unsold. Return within ${daysToClose} days.`,
      rupees: claimAmount(b, w, unsold),
    };
  }
  return { ...base, action: 'watch', label: 'WATCH', reason: 'Not yet in the return window.', rupees: 0 };
}

export function adviseAll(
  batches: Batch[],
  wholesalers: Wholesaler[],
  dispenses: Dispense[],
  patients: Patient[],
  today: ISODate,
  horizonDays = 90,
): BatchAdvice[] {
  const byId = new Map(wholesalers.map((w) => [w.id, w]));
  return onShelf(batches)
    .filter((b) => daysToExpiry(b, today) <= horizonDays)
    .map((b) => adviseBatch(b, wholesalerFor(b, wholesalers, byId), dispenses, patients, today))
    .sort((a, b) => a.days_to_close - b.days_to_close);
}

export function wholesalerFor(
  b: Pick<Batch, 'wholesaler_id' | 'distributor_name'>,
  wholesalers: Wholesaler[],
  byId?: Map<string, Wholesaler>,
): Wholesaler | undefined {
  if (b.wholesaler_id) {
    const w = byId ? byId.get(b.wholesaler_id) : wholesalers.find((x) => x.id === b.wholesaler_id);
    if (w) return w;
  }
  const n = normName(b.distributor_name);
  return wholesalers.find((w) => normName(w.name) === n);
}

// ---- credit notes ---------------------------------------------------------

export const CHASE_DAYS = [15, 30, 45];

export function creditAgeDays(c: CreditNote, today: ISODate): number {
  return daysBetween(c.raised_at.slice(0, 10), today);
}

/** Pending credit notes that have crossed the next chase step. */
export function chaseDue(credits: CreditNote[], today: ISODate): CreditNote[] {
  return credits.filter((c) => {
    if (c.status !== 'pending') return false;
    const age = creditAgeDays(c, today);
    const step = CHASE_DAYS[c.chase_count];
    return step !== undefined && age >= step;
  });
}

export function creditSummary(credits: CreditNote[], today: ISODate) {
  const month = today.slice(0, 7);
  const pending = credits.filter((c) => c.status === 'pending');
  const settledThisMonth = credits.filter((c) => c.status === 'settled' && (c.settled_at || '').slice(0, 7) === month);
  return {
    pendingCount: pending.length,
    pendingValue: sum(pending, (c) => c.claim_amount_inr),
    recoveredThisMonth: sum(settledThisMonth, (c) => c.settled_amount_inr ?? c.claim_amount_inr),
    recoveredAllTime: sum(
      credits.filter((c) => c.status === 'settled'),
      (c) => c.settled_amount_inr ?? c.claim_amount_inr,
    ),
    overdue: pending.filter((c) => creditAgeDays(c, today) > 45).length,
  };
}

export function chaseMessage(c: CreditNote, shopName: string, today: ISODate): string {
  const age = creditAgeDays(c, today);
  return (
    `Namaste, ${shopName} here. Reminder for expiry return slip ${c.return_slip_no} ` +
    `(${c.medicine_name}, batch ${c.batch_no}, ${c.qty} packs), claim ₹${c.claim_amount_inr.toFixed(0)}, ` +
    `pending ${age} days. Please share the credit note. Dhanyavaad.`
  );
}

export function nextSlipNo(credits: CreditNote[], today: ISODate): string {
  const prefix = `RS-${today.slice(2, 4)}${today.slice(5, 7)}-`;
  const n = credits.filter((c) => c.return_slip_no.startsWith(prefix)).length + 1;
  return prefix + String(n).padStart(3, '0');
}
