// Live store: Supabase Postgres with Row-Level Security and Realtime.
// Loads the signed-in member's shop and keeps it current from postgres_changes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DB, Row, TableName } from '@/core/types';
import { emptyDB, TABLES } from '@/core/types';
import { seedDB } from '@/core/seed';
import { applyInsert, applyRemove, applyUpdate, type Listener, type Store } from './store';

const REALTIME: TableName[] = [
  'inventory_batches',
  'credit_notes',
  'chronic_patients',
  'agent_tasks',
  'purchase_bills',
  'orders',
  'schedule_h1_logs',
  'messages',
  'audit_events',
];

/** Columns the database computes; never sent on insert or update. */
const GENERATED: Partial<Record<TableName, string[]>> = { schedule_h1_logs: ['retain_until'] };
const SHARED: TableName[] = ['drug_master'];

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ||= createClient(url, key, { auth: { persistSession: true } });
  return client;
}

function clean<T extends TableName>(table: T, row: Partial<Row<T>>) {
  const out = { ...(row as Record<string, unknown>) };
  for (const c of GENERATED[table] || []) delete out[c];
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Seed rows use readable ids ("b-001"); Postgres wants uuids. Remap consistently. */
export function remapSeed(seed: DB, shopId: string): DB {
  const map = new Map<string, string>();
  const id = (old: string | null | undefined) => {
    if (!old) return old ?? null;
    if (old.startsWith('d-')) return old; // drug_master ids are text
    if (UUID.test(old) && old !== seed.shops[0]?.id) return old;
    if (old === seed.shops[0]?.id) return shopId;
    if (!map.has(old)) map.set(old, crypto.randomUUID());
    return map.get(old)!;
  };
  const fix = (v: unknown, key: string): unknown => {
    if (typeof v === 'string' && (key === 'id' || key.endsWith('_id'))) return id(v);
    if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? fixObj(x as Record<string, unknown>) : key.endsWith('_ids') ? id(x as string) : x));
    if (v && typeof v === 'object') return fixObj(v as Record<string, unknown>);
    return v;
  };
  const fixObj = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fix(v, k)]));
  const out = emptyDB();
  for (const t of TABLES) (out as unknown as Record<string, unknown[]>)[t] = (seed[t] as unknown as Record<string, unknown>[]).map(fixObj);
  return out;
}

export async function createLiveStore(): Promise<Store | { error: string; needsSignIn?: boolean; needsShop?: boolean }> {
  const sb = supabase();
  if (!sb) return { error: 'Supabase is not configured.' };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: 'Sign in to open your shop.', needsSignIn: true };
  const { data: member } = await sb.from('shop_members').select('shop_id, role').eq('user_id', auth.user.id).limit(1).maybeSingle();
  if (!member) return { error: 'Create your shop to begin.', needsShop: true };
  const shopId = member.shop_id as string;

  let db = emptyDB();
  const load = async () => {
    const next = emptyDB();
    await Promise.all(
      TABLES.map(async (t) => {
        let q = sb.from(t).select('*');
        if (t === 'shops') q = q.eq('id', shopId);
        else if (!SHARED.includes(t)) q = q.eq('shop_id', shopId);
        if (t === 'audit_events' || t === 'dispenses') q = q.order(t === 'audit_events' ? 'at' : 'sold_at', { ascending: false }).limit(5000);
        const { data, error } = await q;
        if (error) throw new Error(`${t}: ${error.message}`);
        (next as unknown as Record<string, unknown[]>)[t] = (data || []).map(numify);
      }),
    );
    db = next;
  };
  await load();

  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());
  let actor = auth.user.email || 'member';

  const channel = sb.channel(`shop-${shopId}`);
  for (const t of REALTIME) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `shop_id=eq.${shopId}` }, (payload) => {
      if (payload.eventType === 'DELETE') db = applyRemove(db, t, (payload.old as { id: string }).id);
      else db = applyInsert(db, t, [numify(payload.new) as never]);
      emit();
    });
  }
  channel.subscribe();

  const store: Store = {
    mode: 'live',
    ready: true,
    get: () => db,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async insert(table, rows) {
      db = applyInsert(db, table, rows);
      emit();
      const { error } = await sb.from(table).upsert(rows.map((r) => clean(table, r)));
      if (error) {
        await load();
        emit();
        throw new Error(error.message);
      }
    },
    async update(table, id, patch) {
      db = applyUpdate(db, table, id, patch);
      emit();
      const { error } = await sb.from(table).update(clean(table, patch)).eq('id', id);
      if (error) {
        await load();
        emit();
        throw new Error(error.message);
      }
    },
    async remove(table, id) {
      db = applyRemove(db, table, id);
      emit();
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async loadDemo(today) {
      const seed = remapSeed(seedDB(today), shopId);
      const order: TableName[] = ['wholesalers', 'purchase_bills', 'orders', 'inventory_batches', 'chronic_patients', 'consent_log', 'schedule_h1_logs', 'credit_notes', 'dispenses', 'audit_events'];
      const { shops: _s, ...rest } = seed;
      void _s;
      // purchase_bills.order_id and orders.bill_id reference each other: insert bills without the link first
      for (const t of order) {
        const rows = (rest[t as keyof typeof rest] as unknown as Record<string, unknown>[]).map((r) => clean(t, r as never));
        if (!rows.length) continue;
        const { error } = await sb.from(t).insert(rows);
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      await sb.from('shops').update({ ...clean('shops', { ...seed.shops[0], id: undefined, created_at: undefined } as never) }).eq('id', shopId);
      await load();
      emit();
    },
    async wipe() {
      for (const t of ['audit_events', 'messages', 'agent_tasks', 'dispenses', 'credit_notes', 'schedule_h1_logs', 'consent_log', 'chronic_patients', 'inventory_batches', 'orders', 'purchase_bills', 'wholesalers'] as TableName[]) {
        await sb.from(t).delete().eq('shop_id', shopId);
      }
      await load();
      emit();
    },
    actor: () => actor,
    setActor(name) {
      actor = name;
      emit();
    },
  };
  return store;
}

// numeric columns arrive as strings from PostgREST
const NUMERIC = new Set(['cost_inr', 'mrp_inr', 'credit_pct', 'monthly_bill_inr', 'claim_amount_inr', 'settled_amount_inr', 'total_inr', 'total_est_inr', 'amount_inr']);
function numify<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const o = { ...(row as Record<string, unknown>) };
  for (const k of Object.keys(o)) if (NUMERIC.has(k) && typeof o[k] === 'string') o[k] = Number(o[k]);
  return o as T;
}
