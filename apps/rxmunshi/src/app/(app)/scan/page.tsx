'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/ui/app';
import { Chip, Ev, Money, PageHead, Source, Win } from '@/ui/kit';
import { SAMPLE_BILLS, type BillRead } from '@/core/fixtures';
import type { BillLine, VerifyIssue } from '@/core/types';
import * as A from '@/data/actions';
import { apiFetch } from '@/data/api';
import { billSVG, svgURL } from '@/lib/paperArt';
import { billTotal, disputeMessage, moneyAtStake } from '@/core/verify';
import { formatDate, inr } from '@/core/util';

export default function ScanPage() {
  return (
    <Suspense>
      <Scanner />
    </Suspense>
  );
}

const KIND_LABEL: Record<VerifyIssue['kind'], string> = {
  price_up: 'PRICE UP',
  above_mrp: 'ABOVE MRP',
  short_qty: 'SHORT SUPPLY',
  missing_free: 'FREE GOODS MISSING',
  short_dated: 'SHORT-DATED',
  duplicate_bill: 'DUPLICATE BILL',
  not_ordered: 'NOT ORDERED',
  dead_stock: 'DEAD-STOCK RISK',
  low_confidence: 'CHECK READING',
};

function Scanner() {
  const app = useApp();
  const params = useSearchParams();
  const [read, setRead] = useState<BillRead | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [source, setSource] = useState<'ocr' | 'sample' | 'manual'>('sample');
  const [scanning, setScanning] = useState(false);
  const [skip, setSkip] = useState<number[]>([]);
  const [over, setOver] = useState(false);
  const [cam, setCam] = useState(false);
  const [saved, setSaved] = useState<{ lines: number; total: number; issues: number } | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSample = (id: string) => {
    const s = SAMPLE_BILLS.find((x) => x.id === id) ?? SAMPLE_BILLS[0];
    const r = s.read(app.today);
    const w = app.db.wholesalers.find((x) => x.name === r.distributor_name);
    setImage(svgURL(billSVG(r, w?.license_no)));
    setRead(null);
    setSaved(null);
    setSkip([]);
    setSource('sample');
    setScanning(true);
    const t0 = performance.now();
    // the stage moment: a short "reading" pass, then the rows appear
    setTimeout(() => {
      setRead(r);
      setScanning(false);
      setMs(Math.round(performance.now() - t0));
    }, 1400);
  };

  useEffect(() => {
    const s = params.get('sample');
    if (s && app.store.ready) loadSample(s);
  }, [params, app.store.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const ocr = async (file: Blob, name = 'bill.jpg') => {
    setSaved(null);
    setSkip([]);
    setImage(URL.createObjectURL(file));
    if (!app.health.gemini) {
      setRead({ distributor_name: '', bill_no: '', bill_date: app.today, lines: [A.lineFromManual()] });
      setSource('manual');
      app.toast({ title: 'OCR NEEDS A KEY', body: 'Live bill reading needs GEMINI_API_KEY on the server. Type the rows on the right, or load a sample bill.', tone: 'amber', ttl: 9000 });
      return;
    }
    setScanning(true);
    const fd = new FormData();
    fd.append('file', file, name);
    const t0 = performance.now();
    try {
      const res = await apiFetch('/api/scan-bill', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRead(j.read);
      setSource('ocr');
      setMs(Math.round(performance.now() - t0));
    } catch (e) {
      app.toast({ title: 'OCR FAILED', body: `${e instanceof Error ? e.message : e}. Type the rows or load the sample bill.`, tone: 'red' });
      setRead({ distributor_name: '', bill_no: '', bill_date: app.today, lines: [A.lineFromManual()] });
      setSource('manual');
    } finally {
      setScanning(false);
    }
  };

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 1920 } });
      setCam(true);
      setImage(null);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch {
      app.toast({ title: 'CAMERA', body: 'Camera permission was refused or no camera found.', tone: 'amber' });
    }
  };
  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    setCam(false);
    c.toBlob((b) => b && ocr(b, 'webcam.jpg'), 'image/jpeg', 0.9);
  };

  const check = useMemo(() => (read ? A.checkBill(app.store, { ...read, lines: read.lines.filter((_, i) => !skip.includes(i)) }, app.today) : null), [read, skip, app.store, app.today, app.db]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = check?.issues ?? [];
  const stake = moneyAtStake(issues);
  const lineIssues = (i: number) => {
    // map issues back to original indices (skip shifts them)
    const kept = read ? read.lines.map((_, k) => k).filter((k) => !skip.includes(k)) : [];
    return issues.filter((x) => x.line !== null && kept[x.line] === i);
  };

  const setLine = (i: number, patch: Partial<BillLine>) =>
    setRead((r) => (r ? { ...r, lines: r.lines.map((l, k) => (k === i ? { ...l, ...patch, confidence: 1 } : l)) } : r));

  const save = async () => {
    if (!read) return;
    const bad = read.lines.filter((l, i) => !skip.includes(i) && (!l.medicine_name || !l.expiry_date || l.qty <= 0));
    if (bad.length) {
      app.toast({ title: 'CHECK ROWS', body: `${bad.length} rows need a name, expiry and quantity (or tick Skip).`, tone: 'amber' });
      return;
    }
    if (issues.some((i) => i.kind === 'duplicate_bill') && !confirm('This bill number was already entered. Save anyway?')) return;
    const res = await A.saveBill(app.store, read, { today: app.today, image_url: source === 'sample' ? 'sample' : null, source, skip });
    setSaved({ lines: res.batches.length, total: res.bill.total_inr, issues: res.issues.length });
    app.toast({ title: 'SAVED · LIVE', body: `${res.batches.length} batches added (${inr(res.bill.total_inr)}). KPIs updated.`, tone: 'good' });
  };

  const dispute = async () => {
    if (!read) return;
    const shop = app.db.shops[0];
    const body = disputeMessage(read, issues, shop.name);
    const out = await A.messageWholesaler(app.store, check?.wholesaler?.id ?? null, body, app.lane);
    if (out) app.openOutbound([out]);
    else app.toast({ title: 'NO WHOLESALER', body: 'Pick a known wholesaler to message.', tone: 'amber' });
  };

  return (
    <>
      <PageHead
        title="Scan a bill"
        sub="Drop a wholesaler bill or use the webcam. The bill stays on the left; check the rows on the right. The Delivery Verifier runs as you edit."
        actions={
          <>
            {SAMPLE_BILLS.map((s) => (
              <button key={s.id} className="btn ghost sm" onClick={() => loadSample(s.id)}>
                Sample: {s.label}
              </button>
            ))}
          </>
        }
      />
      <div className="split2" data-tour="scan">
        <Win title={image ? 'original' : 'drop a bill'} tools={image || cam ? <button onClick={() => { setImage(null); setRead(null); setCam(false); }}>×</button> : undefined} flush>
          <div className="paperview">
            {cam ? (
              <div style={{ width: '100%' }}>
                <video ref={videoRef} playsInline muted style={{ width: '100%' }} />
                <div className="row" style={{ padding: 8 }}>
                  <button className="btn hot" onClick={snap}>
                    ◉ Capture
                  </button>
                </div>
              </div>
            ) : image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Bill being read" />
                {scanning && <div className="scanline" />}
              </>
            ) : (
              <label
                className={`drop ${over ? 'over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) ocr(f, f.name);
                }}
              >
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Drop a bill here</b>
                <span className="hint">JPG, PNG, WEBP or PDF · up to 8 MB</span>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && ocr(e.target.files[0], e.target.files[0].name)} />
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    Choose file
                  </button>
                  <button type="button" className="btn ghost" onClick={startCam}>
                    ◉ Webcam
                  </button>
                  <button type="button" className="btn hot" onClick={() => loadSample(SAMPLE_BILLS[0].id)}>
                    Load sample bill
                  </button>
                </div>
              </label>
            )}
          </div>
        </Win>

        <div className="stack">
          <Win
            title="extracted rows"
            count={read ? `${read.lines.length} lines · ${source === 'ocr' ? `Gemini ${ms ?? ''} ms` : source === 'sample' ? 'sample (synthetic)' : 'typed'}` : ''}
          >
            {!read ? (
              <div className="hint">{scanning ? 'Reading the bill…' : 'Rows appear here after the bill is read.'}</div>
            ) : (
              <>
                <div className="form" style={{ gridTemplateColumns: '2fr 1fr 1fr', marginBottom: 10 }}>
                  <label className="field">
                    Wholesaler
                    <input className="input sm" list="wlist" value={read.distributor_name} onChange={(e) => setRead({ ...read, distributor_name: e.target.value })} />
                    <datalist id="wlist">
                      {app.db.wholesalers.map((w) => (
                        <option key={w.id} value={w.name} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    Bill no.
                    <input className="input sm" value={read.bill_no} onChange={(e) => setRead({ ...read, bill_no: e.target.value })} />
                  </label>
                  <label className="field">
                    Date
                    <input className="input sm" type="date" value={read.bill_date} onChange={(e) => setRead({ ...read, bill_date: e.target.value })} />
                  </label>
                </div>
                <div className="tablewrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Batch</th>
                        <th>Expiry</th>
                        <th className="num">Qty</th>
                        <th className="num">Free</th>
                        <th className="num">Rate</th>
                        <th className="num">MRP</th>
                        <th>H1</th>
                        <th>Read</th>
                        <th>Skip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {read.lines.map((l, i) => {
                        const li = lineIssues(i);
                        const low = l.confidence < 0.8;
                        return (
                          <tr key={i} className={skip.includes(i) ? 'dim' : li.some((x) => x.severity === 'bad') ? 'flag' : li.length ? 'warnrow' : ''}>
                            <td>
                              <input className={`cell ${low ? 'lowconf' : ''}`} value={l.medicine_name} onChange={(e) => setLine(i, { medicine_name: e.target.value })} aria-label="Medicine" />
                            </td>
                            <td>
                              <input className="cell" value={l.batch_no} onChange={(e) => setLine(i, { batch_no: e.target.value })} aria-label="Batch" />
                            </td>
                            <td>
                              <input className="cell" type="date" value={l.expiry_date} onChange={(e) => setLine(i, { expiry_date: e.target.value })} aria-label="Expiry" />
                            </td>
                            <td>
                              <input className="cell num" type="number" min={0} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} aria-label="Quantity" />
                            </td>
                            <td>
                              <input className="cell num" type="number" min={0} value={l.free_qty} onChange={(e) => setLine(i, { free_qty: Number(e.target.value) })} aria-label="Free" />
                            </td>
                            <td>
                              <input className="cell num" type="number" step="0.01" min={0} value={l.cost_inr} onChange={(e) => setLine(i, { cost_inr: Number(e.target.value) })} aria-label="Rate" />
                            </td>
                            <td>
                              <input className="cell num" type="number" step="0.01" min={0} value={l.mrp_inr} onChange={(e) => setLine(i, { mrp_inr: Number(e.target.value) })} aria-label="MRP" />
                            </td>
                            <td>
                              <input type="checkbox" checked={l.is_schedule_h1} onChange={(e) => setLine(i, { is_schedule_h1: e.target.checked })} aria-label="Schedule H1" />
                            </td>
                            <td>{l.confidence >= 1 ? <Ev k="obs" /> : <span title="read by OCR"><Ev k="imp" /> {Math.round(l.confidence * 100)}%</span>}</td>
                            <td>
                              <input type="checkbox" checked={skip.includes(i)} onChange={(e) => setSkip((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))} aria-label="Skip row" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn ghost sm" onClick={() => setRead({ ...read, lines: [...read.lines, A.lineFromManual()] })}>
                    + Row
                  </button>
                  <span className="hint">
                    Total <b>{inr(billTotal(read.lines.filter((_, i) => !skip.includes(i))))}</b> before GST · free goods lower the cost per pack on save
                  </span>
                  <span className="spacer" />
                  {saved ? (
                    <>
                      <Chip tone="good">SAVED · {saved.lines} BATCHES</Chip>
                      <Link className="btn" href="/expiry">
                        Expiry Radar ▸
                      </Link>
                    </>
                  ) : (
                    <button className="btn hot" onClick={save}>
                      ✓ Save all
                    </button>
                  )}
                </div>
              </>
            )}
          </Win>

          {read && (
            <Win title="delivery verifier" count={issues.length ? `${issues.length} findings` : 'clean'}>
              {check?.order && (
                <div className="note">
                  Matched to the order sent {formatDate(check.order.sent_at?.slice(0, 10) ?? '')} to {check.wholesaler?.name} ({check.order.lines.length} lines).
                </div>
              )}
              {!issues.length ? (
                <div className="row">
                  <Chip tone="good">CLEAN</Chip>
                  <span className="hint">Prices, quantities, schemes, shelf life and bill number all check out.</span>
                </div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <span className="big money-bad" style={{ fontSize: 26 }}>
                      {inr(stake)}
                    </span>
                    <span className="kicker">at stake on this bill</span>
                    <span className="spacer" />
                    <button className="btn sm" onClick={dispute}>
                      Message wholesaler ▸
                    </button>
                  </div>
                  {issues.map((x, k) => (
                    <div key={k} className="issue">
                      <Chip tone={x.severity}>{KIND_LABEL[x.kind]}</Chip>
                      <span>{x.message}</span>
                      <span className="amt">{x.amount_inr ? <Money v={x.amount_inr} /> : ''}</span>
                    </div>
                  ))}
                </>
              )}
              <Source>verifyBill(): previous bills · order {check?.order?.id ? 'matched' : 'none'} · MRP · shelf-life rule {check?.wholesaler?.min_shelf_life_months ?? 6} months · dead-stock history</Source>
            </Win>
          )}
        </div>
      </div>
    </>
  );
}
