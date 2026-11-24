'use client';
import { useState } from 'react';
import { useApp } from '@/ui/app';
import { Chip, Modal, PageHead, Source, Win } from '@/ui/kit';
import { inr, sum, uid } from '@/core/util';
import { moneyAtStake } from '@/core/verify';
import * as A from '@/data/actions';
import type { Wholesaler } from '@/core/types';

/** Wholesaler scorecard: how each supplier treats this shop, from its own bills and returns. */
export default function Wholesalers() {
  const app = useApp();
  const { db } = app;
  const [edit, setEdit] = useState<Wholesaler | null>(null);

  const cards = db.wholesalers.map((w) => {
    const bills = db.purchase_bills.filter((b) => b.wholesaler_id === w.id || b.distributor_name === w.name);
    const issues = bills.flatMap((b) => b.issues);
    const credits = db.credit_notes.filter((c) => c.wholesaler_id === w.id);
    const settled = credits.filter((c) => c.status === 'settled');
    const settleDays = settled.map((c) => (c.settled_at ? (Date.parse(c.settled_at) - Date.parse(c.raised_at)) / 86400000 : 0));
    const avgSettle = settleDays.length ? Math.round(sum(settleDays, (d) => d) / settleDays.length) : null;
    const k = (kind: string) => issues.filter((i) => i.kind === kind).length;
    // reliability: start at 100, lose points for each problem kind
    const score = Math.max(0, 100 - k('short_qty') * 8 - k('price_up') * 4 - k('short_dated') * 10 - k('missing_free') * 5 - k('above_mrp') * 15 - (avgSettle !== null && avgSettle > 30 ? 10 : 0) - credits.filter((c) => c.status === 'rejected').length * 10);
    return { w, bills, issues, credits, settled, avgSettle, score, stake: moneyAtStake(issues), k };
  });

  return (
    <>
      <PageHead
        title="Wholesalers"
        sub="A scorecard per supplier from your own bills and returns: short supply, price rises, short-dated stock, missing schemes and how fast credit notes are paid."
        actions={
          <button
            className="btn"
            onClick={() => setEdit({ id: uid(), shop_id: db.shops[0].id, name: '', phone: '91', license_no: '', city: '', return_window_days: 30, credit_pct: 100, min_shelf_life_months: 6 })}
          >
            + Wholesaler
          </button>
        }
      />
      <div className="grid-3">
        {cards.map((c) => (
          <Win key={c.w.id} title={c.w.name} tools={<button onClick={() => setEdit(c.w)}>✎</button>}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <span className="big" style={{ color: c.score >= 85 ? 'var(--good)' : c.score < 60 ? 'var(--bad)' : 'var(--ink)' }}>
                {c.score}
              </span>
              <span className="kicker">reliability</span>
              <span className="spacer" />
              <Chip tone="ink" plain>
                DL {c.w.license_no.split('/')[0]}
              </Chip>
            </div>
            <table className="grid" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Bills scanned</td><td className="num">{c.bills.length}</td></tr>
                <tr><td>Short supplies</td><td className="num">{c.k('short_qty')}</td></tr>
                <tr><td>Price rises</td><td className="num">{c.k('price_up')}</td></tr>
                <tr><td>Short-dated deliveries</td><td className="num">{c.k('short_dated')}</td></tr>
                <tr><td>Missing free goods</td><td className="num">{c.k('missing_free')}</td></tr>
                <tr><td>₹ flagged on bills</td><td className="num">{inr(c.stake)}</td></tr>
                <tr><td>Credit notes settled</td><td className="num">{c.settled.length}/{c.credits.length}</td></tr>
                <tr><td>Avg days to settle</td><td className="num">{c.avgSettle ?? '—'}</td></tr>
                <tr><td>Terms</td><td className="num">{c.w.credit_pct}% · {c.w.return_window_days} d · min {c.w.min_shelf_life_months} mo</td></tr>
              </tbody>
            </table>
          </Win>
        ))}
      </div>
      <Source>purchase_bills.issues × credit_notes · score = 100 − 8/short supply − 4/price rise − 10/short-dated − 5/missing scheme − 15/above MRP − 10 if credit takes 30+ days</Source>
      {edit && (
        <Modal title={edit.name ? `edit ${edit.name}` : 'new wholesaler'} onClose={() => setEdit(null)} wide>
          <div className="form">
            {(
              [
                ['name', 'Name', 'text'],
                ['phone', 'WhatsApp (with 91)', 'text'],
                ['license_no', 'Licence (Form 20B/21B)', 'text'],
                ['city', 'City', 'text'],
                ['return_window_days', 'Accepts returns until N days after expiry', 'number'],
                ['credit_pct', 'Credit % of cost on returns', 'number'],
                ['min_shelf_life_months', 'Refuse deliveries with less shelf life than (months)', 'number'],
              ] as const
            ).map(([k, l, t]) => (
              <label key={k} className="field">
                {l}
                <input className="input" type={t} value={String(edit[k])} onChange={(e) => setEdit({ ...edit, [k]: t === 'number' ? Number(e.target.value) : e.target.value })} />
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button
              className="btn hot"
              disabled={!edit.name}
              onClick={async () => {
                await A.upsertWholesaler(app.store, edit);
                setEdit(null);
              }}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
