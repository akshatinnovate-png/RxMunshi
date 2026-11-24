'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/ui/app';
import { useMetrics } from '@/ui/metrics';
import { Chip, Money, PageHead, Source, Win } from '@/ui/kit';
import { orderMessage } from '@/core/reorder';
import { formatTimeIST, inr, round2 } from '@/core/util';
import * as A from '@/data/actions';

export default function Reorder() {
  const app = useApp();
  const m = useMetrics();
  const { db } = app;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [off, setOff] = useState<string[]>([]);
  const [override, setOverride] = useState<string[]>([]);

  const rows = m.reorder;
  const groups = useMemo(() => {
    const g = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.wholesaler) continue;
      if (r.blocked && !override.includes(r.key)) continue;
      if (off.includes(r.key)) continue;
      g.set(r.wholesaler.id, [...(g.get(r.wholesaler.id) || []), r]);
    }
    return g;
  }, [rows, off, override]);

  const send = async (wid: string) => {
    const items = groups.get(wid) ?? [];
    const out = await A.sendOrder(
      app.store,
      wid,
      items.map((r) => ({ drug_id: r.drug_id, medicine_name: r.medicine_name, qty: qty[r.key] ?? r.qty, est_cost_inr: r.est_cost_inr, reason: r.reason })),
      app.lane,
    );
    if (out) app.openOutbound([out]);
  };

  const sent = [...db.orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);

  return (
    <>
      <PageHead
        title="Reorder"
        sub="Refill patients are guaranteed demand. Munshi adds their next 14 days to sell-through, subtracts stock that will still be usable, and blocks medicines that recently expired unsold."
      />
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' }}>
        <Win title="suggestions · next 14 days" count={`${rows.length}`} flush>
          <table className="grid">
            <thead>
              <tr>
                <th>✓</th>
                <th>Medicine</th>
                <th className="num">On hand</th>
                <th className="num">Committed</th>
                <th className="num">/day</th>
                <th className="num">Order</th>
                <th className="num">Est.</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const blocked = r.blocked && !override.includes(r.key);
                return (
                  <tr key={r.key} className={blocked || off.includes(r.key) ? 'dim' : ''}>
                    <td>
                      {blocked ? (
                        <button className="btn sm ghost" title="Override the dead-stock guard" onClick={() => setOverride((o) => [...o, r.key])}>
                          override
                        </button>
                      ) : (
                        <input type="checkbox" checked={!off.includes(r.key)} onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== r.key) : [...o, r.key]))} aria-label={`Include ${r.medicine_name}`} />
                      )}
                    </td>
                    <td>
                      <b>{r.medicine_name}</b> {r.blocked && <Chip tone="bad">DEAD-STOCK GUARD</Chip>}
                      <div className="hint">{r.reason}</div>
                    </td>
                    <td className="num">{r.on_hand}</td>
                    <td className="num">{r.committed || '—'}</td>
                    <td className="num">{r.per_day}</td>
                    <td className="num">
                      <input className="cell num" type="number" min={1} style={{ width: 56 }} value={qty[r.key] ?? r.qty} onChange={(e) => setQty({ ...qty, [r.key]: Math.max(1, Number(e.target.value)) })} aria-label="Order quantity" />
                    </td>
                    <td className="num">
                      <Money v={(qty[r.key] ?? r.qty) * r.est_cost_inr} />
                    </td>
                    <td>{r.wholesaler?.name.split(' ')[0] ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '0 10px 10px' }}>
            <Source>dispenses (30 d) · chronic_patients refills due in 14 d · inventory_batches usable past 44 d · deadStockNames()</Source>
          </div>
        </Win>
        <div className="stack">
          {[...groups.entries()].map(([wid, items]) => {
            const w = db.wholesalers.find((x) => x.id === wid)!;
            const total = round2(items.reduce((s, r) => s + (qty[r.key] ?? r.qty) * r.est_cost_inr, 0));
            const preview = orderMessage(
              { id: '', shop_id: '', wholesaler_id: wid, lines: items.map((r) => ({ drug_id: r.drug_id, medicine_name: r.medicine_name, qty: qty[r.key] ?? r.qty, est_cost_inr: r.est_cost_inr, reason: '' })), status: 'draft', total_est_inr: total, sent_via: null, created_at: '', sent_at: null, bill_id: null },
              w,
              db.shops[0],
            );
            return (
              <Win key={wid} title={`order — ${w.name}`} count={inr(total)}>
                <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{preview}</div>
                <div className="row end">
                  <span className="hint">via {app.lane === 'sim' ? 'simulated WhatsApp' : app.lane}</span>
                  <button className="btn hot" onClick={() => send(wid)}>
                    Send on WhatsApp ▸
                  </button>
                </div>
              </Win>
            );
          })}
          <Win title="orders" count={`${db.orders.length}`}>
            <table className="grid">
              <tbody>
                {sent.map((o) => (
                  <tr key={o.id}>
                    <td>{db.wholesalers.find((w) => w.id === o.wholesaler_id)?.name}</td>
                    <td className="hint">{o.sent_at ? formatTimeIST(o.sent_at) : ''}</td>
                    <td className="num">{inr(o.total_est_inr)}</td>
                    <td>
                      <Chip tone={o.status === 'verified' ? 'good' : o.status === 'delivered' ? 'warn' : undefined}>{o.status.toUpperCase()}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 6 }}>An order is verified when its delivery bill is scanned and matches.</div>
          </Win>
        </div>
      </div>
    </>
  );
}
