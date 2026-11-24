'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/ui/app';
import { Chip, Modal, PageHead, Source, Win } from '@/ui/kit';
import { h1CSV, h1Missing } from '@/core/h1';
import { formatDate } from '@/core/util';
import { download } from '@/lib/browser';
import { apiFetch } from '@/data/api';
import * as A from '@/data/actions';
import type { H1Entry } from '@/core/types';

export default function H1() {
  const app = useApp();
  const { db, today } = app;
  const [q, setQ] = useState('');
  const [onlyBad, setOnlyBad] = useState(false);
  const [edit, setEdit] = useState<H1Entry | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(
    () =>
      [...db.schedule_h1_logs]
        .filter((e) => !onlyBad || h1Missing(e).length)
        .filter((e) => !q || `${e.patient_name} ${e.doctor_name} ${e.drug_name} ${e.batch_no}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.dispensed_date < b.dispensed_date ? 1 : -1)),
    [db.schedule_h1_logs, q, onlyBad],
  );
  const bad = db.schedule_h1_logs.filter((e) => h1Missing(e).length).length;

  const csv = async () => {
    if (app.mode === 'live') {
      const res = await apiFetch('/api/export/h1-csv');
      if (res.ok) {
        download(`schedule-h1-register-${today}.csv`, await res.blob());
        return;
      }
    }
    download(`schedule-h1-register-${today}.csv`, h1CSV(db.schedule_h1_logs, db.shops[0]), 'text/csv;charset=utf-8');
  };

  return (
    <>
      <PageHead
        title="Schedule H1 register"
        sub="Written at the moment of supply from the prescription: prescriber name and address, patient, drug, quantity. Kept three years. Rule 65, Drugs and Cosmetics Rules."
        actions={
          <>
            <button className="btn ghost" onClick={() => setAdding(true)}>
              + Entry
            </button>
            <button className="btn ghost" onClick={async () => { const { h1PDF } = await import('@/lib/pdf'); download(`schedule-h1-register-${today}.pdf`, h1PDF(db.schedule_h1_logs, db.shops[0], today), 'application/pdf'); }}>
              PDF
            </button>
            <button className="btn hot" onClick={csv}>
              Drug Inspector CSV ▸
            </button>
          </>
        }
      />
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input sm" placeholder="Search patient, doctor, drug, batch" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} aria-label="Search" />
        <label className="check">
          <input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> Only incomplete ({bad})
        </label>
      </div>
      <Win title="register" count={`${rows.length} of ${db.schedule_h1_logs.length}`} flush>
        <div className="tablewrap" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Prescriber</th>
                <th>Prescriber address</th>
                <th>Drug</th>
                <th>Batch</th>
                <th className="num">Qty</th>
                <th>Keep until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const miss = h1Missing(e);
                return (
                  <tr key={e.id} className={miss.length ? 'flag' : ''}>
                    <td>{formatDate(e.dispensed_date)}</td>
                    <td>
                      {e.patient_name}
                      <div className="hint">{e.patient_address}</div>
                    </td>
                    <td>
                      {e.doctor_name}
                      <div className="hint">{e.doctor_reg_no}</div>
                    </td>
                    <td>{e.doctor_address || <Chip tone="bad">MISSING</Chip>}</td>
                    <td>{e.drug_name}</td>
                    <td>{e.batch_no}</td>
                    <td className="num">{e.qty}</td>
                    <td>{formatDate(e.retain_until)}</td>
                    <td className="act">
                      {miss.length > 0 && (
                        <button className="btn sm hot" onClick={() => setEdit(e)}>
                          Fix
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Win>
      <Source>schedule_h1_logs · written by Dispense Rx or by hand · CSV neutralises spreadsheet formulas</Source>
      {edit && <EditEntry e={edit} onClose={() => setEdit(null)} />}
      {adding && <NewEntry onClose={() => setAdding(false)} />}
    </>
  );
}

function EditEntry({ e, onClose }: { e: H1Entry; onClose: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ doctor_address: e.doctor_address, doctor_name: e.doctor_name, patient_name: e.patient_name, qty: e.qty });
  return (
    <Modal title={`correct entry · ${e.drug_name}`} onClose={onClose}>
      <p className="hint">Corrections are logged in the audit trail with who made them.</p>
      <label className="field">
        Prescriber
        <input className="input" value={f.doctor_name} onChange={(x) => setF({ ...f, doctor_name: x.target.value })} />
      </label>
      <label className="field">
        Prescriber address
        <input className="input" value={f.doctor_address} onChange={(x) => setF({ ...f, doctor_address: x.target.value })} autoFocus />
      </label>
      <label className="field">
        Patient
        <input className="input" value={f.patient_name} onChange={(x) => setF({ ...f, patient_name: x.target.value })} />
      </label>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn hot"
          disabled={h1Missing({ ...e, ...f }).length > 0}
          onClick={async () => {
            await A.updateH1(app.store, e.id, f);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function NewEntry({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ dispensed_date: app.today, patient_name: '', patient_address: '', doctor_name: '', doctor_address: '', doctor_reg_no: '', drug_name: '', batch_no: '', qty: 1, rx_image_url: null as string | null });
  const miss = h1Missing(f);
  const h1Drugs = app.db.drug_master.filter((d) => d.schedule === 'H1');
  return (
    <Modal title="new h1 entry" onClose={onClose} wide>
      <div className="form">
        {(
          [
            ['patient_name', 'Patient'],
            ['patient_address', 'Patient address'],
            ['doctor_name', 'Prescriber'],
            ['doctor_address', 'Prescriber address'],
            ['doctor_reg_no', 'Prescriber reg. no.'],
            ['batch_no', 'Batch'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="field">
            {l}
            <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
        <label className="field">
          Drug
          <input className="input" list="h1drugs" value={f.drug_name} onChange={(e) => setF({ ...f, drug_name: e.target.value })} />
          <datalist id="h1drugs">
            {h1Drugs.map((d) => (
              <option key={d.id} value={d.name} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Quantity (packs)
          <input className="input" type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
        </label>
      </div>
      {miss.length > 0 && <div className="hint">Required: {miss.join(', ')}</div>}
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn hot"
          disabled={miss.length > 0}
          onClick={async () => {
            await A.addH1Entry(app.store, f);
            onClose();
          }}
        >
          Save entry
        </button>
      </div>
    </Modal>
  );
}
