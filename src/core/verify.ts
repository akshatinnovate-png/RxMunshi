// F2 · Delivery Verifier: checks a scanned wholesaler bill against the order,
// the last price paid, the MRP, shelf life and the shop's dead-stock history.
import type { Batch, BillLine, ISODate, Order, PurchaseBill, VerifyIssue, Wholesaler } from './types';
import { addMonths, daysBetween, normName, round2, similarity } from './util';
import { deadStockNames } from './expiry';

export interface VerifyContext {
  bill_no: string;
  distributor_name: string;
  wholesaler?: Wholesaler;
  previousBills: PurchaseBill[];
  batches: Batch[];
  order?: Order;
  today: ISODate;
}

const PRICE_TOLERANCE = 0.02; // 2% before we call it a price rise
const CONFIDENCE_FLOOR = 0.8;

function sameMed(a: string, b: string) {
  return normName(a) === normName(b) || similarity(a, b) >= 0.86;
}

/** The last cost paid for a medicine, from earlier bills (newest first) or batches. */
export function lastCost(name: string, previousBills: PurchaseBill[], batches: Batch[], excludeBillNo?: string) {
  const bills = [...previousBills]
    .filter((b) => b.bill_no !== excludeBillNo)
    .sort((a, b) => (a.bill_date < b.bill_date ? 1 : -1));
  for (const bill of bills) {
    const line = bill.lines.find((l) => sameMed(l.medicine_name, name));
    if (line) return { cost: line.cost_inr, date: bill.bill_date, distributor: bill.distributor_name, line };
  }
  const bs = batches.filter((b) => sameMed(b.medicine_name, name)).sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
  if (bs[0]) return { cost: bs[0].cost_inr, date: bs[0].received_at, distributor: bs[0].distributor_name, line: null };
  return null;
}

export function verifyBill(lines: BillLine[], ctx: VerifyContext): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const dist = normName(ctx.distributor_name);

  if (
    ctx.bill_no &&
    ctx.previousBills.some((b) => b.bill_no.trim() === ctx.bill_no.trim() && normName(b.distributor_name) === dist)
  ) {
    issues.push({
      kind: 'duplicate_bill',
      severity: 'bad',
      line: null,
      message: `Bill ${ctx.bill_no} from ${ctx.distributor_name} was already entered.`,
      amount_inr: round2(lines.reduce((s, l) => s + l.qty * l.cost_inr, 0)),
    });
  }

  const dead = deadStockNames(ctx.batches, ctx.today);
  const minShelf = ctx.wholesaler?.min_shelf_life_months ?? 6;

  lines.forEach((l, i) => {
    if (l.confidence < CONFIDENCE_FLOOR) {
      issues.push({
        kind: 'low_confidence',
        severity: 'warn',
        line: i,
        message: `Check this row: read with ${(l.confidence * 100).toFixed(0)}% confidence.`,
        amount_inr: 0,
      });
    }
    if (l.mrp_inr > 0 && l.cost_inr > l.mrp_inr) {
      issues.push({
        kind: 'above_mrp',
        severity: 'bad',
        line: i,
        message: `${l.medicine_name}: billed ₹${l.cost_inr} per pack, above MRP ₹${l.mrp_inr}.`,
        amount_inr: round2((l.cost_inr - l.mrp_inr) * l.qty),
      });
    }
    const prev = lastCost(l.medicine_name, ctx.previousBills, ctx.batches, ctx.bill_no);
    if (prev && l.cost_inr > prev.cost * (1 + PRICE_TOLERANCE)) {
      issues.push({
        kind: 'price_up',
        severity: 'warn',
        line: i,
        message: `${l.medicine_name}: ₹${prev.cost} → ₹${l.cost_inr} per pack (+${(((l.cost_inr - prev.cost) / prev.cost) * 100).toFixed(1)}% since ${prev.date}).`,
        amount_inr: round2((l.cost_inr - prev.cost) * l.qty),
      });
    }
    if (prev?.line && prev.line.free_qty > 0 && normName(prev.distributor) === dist) {
      const ratio = prev.line.free_qty / prev.line.qty;
      const expected = Math.floor(l.qty * ratio);
      if (expected > 0 && l.free_qty < expected) {
        issues.push({
          kind: 'missing_free',
          severity: 'warn',
          line: i,
          message: `${l.medicine_name}: scheme was ${prev.line.qty}+${prev.line.free_qty}; expected ${expected} free, got ${l.free_qty}.`,
          amount_inr: round2((expected - l.free_qty) * l.cost_inr),
        });
      }
    }
    const minOk = addMonths(ctx.today, minShelf);
    if (l.expiry_date && l.expiry_date < minOk) {
      const months = Math.max(0, Math.floor(daysBetween(ctx.today, l.expiry_date) / 30));
      issues.push({
        kind: 'short_dated',
        severity: 'bad',
        line: i,
        message: `${l.medicine_name} batch ${l.batch_no}: only ${months} months of shelf life (your rule: ${minShelf}). Refuse or return now.`,
        amount_inr: round2(l.qty * l.cost_inr),
      });
    }
    if (dead.has(normName(l.medicine_name))) {
      issues.push({
        kind: 'dead_stock',
        severity: 'warn',
        line: i,
        message: `${l.medicine_name} expired unsold in the last 90 days. Dead-stock risk.`,
        amount_inr: round2(l.qty * l.cost_inr),
      });
    }
  });

  if (ctx.order) {
    for (const ol of ctx.order.lines) {
      const got = lines.filter((l) => sameMed(l.medicine_name, ol.medicine_name)).reduce((s, l) => s + l.qty, 0);
      if (got < ol.qty) {
        issues.push({
          kind: 'short_qty',
          severity: 'bad',
          line: lines.findIndex((l) => sameMed(l.medicine_name, ol.medicine_name)) >= 0
            ? lines.findIndex((l) => sameMed(l.medicine_name, ol.medicine_name))
            : null,
          message: `${ol.medicine_name}: ordered ${ol.qty}, received ${got}.`,
          amount_inr: round2((ol.qty - got) * ol.est_cost_inr),
        });
      }
    }
    lines.forEach((l, i) => {
      if (!ctx.order!.lines.some((ol) => sameMed(ol.medicine_name, l.medicine_name))) {
        issues.push({
          kind: 'not_ordered',
          severity: 'warn',
          line: i,
          message: `${l.medicine_name} was not in order; check before accepting.`,
          amount_inr: round2(l.qty * l.cost_inr),
        });
      }
    });
  }

  return issues;
}

/** Rupees at stake on a bill, counting each money issue once per line and kind. */
export function moneyAtStake(issues: VerifyIssue[]): number {
  return round2(
    issues
      .filter((i) => ['price_up', 'above_mrp', 'short_qty', 'missing_free', 'short_dated', 'duplicate_bill'].includes(i.kind))
      .reduce((s, i) => s + i.amount_inr, 0),
  );
}

export function disputeMessage(bill: { bill_no: string; distributor_name: string }, issues: VerifyIssue[], shopName: string) {
  const lines = issues
    .filter((i) => i.severity === 'bad' || i.kind === 'price_up' || i.kind === 'missing_free')
    .map((i, n) => `${n + 1}. ${i.message}`);
  return `Namaste ${bill.distributor_name}, ${shopName} here. On bill ${bill.bill_no} we found:\n${lines.join('\n')}\nPlease correct or issue a credit note. Dhanyavaad.`;
}

export function billTotal(lines: BillLine[]): number {
  return round2(lines.reduce((s, l) => s + l.qty * l.cost_inr, 0));
}
