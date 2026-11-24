// F5 · Committed-Demand Reorder: refill patients are guaranteed demand.
// Combine them with sell-through, subtract usable stock, block dead stock.
import type { Batch, DB, Drug, ISODate, Order, OrderLine, Shop, Wholesaler } from './types';
import { committedDemand, velocity, wholesalerFor } from './returns';
import { deadStockNames, onShelf } from './expiry';
import { addDays, normName, round2, sum, uid } from './util';

export interface ReorderSuggestion {
  key: string;
  medicine_name: string;
  drug_id: string | null;
  on_hand: number; // usable packs (not expiring inside the horizon)
  per_day: number;
  committed: number;
  demand: number;
  qty: number; // suggested packs
  est_cost_inr: number; // per pack
  wholesaler: Wholesaler | undefined;
  blocked: boolean;
  reason: string;
}

export function reorderSuggestions(db: DB, today: ISODate, horizonDays = 14): ReorderSuggestion[] {
  const dead = deadStockNames(db.inventory_batches, today);
  const usableAfter = addDays(today, horizonDays + 30);
  const names = new Map<string, { name: string; drug: Drug | undefined; batches: Batch[] }>();

  const touch = (name: string, drug?: Drug) => {
    const k = normName(name);
    if (!names.has(k)) names.set(k, { name, drug, batches: [] });
    return names.get(k)!;
  };
  for (const b of db.inventory_batches) touch(b.medicine_name, db.drug_master.find((d) => d.id === b.drug_id)).batches.push(b);
  for (const p of db.chronic_patients) for (const m of p.medicines) touch(m.name, db.drug_master.find((d) => d.id === m.drug_id));

  const out: ReorderSuggestion[] = [];
  for (const [key, { name, drug, batches }] of names) {
    const live = onShelf(batches);
    const onHand = sum(live.filter((b) => b.expiry_date > usableAfter), (b) => b.qty);
    const perDay = velocity(name, db.dispenses, today);
    const committed = committedDemand(name, db.chronic_patients, today, horizonDays);
    const demand = Math.ceil(perDay * horizonDays) + committed;
    const need = demand - onHand;
    if (need <= 0) continue;
    const latest = [...batches].sort((a, b) => (a.received_at < b.received_at ? 1 : -1))[0];
    const w = latest ? wholesalerFor(latest, db.wholesalers) : db.wholesalers[0];
    const est = latest?.cost_inr ?? round2((drug?.mrp_inr ?? 0) * 0.75);
    const isDead = dead.has(key) && committed === 0;
    out.push({
      key,
      medicine_name: name,
      drug_id: drug?.id ?? latest?.drug_id ?? null,
      on_hand: onHand,
      per_day: round2(perDay),
      committed,
      demand,
      qty: need,
      est_cost_inr: est,
      wholesaler: w,
      blocked: isDead,
      reason: isDead
        ? `Blocked: expired unsold in the last 90 days and no patient is committed to it.`
        : [
            committed ? `${committed} packs committed by refill patients` : null,
            perDay > 0 ? `sells ${perDay.toFixed(1)}/day` : null,
            `${onHand} usable on hand`,
          ]
            .filter(Boolean)
            .join(' · '),
    });
  }
  return out.sort((a, b) => b.committed - a.committed || b.qty * b.est_cost_inr - a.qty * a.est_cost_inr);
}

/** One draft order per wholesaler from the unblocked suggestions. */
export function draftOrders(suggestions: ReorderSuggestion[], shopId: string, now: string): Order[] {
  const by = new Map<string, OrderLine[]>();
  const ws = new Map<string, Wholesaler>();
  for (const s of suggestions) {
    if (s.blocked || !s.wholesaler) continue;
    ws.set(s.wholesaler.id, s.wholesaler);
    const list = by.get(s.wholesaler.id) || [];
    list.push({ drug_id: s.drug_id, medicine_name: s.medicine_name, qty: s.qty, est_cost_inr: s.est_cost_inr, reason: s.reason });
    by.set(s.wholesaler.id, list);
  }
  return [...by.entries()].map(([wid, lines]) => ({
    id: uid(),
    shop_id: shopId,
    wholesaler_id: wid,
    lines,
    status: 'draft',
    total_est_inr: round2(sum(lines, (l) => l.qty * l.est_cost_inr)),
    sent_via: null,
    created_at: now,
    sent_at: null,
    bill_id: null,
  }));
}

export function orderMessage(order: Order, w: Wholesaler, shop: Shop): string {
  const lines = order.lines.map((l, i) => `${i + 1}. ${l.medicine_name} × ${l.qty}`).join('\n');
  return `Namaste ${w.name}, order from ${shop.name} (DL ${shop.drug_license_no}):\n${lines}\nPlease confirm availability and send with at least ${w.min_shelf_life_months} months expiry. Dhanyavaad.`;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
