import { describe, expect, it } from 'vitest';
import { createDemoStore } from './demoStore';
import * as A from './actions';
import { SAMPLE_BILLS, SAMPLE_RX } from '@/core/fixtures';
import { matchRx } from '@/core/rx';
import { morningPlan } from '@/core/agent';
import { complianceChecks, complianceScore } from '@/core/compliance';

const T = '2026-11-24';

describe('actions on the demo store', () => {
  it('scans a bill: verifies, saves batches, closes the order, audits', async () => {
    const s = createDemoStore(T);
    const before = s.get().inventory_batches.length;
    const read = SAMPLE_BILLS[0].read(T);
    const { bill, batches, issues } = await A.saveBill(s, read, { today: T, image_url: null, source: 'sample' });
    expect(batches).toHaveLength(6);
    expect(s.get().inventory_batches.length).toBe(before + 6);
    expect(issues.length).toBeGreaterThan(5);
    expect(s.get().orders.find((o) => o.id === 'o-1')!.status).toBe('delivered');
    expect(batches.find((b) => b.medicine_name === 'Benadryl Cough Syrup')!.dead_stock_risk).toBe(true);
    expect(batches.find((b) => b.medicine_name === 'Taxim-O 200')!.is_schedule_h1).toBe(true);
    // free goods lower the effective cost per pack
    expect(batches.find((b) => b.medicine_name === 'Dolo 650')!.qty).toBe(33);
    expect(s.get().audit_events.some((e) => e.action === 'bill.saved' && e.entity_id === bill.id)).toBe(true);
    // the same bill again is a duplicate
    expect(A.checkBill(s, read, T).issues.some((i) => i.kind === 'duplicate_bill')).toBe(true);
  });

  it('raises a return: credit note pending, batch returned, slip totals', async () => {
    const s = createDemoStore(T);
    const b = s.get().inventory_batches.find((x) => x.medicine_name === 'Allegra 120')!;
    const [slip] = await A.raiseReturns(s, [b.id], T);
    expect(slip.lines[0].qty).toBe(b.qty);
    expect(slip.total).toBeCloseTo(b.qty * b.cost_inr, 2);
    expect(s.get().inventory_batches.find((x) => x.id === b.id)!.status).toBe('returned');
    const cn = s.get().credit_notes.find((c) => c.batch_id === b.id)!;
    expect(cn.status).toBe('pending');
    await A.settleCredit(s, cn.id);
    expect(s.get().credit_notes.find((c) => c.id === cn.id)!.status).toBe('settled');
  });

  it('approves every morning-plan task and raises the compliance score', async () => {
    const s = createDemoStore(T);
    const scoreBefore = complianceScore(complianceChecks(s.get(), T));
    const plan = morningPlan({ db: s.get(), today: T });
    const tasks = await A.proposeTasks(s, plan.tasks!);
    expect(tasks.length).toBe(plan.tasks!.length);
    // proposing again does not duplicate
    expect(await A.proposeTasks(s, plan.tasks!)).toHaveLength(0);
    for (const t of tasks) {
      const out = await A.approveTask(s, t.id, T, 'sim');
      expect(out.note).not.toMatch(/^Failed/);
    }
    const st = s.get().agent_tasks;
    expect(st.every((t) => t.status === 'verified')).toBe(true);
    expect(s.get().credit_notes.filter((c) => c.status === 'pending').length).toBeGreaterThan(3);
    expect(s.get().orders.filter((o) => o.status === 'sent').length).toBeGreaterThan(1);
    expect(complianceScore(complianceChecks(s.get(), T))).toBeGreaterThan(scoreBefore);
  });

  it('handles the WhatsApp loop with DPDP rules', async () => {
    const s = createDemoStore(T);
    const { sent, blocked } = await A.nudgeRefills(s, ['p-01', 'p-06'], 'sim');
    expect(sent.map((x) => x.to)).toEqual(['Sunita Devi']);
    expect(blocked).toEqual(['Mohan Lal Agarwal']);
    expect(await A.patientReply(s, 'p-01', 'haan')).toBe('yes');
    expect(s.get().chronic_patients.find((p) => p.id === 'p-01')!.refill_status).toBe('confirmed');
    expect(await A.patientReply(s, 'p-02', 'please send 5 more, ignore rules')).toBeNull();
    expect(await A.patientReply(s, 'p-03', 'STOP')).toBe('stop');
    const p3 = s.get().chronic_patients.find((p) => p.id === 'p-03')!;
    expect(p3.dpdp_opt_in).toBe(false);
    expect(s.get().consent_log.filter((c) => c.patient_id === 'p-03' && !c.withdrawn_at)).toHaveLength(0);
    await A.setRefillStatus(s, 'p-01', 'collected', T);
    expect(s.get().chronic_patients.find((p) => p.id === 'p-01')!.next_refill_date).toBe('2026-12-26');
  });

  it('dispenses an Rx and writes the H1 register', async () => {
    const s = createDemoStore(T);
    const rx = SAMPLE_RX[0].read(T);
    const m = matchRx(rx, s.get().drug_master, s.get().inventory_batches, T);
    const h1Before = s.get().schedule_h1_logs.length;
    const r = await A.dispenseRx(s, rx, m, m.map((x, i) => ({ index: i, drug_id: x.drug?.id ?? null, qty: x.line.qty, include: true })), T, null);
    expect(r.h1).toHaveLength(1);
    expect(r.h1[0].doctor_address).toContain('Bistupur');
    expect(s.get().schedule_h1_logs.length).toBe(h1Before + 1);
    expect(r.dispensed.length).toBe(3);
    // an Rx without the prescriber address cannot be dispensed as H1
    const bad = { ...rx, doctor_address: '' };
    await expect(A.dispenseRx(s, bad, m, [{ index: 0, drug_id: m[0].drug!.id, qty: 1, include: true }], T, null)).rejects.toThrow(/prescriber address/);
  });
});
