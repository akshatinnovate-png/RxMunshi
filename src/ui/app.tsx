'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { DB, Patient } from '@/core/types';
import { emptyDB } from '@/core/types';
import { addDays, todayIST, inr } from '@/core/util';
import type { Store } from '@/data/store';
import { createDemoStore } from '@/data/demoStore';
import { createLiveStore, supabase } from '@/data/liveStore';
import type { Lane, Outbound, TaskOutcome } from '@/data/actions';
import { chime, download, lsGet, lsSet } from '@/lib/browser';

export interface Health {
  gemini: boolean;
  model: string | null;
  supabase: boolean;
  whatsapp: boolean;
}

export interface Toast {
  id: number;
  title: string;
  body: ReactNode;
  tone?: 'hot' | 'good' | 'red' | 'amber';
  ttl?: number;
}

interface AppCtx {
  store: Store;
  db: DB;
  today: string;
  dayOffset: number;
  setDayOffset: (n: number) => void;
  health: Health;
  lane: Lane;
  useGemini: boolean;
  setUseGemini: (v: boolean) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  yes: Patient | null;
  clearYes: () => void;
  flash: string | null;
  theme: 'reachgrid' | 'reachgrid-dark';
  setTheme: (t: 'reachgrid' | 'reachgrid-dark') => void;
  right: boolean;
  setRight: (v: boolean) => void;
  palette: boolean;
  setPalette: (v: boolean) => void;
  help: boolean;
  setHelp: (v: boolean) => void;
  tour: number | null;
  setTour: (n: number | null) => void;
  munshiInput: { text: string; n: number } | null;
  askMunshi: (text: string) => void;
  handleOutcome: (o: TaskOutcome) => void;
  openOutbound: (o: Outbound[]) => void;
  mode: 'demo' | 'live';
  switchMode: (m: 'demo' | 'live') => void;
  liveProblem: string | null;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

const EMPTY = emptyDB();
const NOOP_STORE: Store = {
  mode: 'demo',
  ready: false,
  get: () => EMPTY,
  subscribe: () => () => {},
  insert: async () => {},
  update: async () => {},
  remove: async () => {},
  loadDemo: async () => {},
  wipe: async () => {},
  actor: () => '',
  setActor: () => {},
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [dayOffset, setOffsetState] = useState(0);
  const [store, setStore] = useState<Store>(NOOP_STORE);
  const [health, setHealth] = useState<Health>({ gemini: false, model: null, supabase: false, whatsapp: false });
  const [useGemini, setUseGeminiState] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [yes, setYes] = useState<Patient | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'reachgrid' | 'reachgrid-dark'>('reachgrid');
  const [right, setRightState] = useState(true);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [munshiInput, setMunshiInput] = useState<{ text: string; n: number } | null>(null);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [liveProblem, setLiveProblem] = useState<string | null>(null);
  const seq = useRef(0);

  const today = useMemo(() => addDays(todayIST(), dayOffset), [dayOffset]);

  // boot: preferences, health, store
  useEffect(() => {
    const off = Number(lsGet('rxmunshi.dayOffset') || 0);
    setOffsetState(Number.isFinite(off) ? off : 0);
    const th = lsGet('rxmunshi.theme');
    if (th === 'reachgrid-dark' || th === 'reachgrid') setThemeState(th);
    else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) setThemeState('reachgrid-dark');
    setRightState(lsGet('rxmunshi.right') !== '0');
    let cancelled = false;
    (async () => {
      const h: Health = await fetch('/api/health')
        .then((r) => r.json())
        .catch(() => ({ gemini: false, model: null, supabase: false, whatsapp: false }));
      if (cancelled) return;
      setHealth(h);
      setUseGeminiState(h.gemini && lsGet('rxmunshi.gemini') !== '0');
      const wantLive = h.supabase && lsGet('rxmunshi.mode') !== 'demo';
      if (wantLive) {
        const s = await createLiveStore();
        if (cancelled) return;
        if ('error' in s) {
          setLiveProblem(s.error);
          if (s.needsSignIn || s.needsShop) {
            window.location.href = '/signin';
            return;
          }
        } else {
          setStore(s);
          setMode('live');
          return;
        }
      }
      setStore(createDemoStore(addDays(todayIST(), off)));
      setMode('demo');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const db = useSyncExternalStore(
    store.subscribe,
    store.get,
    () => EMPTY,
  );

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((xs) => [...xs.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.ttl ?? 6000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((xs) => xs.filter((x) => x.id !== id)), []);

  // Realtime moments: a patient's YES, a new task, a settled credit.
  const prev = useRef<DB | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = db;
    if (!p || !p.shops.length || !db.shops.length) return;
    for (const pt of db.chronic_patients) {
      const before = p.chronic_patients.find((x) => x.id === pt.id);
      if (before && before.refill_status !== 'confirmed' && pt.refill_status === 'confirmed') {
        setYes(pt);
        setFlash('refills');
        chime();
        setTimeout(() => setFlash(null), 2000);
        setTimeout(() => setYes((y) => (y?.id === pt.id ? null : y)), 9000);
      }
      if (before && before.dpdp_opt_in && !pt.dpdp_opt_in && pt.last_reply === 'STOP') {
        toast({ title: 'CONSENT WITHDRAWN', body: `${pt.patient_name} replied STOP. No more messages will be sent.`, tone: 'amber' });
      }
    }
    for (const c of db.credit_notes) {
      const before = p.credit_notes.find((x) => x.id === c.id);
      if (before && before.status === 'pending' && c.status === 'settled') {
        setFlash('credit');
        setTimeout(() => setFlash(null), 2000);
      }
    }
  }, [db, toast]);

  const setDayOffset = (n: number) => {
    setOffsetState(n);
    lsSet('rxmunshi.dayOffset', String(n));
  };
  const setTheme = (t: 'reachgrid' | 'reachgrid-dark') => {
    setThemeState(t);
    lsSet('rxmunshi.theme', t);
  };
  const setRight = (v: boolean) => {
    setRightState(v);
    lsSet('rxmunshi.right', v ? '1' : '0');
  };
  const setUseGemini = (v: boolean) => {
    setUseGeminiState(v && health.gemini);
    lsSet('rxmunshi.gemini', v ? '1' : '0');
  };
  const switchMode = (m: 'demo' | 'live') => {
    lsSet('rxmunshi.mode', m);
    window.location.reload();
  };

  const lane: Lane = mode === 'demo' ? 'sim' : health.whatsapp ? 'cloud' : 'wa.me';

  const openOutbound = useCallback(
    (out: Outbound[]) => {
      if (!out.length) return;
      if (lane === 'wa.me') {
        // one tab per message would be blocked; open the first, list the rest
        window.open(out[0].link, '_blank', 'noopener');
        if (out.length > 1)
          toast({
            title: `WHATSAPP · ${out.length} MESSAGES`,
            body: (
              <span>
                Opened the first. Tap each to send:{' '}
                {out.slice(1).map((o) => (
                  <a key={o.link} href={o.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                    {o.to} ▸
                  </a>
                ))}
              </span>
            ),
            ttl: 20000,
          });
      } else {
        toast({
          title: lane === 'sim' ? 'SENT · SIMULATED WHATSAPP' : 'SENT · WHATSAPP CLOUD',
          body: `${out.length} message${out.length > 1 ? 's' : ''} to ${out.map((o) => o.to).join(', ')}.${lane === 'sim' ? ' Open Patient phone to reply.' : ''}`,
          tone: 'good',
        });
      }
    },
    [lane, toast],
  );

  const handleOutcome = useCallback(
    (o: TaskOutcome) => {
      const shop = store.get().shops[0];
      if (o.slips?.length) {
        import('@/lib/pdf').then(({ returnSlipPDF }) => {
          for (const slip of o.slips ?? []) download(`${slip.slip_no}.pdf`, returnSlipPDF(slip, shop, today), 'application/pdf');
        });
      }
      if (o.outbound?.length) openOutbound(o.outbound);
      toast({ title: o.note.startsWith('Failed') ? 'TASK FAILED' : 'DONE', body: o.note + (o.slips?.length ? ` Slip PDF downloaded (${inr(o.slips.reduce((s, x) => s + x.total, 0))}).` : ''), tone: o.note.startsWith('Failed') ? 'red' : 'good' });
    },
    [store, today, openOutbound, toast],
  );

  const askMunshi = (text: string) => {
    setRight(true);
    setMunshiInput({ text, n: Date.now() });
  };

  const value: AppCtx = {
    store,
    db,
    today,
    dayOffset,
    setDayOffset,
    health,
    lane,
    useGemini,
    setUseGemini,
    toast,
    toasts,
    dismiss,
    yes,
    clearYes: () => setYes(null),
    flash,
    theme,
    setTheme,
    right,
    setRight,
    palette,
    setPalette,
    help,
    setHelp,
    tour,
    setTour,
    munshiInput,
    askMunshi,
    handleOutcome,
    openOutbound,
    mode,
    switchMode,
    liveProblem,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export async function signOut() {
  await supabase()?.auth.signOut();
  lsSet('rxmunshi.mode', 'demo');
  window.location.href = '/today';
}
