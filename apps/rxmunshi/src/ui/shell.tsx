'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './app';
import { useMetrics } from './metrics';
import { MunshiPanel } from './munshi';
import { Modal } from './kit';
import { inr, formatDate, normName } from '@/core/util';
import { listen, speechSupported } from '@/lib/browser';
import * as A from '@/data/actions';
import { morningPlan } from '@/core/agent';

const NAV: { href: string; label: string; g: string; key?: string; grp?: string }[] = [
  { href: '/today', label: 'Today', g: '◉', key: 'D', grp: 'Run the shop' },
  { href: '/munshi', label: 'Munshi inbox', g: '⚡', key: 'M' },
  { href: '/scan', label: 'Scan bill', g: '◧', key: 'S' },
  { href: '/dispense', label: 'Dispense Rx', g: '◨', key: 'R' },
  { href: '/expiry', label: 'Expiry Radar', g: '●', key: 'E', grp: 'Money' },
  { href: '/returns', label: 'Money-back', g: '↑', key: 'B' },
  { href: '/reorder', label: 'Reorder', g: '⇅', key: 'O' },
  { href: '/refills', label: 'Refills', g: '▸', key: 'F', grp: 'Patients' },
  { href: '/h1', label: 'H1 register', g: '☰', key: 'H', grp: 'Compliance' },
  { href: '/inspector', label: 'Inspector Mode', g: '✓', key: 'I' },
  { href: '/wholesalers', label: 'Wholesalers', g: '□', grp: 'Records' },
  { href: '/audit', label: 'Audit trail', g: '▪' },
  { href: '/settings', label: 'Settings', g: '⚙' },
];

export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const m = useMetrics();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [mic, setMic] = useState(false);
  const [booted, setBooted] = useState(false);
  const stopRef = useRef<() => void>(() => {});

  const counts: Record<string, { n: number; hot?: boolean } | undefined> = {
    '/munshi': m.openTasks.length ? { n: m.openTasks.length, hot: true } : undefined,
    '/expiry': m.exp.expired.count + m.exp.d30.count ? { n: m.exp.expired.count + m.exp.d30.count } : undefined,
    '/returns': m.chase.length ? { n: m.chase.length } : undefined,
    '/refills': m.confirmed.length ? { n: m.confirmed.length, hot: true } : m.due.length ? { n: m.due.length } : undefined,
    '/reorder': m.reorder.filter((r) => !r.blocked).length ? { n: m.reorder.filter((r) => !r.blocked).length } : undefined,
    '/h1': m.h1Incomplete ? { n: m.h1Incomplete } : undefined,
    '/inspector': { n: m.score },
  };

  const startVoice = () => {
    if (mic) {
      stopRef.current();
      return;
    }
    if (!speechSupported()) {
      app.toast({ title: 'VOICE', body: 'Voice needs Chrome or Edge with a microphone. Type in the Munshi box instead.', tone: 'amber' });
      return;
    }
    setMic(true);
    let last = '';
    stopRef.current = listen({
      lang: 'hi-IN',
      onText: (t) => (last = t),
      onEnd: () => {
        setMic(false);
        if (last.trim()) app.askMunshi(last.trim());
      },
      onError: (e) => app.toast({ title: 'VOICE', body: e, tone: 'amber' }),
    });
  };

  // keyboard: / palette, V voice, ? help, T tour, letters navigate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        app.setPalette(true);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        app.setPalette(true);
      } else if (e.key === 'v' || e.key === 'V') startVoice();
      else if (e.key === '?') app.setHelp(true);
      else if (e.key === 't' || e.key === 'T') app.setTour(0);
      else {
        const n = NAV.find((x) => x.key === e.key.toUpperCase());
        if (n) router.push(n.href);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const seen = sessionStorage.getItem('rxmunshi.booted');
    if (seen) setBooted(true);
  }, []);

  const runMorning = async () => {
    const plan = morningPlan({ db: app.store.get(), today: app.today });
    const rows = await A.proposeTasks(app.store, plan.tasks ?? []);
    app.toast({ title: '08:00 JOB · MORNING PLAN', body: `${rows.length} new proposals in the Munshi inbox. ${plan.text.split('\n')[1] ?? ''}`, tone: 'hot' });
    router.push('/munshi');
  };

  const simulateYes = async () => {
    const db = app.store.get();
    const target =
      db.chronic_patients.find((p) => p.refill_status === 'nudged') ??
      db.chronic_patients.find((p) => p.dpdp_opt_in && ['none', 'due'].includes(p.refill_status));
    if (!target) {
      app.toast({ title: 'SIMULATE', body: 'No patient is waiting for a reply.', tone: 'amber' });
      return;
    }
    if (target.refill_status !== 'nudged') await A.nudgeRefills(app.store, [target.id], 'sim');
    setTimeout(() => A.patientReply(app.store, target.id, 'YES'), 900);
  };

  if (!app.store.ready) return <Boot onDone={() => {}} progress={0.4} />;

  return (
    <div className={`rx ${app.right ? '' : 'no-right'}`}>
      {!booted && (
        <Boot
          progress={1}
          lines={[
            `[ OK ] Shop ${app.db.shops[0]?.name ?? ''} · ${app.mode === 'demo' ? 'DEMO, synthetic data' : 'LIVE, Supabase'}`,
            `[ OK ] ${app.db.inventory_batches.length} batches · ${app.db.chronic_patients.length} refill patients · ${app.db.schedule_h1_logs.length} H1 entries`,
            `[ OK ] Munshi ${app.health.gemini && app.useGemini ? `online (${app.health.model})` : 'offline planner (no key needed)'}`,
            `[ OK ] WhatsApp lane: ${app.lane}`,
            `[ OK ] Audit chain · ${app.db.audit_events.length} events`,
          ]}
          onDone={() => {
            sessionStorage.setItem('rxmunshi.booted', '1');
            setBooted(true);
          }}
        />
      )}
      <header className="appbar">
        <Link href="/today" className="ab-brand" aria-label="RxMunshi home">
          <span className="mark" />
          RxMunshi <small>{app.db.shops[0]?.name}</small>
        </Link>
        <div className="ab-search">
          <button className="fake" onClick={() => app.setPalette(true)} data-tour="search">
            Search or ask anything… <span className="kbd" style={{ float: 'right', color: 'var(--ink)' }}>/</span>
          </button>
        </div>
        <div className="ab-tools">
          <button className={`ab-btn ${mic ? 'mic-on' : ''}`} onClick={startVoice} title="Hindi voice (V)" data-tour="voice">
            {mic ? '● Listening…' : '◉ Bolo (V)'}
          </button>
          <Link className="ab-btn" href="/scan" title="Scan a bill (S)">
            ◧ Scan
          </Link>
          <button className={`ab-btn ${app.mode === 'live' ? 'live' : ''}`} onClick={() => app.toast({ title: app.mode === 'live' ? 'LIVE' : 'DEMO MODE', body: app.mode === 'live' ? 'Connected to Supabase with Row-Level Security and Realtime.' : 'All data is synthetic and stays in this browser. Works offline.' })}>
            {app.mode === 'live' ? 'LIVE' : 'DEMO · syn'}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="ab-btn" aria-expanded={menu} onClick={() => setMenu((x) => !x)} data-tour="demo">
              ▶ Demo
            </button>
            {menu && (
              <div className="ab-menu" onMouseLeave={() => setMenu(false)}>
                <div className="dh">Stage safety net</div>
                <button onClick={() => { setMenu(false); router.push('/scan?sample=tatanagar-4519'); }}>Load sample bill <span className="kbd">S</span></button>
                <button onClick={() => { setMenu(false); simulateYes(); }}>Simulate patient YES reply</button>
                <button onClick={() => { setMenu(false); window.open('/phone', 'rxphone', 'width=440,height=820'); }}>Open Patient phone ↗</button>
                <button onClick={() => { setMenu(false); runMorning(); }}>Run the 08:00 job now</button>
                <button onClick={() => { setMenu(false); app.setTour(0); }}>Jury tour <span className="kbd">T</span></button>
                <div className="dh">Clock {app.dayOffset ? `(+${app.dayOffset} d)` : ''}</div>
                <button onClick={() => app.setDayOffset(app.dayOffset + 1)}>+1 day <span>{formatDate(app.today)}</span></button>
                <button onClick={() => app.setDayOffset(app.dayOffset + 7)}>+7 days</button>
                <button onClick={() => app.setDayOffset(0)}>Back to today</button>
                <div className="dh">Data</div>
                <button
                  onClick={async () => {
                    setMenu(false);
                    if (!confirm(app.mode === 'live' ? 'Load synthetic demo data into your live shop?' : 'Reset all demo data?')) return;
                    app.setDayOffset(0);
                    await app.store.loadDemo(app.today);
                    app.toast({ title: 'DEMO DATA', body: 'Fresh synthetic shop loaded.', tone: 'good' });
                  }}
                >
                  {app.mode === 'live' ? 'Load demo data into shop' : 'Reset demo data'}
                </button>
              </div>
            )}
          </div>
          <button className="ab-btn" onClick={() => app.setTheme(app.theme === 'reachgrid' ? 'reachgrid-dark' : 'reachgrid')} title="Light / dark">
            {app.theme === 'reachgrid' ? '◐' : '◑'}
          </button>
          <button className="ab-btn" aria-pressed={app.right} onClick={() => app.setRight(!app.right)} title="Munshi panel">
            ◨ Munshi
          </button>
          <button className="ab-btn" onClick={() => app.setHelp(true)} title="Shortcuts (?)">
            ?
          </button>
        </div>
      </header>

      <nav className="kstrip" aria-label="Live numbers" data-tour="kpis">
        <Link href="/expiry" className={m.exp.atRiskValue > 0 ? 'bad' : ''}>
          <b>{inr(m.exp.atRiskValue, { compact: true })}</b>
          <span>Stock at risk · 90 d</span>
        </Link>
        <Link href="/expiry?bucket=expired" className={m.exp.expired.count ? 'bad' : 'good'}>
          <b>{m.exp.expired.count}</b>
          <span>Expired on shelf</span>
        </Link>
        <Link href="/returns">
          <b>{inr(m.recoverableNow, { compact: true })}</b>
          <span>Recoverable now</span>
        </Link>
        <Link href="/returns" className={`good ${app.flash === 'credit' ? 'flash' : ''}`}>
          <b>{inr(m.credits.recoveredThisMonth, { compact: true })}</b>
          <span>Recovered this month</span>
        </Link>
        <Link href="/returns">
          <b>{inr(m.credits.pendingValue, { compact: true })}</b>
          <span>Credit pending · {m.credits.pendingCount}</span>
        </Link>
        <Link href="/refills" className={app.flash === 'refills' ? 'flash' : ''}>
          <b>
            {m.due.length} <small style={{ fontSize: 12 }}>due</small> · {m.confirmed.length} <small style={{ fontSize: 12 }}>YES</small>
          </b>
          <span>Refills</span>
        </Link>
        <Link href="/inspector" className={m.score >= 90 ? 'good' : m.score < 60 ? 'bad' : ''}>
          <b>{m.score}/100</b>
          <span>Inspector ready</span>
        </Link>
      </nav>

      <nav className="nav" aria-label="Sections" data-tour="nav">
        <div className="tb">
          <span className="grow">navigator</span>
        </div>
        {NAV.map((n) => (
          <div key={n.href}>
            {n.grp && <div className="grp">{n.grp}</div>}
            <Link href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              <span className="g">{n.g}</span>
              <span className="lbl">{n.label}</span>
              {counts[n.href] && <span className={`cnt ${counts[n.href]!.hot ? 'hot' : ''}`}>{counts[n.href]!.n}</span>}
            </Link>
          </div>
        ))}
        <a href="/phone" target="rxphone" rel="noopener">
          <span className="g">↗</span>
          <span className="lbl">Patient phone</span>
        </a>
        <div className="foot">
          B2B software only. Never sells, stocks or delivers medicines. Returns go to licensed wholesalers. Messages need DPDP consent.
        </div>
      </nav>

      <main className="main" id="main">
        {children}
      </main>

      <aside className="insp" aria-label="Munshi" data-tour="munshi">
        <MunshiPanel />
      </aside>

      <footer className="sbar">
        <span>
          <i className={`dot ${app.mode === 'live' ? '' : 'off'}`} />
          mode <b>{app.mode === 'live' ? 'live · realtime' : 'demo · synthetic · offline-safe'}</b>
        </span>
        <span>
          munshi <b>{app.health.gemini && app.useGemini ? app.health.model : 'offline planner'}</b>
        </span>
        <span>
          whatsapp <b>{app.lane === 'sim' ? 'simulated' : app.lane}</b>
        </span>
        <span className="grow" />
        {app.dayOffset > 0 && (
          <button className="sb-badge" onClick={() => app.setDayOffset(0)}>
            clock +{app.dayOffset} d ×
          </button>
        )}
        <span>
          today <b>{formatDate(app.today)}</b> IST
        </span>
        <span>
          actor <b>{app.store.actor()}</b>
        </span>
      </footer>

      <Toasts />
      <YesBanner />
      {app.palette && <Palette />}
      {app.help && <Help />}
      {app.tour !== null && <Tour />}
    </div>
  );
}

function Boot({ onDone, progress, lines = [] }: { onDone: () => void; progress: number; lines?: string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!lines.length) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onDone();
      return;
    }
    const id = setInterval(() => setN((x) => x + 1), 160);
    return () => clearInterval(id);
  }, [lines.length, onDone]);
  useEffect(() => {
    if (lines.length && n > lines.length + 2) onDone();
  }, [n, lines.length, onDone]);
  return (
    <div className="bootwrap" onClick={onDone}>
      <div className="boot">
        <div className="hd">RX.MUNSHI</div>
        {lines.slice(0, n).map((l) => (
          <div className="ln" key={l}>
            <span className="ok">{l.slice(0, 6)}</span>
            {l.slice(6)}
          </div>
        ))}
        {!lines.length && <div className="ln">[ .. ] Opening the shop</div>}
        <div className="bar">
          <i style={{ width: `${Math.round((lines.length ? Math.min(1, n / lines.length) : progress) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          <div className="th">
            <span>{t.title}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
          <div className="tbd">{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function YesBanner() {
  const { yes, clearYes } = useApp();
  const router = useRouter();
  if (!yes) return null;
  return (
    <div className="yesbanner" role="alert">
      <span className="big">YES</span>
      <div style={{ flex: 1 }}>
        <div className="t">LIVE · WHATSAPP REFILL CONFIRMED</div>
        <div className="d">
          <b>{yes.patient_name}</b> wants {yes.medicine_summary} kept ready · {inr(yes.monthly_bill_inr)} a month
        </div>
      </div>
      <button
        className="btn"
        onClick={() => {
          clearYes();
          router.push('/refills');
        }}
      >
        Pack it ▸
      </button>
      <button className="btn ghost sm" onClick={clearYes} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function Palette() {
  const app = useApp();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const n = normName(q);
    const out: { label: string; hint: string; run: () => void }[] = [];
    if (q.trim()) out.push({ label: `Ask Munshi: “${q.trim()}”`, hint: 'agent', run: () => app.askMunshi(q.trim()) });
    for (const x of NAV) if (!n || normName(x.label).includes(n)) out.push({ label: `Go to ${x.label}`, hint: x.key ? `key ${x.key}` : '', run: () => router.push(x.href) });
    if (n.length >= 2) {
      const seen = new Set<string>();
      for (const b of app.db.inventory_batches) {
        if (b.status !== 'active' || !normName(b.medicine_name).includes(n) || seen.has(b.medicine_name)) continue;
        seen.add(b.medicine_name);
        out.push({ label: `Stock: ${b.medicine_name}`, hint: 'batches', run: () => router.push(`/expiry?q=${encodeURIComponent(b.medicine_name)}&days=9999`) });
      }
      for (const p of app.db.chronic_patients) if (normName(p.patient_name).includes(n)) out.push({ label: `Patient: ${p.patient_name}`, hint: p.medicine_summary, run: () => router.push(`/refills?p=${p.id}`) });
      for (const w of app.db.wholesalers) if (normName(w.name).includes(n)) out.push({ label: `Wholesaler: ${w.name}`, hint: w.city, run: () => router.push('/wholesalers') });
    }
    out.push({ label: 'Run the 08:00 job now', hint: 'demo', run: () => router.push('/munshi?run=1') });
    return out.slice(0, 14);
  }, [q, app, router]);
  const close = () => app.setPalette(false);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="win rg focused palette" role="dialog" aria-label="Command palette">
        <div className="tb">
          <span className="t">search or ask</span>
          <button onClick={close}>×</button>
        </div>
        <div className="body">
          <input
            autoFocus
            value={q}
            placeholder="Telma · Sunita · Agle mahine kya expire hoga? · return kar do"
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              if (e.key === 'ArrowDown') setI((x) => Math.min(items.length - 1, x + 1));
              if (e.key === 'ArrowUp') setI((x) => Math.max(0, x - 1));
              if (e.key === 'Enter' && items[i]) {
                items[i].run();
                close();
              }
            }}
          />
          <div className="list">
            {items.map((it, k) => (
              <div
                key={it.label + k}
                className={`it ${k === i ? 'on' : ''}`}
                onMouseEnter={() => setI(k)}
                onClick={() => {
                  it.run();
                  close();
                }}
              >
                {it.label}
                <small>{it.hint}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Help() {
  const app = useApp();
  const keys: [string, string][] = [
    ['/', 'Search or ask anything (also Ctrl K)'],
    ['V', 'Speak in Hindi or English to Munshi'],
    ['D', 'Today'],
    ['M', 'Munshi inbox'],
    ['S', 'Scan a bill'],
    ['R', 'Dispense a prescription'],
    ['E', 'Expiry Radar'],
    ['B', 'Money-back'],
    ['O', 'Reorder'],
    ['F', 'Refills'],
    ['H', 'H1 register'],
    ['I', 'Inspector Mode'],
    ['T', 'Jury tour'],
    ['?', 'This help'],
  ];
  return (
    <Modal title="keyboard" onClose={() => app.setHelp(false)}>
      <table className="grid">
        <tbody>
          {keys.map(([k, d]) => (
            <tr key={k}>
              <td style={{ width: 60 }}>
                <span className="kbd">{k}</span>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

const TOUR: { sel: string; title: string; text: string; href?: string }[] = [
  { sel: '[data-tour="kpis"]', title: 'Live numbers', text: 'Every number here is computed from the shop’s own records and updates in real time: stock at risk, money recoverable, money recovered, refills, inspection readiness.', href: '/today' },
  { sel: '[data-tour="plan"]', title: 'The morning plan', text: 'At 08:00 Munshi prepares the day: returns before windows close, refill reminders, credit-note chases, reorders. Nothing happens until the owner approves.', href: '/today' },
  { sel: '[data-tour="munshi"]', title: 'Munshi, the agent', text: 'Ask in Hindi or English, by voice or typing. Answers come from tools over the records, with the source shown. Actions become tasks to approve.' },
  { sel: '[data-tour="scan"]', title: 'Split-screen bill scanner', text: 'The bill on the left, editable rows on the right. The Delivery Verifier catches price rises, short supply, missing free goods, short-dated stock and duplicates before you save.', href: '/scan?sample=tatanagar-4519' },
  { sel: '[data-tour="demo"]', title: 'Stage safety net', text: 'Sample bill, simulated YES reply, the 08:00 job and a clock you can move forward. The demo works with no Wi-Fi and no keys.' },
  { sel: '[data-tour="score"]', title: 'Inspector Mode', text: 'A drug inspector walks in: one click gives the compliance score, what to fix, and the inspection pack PDF with the H1 register.', href: '/inspector' },
];

function Tour() {
  const app = useApp();
  const router = useRouter();
  const step = app.tour ?? 0;
  const s = TOUR[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (s?.href) router.push(s.href);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => {
      const el = document.querySelector(s?.sel ?? '');
      setRect(el ? el.getBoundingClientRect() : null);
    }, 200);
    return () => clearInterval(id);
  }, [s]);
  if (!s) return null;
  const close = () => app.setTour(null);
  const cardTop = rect ? Math.min(window.innerHeight - 220, rect.bottom + 12) : 120;
  const cardLeft = rect ? Math.min(window.innerWidth - 360, Math.max(16, rect.left)) : 120;
  return (
    <div className="tourwrap">
      {rect && <div className="tour-hole" style={{ position: 'fixed', left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className="win rg tour-card" style={{ top: cardTop, left: cardLeft }}>
        <div className="tb">
          <span className="t">
            tour — {step + 1} of {TOUR.length} · {s.title}
          </span>
          <button onClick={close}>×</button>
        </div>
        <div className="body">
          <p>{s.text}</p>
          <div className="row end">
            <button className="btn sm ghost" disabled={step === 0} onClick={() => app.setTour(step - 1)}>
              Back
            </button>
            {step < TOUR.length - 1 ? (
              <button className="btn sm" onClick={() => app.setTour(step + 1)}>
                Next
              </button>
            ) : (
              <button className="btn sm hot" onClick={close}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
