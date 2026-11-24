'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/ui/app';
import { useMetrics } from '@/ui/metrics';
import { Bar, Chip, Modal, Money, PageHead, Source, Win } from '@/ui/kit';
import { creditAgeDays, CHASE_DAYS, wholesalerFor } from '@/core/returns';
import { formatDate, inr, sum } from '@/core/util';
import * as A from '@/data/actions';
import type { CreditNote } from '@/core/types';

export default function Returns() {
  const app = useApp();
  const m = useMetrics();
  const { db, today } = app;
  const [filter, setFilter] = useState<'pending' | 'settled' | 'all'>('pending');
  const [settling, setSettling] = useState<CreditNote | null>(null);
  const [amount, setAmount] = useState('');

  const credits = useMemo(
    () => [...db.credit_notes].filter((c) => filter === 'all' || c.status === filter || (filter === 'settled' && c.status === 'rejected')).sort((a, b) => (a.raised_at < b.raised_at ? -1 : 1)),
    [db.credit_notes, filter],
  );

  const windows = m.advice.filter((a) => a.action === 'return_now' || a.action === 'return_soon' || a.action === 'window_missed');
  const byW = new Map<string, typeof windows>();
  for (const a of windows) {
    const w = wholesalerFor(a.batch, db.wholesalers);
    const k = w?.name ?? a.batch.distributor_name;
    byW.set(k, [...(byW.get(k) || []), a]);
  }

  const perW = db.wholesalers.map((w) => {
    const cs = db.credit_notes.filter((c) => c.wholesaler_id === w.id);
    const settled = cs.filter((c) => c.status === 'settled');
    const days = settled.map((c) => (c.settled_at ? Math.max(0, Math.round((Date.parse(c.settled_at) - Date.parse(c.raised_at)) / 86400000)) : 0));
    return {
      w,
      recovered: sum(settled, (c) => c.settled_amount_inr ?? c.claim_amount_inr),
      pending: sum(cs.filter((c) => c.status === 'pending'), (c) => c.claim_amount_inr),
      avgDays: days.length ? Math.round(sum(days, (d) => d) / days.length) : null,
    };
  });
  const maxW = Math.max(1, ...perW.map((p) => p.recovered + p.pending));

  const chaseAll = async () => {
    const out = await A.chaseCredits(app.store, m.chase.map((c) => c.id), today, app.lane);
    app.openOutbound(out);
  };
  const raiseFor = async (items: typeof windows) => {
    const ids = items.filter((a) => a.action !== 'window_missed').map((a) => a.batch.id);
    if (!ids.length) return;
    const qty = Object.fromEntries(items.map((a) => [a.batch.id, a.packs_unsold || a.batch.qty]));
    const slips = await A.raiseReturns(app.store, ids, today, qty);
    app.handleOutcome({ slips, note: `Return slip raised for ${ids.length} batches.` });
  };

  return (
    <>
      <PageHead
        title="Money-back"
        sub="Expiry returns to licensed wholesalers: windows before they close, credit notes until they are paid."
        actions={
          <button className="btn hot" disabled={!m.chase.length} onClick={chaseAll}>
            Chase {m.chase.length} credit notes ▸
          </button>
        }
      />
      <div className="grid-4">
        <div className="card stat">
          <span className="v money-good">{inr(m.credits.recoveredThisMonth)}</span>
          <span className="l">recovered this month</span>
        </div>
        <div className="card stat">
          <span className="v">{inr(m.recoverableNow)}</span>
          <span className="l">recoverable now · {m.returnNow.length} batches</span>
        </div>
        <div className="card stat">
          <span className="v">{inr(m.credits.pendingValue)}</span>
          <span className="l">pending · {m.credits.pendingCount} slips · {m.credits.overdue} overdue</span>
        </div>
        <div className="card stat">
          <span className="v">{inr(m.credits.recoveredAllTime, { compact: true })}</span>
          <span className="l">recovered all time</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12, gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' }}>
        <Win
          title="credit notes"
          count={`${credits.length}`}
          tools={
            <div className="seg" style={{ borderColor: 'var(--paper)' }}>
              {(['pending', 'settled', 'all'] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} style={{ color: filter === f ? undefined : 'var(--ink)' }}>
                  {f}
                </button>
              ))}
            </div>
          }
          flush
        >
          <div className="tablewrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Slip</th>
                  <th>Wholesaler</th>
                  <th>Medicine</th>
                  <th className="num">Claim</th>
                  <th className="num">Age</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => {
                  const age = creditAgeDays(c, today);
                  const nextChase = CHASE_DAYS[c.chase_count];
                  return (
                    <tr key={c.id}>
                      <td>{c.return_slip_no}</td>
                      <td>{c.distributor_name}</td>
                      <td>
                        {c.medicine_name} <span className="hint">{c.batch_no} · {c.qty}</span>
                      </td>
                      <td className="num">
                        <Money v={c.claim_amount_inr} />
                      </td>
                      <td className="num">{age} d</td>
                      <td>
                        {c.status === 'settled' ? (
                          <Chip tone="good">SETTLED {c.settled_amount_inr !== null && c.settled_amount_inr < c.claim_amount_inr ? `· SHORT ${inr(c.claim_amount_inr - c.settled_amount_inr)}` : ''}</Chip>
                        ) : c.status === 'rejected' ? (
                          <Chip tone="bad">REJECTED</Chip>
                        ) : age > 45 ? (
                          <Chip tone="bad">OVERDUE · {c.chase_count} chases</Chip>
                        ) : (
                          <Chip tone="warn">PENDING {nextChase !== undefined ? `· chase at ${nextChase} d` : ''}</Chip>
                        )}
                      </td>
                      <td className="act">
                        {c.status === 'pending' && (
                          <>
                            <button
                              className="btn sm"
                              onClick={() => {
                                setSettling(c);
                                setAmount(String(c.claim_amount_inr));
                              }}
                            >
                              Settle
                            </button>{' '}
                            <button className="btn sm ghost" onClick={async () => app.openOutbound(await A.chaseCredits(app.store, [c.id], today, app.lane))}>
                              Chase
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Win>

        <div className="stack">
          <Win title="return windows" count={`${windows.length} batches`}>
            {!windows.length && <div className="hint">No batch needs returning.</div>}
            {[...byW.entries()].map(([name, items]) => (
              <div key={name} style={{ marginBottom: 12 }}>
                <div className="row">
                  <b style={{ fontSize: 12.5 }}>{name}</b>
                  <span className="spacer" />
                  <Money v={sum(items, (a) => (a.action === 'window_missed' ? 0 : a.rupees))} tone="good" />
                  <button className="btn sm hot" onClick={() => raiseFor(items)} disabled={!items.some((a) => a.action !== 'window_missed')}>
                    Raise slip ▸
                  </button>
                </div>
                {items.map((a) => (
                  <div key={a.batch.id} className="issue">
                    <Chip tone={a.action === 'return_now' || a.action === 'window_missed' ? 'bad' : 'warn'}>{a.label}</Chip>
                    <span>
                      {a.batch.medicine_name} <span className="hint">· {a.packs_unsold || a.batch.qty} packs · closes {formatDate(a.window_closes)}</span>
                    </span>
                    <span className="amt">{a.days_to_close >= 0 ? `${a.days_to_close} d` : 'closed'}</span>
                  </div>
                ))}
              </div>
            ))}
          </Win>
          <Win title="by wholesaler">
            <div className="bars">
              {perW.map((p) => (
                <Bar key={p.w.id} label={p.w.name.split(' ')[0]} v={p.recovered} max={maxW} right={`${inr(p.recovered, { compact: true })}${p.avgDays !== null ? ` · ${p.avgDays} d` : ''}`} />
              ))}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>Recovered · average days to settle. Terms: {db.wholesalers.map((w) => `${w.name.split(' ')[0]} ${w.credit_pct}% / ${w.return_window_days} d`).join(' · ')}</div>
            <Source>credit_notes × wholesalers</Source>
          </Win>
        </div>
      </div>

      {settling && (
        <Modal title={`settle ${settling.return_slip_no}`} onClose={() => setSettling(null)}>
          <p className="p">
            Credit note received from {settling.distributor_name} for {settling.medicine_name} ({settling.qty} packs). Claim was {inr(settling.claim_amount_inr)}.
          </p>
          <label className="field">
            Amount credited, ₹
            <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <div className="actions">
            <button
              className="btn ghost"
              onClick={async () => {
                await A.rejectCredit(app.store, settling.id, 'Rejected by wholesaler');
                setSettling(null);
              }}
            >
              Mark rejected
            </button>
            <button
              className="btn hot"
              onClick={async () => {
                await A.settleCredit(app.store, settling.id, Number(amount));
                app.toast({ title: 'MONEY BACK', body: `${inr(Number(amount))} recovered from ${settling.distributor_name}.`, tone: 'good' });
                setSettling(null);
              }}
            >
              ✓ Settle
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
