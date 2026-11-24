import type { ISODate } from './types';

const DAY = 86_400_000;
const IST_OFFSET_MIN = 330;

/** Today's date in India (IST), as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): ISODate {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function parseDate(d: ISODate): number {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(parseDate(d) + n * DAY).toISOString().slice(0, 10);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const t = new Date(parseDate(d));
  t.setUTCMonth(t.getUTCMonth() + n);
  return t.toISOString().slice(0, 10);
}

/** Last day of the month, for expiry dates printed as MM/YY. */
export function endOfMonth(year: number, month1: number): ISODate {
  return new Date(Date.UTC(year, month1, 0)).toISOString().slice(0, 10);
}

/** Parses the expiry formats found on Indian bills: 2026-03-31, 03/26, 3/2026, MAR-26, 03-26. */
export function parseExpiry(raw: string): ISODate | null {
  const s = raw.trim().toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{2}|\d{4})$/))) {
    const mon = Number(m[1]);
    const yr = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (mon >= 1 && mon <= 12) return endOfMonth(yr, mon);
  }
  if ((m = s.match(/^([A-Z]{3})[\s\-/']*(\d{2}|\d{4})$/))) {
    const mon = months.indexOf(m[1]) + 1;
    const yr = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (mon > 0) return endOfMonth(yr, mon);
  }
  return null;
}

/** Indian digit grouping: 12,34,567. */
export function groupIN(n: number, decimals = 0): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const out = (rest ? rest + ',' : '') + last3 + (dec ? '.' + dec : '');
  return (neg ? '−' : '') + out;
}

/** ₹ 4,820 · ₹ 1.2 L · ₹ 3.4 Cr */
export function inr(n: number, opts: { compact?: boolean; paise?: boolean } = {}): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (opts.compact && abs >= 1e7) return `${sign}₹ ${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)} Cr`;
  if (opts.compact && abs >= 1e5) return `${sign}₹ ${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)} L`;
  return `${sign}₹ ${groupIN(abs, opts.paise ? 2 : 0)}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sum<T>(xs: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of xs) s += f(x);
  return s;
}

export function groupBy<T, K extends string>(xs: T[], f: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of xs) (out[f(x)] ||= []).push(x);
  return out;
}

let counter = 0;
export function uid(prefix = ''): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Lower-case, strip punctuation and pack words, for fuzzy medicine matching. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|strip|strips|mg)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Similarity 0..1 from shared character bigrams (Dice coefficient). */
export function similarity(a: string, b: string): number {
  const x = normName(a).replace(/ /g, '');
  const y = normName(b).replace(/ /g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, c] of gx) inter += Math.min(c, gy.get(g) || 0);
  return (2 * inter) / (x.length - 1 + (y.length - 1));
}

export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const t = new Date(parseDate(d));
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatTimeIST(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
