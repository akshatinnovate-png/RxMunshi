'use client';
import { useEffect, useState } from 'react';
import { useApp, signOut } from '@/ui/app';
import { Chip, PageHead, Win } from '@/ui/kit';
import * as A from '@/data/actions';
import { download } from '@/lib/browser';
import type { Shop } from '@/core/types';

export default function Settings() {
  const app = useApp();
  const shop = app.db.shops[0];
  const [f, setF] = useState<Shop | null>(shop ?? null);
  const [actor, setActor] = useState(app.store.actor());
  useEffect(() => setF(shop ?? null), [shop]);
  if (!f) return null;

  const fields: [keyof Shop, string, string?][] = [
    ['name', 'Shop name'],
    ['owner_name', 'Owner'],
    ['phone', 'Phone (WhatsApp, with 91)'],
    ['address', 'Address'],
    ['city', 'City'],
    ['drug_license_no', 'Retail drug licence (Form 20/21)'],
    ['license_valid_until', 'Licence valid until', 'date'],
    ['pharmacist_name', 'Registered pharmacist'],
    ['pharmacist_reg_no', 'Pharmacist reg. no.'],
    ['pharmacist_reg_valid_until', 'Registration valid until', 'date'],
    ['gstin', 'GSTIN'],
  ];

  return (
    <>
      <PageHead title="Settings" sub="Shop profile, who is at the counter, integrations, and your data." />
      <div className="grid-2">
        <Win title="shop profile">
          <div className="form">
            {fields.map(([k, l, t]) => (
              <label key={k} className="field">
                {l}
                <input className="input" type={t ?? 'text'} value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row end" style={{ marginTop: 10 }}>
            <button
              className="btn hot"
              onClick={async () => {
                const { id: _id, created_at: _c, ...patch } = f;
                void _id;
                void _c;
                await A.updateShop(app.store, patch);
                app.toast({ title: 'SAVED', body: 'Shop profile updated.', tone: 'good' });
              }}
            >
              Save profile
            </button>
          </div>
        </Win>
        <div className="stack">
          <Win title="at the counter">
            <label className="field">
              Name recorded on approvals and the H1 register
              <input className="input" value={actor} onChange={(e) => setActor(e.target.value)} />
            </label>
            <div className="row end" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => app.store.setActor(actor)}>
                Set
              </button>
            </div>
          </Win>
          <Win title="integrations">
            <table className="grid">
              <tbody>
                <tr>
                  <td>Data</td>
                  <td>{app.mode === 'live' ? <Chip tone="good">SUPABASE · RLS · REALTIME</Chip> : <Chip tone="warn">DEMO · THIS BROWSER</Chip>}</td>
                  <td className="act">
                    {app.health.supabase && (
                      <button className="btn sm ghost" onClick={() => app.switchMode(app.mode === 'live' ? 'demo' : 'live')}>
                        Switch to {app.mode === 'live' ? 'demo' : 'live'}
                      </button>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Munshi model</td>
                  <td>{app.health.gemini ? <Chip tone="good">{app.health.model}</Chip> : <Chip>OFFLINE PLANNER</Chip>}</td>
                  <td className="act">
                    {app.health.gemini && (
                      <label className="check">
                        <input type="checkbox" checked={app.useGemini} onChange={(e) => app.setUseGemini(e.target.checked)} /> use Gemini
                      </label>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Bill + Rx OCR</td>
                  <td>{app.health.gemini ? <Chip tone="good">GEMINI VISION</Chip> : <Chip>SAMPLES + TYPING</Chip>}</td>
                  <td />
                </tr>
                <tr>
                  <td>WhatsApp</td>
                  <td>{app.lane === 'cloud' ? <Chip tone="good">CLOUD API</Chip> : app.lane === 'wa.me' ? <Chip tone="warn">WA.ME LINKS</Chip> : <Chip>SIMULATED</Chip>}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 8 }}>
              Keys live only on the server (see .env.example). Without them RxMunshi runs fully in Demo mode.
            </div>
          </Win>
          <Win title="your data · dpdp">
            <div className="row">
              <button className="btn ghost" onClick={() => download(`rxmunshi-export-${app.today}.json`, JSON.stringify(app.store.get(), null, 2), 'application/json')}>
                Export everything (JSON)
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  if (!confirm('Delete all records of this shop (stock, patients, registers, audit)? This cannot be undone.')) return;
                  await app.store.wipe();
                  app.toast({ title: 'DELETED', body: 'All shop records were deleted.', tone: 'amber' });
                }}
              >
                Delete shop data
              </button>
              {app.mode === 'live' && (
                <button className="btn ghost" onClick={signOut}>
                  Sign out
                </button>
              )}
            </div>
          </Win>
        </div>
      </div>
    </>
  );
}
