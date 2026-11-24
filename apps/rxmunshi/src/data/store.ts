import type { DB, Row, TableName } from '@/core/types';

/** One interface for the demo store (browser) and the live store (Supabase). */
export interface Store {
  mode: 'demo' | 'live';
  ready: boolean;
  get(): DB;
  subscribe(cb: () => void): () => void;
  insert<T extends TableName>(table: T, rows: Row<T>[]): Promise<void>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Replace everything with fresh synthetic data (demo) or load it into the shop (live). */
  loadDemo(today: string): Promise<void>;
  /** Wipe the shop's data (DPDP right to erasure for the shop's own records). */
  wipe(): Promise<void>;
  actor(): string;
  setActor(name: string): void;
}

export type Listener = () => void;

export function applyInsert<T extends TableName>(db: DB, table: T, rows: Row<T>[]): DB {
  const existing = db[table] as Row<T>[];
  const ids = new Set(rows.map((r) => (r as { id?: string }).id));
  const kept = existing.filter((r) => !ids.has((r as { id?: string }).id));
  return { ...db, [table]: [...kept, ...rows] };
}

export function applyUpdate<T extends TableName>(db: DB, table: T, id: string, patch: Partial<Row<T>>): DB {
  const rows = db[table] as Row<T>[];
  return { ...db, [table]: rows.map((r) => ((r as { id?: string }).id === id ? { ...r, ...patch } : r)) };
}

export function applyRemove(db: DB, table: TableName, id: string): DB {
  const rows = db[table] as { id?: string }[];
  return { ...db, [table]: rows.filter((r) => r.id !== id) };
}
