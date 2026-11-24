'use client';
import Link from 'next/link';
import { useApp } from '@/ui/app';
import { useMetrics } from '@/ui/metrics';
import { Chip, PageHead, Source, Win } from '@/ui/kit';
import { download } from '@/lib/browser';
import { formatDate } from '@/core/util';
import { morningPlan } from '@/core/agent';
import * as A from '@/data/actions';

export default function Inspector() {
  const app = useApp();
  const m = useMetrics();
  const { db, today } = app;
  const fails = m.checks.filter((c) => c.state !== 'pass');

  const fixWithMunshi = async () => {
    const plan = morningPlan({ db, today });
    const drafts = (plan.tasks ?? []).filter((t) => t.kind === 'quarantine_batches' || t.kind === 'return_batches');
    const rows = await A.proposeTasks(app.store, drafts);
    app.toast({ title: 'MUNSHI', body: rows.length ? `${rows.length} fixes proposed in the inbox (quarantine and returns).` : 'Nothing Munshi can fix automatically; see the list.', tone: 'hot' });
    if (rows.length) app.setRight(true);
  };

  return (
    <>
      <PageHead
        title="Inspector Mode"
        sub={`A drug inspector walks in. Everything they will ask for, from the shop's own records, as of ${formatDate(today)}.`}
        actions={
          <>
            <button className="btn ghost" onClick={fixWithMunshi}>
              Fix with Munshi ▸
            </button>
            <button className="btn hot" onClick={async () => { const { inspectionPackPDF } = await import('@/lib/pdf'); download(`inspection-pack-${today}.pdf`, inspectionPackPDF(db, m.checks, m.score, today), 'application/pdf'); }}>
              Inspection pack PDF ▸
            </button>
          </>
        }
      />
      <div className="grid-2" style={{ gridTemplateColumns: '200px minmax(0, 1fr)' }}>
        <div className="stack" data-tour="score">
          <div className="score">
            <div style={{ textAlign: 'center' }}>
              <b style={{ color: m.score >= 90 ? 'var(--good)' : m.score < 60 ? 'var(--bad)' : 'var(--ink)' }}>{m.score}</b>
              <br />
              <span>OUT OF 100</span>
            </div>
          </div>
          <div className="hint">
            {fails.length ? `${fails.length} things to fix before an inspection.` : 'Ready for inspection.'} Self-assessment from records; not legal advice.
          </div>
        </div>
        <Win title="checks" count={`${m.checks.filter((c) => c.state === 'pass').length}/${m.checks.length} pass`} flush>
          {m.checks.map((c) => (
            <div key={c.id} className="checkrow">
              <Chip tone={c.state === 'pass' ? 'good' : c.state === 'warn' ? 'warn' : 'bad'}>{c.state.toUpperCase()}</Chip>
              <div>
                <b>{c.title}</b>
                <p>{c.detail}</p>
              </div>
              {c.state !== 'pass' && c.fix ? (
                <Link className="btn sm" href={c.fix.href}>
                  {c.fix.label} ▸
                </Link>
              ) : (
                <span className="hint">weight {c.weight}</span>
              )}
            </div>
          ))}
        </Win>
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <Win title="licences">
          <table className="grid">
            <tbody>
              <tr>
                <td>Retail drug licence</td>
                <td>{db.shops[0]?.drug_license_no}</td>
                <td>{formatDate(db.shops[0]?.license_valid_until)}</td>
              </tr>
              <tr>
                <td>Pharmacist</td>
                <td>{db.shops[0]?.pharmacist_reg_no}</td>
                <td>{formatDate(db.shops[0]?.pharmacist_reg_valid_until)}</td>
              </tr>
              <tr>
                <td>GSTIN</td>
                <td colSpan={2}>{db.shops[0]?.gstin}</td>
              </tr>
            </tbody>
          </table>
        </Win>
        <Win title="the pack contains">
          <div className="p">
            1. Score and checks · 2. Schedule H1 register ({db.schedule_h1_logs.length} entries) · 3. Expired and quarantined stock register · 4. Expiry returns to licensed wholesalers ({db.credit_notes.length}) · 5. Purchase bills index ({db.purchase_bills.length}).
          </div>
        </Win>
        <Win title="what RxMunshi never does">
          <div className="p">Sell, stock or deliver medicines. List medicines between retailers. Message a patient without recorded consent. Decide a substitution: same-salt options are shown to the pharmacist only.</div>
        </Win>
      </div>
      <Source>complianceChecks(): shops · schedule_h1_logs · inventory_batches · consent_log · credit_notes</Source>
    </>
  );
}
