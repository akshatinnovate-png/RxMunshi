-- RxMunshi schema: the spec's five core tables plus the tables the six
-- winning features need. Multi-tenant by shop_id with Row-Level Security
-- through shop_members (a shop can have several logins with roles).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- shops
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null default '',
  phone text not null default '',
  drug_license_no text not null default '',
  license_valid_until date,
  pharmacist_name text not null default '',
  pharmacist_reg_no text not null default '',
  pharmacist_reg_valid_until date,
  gstin text not null default '',
  address text not null default '',
  city text not null default '',
  created_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'pharmacist', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

-- Membership helpers. security definer so policies on shop_members do not recurse.
create or replace function public.is_member(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = auth.uid());
$$;

create or replace function public.has_role(p_shop uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = auth.uid() and m.role = any(p_roles));
$$;

-- Create a shop and make the caller its owner in one step.
create or replace function public.create_shop(p_name text, p_city text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.shops (name, city) values (p_name, p_city) returning id into v_id;
  insert into public.shop_members (shop_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- ---------------------------------------------------------------- reference
create table public.wholesalers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text not null default '',
  license_no text not null default '',          -- Form 20B/21B
  city text not null default '',
  return_window_days int not null default 30 check (return_window_days between 0 and 365),
  credit_pct numeric(5,2) not null default 100 check (credit_pct between 0 and 100),
  min_shelf_life_months int not null default 6 check (min_shelf_life_months between 0 and 36)
);

-- Shared catalogue: readable by everyone signed in, written by the service role.
create table public.drug_master (
  id text primary key,
  name text not null,
  salt text not null,
  form text not null default 'tab',
  schedule text not null check (schedule in ('OTC', 'G', 'H', 'H1', 'X')),
  pack text not null default '',
  mrp_inr numeric(10,2) not null default 0,
  chronic boolean not null default false
);

-- ---------------------------------------------------------------- core (spec)
create table public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  wholesaler_id uuid references public.wholesalers(id) on delete set null,
  distributor_name text not null,
  bill_no text not null,
  bill_date date not null,
  total_inr numeric(12,2) not null default 0,
  image_url text,
  source text not null default 'ocr' check (source in ('ocr', 'sample', 'manual')),
  lines jsonb not null default '[]',
  issues jsonb not null default '[]',
  order_id uuid,
  created_at timestamptz not null default now(),
  unique (shop_id, distributor_name, bill_no)
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  drug_id text references public.drug_master(id),
  medicine_name text not null,
  batch_no text not null,
  expiry_date date not null,
  qty int not null default 0 check (qty >= 0),
  cost_inr numeric(10,2) not null default 0 check (cost_inr >= 0),
  mrp_inr numeric(10,2) not null default 0 check (mrp_inr >= 0),
  distributor_name text not null default '',
  wholesaler_id uuid references public.wholesalers(id) on delete set null,
  is_schedule_h1 boolean not null default false,
  dead_stock_risk boolean not null default false,
  status text not null default 'active' check (status in ('active', 'returned', 'sold', 'quarantined')),
  bill_id uuid references public.purchase_bills(id) on delete set null,
  received_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.inventory_batches (shop_id, status, expiry_date);

create table public.chronic_patients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  patient_name text not null,
  whatsapp_phone text not null,
  medicine_summary text not null default '',
  medicines jsonb not null default '[]',
  refill_cycle_days int not null default 30 check (refill_cycle_days > 0),
  next_refill_date date not null,
  monthly_bill_inr numeric(10,2) not null default 0,
  dpdp_opt_in boolean not null default false,
  preferred_lang text not null default 'hi' check (preferred_lang in ('hi', 'en')),
  refill_status text not null default 'none'
    check (refill_status in ('none', 'due', 'nudged', 'confirmed', 'ready', 'collected', 'declined')),
  last_nudged_at timestamptz,
  last_reply text,
  created_at timestamptz not null default now()
);
create index on public.chronic_patients (shop_id, next_refill_date);
create index on public.chronic_patients (whatsapp_phone);

create table public.consent_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  patient_id uuid not null references public.chronic_patients(id) on delete cascade,
  purpose text not null,
  channel text not null check (channel in ('counter', 'whatsapp')),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  evidence text not null default ''
);

-- Rule 65: name and address of prescriber, patient name, drug, quantity; kept 3 years.
create table public.schedule_h1_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  dispensed_date date not null,
  patient_name text not null check (length(trim(patient_name)) > 0),
  patient_address text not null default '',
  doctor_name text not null check (length(trim(doctor_name)) > 0),
  doctor_address text not null default '',
  doctor_reg_no text not null default '',
  drug_name text not null,
  batch_no text not null default '',
  qty int not null check (qty > 0),
  rx_image_url text,
  retain_until date not null generated always as ((dispensed_date + interval '3 years')::date) stored,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  wholesaler_id uuid references public.wholesalers(id) on delete set null,
  distributor_name text not null,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  medicine_name text not null default '',
  batch_no text not null default '',
  qty int not null default 0,
  claim_amount_inr numeric(12,2) not null check (claim_amount_inr >= 0),
  return_slip_no text not null,
  return_slip_pdf_url text,
  status text not null default 'pending' check (status in ('pending', 'settled', 'rejected')),
  raised_at timestamptz not null default now(),
  chase_count int not null default 0,
  last_chased_at timestamptz,
  settled_at timestamptz,
  settled_amount_inr numeric(12,2),
  unique (shop_id, return_slip_no)
);

-- ---------------------------------------------------------------- features
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  wholesaler_id uuid not null references public.wholesalers(id) on delete cascade,
  lines jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'delivered', 'verified', 'cancelled')),
  total_est_inr numeric(12,2) not null default 0,
  sent_via text check (sent_via in ('cloud', 'wa.me', 'sim')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  bill_id uuid references public.purchase_bills(id) on delete set null
);
alter table public.purchase_bills add constraint purchase_bills_order_fk foreign key (order_id) references public.orders(id) on delete set null;

create table public.dispenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  drug_id text references public.drug_master(id),
  medicine_name text not null,
  qty int not null check (qty > 0),
  patient_id uuid references public.chronic_patients(id) on delete set null,
  sold_at timestamptz not null default now()
);
create index on public.dispenses (shop_id, sold_at);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null,
  title text not null,
  reason text not null default '',
  payload jsonb not null default '{}',
  amount_inr numeric(12,2) not null default 0,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'executed', 'verified', 'failed', 'rejected')),
  proposed_by text not null default 'munshi',
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text
);
create index on public.agent_tasks (shop_id, status);

-- Append-only audit trail.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'
);
create index on public.audit_events (shop_id, at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  to_kind text not null check (to_kind in ('patient', 'wholesaler', 'owner')),
  to_id text,
  to_phone text not null,
  direction text not null check (direction in ('out', 'in')),
  body text not null,
  lane text not null check (lane in ('cloud', 'wa.me', 'sim')),
  at timestamptz not null default now()
);

-- Morning digests written by the 08:00 IST job.
create table public.digests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  for_date date not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique (shop_id, for_date)
);

-- ---------------------------------------------------------------- guards
-- WhatsApp templates only to patients with an active consent record (DPDP Act 2023).
create or replace function public.guard_nudge_consent() returns trigger language plpgsql as $$
begin
  if new.refill_status = 'nudged' and (old.refill_status is distinct from 'nudged') then
    if not new.dpdp_opt_in or not exists (
      select 1 from public.consent_log c where c.patient_id = new.id and c.withdrawn_at is null
    ) then
      raise exception 'DPDP: patient % has no active consent', new.id;
    end if;
  end if;
  return new;
end $$;
create trigger chronic_patients_consent before update on public.chronic_patients
  for each row execute function public.guard_nudge_consent();

-- Flag dead-stock risk on insert: same medicine expired on the shelf or was returned in the past 90 days.
create or replace function public.flag_dead_stock() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.inventory_batches b
    where b.shop_id = new.shop_id
      and lower(b.medicine_name) = lower(new.medicine_name)
      and b.expiry_date >= current_date - 90 and b.expiry_date < current_date
      and (b.status in ('returned', 'quarantined') or (b.status = 'active' and b.qty > 0))
  ) then
    new.dead_stock_risk := true;
  end if;
  return new;
end $$;
create trigger inventory_batches_dead_stock before insert on public.inventory_batches
  for each row execute function public.flag_dead_stock();

-- Audit events cannot be edited or deleted by app users.
create or replace function public.audit_append_only() returns trigger language plpgsql as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row when (current_user not in ('postgres', 'service_role', 'supabase_admin'))
  execute function public.audit_append_only();

-- ---------------------------------------------------------------- RLS
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.drug_master enable row level security;

create policy shops_read on public.shops for select using (public.is_member(id));
create policy shops_update on public.shops for update using (public.has_role(id, array['owner'])) with check (public.has_role(id, array['owner']));
create policy members_read on public.shop_members for select using (public.is_member(shop_id));
create policy members_admin on public.shop_members for all using (public.has_role(shop_id, array['owner'])) with check (public.has_role(shop_id, array['owner']));
create policy drugs_read on public.drug_master for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['wholesalers', 'purchase_bills', 'inventory_batches', 'chronic_patients', 'consent_log',
    'schedule_h1_logs', 'credit_notes', 'orders', 'dispenses', 'agent_tasks', 'messages', 'digests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(shop_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert with check (public.is_member(shop_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(shop_id)) with check (public.is_member(shop_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.has_role(shop_id, array[''owner'']))', t || '_delete', t);
  end loop;
end $$;

-- Approving agent work, and the H1 register, need owner or pharmacist.
drop policy agent_tasks_update on public.agent_tasks;
create policy agent_tasks_update on public.agent_tasks for update
  using (public.has_role(shop_id, array['owner', 'pharmacist']))
  with check (public.has_role(shop_id, array['owner', 'pharmacist']));
drop policy schedule_h1_logs_insert on public.schedule_h1_logs;
create policy schedule_h1_logs_insert on public.schedule_h1_logs for insert
  with check (public.has_role(shop_id, array['owner', 'pharmacist']));

alter table public.audit_events enable row level security;
create policy audit_read on public.audit_events for select using (public.is_member(shop_id));
create policy audit_insert on public.audit_events for insert with check (public.is_member(shop_id));

-- ---------------------------------------------------------------- realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.inventory_batches, public.credit_notes,
      public.chronic_patients, public.agent_tasks, public.purchase_bills, public.orders,
      public.schedule_h1_logs, public.messages, public.audit_events;
  end if;
end $$;

-- ---------------------------------------------------------------- storage
-- Private buckets for bills and prescriptions; objects live under <shop_id>/...
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('bills', 'bills', false), ('rx', 'rx', false)
      on conflict (id) do nothing;
    execute $p$create policy "members read shop files" on storage.objects for select
      using (bucket_id in ('bills', 'rx') and public.is_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "members write shop files" on storage.objects for insert
      with check (bucket_id in ('bills', 'rx') and public.is_member(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;
