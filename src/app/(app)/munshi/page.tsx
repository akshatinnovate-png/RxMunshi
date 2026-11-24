'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/ui/app';
import { Chip, PageHead, Source, Win } from '@/ui/kit';
import { Inbox, StatusChip, TaskCard } from '@/ui/munshi';
import { morningPlan, TOOLS } from '@/core/agent';
import { formatTimeIST, inr, sum } from '@/core/util';
import * as A from '@/data/actions';

export default function MunshiPage() {
  return (
    <Suspense>
      <MunshiInbox />
    </Suspense>
  );
}

function MunshiInbox() {
  const app = useApp();
  const params = useSearchParams();
  const { db, today } = app;
  const [show, setShow] = useState<'done' | 'tools'>('done');

  const run = async () => {
    const plan = morningPlan({ db: app.store.get(), today });
    const rows = await A.proposeTasks(app.store, plan.tasks ?? []);
    app.toast({ title: '08:00 JOB', body: `${rows.length} new proposals.`, tone: 'hot' });
  };
  useEffect(() => {
    if (params.get('run') === '1' && app.store.ready) run();
  }, [params, app.store.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = useMemo(() => db.agent_tasks.filter((t) => t.status !== 'proposed').sort((a, b) => ((a.decided_at ?? '') < (b.decided_at ?? '') ? 1 : -1)), [db.agent_tasks]);
  const verified = done.filter((t) => t.status === 'verified' || t.status === 'executed');
  const value = sum(verified, (t) => t.amount_inr);

  return (
    <>
      <PageHead
        title="Munshi inbox"
        sub="Every action Munshi proposes waits here. Approve, and code executes it: return slips, WhatsApp reminders, orders, chases. Each step is logged."
        actions={
          <>
            <button className="btn ghost" onClick={() => app.askMunshi('Aaj ka plan')}>
              Ask for the plan
            </button>
            <button className="btn hot" onClick={run}>
              ▶ Run the 08:00 job now
            </button>
          </>
        }
      />
      <div className="grid-2">
        <Win title="waiting for you" count={`${db.agent_tasks.filter((t) => t.status === 'proposed').length}`}>
          <div className="stack" style={{ gap: 10 }}>
            <Inbox />
          </div>
        </Win>
        <div className="stack">
          <div className="grid-3">
            <div className="card stat">
              <span className="v">{verified.length}</span>
              <span className="l">tasks done</span>
            </div>
            <div className="card stat">
              <span className="v money-good">{inr(value, { compact: true })}</span>
              <span className="l">value handled</span>
            </div>
            <div className="card stat">
              <span className="v">{done.filter((t) => t.status === 'rejected').length}</span>
              <span className="l">rejected by you</span>
            </div>
          </div>
          <Win
            title={show === 'done' ? 'history' : 'tools munshi can use'}
            tools={
              <div className="seg" style={{ borderColor: 'var(--paper)' }}>
                <button aria-pressed={show === 'done'} onClick={() => setShow('done')} style={{ color: show === 'done' ? undefined : 'var(--ink)' }}>
                  history
                </button>
                <button aria-pressed={show === 'tools'} onClick={() => setShow('tools')} style={{ color: show === 'tools' ? undefined : 'var(--ink)' }}>
                  tools
                </button>
              </div>
            }
            flush
          >
            {show === 'done' ? (
              <table className="grid">
                <tbody>
                  {done.slice(0, 30).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <b>{t.title}</b>
                        <div className="hint">{(t.result as { note?: string } | null)?.note ?? t.error ?? ''}</div>
                      </td>
                      <td className="hint">{t.decided_at ? formatTimeIST(t.decided_at) : ''}</td>
                      <td>
                        <StatusChip t={t} />
                      </td>
                    </tr>
                  ))}
                  {!done.length && (
                    <tr>
                      <td className="hint">Nothing done yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="grid">
                <tbody>
                  {TOOLS.map((t) => (
                    <tr key={t.name}>
                      <td>
                        <code>{t.name}</code>
                      </td>
                      <td>{t.description}</td>
                      <td>{t.writes ? <Chip tone="hot">PROPOSES</Chip> : <Chip>READS</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Win>
          <Win title="how munshi stays safe">
            <div className="p">
              ▸ Numbers come from tools over your records, never from the model&apos;s text.
              <br />▸ Write tools only create proposals; nothing is sent, returned or ordered without your approval.
              <br />▸ Text on bills, prescriptions and WhatsApp replies is data, never instructions. Replies are limited to YES / NO / STOP.
              <br />▸ No consent, no message (DPDP Act 2023). Same-salt alternatives are for the pharmacist to decide.
              <br />▸ Works with no internet: the offline planner understands Hindi, Hinglish and English.
            </div>
          </Win>
        </div>
      </div>
      {params.get('task') && <TaskCard id={params.get('task')!} />}
      <Source>agent_tasks · audit_events</Source>
    </>
  );
}
