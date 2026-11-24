'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/ui/app';
import { Chip, Ev, PageHead, Source, Win } from '@/ui/kit';
import { SAMPLE_RX } from '@/core/fixtures';
import { matchRx, type RxRead } from '@/core/rx';
import { h1Missing } from '@/core/h1';
import { formatDate } from '@/core/util';
import { rxSVG, svgURL } from '@/lib/paperArt';
import { apiFetch } from '@/data/api';
import * as A from '@/data/actions';

export default function Dispense() {
  const app = useApp();
  const [rx, setRx] = useState<RxRead | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [choice, setChoice] = useState<A.DispenseChoice[]>([]);
  const [done, setDone] = useState<{ lines: number; h1: number; problems: string[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => (rx ? matchRx(rx, app.db.drug_master, app.db.inventory_batches, app.today) : []), [rx, app.db, app.today]);

  const load = (r: RxRead, img: string | null) => {
    setRx(r);
    setImage(img);
    setDone(null);
    const ms = matchRx(r, app.db.drug_master, app.db.inventory_batches, app.today);
    setChoice(ms.map((m, i) => ({ index: i, drug_id: m.drug?.id ?? null, qty: m.line.qty, include: Boolean(m.drug) })));
  };
  const sample = (id: string) => {
    const s = SAMPLE_RX.find((x) => x.id === id)!;
    const r = s.read(app.today);
    setScanning(true);
    setImage(svgURL(rxSVG(r)));
    setRx(null);
    setTimeout(() => {
      setScanning(false);
      load(r, svgURL(rxSVG(r)));
    }, 1100);
  };
  const upload = async (f: File) => {
    const url = URL.createObjectURL(f);
    if (!app.health.gemini) {
      load({ doctor_name: '', doctor_address: '', doctor_reg_no: '', patient_name: '', patient_address: '', date: app.today, lines: [{ name: '', qty: 1 }] }, url);
      app.toast({ title: 'OCR NEEDS A KEY', body: 'Reading prescriptions needs GEMINI_API_KEY. Type the details, or load a sample.', tone: 'amber' });
      return;
    }
    setImage(url);
    setScanning(true);
    const fd = new FormData();
    fd.append('file', f, f.name);
    try {
      const res = await apiFetch('/api/scan-rx', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      load(j.read, url);
    } catch (e) {
      app.toast({ title: 'OCR FAILED', body: String(e instanceof Error ? e.message : e), tone: 'red' });
    } finally {
      setScanning(false);
    }
  };

  const anyH1 = matches.some((m, i) => choice[i]?.include && (m.is_h1 || app.db.drug_master.find((d) => d.id === choice[i]?.drug_id)?.schedule === 'H1'));
  const missing = rx && anyH1 ? h1Missing({ dispensed_date: app.today, patient_name: rx.patient_name, doctor_name: rx.doctor_name, doctor_address: rx.doctor_address, drug_name: 'x', qty: 1 }) : [];

  const dispense = async () => {
    if (!rx) return;
    try {
      const r = await A.dispenseRx(app.store, rx, matches, choice, app.today, null);
      setDone({ lines: r.dispensed.length, h1: r.h1.length, problems: r.problems });
      app.toast({ title: 'DISPENSED', body: `${r.dispensed.length} batch lines from stock (first expiry first).${r.h1.length ? ` ${r.h1.length} H1 register entr${r.h1.length > 1 ? 'ies' : 'y'} written.` : ''}`, tone: 'good' });
    } catch (e) {
      app.toast({ title: 'NOT DISPENSED', body: String(e instanceof Error ? e.message : e), tone: 'red' });
    }
  };

  const set = (k: keyof RxRead, v: string) => rx && setRx({ ...rx, [k]: v });

  return (
    <>
      <PageHead
        title="Dispense Rx"
        sub="Scan the prescription. Munshi matches stock first-expiry-first-out, shows same-salt alternatives for the pharmacist, and fills the Schedule H1 register at the moment of supply."
        actions={SAMPLE_RX.map((s) => (
          <button key={s.id} className="btn ghost sm" onClick={() => sample(s.id)}>
            Sample: {s.label}
          </button>
        ))}
      />
      <div className="split2">
        <Win title="prescription" flush>
          <div className="paperview">
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Prescription" />
                {scanning && <div className="scanline" />}
              </>
            ) : (
              <label className="drop">
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Drop a prescription</b>
                <span className="hint">Stored privately; never shared</span>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    Choose file
                  </button>
                  <button type="button" className="btn hot" onClick={() => sample('rx-h1')}>
                    Load sample Rx
                  </button>
                </div>
              </label>
            )}
          </div>
        </Win>
        <div className="stack">
          <Win title="read" count={rx ? <>{rx.lines.length} medicines <Ev k={image?.startsWith('data:image/svg') ? 'syn' : 'imp'} /></> : ''}>
            {!rx ? (
              <div className="hint">{scanning ? 'Reading the prescription…' : 'Details appear here.'}</div>
            ) : (
              <div className="form">
                <label className="field">
                  Prescriber
                  <input className="input sm" value={rx.doctor_name} onChange={(e) => set('doctor_name', e.target.value)} />
                </label>
                <label className="field">
                  Reg. no.
                  <input className="input sm" value={rx.doctor_reg_no} onChange={(e) => set('doctor_reg_no', e.target.value)} />
                </label>
                <label className="field full">
                  Prescriber address {anyH1 && <Chip tone={rx.doctor_address ? 'good' : 'bad'} plain>H1 REQUIRED</Chip>}
                  <input className="input sm" value={rx.doctor_address} onChange={(e) => set('doctor_address', e.target.value)} />
                </label>
                <label className="field">
                  Patient
                  <input className="input sm" value={rx.patient_name} onChange={(e) => set('patient_name', e.target.value)} />
                </label>
                <label className="field">
                  Patient address
                  <input className="input sm" value={rx.patient_address} onChange={(e) => set('patient_address', e.target.value)} />
                </label>
              </div>
            )}
          </Win>
          {rx && (
            <Win title="match to stock" count={formatDate(rx.date)} flush>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Written</th>
                    <th>Give</th>
                    <th className="num">Packs</th>
                    <th>From batch (FEFO)</th>
                    <th>✓</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m, i) => {
                    const c = choice[i];
                    if (!c) return null;
                    const chosen = app.db.drug_master.find((d) => d.id === c.drug_id);
                    const isH1 = m.is_h1 || chosen?.schedule === 'H1';
                    return (
                      <tr key={i} className={!c.include ? 'dim' : m.short && c.drug_id === m.drug?.id ? 'warnrow' : ''}>
                        <td>
                          <b>{m.line.name}</b>
                          <div className="hint">{m.line.dose}</div>
                        </td>
                        <td>
                          <select
                            className="input sm"
                            value={c.drug_id ?? ''}
                            onChange={(e) => setChoice((cs) => cs.map((x, k) => (k === i ? { ...x, drug_id: e.target.value || null } : x)))}
                            aria-label="Medicine to give"
                          >
                            {m.drug && <option value={m.drug.id}>{m.drug.name} · {m.in_stock} in stock</option>}
                            {m.alternatives.map((a) => (
                              <option key={a.drug.id} value={a.drug.id}>
                                same salt: {a.drug.name} · {a.in_stock}
                              </option>
                            ))}
                            {!m.drug && <option value="">not found in catalogue</option>}
                          </select>
                          <div className="hint">
                            {m.drug?.salt} {isH1 && <Chip tone="ink" plain>H1</Chip>} {m.alternatives.length > 0 && `· ${m.alternatives.length} same-salt option${m.alternatives.length > 1 ? 's' : ''} (pharmacist decides)`}
                          </div>
                        </td>
                        <td className="num">
                          <input className="cell num" type="number" min={1} style={{ width: 50 }} value={c.qty} onChange={(e) => setChoice((cs) => cs.map((x, k) => (k === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} aria-label="Packs" />
                        </td>
                        <td>
                          {c.drug_id === m.drug?.id
                            ? m.picks.map((p) => (
                                <div key={p.batch.id} className="hint">
                                  {p.batch.batch_no} · exp {formatDate(p.batch.expiry_date)} · {p.qty}
                                </div>
                              ))
                            : <span className="hint">FEFO on save</span>}
                          {m.short > 0 && c.drug_id === m.drug?.id && <Chip tone="warn">SHORT {m.short}</Chip>}
                        </td>
                        <td>
                          <input type="checkbox" checked={c.include} onChange={(e) => setChoice((cs) => cs.map((x, k) => (k === i ? { ...x, include: e.target.checked } : x)))} aria-label="Include" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row" style={{ padding: 10 }}>
                {missing.length > 0 && <Chip tone="bad">H1 NEEDS: {missing.join(', ').toUpperCase()}</Chip>}
                <span className="spacer" />
                {done ? (
                  <>
                    <Chip tone="good">DONE · {done.lines} LINES · {done.h1} H1</Chip>
                    <Link className="btn" href="/h1">
                      H1 register ▸
                    </Link>
                    <Link className="btn ghost" href="/refills">
                      Enrol for refills ▸
                    </Link>
                  </>
                ) : (
                  <button className="btn hot" disabled={missing.length > 0} onClick={dispense}>
                    ✓ Dispense{anyH1 ? ' & write H1 register' : ''}
                  </button>
                )}
              </div>
            </Win>
          )}
          <Source>drug_master (salt) × inventory_batches (FEFO) · H1 rows require prescriber name and address, patient, drug, quantity (Drugs and Cosmetics Rules, rule 65)</Source>
        </div>
      </div>
    </>
  );
}
