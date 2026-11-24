'use client';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/ui/app';
import { useMetrics } from '@/ui/metrics';
import { Chip, Modal, Money, PageHead, Source, Win } from '@/ui/kit';
import { daysToRefill, hasActiveConsent, nudgeable, refillMessage } from '@/core/refills';
import { addDays, formatDate, formatTimeIST, inr } from '@/core/util';
import { findDrug } from '@/core/rx';
import * as A from '@/data/actions';
import type { Patient } from '@/core/types';

export default function RefillsPage() {
  return (
    <Suspense>
      <Refills />
    </Suspense>
  );
}

const CONSENT_HI = 'मैं सहमति देता/देती हूँ कि यह दुकान मेरी नियमित दवाइयों की याद दिलाने के लिए मुझे WhatsApp पर संदेश भेज सकती है। मैं कभी भी STOP लिखकर यह बंद कर सकता/सकती हूँ।';
const CONSENT_EN = 'I agree that this shop may send me WhatsApp reminders about refilling my regular medicines. I can stop this at any time by replying STOP.';

function Refills() {
  const app = useApp();
  const m = useMetrics();
  const params = useSearchParams();
  const { db, today } = app;
  const [adding, setAdding] = useState(false);
  const [consentFor, setConsentFor] = useState<Patient | null>(null);
  const [open, setOpen] = useState<string | null>(params.get('p'));

  const patients = useMemo(() => [...db.chronic_patients].sort((a, b) => (a.refill_status === 'confirmed' ? -1 : b.refill_status === 'confirmed' ? 1 : a.next_refill_date < b.next_refill_date ? -1 : 1)), [db.chronic_patients]);
  const canNudge = nudgeable(db.chronic_patients, db.consent_log, today);

  const sendAll = async () => {
    const r = await A.nudgeRefills(app.store, canNudge.map((p) => p.id), app.lane);
    app.openOutbound(r.sent);
    if (r.blocked.length) app.toast({ title: 'DPDP', body: `Not sent to ${r.blocked.join(', ')}: no active consent.`, tone: 'amber' });
  };

  return (
    <>
      <PageHead
        title="Refills"
        sub="Chronic patients whose medicines run out soon. Reminders go only to patients with a recorded DPDP consent; STOP withdraws it instantly."
        actions={
          <>
            <button className="btn ghost" onClick={() => window.open('/phone', 'rxphone', 'width=440,height=820')}>
              Patient phone ↗
            </button>
            <button className="btn ghost" onClick={() => setAdding(true)}>
              + Patient
            </button>
            <button className="btn hot" disabled={!canNudge.length} onClick={sendAll}>
              Send {canNudge.length} reminders ▸
            </button>
          </>
        }
      />
      <div className="grid-4">
        <div className="card stat">
          <span className="v">{m.due.length}</span>
          <span className="l">run out within 3 days</span>
        </div>
        <div className="card stat">
          <span className="v" style={{ color: 'var(--hot)' }}>{m.confirmed.length}</span>
          <span className="l">said YES · pack them</span>
        </div>
        <div className="card stat">
          <span className="v">{inr(m.due.reduce((s, p) => s + p.monthly_bill_inr, 0))}</span>
          <span className="l">monthly refills at stake</span>
        </div>
        <div className="card stat">
          <span className="v">
            {db.chronic_patients.filter((p) => hasActiveConsent(p, db.consent_log)).length}/{db.chronic_patients.length}
          </span>
          <span className="l">with active consent</span>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Win title="patients" count={`${patients.length}`} flush>
          <table className="grid">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medicines</th>
                <th>Runs out</th>
                <th className="num">Monthly</th>
                <th>Consent</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => {
                const d = daysToRefill(p, today);
                const consent = hasActiveConsent(p, db.consent_log);
                const msgs = db.messages.filter((x) => x.to_id === p.id).sort((a, b) => (a.at < b.at ? 1 : -1));
                return [
                  <tr key={p.id} className={`click ${open === p.id ? 'sel' : ''}`} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td>
                      <b>{p.patient_name}</b>
                      <div className="hint">
                        {p.preferred_lang === 'hi' ? 'Hindi' : 'English'} · every {p.refill_cycle_days} d
                      </div>
                    </td>
                    <td>{p.medicine_summary}</td>
                    <td>
                      {formatDate(p.next_refill_date)} <span className="hint">{d < 0 ? `${-d} d ago` : d === 0 ? 'today' : `in ${d} d`}</span>
                    </td>
                    <td className="num">
                      <Money v={p.monthly_bill_inr} />
                    </td>
                    <td>{consent ? <Chip tone="good">YES</Chip> : p.dpdp_opt_in ? <Chip tone="bad">NO RECORD</Chip> : <Chip>NONE</Chip>}</td>
                    <td>
                      <StatusChip p={p} />
                    </td>
                    <td className="act" onClick={(e) => e.stopPropagation()}>
                      {p.refill_status === 'confirmed' && (
                        <button className="btn sm hot" onClick={() => A.setRefillStatus(app.store, p.id, 'ready', today)}>
                          Packed
                        </button>
                      )}
                      {(p.refill_status === 'ready' || p.refill_status === 'confirmed') && (
                        <button className="btn sm" onClick={() => A.setRefillStatus(app.store, p.id, 'collected', today)}>
                          Collected
                        </button>
                      )}
                      {consent && ['none', 'due', 'declined'].includes(p.refill_status) && d <= 7 && (
                        <button className="btn sm ghost" onClick={async () => app.openOutbound((await A.nudgeRefills(app.store, [p.id], app.lane)).sent)}>
                          Remind
                        </button>
                      )}
                      {!consent && (
                        <button className="btn sm ghost" onClick={() => setConsentFor(p)}>
                          Record consent
                        </button>
                      )}
                    </td>
                  </tr>,
                  open === p.id && (
                    <tr key={p.id + '-x'}>
                      <td colSpan={7} style={{ background: 'var(--panel-2)' }}>
                        <div className="grid-2">
                          <div>
                            <div className="kicker">Next message ({p.preferred_lang === 'hi' ? 'Hindi' : 'English'})</div>
                            <div className="note" lang={p.preferred_lang}>{refillMessage(p, db.shops[0])}</div>
                            <div className="kicker" style={{ marginTop: 8 }}>Consent record</div>
                            {db.consent_log.filter((c) => c.patient_id === p.id).map((c) => (
                              <div key={c.id} className="hint">
                                {formatTimeIST(c.given_at)} · {c.channel} · {c.evidence} {c.withdrawn_at ? `· WITHDRAWN ${formatTimeIST(c.withdrawn_at)}` : ''}
                              </div>
                            ))}
                            {consent && (
                              <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => A.withdrawConsent(app.store, p.id, 'counter')}>
                                Withdraw consent
                              </button>
                            )}
                          </div>
                          <div>
                            <div className="kicker">WhatsApp thread</div>
                            {!msgs.length && <div className="hint">No messages yet.</div>}
                            {msgs.slice(0, 6).map((x) => (
                              <div key={x.id} className="hint" style={{ padding: '3px 0' }}>
                                {x.direction === 'in' ? '◂' : '▸'} {formatTimeIST(x.at)} · {x.lane} · {x.body.slice(0, 90)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </Win>
        <Source>chronic_patients × consent_log · reminders 3 days before medicines run out · inbound replies accept only YES / NO / STOP</Source>
      </div>

      {consentFor && <ConsentModal p={consentFor} onClose={() => setConsentFor(null)} />}
      {adding && <AddPatient onClose={() => setAdding(false)} />}
    </>
  );
}

function StatusChip({ p }: { p: Patient }) {
  const map: Record<Patient['refill_status'], [string, 'hot' | 'good' | 'warn' | 'bad' | undefined]> = {
    none: ['—', undefined],
    due: ['DUE', 'warn'],
    nudged: ['ASKED', 'warn'],
    confirmed: ['YES', 'hot'],
    ready: ['PACKED', 'good'],
    collected: ['COLLECTED', 'good'],
    declined: ['NO', 'bad'],
  };
  const [l, t] = map[p.refill_status];
  return <Chip tone={t}>{l}</Chip>;
}

function ConsentModal({ p, onClose }: { p: Patient; onClose: () => void }) {
  const app = useApp();
  const [ok, setOk] = useState(false);
  return (
    <Modal title="record dpdp consent" onClose={onClose}>
      <p className="p">Read this to {p.patient_name} in their language. Record consent only if they agree.</p>
      <div className="note" lang="hi">{CONSENT_HI}</div>
      <div className="note">{CONSENT_EN}</div>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        {p.patient_name} agreed at the counter, today.
      </label>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn hot"
          disabled={!ok}
          onClick={async () => {
            await A.recordConsent(app.store, p.id, `Counter consent read aloud (${p.preferred_lang}), confirmed by ${app.store.actor()}`);
            onClose();
          }}
        >
          ✓ Record consent
        </button>
      </div>
    </Modal>
  );
}

function AddPatient({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ name: '', phone: '91', meds: '', cycle: 30, bill: 0, lang: 'hi' as 'hi' | 'en', days: 30, consent: false });
  const save = async () => {
    const medicines = f.meds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/^(.*?)(?:\s*[x×]\s*(\d+))?$/i)!;
        const { drug } = findDrug(m[1], app.db.drug_master);
        return { drug_id: drug?.id ?? null, name: drug?.name ?? m[1], packs_per_cycle: Number(m[2] || 1) };
      });
    if (!f.name || f.phone.replace(/\D/g, '').length < 12 || !medicines.length) {
      app.toast({ title: 'CHECK', body: 'Name, a 12-digit WhatsApp number (with 91) and at least one medicine are needed.', tone: 'amber' });
      return;
    }
    await A.addPatient(
      app.store,
      {
        patient_name: f.name,
        whatsapp_phone: f.phone.replace(/\D/g, ''),
        medicine_summary: medicines.map((m) => m.name).join(', '),
        medicines,
        refill_cycle_days: f.cycle,
        next_refill_date: addDays(app.today, f.days),
        monthly_bill_inr: f.bill,
        dpdp_opt_in: f.consent,
        preferred_lang: f.lang,
      },
      f.consent ? `Counter consent read aloud (${f.lang}), confirmed by ${app.store.actor()}` : undefined,
    );
    onClose();
  };
  return (
    <Modal title="new refill patient" onClose={onClose} wide>
      <div className="form">
        <label className="field">
          Name
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </label>
        <label className="field">
          WhatsApp (with 91)
          <input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
        </label>
        <label className="field full">
          Medicines (comma separated, × packs per cycle)
          <input className="input" value={f.meds} placeholder="Telma 40 ×2, Glycomet 500 ×3" onChange={(e) => setF({ ...f, meds: e.target.value })} />
        </label>
        <label className="field">
          Cycle (days)
          <input className="input" type="number" value={f.cycle} onChange={(e) => setF({ ...f, cycle: Number(e.target.value) })} />
        </label>
        <label className="field">
          Runs out in (days)
          <input className="input" type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} />
        </label>
        <label className="field">
          Monthly bill, ₹
          <input className="input" type="number" value={f.bill} onChange={(e) => setF({ ...f, bill: Number(e.target.value) })} />
        </label>
        <label className="field">
          Language
          <select className="input" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as 'hi' | 'en' })}>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="full">
          <div className="note" lang="hi">{CONSENT_HI}</div>
          <label className="check">
            <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            Read aloud; the patient agreed to WhatsApp reminders (DPDP Act 2023). Leave unticked if not.
          </label>
        </div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn hot" onClick={save}>
          Save patient
        </button>
      </div>
    </Modal>
  );
}
