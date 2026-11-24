'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/ui/app';
import { PageHead, Source, Win } from '@/ui/kit';
import { formatTimeIST } from '@/core/util';
import { download } from '@/lib/browser';
import { csvCell } from '@/core/h1';

export default function Audit() {
  const app = useApp();
  const [q, setQ] = useState('');
  const events = useMemo(
    () =>
      [...app.db.audit_events]
        .filter((e) => !q || `${e.action} ${e.actor} ${e.entity} ${JSON.stringify(e.details)}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [app.db.audit_events, q],
  );
  const exportCSV = () => {
    const rows = events.map((e) => [e.at, e.actor, e.action, e.entity, e.entity_id ?? '', JSON.stringify(e.details)].map(csvCell).join(','));
    download(`audit-${app.today}.csv`, ['At,Actor,Action,Entity,Entity id,Details', ...rows].join('\r\n'), 'text/csv');
  };
  return (
    <>
      <PageHead
        title="Audit trail"
        sub="Append-only: who did what, when, and with what evidence. Agent proposals, approvals, executions, scans, returns, messages and consent changes."
        actions={
          <>
            <input className="input sm" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
            <button className="btn ghost" onClick={exportCSV}>
              Export CSV
            </button>
          </>
        }
      />
      <Win title="events" count={`${events.length}`}>
        <div className="tl">
          {events.map((e) => (
            <div key={e.id} className="ev2">
              <span className="t">{formatTimeIST(e.at)}</span>
              <span className={`d ${e.action.startsWith('agent') ? 'hot' : ''}`} />
              <span className="x">
                <b>{e.action}</b> · {e.actor} · {e.entity}
                <br />
                <code>{JSON.stringify(e.details).slice(0, 220)}</code>
              </span>
            </div>
          ))}
        </div>
      </Win>
      <Source>audit_events (database trigger blocks edits and deletes in live mode)</Source>
    </>
  );
}
