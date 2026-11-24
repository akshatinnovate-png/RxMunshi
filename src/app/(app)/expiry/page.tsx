'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/ui/app';
import { BucketChip, Chip, Ev, Money, PageHead, Source, Win } from '@/ui/kit';
import { bucketOf, daysToExpiry, onShelf, stockValue, type Bucket } from '@/core/expiry';
import { adviseBatch, wholesalerFor } from '@/core/returns';
import { parseIntent } from '@/core/intents';
import { formatDate, inr, normName, similarity, sum } from '@/core/util';
import { listen, speechSupported, download } from '@/lib/browser';
import { csvCell } from '@/core/h1';
import * as A from '@/data/actions';

export default function ExpiryPage() {
  return (
    <Suspense>
      <Radar />
    </Suspense>
  );
}

const ACTION_TONE = { return_now: 'bad', window_missed: 'bad', return_soon: 'warn', sell_first: 'good', watch: undefined } as const;

function Radar() {
  const app = useApp();
  const params = useSearchParams();
  const [bucket, setBucket] = useState<'all' | Bucket>('all');
  const [days, setDays] = useState(90);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [mic, setMic] = useState(false);
  const [heard, setHeard] = useState('');

  useEffect(() => {
    const b = params.get('bucket');
    if (b) setBucket(b as Bucket);
    const d = params.get('days');
    if (d) setDays(Number(d));
    const qq = params.get('q');
    if (qq) setQ(qq);
  }, [params]);

  const rows = useMemo(() => {
    const live = onShelf(app.db.inventory_batches);
    return live
      .filter((b) => (bucket === 'all' ? daysToExpiry(b, app.today) <= days : bucketOf(b, app.today) === bucket))
      .filter((b) => !q || normName(b.medicine_name).includes(normName(q)) || similarity(b.medicine_name, q) > 0.7 || b.batch_no.toLowerCase().includes(q.toLowerCase()))
      .map((b) => ({ b, a: adviseBatch(b, wholesalerFor(b, app.db.wholesalers), app.db.dispenses, app.db.chronic_patients, app.today) }))
      .sort((x, y) => (x.b.expiry_date < y.b.expiry_date ? -1 : 1));
  }, [app.db, app.today, bucket, days, q]);

  const voice = () => {
    if (!speechSupported()) {
      app.toast({ title: 'VOICE', body: 'Voice needs Chrome or Edge. Type in the filter instead.', tone: 'amber' });
      return;
    }
    setMic(true);
    let last = '';
    listen({
      lang: 'hi-IN',
      onText: (t) => {
        last = t;
        setHeard(t);
      },
      onEnd: () => {
        setMic(false);
        applySpoken(last);
      },
    });
  };
  const applySpoken = (t: string) => {
    if (!t) return;
    const intent = parseIntent(t);
    if (intent.tool === 'expiring_batches') {
      setBucket('all');
      setDays(intent.args.days);
      setQ(intent.args.name ?? '');
    } else if (intent.tool === 'stock_lookup') {
      setBucket('all');
      setDays(9999);
      setQ(intent.args.name);
    } else if (intent.tool === 'propose_returns') {
      setSel(rows.filter((r) => r.a.action === 'return_now').map((r) => r.b.id));
    } else app.askMunshi(t);
  };

  const selected = rows.filter((r) => sel.includes(r.b.id));
  const returnSelected = async () => {
    if (!selected.length) return;
    const qty = Object.fromEntries(selected.map((r) => [r.b.id, r.a.action === 'return_now' && r.a.packs_unsold ? r.a.packs_unsold : r.b.qty]));
    const slips = await A.raiseReturns(app.store, selected.map((r) => r.b.id), app.today, qty);
    app.handleOutcome({ slips, note: `${slips.length} return slip${slips.length > 1 ? 's' : ''} raised · credit notes pending.` });
    setSel([]);
  };
  const quarantineExpired = async () => {
    const ids = rows.filter((r) => bucketOf(r.b, app.today) === 'expired').map((r) => r.b.id);
    if (!ids.length) return;
    await A.quarantine(app.store, ids);
    app.toast({ title: 'QUARANTINED', body: `${ids.length} expired batches moved off the saleable shelf.`, tone: 'good' });
  };
  const exportCSV = () => {
    const head = ['Medicine', 'Batch', 'Expiry', 'Days', 'Qty', 'Cost/pack', 'Value', 'Supplier', 'Advice'];
    const body = rows.map(({ b, a }) => [b.medicine_name, b.batch_no, b.expiry_date, daysToExpiry(b, app.today), b.qty, b.cost_inr, stockValue(b), b.distributor_name, a.label].map(csvCell).join(','));
    download(`expiry-radar-${app.today}.csv`, [head.join(','), ...body].join('\r\n'), 'text/csv');
  };

  const total = sum(rows, (r) => stockValue(r.b));
  const recover = sum(rows.filter((r) => r.a.action === 'return_now'), (r) => r.a.rupees);

  return (
    <>
      <PageHead
        title="Expiry Radar"
        sub="Every batch on the shelf by expiry, with the best action for each: return now, sell first, or watch. Return windows come from each wholesaler's terms."
        actions={
          <>
            <button className={`btn ${mic ? 'hot' : 'ghost'}`} onClick={voice}>
              {mic ? '● Listening…' : '◉ Bolo filter'}
            </button>
            <button className="btn ghost" onClick={exportCSV}>
              Export CSV
            </button>
            <button className="btn ghost" onClick={quarantineExpired}>
              Quarantine expired
            </button>
            <button className="btn hot" disabled={!selected.length} onClick={returnSelected}>
              Return selected ({selected.length}) ▸ PDF
            </button>
          </>
        }
      />
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="seg" role="group" aria-label="Bucket">
          {(['all', 'expired', 'd30', 'd60', 'd90'] as const).map((b) => (
            <button key={b} aria-pressed={bucket === b} onClick={() => setBucket(b)}>
              {b === 'all' ? `≤ ${days >= 9999 ? 'any' : days} d` : { expired: 'Expired', d30: '≤ 30', d60: '31–60', d90: '61–90' }[b]}
            </button>
          ))}
        </div>
        <input className="input sm" style={{ width: 220 }} placeholder="Filter: medicine or batch" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
        <select className="input sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days ahead">
          {[30, 60, 90, 180, 9999].map((d) => (
            <option key={d} value={d}>
              {d === 9999 ? 'all stock' : `next ${d} days`}
            </option>
          ))}
        </select>
        {heard && <span className="hint">heard: “{heard}”</span>}
        <span className="spacer" />
        <span className="hint">
          {rows.length} batches · <b>{inr(total)}</b> · recoverable now <b className="money-good">{inr(recover)}</b>
        </span>
      </div>
      <Win title="batches" count={`${rows.length}`} flush>
        <div className="tablewrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          <table className="grid">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={rows.length > 0 && sel.length === rows.length}
                    onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.b.id) : [])}
                  />
                </th>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="num">Days</th>
                <th className="num">Qty</th>
                <th className="num">Value</th>
                <th>Supplier</th>
                <th>Best action</th>
                <th className="num">Claim</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, a }) => (
                <tr key={b.id} className={sel.includes(b.id) ? 'sel' : ''}>
                  <td>
                    <input type="checkbox" checked={sel.includes(b.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))} aria-label={`Select ${b.medicine_name}`} />
                  </td>
                  <td>
                    <b>{b.medicine_name}</b> {b.is_schedule_h1 && <Chip tone="ink" plain>H1</Chip>} {b.dead_stock_risk && <Chip tone="warn" plain>DEAD-STOCK</Chip>}
                  </td>
                  <td>{b.batch_no}</td>
                  <td>
                    {formatDate(b.expiry_date)} <BucketChip b={bucketOf(b, app.today)} />
                  </td>
                  <td className="num">{daysToExpiry(b, app.today)}</td>
                  <td className="num">{b.qty}</td>
                  <td className="num">
                    <Money v={stockValue(b)} />
                  </td>
                  <td>{b.distributor_name}</td>
                  <td title={a.reason}>
                    <Chip tone={ACTION_TONE[a.action]}>{a.label}</Chip>
                    <div className="hint" style={{ maxWidth: 280 }}>{a.reason}</div>
                  </td>
                  <td className="num">{a.rupees ? <Money v={a.rupees} tone={a.action === 'window_missed' ? 'bad' : 'good'} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Win>
      <Source>
        inventory_batches (status=active) · <Ev k="der" /> best action = 30-day sell-through × refill commitments × wholesaler return window and credit % · demo data <Ev k="syn" />
      </Source>
    </>
  );
}
