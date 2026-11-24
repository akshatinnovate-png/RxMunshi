// Demo store: the whole shop in the browser. Persists to localStorage and
// syncs every tab through BroadcastChannel, so the Patient Phone simulator in
// another tab updates the dashboard in real time with no server and no Wi-Fi.
import type { DB, Row, TableName } from '@/core/types';
import { emptyDB, TABLES } from '@/core/types';
import { seedDB } from '@/core/seed';
import { applyInsert, applyRemove, applyUpdate, type Listener, type Store } from './store';

const KEY = 'rxmunshi.demo.v1';
const ACTOR_KEY = 'rxmunshi.actor';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota or private mode: keep working in memory */
  }
}

function normalise(raw: Partial<DB>): DB {
  const db = emptyDB();
  for (const t of TABLES) (db as unknown as Record<string, unknown[]>)[t] = Array.isArray(raw[t]) ? (raw[t] as unknown[]) : [];
  return db;
}

export function createDemoStore(today: string): Store {
  let db: DB;
  const stored = typeof window !== 'undefined' ? safeGet(KEY) : null;
  if (stored) {
    try {
      db = normalise(JSON.parse(stored));
    } catch {
      db = seedDB(today);
    }
  } else db = seedDB(today);
  if (!db.shops.length) db = seedDB(today);

  let actor = (typeof window !== 'undefined' && safeGet(ACTOR_KEY)) || db.shops[0]?.owner_name || 'Owner';
  const listeners = new Set<Listener>();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rxmunshi') : null;
  (channel as unknown as { unref?: () => void } | null)?.unref?.();

  const emit = () => listeners.forEach((l) => l());
  const commit = (next: DB) => {
    db = next;
    safeSet(KEY, JSON.stringify(db));
    channel?.postMessage({ type: 'db' });
    emit();
  };

  channel?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'db') {
      const s = safeGet(KEY);
      if (s) {
        try {
          db = normalise(JSON.parse(s));
          emit();
        } catch {
          /* ignore */
        }
      }
    }
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          db = normalise(JSON.parse(e.newValue));
          emit();
        } catch {
          /* ignore */
        }
      }
    });
  }
  if (!stored) safeSet(KEY, JSON.stringify(db));

  return {
    mode: 'demo',
    ready: true,
    get: () => db,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async insert<T extends TableName>(table: T, rows: Row<T>[]) {
      commit(applyInsert(db, table, rows));
    },
    async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>) {
      commit(applyUpdate(db, table, id, patch));
    },
    async remove(table, id) {
      commit(applyRemove(db, table, id));
    },
    async loadDemo(t) {
      commit(seedDB(t));
    },
    async wipe() {
      const shop = db.shops[0];
      commit({ ...emptyDB(), shops: shop ? [shop] : [], drug_master: db.drug_master });
    },
    actor: () => actor,
    setActor(name) {
      actor = name;
      safeSet(ACTOR_KEY, name);
      emit();
    },
  };
}
