'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApp } from '@/ui/app';
import { useMetrics } from '@/ui/metrics';
import { Bar, Chip, Money, PageHead, Source, Win } from '@/ui/kit';
import { TaskCard } from '@/ui/munshi';
import { morningPlan } from '@/core/agent';
import * as A from '@/data/actions';
import { formatDate, formatTimeIST, inr } from '@/core/util';
import { hasActiveConsent } from '@/core/refills';
import { moneyAtStake } from '@/core/verify';

export default function Today() {
  const app = useApp();
  const m = useMetrics();
  const { db, today } = app;
  const plan = useMemo(() => morningPlan({ db, today }), [db, today]);
  const [busy, setBusy] = useState(false);
  const shop = db.shops[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Suprabhat' : hour < 17 ? 'Namaste' : 'Shubh sandhya';
  const maxBucket = Math.max(m.exp.expired.value, m.exp.d30.value, m.exp.d60.value, m.exp.d90.value, 1);
  const open = m.openTasks;
  const sentOrders = db.orders.filter((o) => o.status === 'sent');
  const lastBills = [...db.purchase_bills].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 4);
  const events = [...db.audit_events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 9);

  const proposeAll = async () => {
    setBusy(true);
    const rows = await A.proposeTasks(app.store, plan.tasks ?? []);
    app.toast({ title: 'MORNING PLAN', body: `${rows.length} proposals added to the inbox.`, tone: 'hot' });
    setBusy(false);
  };

  return (
    <>
      <PageHead
        title={`${greet}, ${shop?.owner_name.split(' ')[0] ?? ''}`}
        sub={`${formatDate(today)} · ${shop?.name}, ${shop?.city} · ${app.mode === 'demo' ? 'demo shop, synthetic data' : 'live'}`}
        actions={
          <>
            <button className="btn ghost" onClick={() => app.askMunshi('Aaj ka plan')}>
              Ask Munshi ▸
            </button>
            <Link className="btn hot" href="/scan?sample=tatanagar-4519">
              ◧ Scan a bill
            </Link>
          </>
        }
      />

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' }}>
        <Win title={`plan — ${formatDate(today)}`} count={`${(plan.tasks ?? []).length} actions`} id="plan">
          <div data-tour="plan">
            <div className="stack" style={{ gap: 6 }}>
              {plan.text.split('\n').map((l, i) => (
                <div key={i} style={i === 0 ? { fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' } : { fontSize: 12.5 }}>
                  {i > 0 && '▸ '}
                  {l}
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {open.length ? (
                <Link className="btn hot" href="/munshi">
                  ✓ Review {open.length} in inbox ▸
                </Link>
              ) : (
                <button className="btn hot" onClick={proposeAll} disabled={busy || !(plan.tasks ?? []).length}>
                  Send plan to my inbox ▸
                </button>
              )}
              <span className="hint">Munshi proposes. You approve. Code does the arithmetic.</span>
            </div>
            {open.length > 0 && (
              <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                {open.slice(0, 3).map((t) => (
                  <TaskCard key={t.id} id={t.id} compact />
                ))}
                {open.length > 3 && <Link href="/munshi" className="hint">+{open.length - 3} more in the inbox ▸</Link>}
              </div>
            )}
            <Source>{plan.evidence}</Source>
          </div>
        </Win>

        <div className="stack">
          <Win title="money-back" count="this month">
            <div className="row" style={{ alignItems: 'flex-end', gap: 18 }}>
              <div>
                <div className="big money-good">{inr(m.credits.recoveredThisMonth)}</div>
                <div className="kicker">recovered from wholesalers</div>
              </div>
              <div>
                <div className="big" style={{ fontSize: 24 }}>{inr(m.recoverableNow)}</div>
                <div className="kicker">recoverable now</div>
              </div>
              <div>
                <div className="big" style={{ fontSize: 24 }}>{inr(m.credits.pendingValue)}</div>
                <div className="kicker">pending · {m.chase.length} to chase</div>
              </div>
            </div>
            <Source>credit_notes · settled_at in {today.slice(0, 7)} · adviseAll()</Source>
          </Win>
          <Win title="expiry radar" tools={<Link href="/expiry" className="btn sm ghost" style={{ padding: '0 6px' }}>open ▸</Link>}>
            <div className="bars">
              <Bar label={`Expired · ${m.exp.expired.count}`} v={m.exp.expired.value} max={maxBucket} tone="bad" right={inr(m.exp.expired.value)} />
              <Bar label={`≤ 30 d · ${m.exp.d30.count}`} v={m.exp.d30.value} max={maxBucket} tone="bad" right={inr(m.exp.d30.value)} />
              <Bar label={`31–60 · ${m.exp.d60.count}`} v={m.exp.d60.value} max={maxBucket} tone="warn" right={inr(m.exp.d60.value)} />
              <Bar label={`61–90 · ${m.exp.d90.count}`} v={m.exp.d90.value} max={maxBucket} right={inr(m.exp.d90.value)} />
            </div>
            <Source>inventory_batches · status=active · cost × qty</Source>
          </Win>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 12 }}>
        <Win title="refills" count={`${m.due.length} due · ${m.confirmed.length} YES`} tools={<Link href="/refills" className="btn sm ghost" style={{ padding: '0 6px' }}>open ▸</Link>}>
          <table className="grid">
            <tbody>
              {[...m.confirmed, ...m.due.filter((p) => p.refill_status !== 'confirmed')].slice(0, 6).map((p) => (
                <tr key={p.id}>
                  <td>{p.patient_name}</td>
                  <td>{formatDate(p.next_refill_date)}</td>
                  <td className="act">
                    {p.refill_status === 'confirmed' ? (
                      <Chip tone="hot">YES</Chip>
                    ) : p.refill_status === 'nudged' ? (
                      <Chip tone="warn">ASKED</Chip>
                    ) : hasActiveConsent(p, db.consent_log) ? (
                      <Chip>DUE</Chip>
                    ) : (
                      <Chip tone="bad">NO CONSENT</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!m.due.length && !m.confirmed.length && <div className="hint">No refills due within 3 days.</div>}
        </Win>

        <Win title="deliveries" count={`${sentOrders.length} awaited`}>
          {sentOrders.map((o) => {
            const w = db.wholesalers.find((x) => x.id === o.wholesaler_id);
            return (
              <div key={o.id} className="issue" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>
                  <b>{w?.name}</b>
                  <br />
                  <span className="hint">
                    {o.lines.length} lines · sent {o.sent_at ? formatTimeIST(o.sent_at) : ''} via {o.sent_via}
                  </span>
                </span>
                <Link className="btn sm" href="/scan?sample=tatanagar-4519">
                  Verify bill ▸
                </Link>
              </div>
            );
          })}
          {lastBills.map((b) => (
            <div key={b.id} className="issue" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>
                {b.distributor_name} · {b.bill_no}
                <br />
                <span className="hint">{formatDate(b.bill_date)} · {inr(b.total_inr)}</span>
              </span>
              {b.issues.length ? <Chip tone="bad">{inr(moneyAtStake(b.issues))} AT STAKE</Chip> : <Chip tone="good">CLEAN</Chip>}
            </div>
          ))}
        </Win>

        <Win title="live activity" count="audit">
          <div className="tl">
            {events.map((e) => (
              <div key={e.id} className="ev2">
                <span className="t">{formatTimeIST(e.at)}</span>
                <span className={`d ${e.actor.startsWith('munshi') || e.action.startsWith('agent') ? 'hot' : ''}`} />
                <span className="x">
                  <b>{e.action}</b> · {e.actor}
                </span>
              </div>
            ))}
          </div>
          <Link href="/audit" className="hint">
            Full audit trail ▸
          </Link>
        </Win>
      </div>

      <div className="grid-4" style={{ marginTop: 12 }}>
        <div className="card stat">
          <span className="v tnum">{db.inventory_batches.filter((b) => b.status === 'active' && b.qty > 0).length}</span>
          <span className="l">batches on shelf · <Money v={m.exp.totalValue} compact /></span>
        </div>
        <div className="card stat">
          <span className="v tnum">{db.chronic_patients.filter((p) => p.dpdp_opt_in).length}/{db.chronic_patients.length}</span>
          <span className="l">refill patients with consent</span>
        </div>
        <div className="card stat">
          <span className="v tnum">{m.reorder.filter((r) => !r.blocked).length}</span>
          <span className="l">to reorder · {m.reorder.filter((r) => r.blocked).length} blocked as dead stock</span>
        </div>
        <div className="card stat">
          <span className="v tnum">{db.schedule_h1_logs.length}</span>
          <span className="l">H1 entries · {m.h1Incomplete} incomplete</span>
        </div>
      </div>
    </>
  );
}
