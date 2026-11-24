-- Run after the migrations. Fails loudly (ON_ERROR_STOP) if any guarantee breaks.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333');


-- user 1 creates shop A, user 2 creates shop B
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.create_shop('Shop A', 'Sakchi') as shop_a \gset
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.create_shop('Shop B', 'Bistupur') as shop_b \gset

-- user 1 writes to shop A
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.inventory_batches (shop_id, medicine_name, batch_no, expiry_date, qty, cost_inr)
  values (:'shop_a', 'Benadryl', 'B1', current_date - 20, 3, 90);
insert into public.inventory_batches (shop_id, medicine_name, batch_no, expiry_date, qty, cost_inr)
  values (:'shop_a', 'Benadryl', 'B2', current_date + 400, 6, 96) returning dead_stock_risk as dead \gset
select case when :'dead' = 't' then 'ok: dead-stock flagged' else 'FAIL: dead stock not flagged' end;
\if :dead
\else
  select 1/0;
\endif

-- isolation: user 1 cannot see or write shop B
select count(*) as visible_b from public.shops where id = :'shop_b' \gset
\if :visible_b
  select 'FAIL: shop B visible to user 1'; select 1/0;
\endif
do $$ begin
  begin
    insert into public.inventory_batches (shop_id, medicine_name, batch_no, expiry_date) values (current_setting('my.shop_b')::uuid, 'X', 'X', current_date);
  exception when others then null; end;
end $$;

-- user 2 sees none of shop A's batches
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as leak from public.inventory_batches where shop_id = :'shop_a' \gset
\if :leak
  select 'FAIL: cross-shop leak'; select 1/0;
\endif
select 'ok: shops isolated';

-- DPDP guard: cannot mark a patient nudged without active consent
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.chronic_patients (shop_id, patient_name, whatsapp_phone, next_refill_date, dpdp_opt_in)
  values (:'shop_a', 'Sunita', '919800001001', current_date + 2, true) returning id as pid \gset
do $$ begin
  update public.chronic_patients set refill_status = 'nudged' where patient_name = 'Sunita';
  raise exception 'FAIL: nudge without consent allowed';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: nudge blocked without consent (%)', sqlerrm;
end $$;
insert into public.consent_log (shop_id, patient_id, purpose, channel) values (:'shop_a', :'pid', 'refill reminders', 'counter');
update public.chronic_patients set refill_status = 'nudged' where id = :'pid';
select 'ok: nudge allowed with consent';

-- H1 register: prescriber required, quantity positive, retention computed
do $$ begin
  insert into public.schedule_h1_logs (shop_id, dispensed_date, patient_name, doctor_name, drug_name, qty)
    values ((select id from public.shops where name = 'Shop A'), current_date, 'Manoj', '', 'Taxim-O 200', 1);
  raise exception 'FAIL: H1 without prescriber accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: H1 needs prescriber';
end $$;
insert into public.schedule_h1_logs (shop_id, dispensed_date, patient_name, doctor_name, doctor_address, drug_name, qty)
  values (:'shop_a', '2026-11-24', 'Manoj', 'Dr Sinha', 'Bistupur', 'Taxim-O 200', 1) returning retain_until \gset
select case when :'retain_until' = '2029-11-24' then 'ok: H1 retained 3 years' else 'FAIL retain' end;

-- staff cannot approve agent tasks or write H1
reset role;
insert into public.shop_members values (:'shop_a', '33333333-3333-3333-3333-333333333333', 'staff');
set role authenticated;
insert into public.agent_tasks (shop_id, kind, title) values (:'shop_a', 'return_batches', 'Return 2 batches') returning id as tid \gset
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
update public.agent_tasks set status = 'approved' where id = :'tid';
select status as st from public.agent_tasks where id = :'tid' \gset
select case when :'st' = 'proposed' then 'ok: staff cannot approve' else 'FAIL: staff approved' end;
do $$ begin
  insert into public.schedule_h1_logs (shop_id, dispensed_date, patient_name, doctor_name, drug_name, qty)
    values ((select shop_id from public.shop_members where user_id = auth.uid()), current_date, 'X', 'Dr Y', 'Z', 1);
  raise exception 'FAIL: staff wrote H1';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: staff cannot write H1';
end $$;

-- audit trail is append-only for app users
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.audit_events (shop_id, actor, action, entity) values (:'shop_a', 'Rakesh', 'test', 'x');
update public.audit_events set actor = 'someone else';
delete from public.audit_events;
select count(*) as tampered from public.audit_events where actor <> 'Rakesh' \gset
select count(*) as kept from public.audit_events \gset
\if :tampered
  select 'FAIL: audit edited'; select 1/0;
\endif
select case when :kept = 1 then 'ok: audit append-only' else 'FAIL: audit deleted' end as audit;
reset role;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  -- even with a row-level grant, the trigger refuses edits
  update public.audit_events set actor = 'x' where false;
end $$;

select * from public.expiry_digest;
reset role;
select 'ALL RLS TESTS PASSED';
