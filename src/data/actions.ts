// Business operations shared by the demo and live stores. Every operation that
// changes records writes an audit event. Code does the arithmetic; the agent
// only proposes tasks, which run here after approval.
import type { AgentTask, Batch, BillLine, CreditNote, Dispense, H1Entry, Message, Order, Patient, PurchaseBill, Wholesaler } from '@/core/types';
import type { Store } from './store';
import type { BillRead } from '@/core/fixtures';
import type { RxMatch, RxRead } from '@/core/rx';
import type { TaskDraft } from '@/core/agent';
import { verifyBill, billTotal } from '@/core/verify';
import { claimAmount, wholesalerFor, nextSlipNo, chaseMessage } from '@/core/returns';
import { isDeadStockRisk, fefo } from '@/core/expiry';
import { findDrug, allocateFEFO } from '@/core/rx';
import { h1Missing, retainUntil } from '@/core/h1';
import { hasActiveConsent, nextCycle, parseReply, refillMessage } from '@/core/refills';
import { orderMessage, waLink } from '@/core/reorder';
import { normName, round2, uid } from '@/core/util';
import { apiFetch } from './api';

export type Lane = 'cloud' | 'wa.me' | 'sim';

export interface Outbound {
  to: string;
  phone: string;
  body: string;
  link: string;
}

const nowISO = () => new Date().toISOString();

export async function audit(store: Store, action: string, entity: string, entity_id: string | null, details: Record<string, unknown> = {}) {
  const shop = store.get().shops[0];
  if (!shop) return;
  await store.insert('audit_events', [{ id: uid(), shop_id: shop.id, at: nowISO(), actor: store.actor(), action, entity, entity_id, details }]);
}

async function logMessage(store: Store, m: Omit<Message, 'id' | 'shop_id' | 'at'>) {
  const shop = store.get().shops[0];
  await store.insert('messages', [{ ...m, id: uid(), shop_id: shop.id, at: nowISO() }]);
}

/** Sends through the WhatsApp Cloud API route when the lane is 'cloud'. */
async function sendCloud(phone: string, body: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text: body }) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- bills (spec + F2)

export function checkBill(store: Store, read: BillRead, today: string, orderId?: string | null) {
  const db = store.get();
  const w = db.wholesalers.find((x) => normName(x.name) === normName(read.distributor_name));
  const order = orderId
    ? db.orders.find((o) => o.id === orderId)
    : db.orders.find((o) => o.status === 'sent' && w && o.wholesaler_id === w.id);
  const issues = verifyBill(read.lines, {
    bill_no: read.bill_no,
    distributor_name: read.distributor_name,
    wholesaler: w,
    previousBills: db.purchase_bills,
    batches: db.inventory_batches,
    order,
    today,
  });
  return { issues, wholesaler: w, order };
}

export async function saveBill(
  store: Store,
  read: BillRead,
  opts: { today: string; image_url: string | null; source: PurchaseBill['source']; skip?: number[] },
) {
  const db = store.get();
  const shop = db.shops[0];
  const { issues, wholesaler, order } = checkBill(store, read, opts.today);
  const billId = uid();
  const lines = read.lines.filter((_, i) => !opts.skip?.includes(i));
  const bill: PurchaseBill = {
    id: billId,
    shop_id: shop.id,
    wholesaler_id: wholesaler?.id ?? null,
    distributor_name: read.distributor_name,
    bill_no: read.bill_no,
    bill_date: read.bill_date,
    total_inr: billTotal(lines),
    image_url: opts.image_url,
    source: opts.source,
    lines,
    issues,
    order_id: order?.id ?? null,
    created_at: nowISO(),
  };
  const batches: Batch[] = lines.map((l) => {
    const { drug } = findDrug(l.medicine_name, db.drug_master);
    return {
      id: uid(),
      shop_id: shop.id,
      drug_id: drug?.id ?? l.drug_id ?? null,
      medicine_name: drug?.name ?? l.medicine_name,
      batch_no: l.batch_no,
      expiry_date: l.expiry_date,
      qty: l.qty + (l.free_qty || 0),
      cost_inr: l.free_qty ? round2((l.qty * l.cost_inr) / (l.qty + l.free_qty)) : l.cost_inr,
      mrp_inr: l.mrp_inr,
      distributor_name: read.distributor_name,
      wholesaler_id: wholesaler?.id ?? null,
      is_schedule_h1: l.is_schedule_h1 || drug?.schedule === 'H1',
      dead_stock_risk: isDeadStockRisk(drug?.name ?? l.medicine_name, db.inventory_batches, opts.today),
      status: 'active',
      bill_id: billId,
      received_at: opts.today,
      created_at: nowISO(),
    };
  });
  await store.insert('purchase_bills', [bill]);
  await store.insert('inventory_batches', batches);
  if (order) await store.update('orders', order.id, { status: issues.some((i) => i.kind === 'short_qty') ? 'delivered' : 'verified', bill_id: billId });
  await audit(store, 'bill.saved', 'purchase_bills', billId, {
    bill_no: bill.bill_no,
    distributor: bill.distributor_name,
    lines: batches.length,
    total_inr: bill.total_inr,
    issues: issues.length,
    order_id: order?.id ?? null,
    source: opts.source,
  });
  return { bill, batches, issues };
}

// ---------------------------------------------------------------- returns (spec + F3)

export interface SlipLine {
  batch: Batch;
  qty: number;
  claim: number;
}
export interface ReturnSlip {
  slip_no: string;
  wholesaler: Wholesaler | undefined;
  distributor_name: string;
  lines: SlipLine[];
  total: number;
  credit_ids: string[];
}

export async function raiseReturns(store: Store, batchIds: string[], today: string, qtyOverride: Record<string, number> = {}): Promise<ReturnSlip[]> {
  const db = store.get();
  const shop = db.shops[0];
  const chosen = db.inventory_batches.filter((b) => batchIds.includes(b.id) && b.status !== 'returned' && b.qty > 0);
  const groups = new Map<string, Batch[]>();
  for (const b of chosen) {
    const w = wholesalerFor(b, db.wholesalers);
    const k = w?.id ?? b.distributor_name;
    groups.set(k, [...(groups.get(k) || []), b]);
  }
  const slips: ReturnSlip[] = [];
  let credits = [...db.credit_notes];
  for (const [, bs] of groups) {
    const w = wholesalerFor(bs[0], db.wholesalers);
    const slipNo = nextSlipNo(credits, today);
    const lines: SlipLine[] = [];
    const notes: CreditNote[] = [];
    for (const b of bs) {
      const qty = Math.min(b.qty, Math.max(1, Math.floor(qtyOverride[b.id] ?? b.qty)));
      const claim = claimAmount(b, w, qty);
      lines.push({ batch: b, qty, claim });
      notes.push({
        id: uid(),
        shop_id: shop.id,
        wholesaler_id: w?.id ?? null,
        distributor_name: w?.name ?? b.distributor_name,
        batch_id: b.id,
        medicine_name: b.medicine_name,
        batch_no: b.batch_no,
        qty,
        claim_amount_inr: claim,
        return_slip_no: slipNo + (notes.length ? `/${notes.length + 1}` : ''),
        return_slip_pdf_url: null,
        status: 'pending',
        raised_at: nowISO(),
        chase_count: 0,
        last_chased_at: null,
        settled_at: null,
        settled_amount_inr: null,
      });
      if (qty >= b.qty) await store.update('inventory_batches', b.id, { status: 'returned', qty: 0 });
      else await store.update('inventory_batches', b.id, { qty: b.qty - qty });
    }
    await store.insert('credit_notes', notes);
    credits = [...credits, ...notes];
    const slip: ReturnSlip = { slip_no: slipNo, wholesaler: w, distributor_name: w?.name ?? bs[0].distributor_name, lines, total: round2(lines.reduce((s, l) => s + l.claim, 0)), credit_ids: notes.map((n) => n.id) };
    slips.push(slip);
    await audit(store, 'return.raised', 'credit_notes', notes[0]?.id ?? null, { slip_no: slipNo, wholesaler: slip.distributor_name, batches: lines.length, claim_inr: slip.total });
  }
  return slips;
}

export async function quarantine(store: Store, batchIds: string[]) {
  for (const id of batchIds) await store.update('inventory_batches', id, { status: 'quarantined' });
  await audit(store, 'stock.quarantined', 'inventory_batches', batchIds[0] ?? null, { batch_ids: batchIds });
}

export async function settleCredit(store: Store, id: string, amount?: number) {
  const c = store.get().credit_notes.find((x) => x.id === id);
  if (!c) return;
  const amt = amount ?? c.claim_amount_inr;
  await store.update('credit_notes', id, { status: 'settled', settled_at: nowISO(), settled_amount_inr: amt });
  await audit(store, 'credit.settled', 'credit_notes', id, { slip_no: c.return_slip_no, amount_inr: amt, short_by_inr: round2(c.claim_amount_inr - amt) });
}

export async function rejectCredit(store: Store, id: string, reason: string) {
  await store.update('credit_notes', id, { status: 'rejected' });
  await audit(store, 'credit.rejected', 'credit_notes', id, { reason });
}

export async function chaseCredits(store: Store, ids: string[], today: string, lane: Lane): Promise<Outbound[]> {
  const db = store.get();
  const out: Outbound[] = [];
  for (const id of ids) {
    const c = db.credit_notes.find((x) => x.id === id);
    if (!c || c.status !== 'pending') continue;
    const w = db.wholesalers.find((x) => x.id === c.wholesaler_id);
    const body = chaseMessage(c, db.shops[0].name, today);
    const phone = w?.phone ?? '';
    if (lane === 'cloud') await sendCloud(phone, body);
    await logMessage(store, { to_kind: 'wholesaler', to_id: w?.id ?? null, to_phone: phone, direction: 'out', body, lane });
    await store.update('credit_notes', id, { chase_count: c.chase_count + 1, last_chased_at: nowISO() });
    out.push({ to: w?.name ?? c.distributor_name, phone, body, link: waLink(phone, body) });
  }
  await audit(store, 'credit.chased', 'credit_notes', ids[0] ?? null, { count: out.length, lane });
  return out;
}

// ---------------------------------------------------------------- refills

export async function nudgeRefills(store: Store, ids: string[], lane: Lane): Promise<{ sent: Outbound[]; blocked: string[] }> {
  const db = store.get();
  const sent: Outbound[] = [];
  const blocked: string[] = [];
  for (const id of ids) {
    const p = db.chronic_patients.find((x) => x.id === id);
    if (!p) continue;
    if (!hasActiveConsent(p, db.consent_log)) {
      blocked.push(p.patient_name);
      continue;
    }
    const body = refillMessage(p, db.shops[0]);
    if (lane === 'cloud') await sendCloud(p.whatsapp_phone, body);
    await logMessage(store, { to_kind: 'patient', to_id: p.id, to_phone: p.whatsapp_phone, direction: 'out', body, lane });
    await store.update('chronic_patients', p.id, { refill_status: 'nudged', last_nudged_at: nowISO() });
    sent.push({ to: p.patient_name, phone: p.whatsapp_phone, body, link: waLink(p.whatsapp_phone, body) });
  }
  await audit(store, 'refill.nudged', 'chronic_patients', ids[0] ?? null, { sent: sent.length, blocked, lane });
  return { sent, blocked };
}

/** An inbound WhatsApp reply. Only YES / NO / STOP are understood. */
export async function patientReply(store: Store, patientId: string, text: string) {
  const db = store.get();
  const p = db.chronic_patients.find((x) => x.id === patientId);
  if (!p) return null;
  const intent = parseReply(text);
  await logMessage(store, { to_kind: 'patient', to_id: p.id, to_phone: p.whatsapp_phone, direction: 'in', body: text.slice(0, 500), lane: 'sim' });
  if (intent === 'yes') await store.update('chronic_patients', p.id, { refill_status: 'confirmed', last_reply: 'YES' });
  else if (intent === 'no') await store.update('chronic_patients', p.id, { refill_status: 'declined', last_reply: 'NO' });
  else if (intent === 'stop') await withdrawConsent(store, p.id, 'whatsapp');
  else await store.update('chronic_patients', p.id, { last_reply: text.slice(0, 120) });
  await audit(store, 'refill.reply', 'chronic_patients', p.id, { intent: intent ?? 'unrecognised' });
  return intent;
}

export async function setRefillStatus(store: Store, patientId: string, status: Patient['refill_status'], today: string) {
  const db = store.get();
  const p = db.chronic_patients.find((x) => x.id === patientId);
  if (!p) return;
  if (status === 'collected') {
    // dispense each refill medicine FEFO and move the cycle on
    const rows: Dispense[] = [];
    for (const m of p.medicines) {
      const own = db.inventory_batches.filter((b) => (m.drug_id && b.drug_id === m.drug_id) || normName(b.medicine_name) === normName(m.name));
      const { picks } = allocateFEFO(own, m.packs_per_cycle, today);
      for (const pick of picks) {
        await store.update('inventory_batches', pick.batch.id, { qty: pick.batch.qty - pick.qty });
        rows.push({ id: uid(), shop_id: p.shop_id, batch_id: pick.batch.id, drug_id: pick.batch.drug_id, medicine_name: pick.batch.medicine_name, qty: pick.qty, patient_id: p.id, sold_at: nowISO() });
      }
    }
    if (rows.length) await store.insert('dispenses', rows);
    await store.update('chronic_patients', p.id, { refill_status: 'none', next_refill_date: nextCycle(p, today), last_reply: null });
  } else await store.update('chronic_patients', p.id, { refill_status: status });
  await audit(store, `refill.${status}`, 'chronic_patients', p.id, {});
}

export async function addPatient(store: Store, p: Omit<Patient, 'id' | 'shop_id' | 'created_at' | 'refill_status' | 'last_nudged_at' | 'last_reply'>, consentEvidence?: string) {
  const shop = store.get().shops[0];
  const id = uid();
  await store.insert('chronic_patients', [{ ...p, id, shop_id: shop.id, created_at: nowISO(), refill_status: 'none', last_nudged_at: null, last_reply: null }]);
  if (p.dpdp_opt_in) {
    await store.insert('consent_log', [
      { id: uid(), shop_id: shop.id, patient_id: id, purpose: 'Refill reminders on WhatsApp for my regular medicines', channel: 'counter', given_at: nowISO(), withdrawn_at: null, evidence: consentEvidence || 'Counter consent captured on screen' },
    ]);
  }
  await audit(store, 'patient.added', 'chronic_patients', id, { opt_in: p.dpdp_opt_in });
  return id;
}

export async function recordConsent(store: Store, patientId: string, evidence: string) {
  const shop = store.get().shops[0];
  await store.insert('consent_log', [{ id: uid(), shop_id: shop.id, patient_id: patientId, purpose: 'Refill reminders on WhatsApp for my regular medicines', channel: 'counter', given_at: nowISO(), withdrawn_at: null, evidence }]);
  await store.update('chronic_patients', patientId, { dpdp_opt_in: true });
  await audit(store, 'consent.given', 'consent_log', patientId, { evidence });
}

export async function withdrawConsent(store: Store, patientId: string, via: 'whatsapp' | 'counter') {
  const db = store.get();
  for (const c of db.consent_log.filter((x) => x.patient_id === patientId && !x.withdrawn_at)) {
    await store.update('consent_log', c.id, { withdrawn_at: nowISO() });
  }
  await store.update('chronic_patients', patientId, { dpdp_opt_in: false, refill_status: 'none', last_reply: 'STOP' });
  await audit(store, 'consent.withdrawn', 'consent_log', patientId, { via });
}

// ---------------------------------------------------------------- dispense (F4)

export interface DispenseChoice {
  index: number;
  drug_id: string | null; // chosen drug (original or same-salt alternative chosen by the pharmacist)
  qty: number;
  include: boolean;
}

export async function dispenseRx(store: Store, rx: RxRead, matches: RxMatch[], choices: DispenseChoice[], today: string, rxImage: string | null) {
  const db = store.get();
  const shop = db.shops[0];
  const rows: Dispense[] = [];
  const h1: H1Entry[] = [];
  const problems: string[] = [];
  for (const ch of choices) {
    if (!ch.include) continue;
    const m = matches[ch.index];
    const drug = db.drug_master.find((d) => d.id === ch.drug_id) ?? m.drug;
    const name = drug?.name ?? m.line.name;
    const own = db.inventory_batches.filter((b) => (drug && b.drug_id === drug.id) || normName(b.medicine_name) === normName(name));
    const { picks, short } = allocateFEFO(own, ch.qty, today);
    if (short > 0) problems.push(`${name}: short by ${short}`);
    const isH1 = drug?.schedule === 'H1' || picks.some((p) => p.batch.is_schedule_h1);
    if (isH1) {
      const entry = {
        id: uid(),
        shop_id: shop.id,
        dispensed_date: today,
        patient_name: rx.patient_name,
        patient_address: rx.patient_address,
        doctor_name: rx.doctor_name,
        doctor_address: rx.doctor_address,
        doctor_reg_no: rx.doctor_reg_no,
        drug_name: name,
        batch_no: picks.map((p) => p.batch.batch_no).join(', '),
        qty: ch.qty - short,
        rx_image_url: rxImage,
        retain_until: retainUntil(today),
        created_by: store.actor(),
        created_at: nowISO(),
      } satisfies H1Entry;
      const missing = h1Missing(entry);
      if (missing.length) throw new Error(`H1 register needs: ${missing.join(', ')}`);
      h1.push(entry);
    }
    for (const p of picks) {
      await store.update('inventory_batches', p.batch.id, { qty: p.batch.qty - p.qty });
      rows.push({ id: uid(), shop_id: shop.id, batch_id: p.batch.id, drug_id: p.batch.drug_id, medicine_name: p.batch.medicine_name, qty: p.qty, patient_id: null, sold_at: nowISO() });
    }
  }
  if (rows.length) await store.insert('dispenses', rows);
  if (h1.length) await store.insert('schedule_h1_logs', h1);
  await audit(store, 'rx.dispensed', 'dispenses', rows[0]?.id ?? null, { patient: rx.patient_name, doctor: rx.doctor_name, lines: rows.length, h1_entries: h1.length, problems });
  return { dispensed: rows, h1, problems };
}

export async function addH1Entry(store: Store, e: Omit<H1Entry, 'id' | 'shop_id' | 'retain_until' | 'created_by' | 'created_at'>) {
  const missing = h1Missing(e);
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
  const shop = store.get().shops[0];
  const row: H1Entry = { ...e, id: uid(), shop_id: shop.id, retain_until: retainUntil(e.dispensed_date), created_by: store.actor(), created_at: nowISO() };
  await store.insert('schedule_h1_logs', [row]);
  await audit(store, 'h1.added', 'schedule_h1_logs', row.id, { drug: e.drug_name });
}

export async function updateH1(store: Store, id: string, patch: Partial<H1Entry>) {
  await store.update('schedule_h1_logs', id, patch);
  await audit(store, 'h1.corrected', 'schedule_h1_logs', id, { fields: Object.keys(patch) });
}

// ---------------------------------------------------------------- orders (F5)

export async function sendOrder(store: Store, wholesalerId: string, lines: Order['lines'], lane: Lane): Promise<Outbound | null> {
  const db = store.get();
  const shop = db.shops[0];
  const w = db.wholesalers.find((x) => x.id === wholesalerId);
  if (!w || !lines.length) return null;
  const order: Order = {
    id: uid(),
    shop_id: shop.id,
    wholesaler_id: w.id,
    lines,
    status: 'sent',
    total_est_inr: round2(lines.reduce((s, l) => s + l.qty * l.est_cost_inr, 0)),
    sent_via: lane,
    created_at: nowISO(),
    sent_at: nowISO(),
    bill_id: null,
  };
  const body = orderMessage(order, w, shop);
  if (lane === 'cloud') await sendCloud(w.phone, body);
  await store.insert('orders', [order]);
  await logMessage(store, { to_kind: 'wholesaler', to_id: w.id, to_phone: w.phone, direction: 'out', body, lane });
  await audit(store, 'order.sent', 'orders', order.id, { to: w.name, lines: lines.length, total_est_inr: order.total_est_inr, lane });
  return { to: w.name, phone: w.phone, body, link: waLink(w.phone, body) };
}

export async function messageWholesaler(store: Store, wholesalerId: string | null, body: string, lane: Lane): Promise<Outbound | null> {
  const db = store.get();
  const w = db.wholesalers.find((x) => x.id === wholesalerId);
  if (!w) return null;
  if (lane === 'cloud') await sendCloud(w.phone, body);
  await logMessage(store, { to_kind: 'wholesaler', to_id: w.id, to_phone: w.phone, direction: 'out', body, lane });
  await audit(store, 'wholesaler.messaged', 'wholesalers', w.id, { lane });
  return { to: w.name, phone: w.phone, body, link: waLink(w.phone, body) };
}

// ---------------------------------------------------------------- agent tasks (F1)

export async function proposeTasks(store: Store, drafts: TaskDraft[]): Promise<AgentTask[]> {
  const db = store.get();
  const shop = db.shops[0];
  const open = db.agent_tasks.filter((t) => t.status === 'proposed');
  const fresh = drafts.filter((d) => !open.some((t) => t.kind === d.kind && t.title === d.title));
  const rows: AgentTask[] = fresh.map((d) => ({
    ...d,
    id: uid(),
    shop_id: shop.id,
    status: 'proposed',
    decided_by: null,
    created_at: nowISO(),
    decided_at: null,
    executed_at: null,
    result: null,
    error: null,
  }));
  if (rows.length) {
    await store.insert('agent_tasks', rows);
    await audit(store, 'agent.proposed', 'agent_tasks', rows[0].id, { count: rows.length, kinds: rows.map((r) => r.kind) });
  }
  return rows;
}

export interface TaskOutcome {
  slips?: ReturnSlip[];
  outbound?: Outbound[];
  note: string;
}

export async function approveTask(store: Store, taskId: string, today: string, lane: Lane): Promise<TaskOutcome> {
  const t = store.get().agent_tasks.find((x) => x.id === taskId);
  if (!t || t.status !== 'proposed') return { note: 'Task is no longer open.' };
  await store.update('agent_tasks', t.id, { status: 'approved', decided_by: store.actor(), decided_at: nowISO() });
  await audit(store, 'agent.approved', 'agent_tasks', t.id, { kind: t.kind, title: t.title });
  try {
    const p = t.payload as Record<string, unknown>;
    let outcome: TaskOutcome;
    switch (t.kind) {
      case 'return_batches': {
        const slips = await raiseReturns(store, (p.batch_ids as string[]) || [], today, (p.qty as Record<string, number>) || {});
        outcome = { slips, note: `${slips.length} return slip${slips.length === 1 ? '' : 's'} raised, ₹${round2(slips.reduce((s, x) => s + x.total, 0))} claimed.` };
        break;
      }
      case 'quarantine_batches':
        await quarantine(store, (p.batch_ids as string[]) || []);
        outcome = { note: 'Expired batches moved to quarantine.' };
        break;
      case 'send_refill_nudges': {
        const r = await nudgeRefills(store, (p.patient_ids as string[]) || [], lane);
        outcome = { outbound: r.sent, note: `${r.sent.length} reminders sent${r.blocked.length ? `, ${r.blocked.length} blocked (no consent)` : ''}.` };
        break;
      }
      case 'chase_credit': {
        const out = await chaseCredits(store, (p.credit_ids as string[]) || [], today, lane);
        outcome = { outbound: out, note: `${out.length} reminders sent to wholesalers.` };
        break;
      }
      case 'send_order': {
        const out = await sendOrder(store, String(p.wholesaler_id), (p.lines as Order['lines']) || [], lane);
        outcome = { outbound: out ? [out] : [], note: out ? `Order sent to ${out.to}.` : 'Order could not be sent.' };
        break;
      }
      case 'message_wholesaler': {
        const out = await messageWholesaler(store, (p.wholesaler_id as string) ?? null, String(p.body ?? ''), lane);
        outcome = { outbound: out ? [out] : [], note: out ? `Message sent to ${out.to}.` : 'No wholesaler.' };
        break;
      }
      default:
        throw new Error(`No executor for ${t.kind}`);
    }
    // wa.me needs the owner's tap: executed, verified when the reply or delivery arrives
    await store.update('agent_tasks', t.id, { status: lane === 'wa.me' && outcome.outbound?.length ? 'executed' : 'verified', executed_at: nowISO(), result: { note: outcome.note } });
    await audit(store, 'agent.executed', 'agent_tasks', t.id, { kind: t.kind, note: outcome.note });
    return outcome;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.update('agent_tasks', t.id, { status: 'failed', error: msg, executed_at: nowISO() });
    await audit(store, 'agent.failed', 'agent_tasks', t.id, { error: msg });
    return { note: `Failed: ${msg}` };
  }
}

export async function rejectTask(store: Store, taskId: string, reason = '') {
  await store.update('agent_tasks', taskId, { status: 'rejected', decided_by: store.actor(), decided_at: nowISO(), error: reason || null });
  await audit(store, 'agent.rejected', 'agent_tasks', taskId, { reason });
}

// ---------------------------------------------------------------- misc

export async function updateShop(store: Store, patch: Partial<import('@/core/types').Shop>) {
  const shop = store.get().shops[0];
  await store.update('shops', shop.id, patch);
  await audit(store, 'shop.updated', 'shops', shop.id, { fields: Object.keys(patch) });
}

export async function upsertWholesaler(store: Store, w: Wholesaler) {
  await store.insert('wholesalers', [w]);
  await audit(store, 'wholesaler.saved', 'wholesalers', w.id, { name: w.name });
}

export function stockFor(store: Store, name: string, today: string) {
  return fefo(store.get().inventory_batches.filter((b) => normName(b.medicine_name) === normName(name)), today);
}

export function lineFromManual(): BillLine {
  return { medicine_name: '', batch_no: '', expiry_date: '', qty: 1, free_qty: 0, cost_inr: 0, mrp_inr: 0, is_schedule_h1: false, confidence: 1 };
}
