'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './app';
import { useMetrics } from './metrics';
import { ask, type HistoryTurn } from '@/data/munshi';
import type { ToolResult } from '@/core/agent';
import type { AgentTask } from '@/core/types';
import * as A from '@/data/actions';
import { inr, formatTimeIST } from '@/core/util';
import { speak } from '@/lib/browser';

interface Turn {
  role: 'user' | 'munshi';
  text: string;
  results?: ToolResult[];
  via?: string;
  ms?: number;
  note?: string;
  taskIds?: string[];
}

const SUGGEST = [
  'Aaj ka plan',
  'Agle mahine kaun si dawai expire hogi?',
  'Teen wale batch return kar do',
  'Refill reminders bhej do',
  'Credit note ka paisa kitna baaki hai?',
  'Kya order karna hai?',
  'Telma kitna bacha hai?',
  'Inspector aaye to ready hain?',
];

export function MunshiPanel() {
  const app = useApp();
  const m = useMetrics();
  const [tab, setTab] = useState<'ask' | 'inbox'>('ask');
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'munshi', text: 'Namaste. Main Munshi hoon. Ask me about stock, expiry, refills, credit notes or compliance, in Hindi or English. I prepare the work; you approve it.', via: 'intro' },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, tab]);

  const send = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setTab('ask');
    setText('');
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: query }]);
    const history: HistoryTurn[] = turns.filter((t) => t.via !== 'intro').map((t) => ({ role: t.role, text: t.text }));
    const reply = await ask(query, app.store.get, app.today, history, app.useGemini);
    const drafts = reply.results.flatMap((r) => r.tasks ?? []);
    const created = drafts.length ? await A.proposeTasks(app.store, drafts) : [];
    const ids = created.length
      ? created.map((c) => c.id)
      : drafts.length
        ? app.store.get().agent_tasks.filter((t) => t.status === 'proposed' && drafts.some((d) => d.title === t.title)).map((t) => t.id)
        : [];
    setTurns((t) => [...t, { role: 'munshi', text: reply.text, results: reply.results, via: reply.via, ms: reply.ms, note: reply.note, taskIds: ids }]);
    if (voiceOut) speak(reply.text, /[ऀ-ॿ]/.test(query) || /\b(kya|hai|kar|kitna|aaj)\b/i.test(query) ? 'hi' : 'en');
    setBusy(false);
  };

  // questions pushed from elsewhere (voice, palette, buttons)
  useEffect(() => {
    if (app.munshiInput) send(app.munshiInput.text);
  }, [app.munshiInput?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="tb">
        <span className="grow">munshi — agent</span>
        <span style={{ fontSize: 10.5, opacity: 0.8 }}>{app.health.gemini && app.useGemini ? app.health.model : 'offline'}</span>
        <button className="ab-btn" style={{ padding: '1px 6px' }} aria-pressed={voiceOut} title="Speak replies aloud" onClick={() => setVoiceOut(!voiceOut)}>
          {voiceOut ? '♪ on' : '♪ off'}
        </button>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>
          Ask
        </button>
        <button role="tab" aria-selected={tab === 'inbox'} onClick={() => setTab('inbox')}>
          Approve {m.openTasks.length ? `(${m.openTasks.length})` : ''}
        </button>
      </div>
      {tab === 'ask' ? (
        <div className="scroll chat" ref={logRef}>
          {turns.map((t, i) => (
            <div key={i} className={`m ${t.role === 'user' ? 'me' : ''}`}>
              {t.text}
              {t.results?.map((r, k) => <ResultBlock key={k} r={r} />)}
              {!!t.taskIds?.length && (
                <div className="stack" style={{ marginTop: 8, gap: 8 }}>
                  {t.taskIds.map((id) => (
                    <TaskCard key={id} id={id} compact />
                  ))}
                </div>
              )}
              {t.role === 'munshi' && t.via !== 'intro' && (
                <span className="via">
                  {t.via === 'gemini' ? `Gemini · tools` : 'offline planner · tools'}
                  {t.ms !== undefined ? ` · ${t.ms} ms` : ''}
                  {t.note ? ` · ${t.note}` : ''}
                </span>
              )}
            </div>
          ))}
          {busy && <div className="m">Munshi is checking the records…</div>}
          <div className="suggest">
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="scroll">
          <Inbox />
        </div>
      )}
      <form
        className="askbar"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Poochho… e.g. Dolo ka rate" aria-label="Ask Munshi" />
        <button className="btn" disabled={busy || !text.trim()}>
          Ask ▸
        </button>
      </form>
    </>
  );
}

function ResultBlock({ r }: { r: ToolResult }) {
  const rows = r.table?.rows ?? [];
  return (
    <div style={{ whiteSpace: 'normal' }}>
      {r.table && rows.length > 0 && (
        <div className="tablewrap" style={{ maxHeight: 220 }}>
          <table className="grid">
            <thead>
              <tr>
                {r.table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => (
                    <td key={j} className={typeof c === 'number' ? 'num' : ''}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 12 && <div className="hint">+{rows.length - 12} more</div>}
        </div>
      )}
      {r.link && (
        <div style={{ marginTop: 6 }}>
          <Link href={r.link.href} className="btn sm ghost">
            {r.link.label}
          </Link>
        </div>
      )}
      <div className="ev">{r.evidence}</div>
    </div>
  );
}

export function TaskCard({ id, compact }: { id: string; compact?: boolean }) {
  const app = useApp();
  const t = app.db.agent_tasks.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  if (!t) return null;
  const open = t.status === 'proposed';
  const approve = async () => {
    setBusy(true);
    const out = await A.approveTask(app.store, t.id, app.today, app.lane);
    app.handleOutcome(out);
    setBusy(false);
  };
  return (
    <div className={`task ${open ? '' : 'done'}`} style={{ whiteSpace: 'normal' }}>
      <div className="th">
        <b>{t.title}</b>
        {t.amount_inr > 0 && <span className="amt">{inr(t.amount_inr)}</span>}
        <StatusChip t={t} />
      </div>
      {!compact && <div className="tbd">{t.reason}</div>}
      {compact && <div className="tbd">{t.reason.length > 140 ? t.reason.slice(0, 140) + '…' : t.reason}</div>}
      {Array.isArray((t.payload as { preview?: string[] }).preview) && !compact && (
        <div className="tbd">
          <div className="kicker">Message preview</div>
          {(t.payload as { preview: string[] }).preview.slice(0, 2).map((p) => (
            <div key={p} className="note">
              {p}
            </div>
          ))}
        </div>
      )}
      {open ? (
        <div className="tact">
          <button className="btn sm hot" onClick={approve} disabled={busy}>
            {busy ? 'Working…' : '✓ Approve'}
          </button>
          <button className="btn sm ghost" onClick={() => A.rejectTask(app.store, t.id)} disabled={busy}>
            × Reject
          </button>
          <span className="hint" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {t.proposed_by}
          </span>
        </div>
      ) : (
        <div className="tbd">
          {t.status === 'failed' ? `Failed: ${t.error}` : (t.result as { note?: string } | null)?.note ?? ''} {t.decided_by ? `· ${t.decided_by}` : ''}{' '}
          {t.decided_at ? `· ${formatTimeIST(t.decided_at)}` : ''}
        </div>
      )}
    </div>
  );
}

export function StatusChip({ t }: { t: AgentTask }) {
  const tone = t.status === 'proposed' ? 'hot' : t.status === 'verified' ? 'good' : t.status === 'failed' || t.status === 'rejected' ? 'bad' : 'warn';
  return <span className={`chip ${tone}`}>{t.status.toUpperCase()}</span>;
}

export function Inbox() {
  const app = useApp();
  const open = app.db.agent_tasks.filter((t) => t.status === 'proposed').sort((a, b) => b.amount_inr - a.amount_inr);
  const [busy, setBusy] = useState(false);
  if (!open.length)
    return (
      <div className="hint">
        Nothing waiting for approval. Ask Munshi for the plan, or run the 08:00 job from ▶ Demo.
      </div>
    );
  return (
    <>
      <div className="row">
        <b style={{ fontSize: 12 }}>{open.length} waiting · {inr(open.reduce((s, t) => s + t.amount_inr, 0))}</b>
        <span className="spacer" />
        <button
          className="btn sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            for (const t of open) app.handleOutcome(await A.approveTask(app.store, t.id, app.today, app.lane));
            setBusy(false);
          }}
        >
          ✓ Approve all
        </button>
      </div>
      {open.map((t) => (
        <TaskCard key={t.id} id={t.id} />
      ))}
    </>
  );
}
