import type { Batch, ISODate } from './types';
import { addDays, daysBetween, normName, sum } from './util';

export type Bucket = 'expired' | 'd30' | 'd60' | 'd90' | 'ok';

export const BUCKET_LABEL: Record<Bucket, string> = {
  expired: 'EXPIRED',
  d30: '≤ 30 DAYS',
  d60: '31–60 DAYS',
  d90: '61–90 DAYS',
  ok: 'OK',
};

export function daysToExpiry(b: Pick<Batch, 'expiry_date'>, today: ISODate): number {
  return daysBetween(today, b.expiry_date);
}

export function bucketOf(b: Pick<Batch, 'expiry_date'>, today: ISODate): Bucket {
  const d = daysToExpiry(b, today);
  if (d < 0) return 'expired';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  if (d <= 90) return 'd90';
  return 'ok';
}

export const stockValue = (b: Pick<Batch, 'qty' | 'cost_inr'>) => b.qty * b.cost_inr;

/** Active batches with stock: the ones that matter for expiry and returns. */
export function onShelf(batches: Batch[]): Batch[] {
  return batches.filter((b) => b.status === 'active' && b.qty > 0);
}

export interface ExpirySummary {
  expired: { count: number; value: number };
  d30: { count: number; value: number };
  d60: { count: number; value: number };
  d90: { count: number; value: number };
  totalValue: number;
  atRiskValue: number; // expired + within 90 days
}

export function expirySummary(batches: Batch[], today: ISODate): ExpirySummary {
  const live = onShelf(batches);
  const pick = (k: Bucket) => {
    const xs = live.filter((b) => bucketOf(b, today) === k);
    return { count: xs.length, value: sum(xs, stockValue) };
  };
  const s = { expired: pick('expired'), d30: pick('d30'), d60: pick('d60'), d90: pick('d90') };
  return {
    ...s,
    totalValue: sum(live, stockValue),
    atRiskValue: s.expired.value + s.d30.value + s.d60.value + s.d90.value,
  };
}

/** The spec's daily digest: batches crossing exactly 90, 60 or 30 days today. */
export function crossingToday(batches: Batch[], today: ISODate): { days: 90 | 60 | 30; batch: Batch }[] {
  const out: { days: 90 | 60 | 30; batch: Batch }[] = [];
  for (const b of onShelf(batches)) {
    const d = daysToExpiry(b, today);
    if (d === 90 || d === 60 || d === 30) out.push({ days: d, batch: b });
  }
  return out;
}

/**
 * Dead-stock guard (spec): a medicine is at risk when a batch of it expired in
 * the past 90 days while still on the shelf or was sent back as expired.
 */
export function deadStockNames(batches: Batch[], today: ISODate): Set<string> {
  const from = addDays(today, -90);
  const names = new Set<string>();
  for (const b of batches) {
    const expiredRecently = b.expiry_date >= from && b.expiry_date < today;
    const wasDead = b.status === 'returned' || (b.status === 'active' && b.qty > 0) || b.status === 'quarantined';
    if (expiredRecently && wasDead) names.add(normName(b.medicine_name));
  }
  return names;
}

export function isDeadStockRisk(medicineName: string, batches: Batch[], today: ISODate): boolean {
  return deadStockNames(batches, today).has(normName(medicineName));
}

/** First-expiry-first-out order for a set of batches of one medicine. */
export function fefo(batches: Batch[], today: ISODate): Batch[] {
  return onShelf(batches)
    .filter((b) => b.expiry_date >= today)
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : 0));
}
