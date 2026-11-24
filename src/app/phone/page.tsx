'use client';
// The patient's side of WhatsApp, for the stage: open in a second window,
// reply YES, and the dashboard in the first window lights up in real time.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createDemoStore } from '@/data/demoStore';
import type { Store } from '@/data/store';
import { emptyDB } from '@/core/types';
import { addDays, formatTimeIST, todayIST } from '@/core/util';
import * as A from '@/data/actions';
import { lsGet } from '@/lib/browser';

const EMPTY = emptyDB();

export default function Phone() {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    const off = Number(lsGet('rxmunshi.dayOffset') || 0);
    setStore(createDemoStore(addDays(todayIST(), off)));
    document.title = 'Patient phone · RxMunshi';
  }, []);
  const db = useSyncExternalStore(store?.subscribe ?? (() => () => {}), store?.get ?? (() => EMPTY), () => EMPTY);
  const chats = useMemo(() => {
    const withMsgs = db.chronic_patients.filter((p) => db.messages.some((m) => m.to_id === p.id));
    return withMsgs.length ? withMsgs : db.chronic_patients.filter((p) => p.dpdp_opt_in);
  }, [db]);
  const [pid, setPid] = useState<string | null>(null);
  const [text, setText] = useState('');
  const p = db.chronic_patients.find((x) => x.id === pid) ?? chats.find((c) => db.messages.some((m) => m.to_id === c.id && m.direction === 'out')) ?? chats[0];
  const thread = db.messages.filter((m) => p && m.to_id === p.id).sort((a, b) => (a.at < b.at ? -1 : 1));
  const shop = db.shops[0];

  const reply = async (t: string) => {
    if (!store || !p || !t.trim()) return;
    await A.patientReply(store, p.id, t.trim());
    setText('');
  };

  return (
    <div className="phonepage" data-theme="poshansetu">
      <div className="phone" role="region" aria-label="Patient WhatsApp simulator">
        <header>
          <span className="brand">
            <span className="mark" style={{ width: 12, height: 12, background: '#e94fbf', display: 'inline-block' }} />
            {shop?.name ?? 'WhatsApp'}
          </span>
          <select
            value={p?.id ?? ''}
            onChange={(e) => setPid(e.target.value)}
            style={{ font: '12px var(--font-mono)', background: '#1f1b1d', color: '#fff', border: '2px solid #fff', padding: 3 }}
            aria-label="Which patient's phone"
          >
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patient_name}
              </option>
            ))}
          </select>
        </header>
        <main>
          <div className="hint" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            SIMULATED WHATSAPP · synthetic patient · {p?.patient_name}
          </div>
          {!thread.length && (
            <div className="bubble in" lang="hi">
              No message yet. On the dashboard, send a refill reminder (Refills ▸ Remind), then reply here.
            </div>
          )}
          {thread.map((m) => (
            <div key={m.id} className={`bubble ${m.direction === 'out' ? 'in' : 'out'}`} lang={p?.preferred_lang}>
              {m.body}
              <small>
                {formatTimeIST(m.at)} {m.direction === 'in' ? '✓✓' : ''}
              </small>
            </div>
          ))}
          {p && p.refill_status === 'confirmed' && <div className="bubble in">Thank you. Your medicines will be kept ready. ✓</div>}
        </main>
        <div className="qr">
          <button className="yes" onClick={() => reply('YES')}>
            हाँ · YES
          </button>
          <button onClick={() => reply('NO')}>नहीं · NO</button>
          <button onClick={() => reply('STOP')}>STOP</button>
        </div>
        <form
          className="qr"
          style={{ borderTop: 0, paddingTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            reply(text);
          }}
        >
          <input className="input" style={{ flex: 1, fontSize: 15 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply" aria-label="Reply" />
        </form>
      </div>
      <div className="win rg" style={{ width: 320 }}>
        <div className="tb">
          <span className="t">how this works</span>
        </div>
        <div className="body p">
          This window plays the patient. It shares the demo shop with the dashboard through the browser, so a reply here reaches the dashboard instantly with no server and no Wi-Fi.
          <br />
          <br />
          Only YES, NO and STOP are acted on. Anything else is logged as text and ignored, so a message cannot instruct the system.
          <br />
          <br />
          In live mode the same flow runs through the Meta WhatsApp webhook and Supabase Realtime.
        </div>
      </div>
    </div>
  );
}
