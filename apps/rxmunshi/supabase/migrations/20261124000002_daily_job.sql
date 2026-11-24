-- Daily 08:00 IST job (02:30 UTC): calls the daily-run Edge Function, which
-- writes each shop's morning digest and sends consented refill templates.
-- Set the two settings once per project:
--   alter database postgres set app.functions_url = 'https://<project>.supabase.co/functions/v1';
--   alter database postgres set app.cron_secret = '<random secret, also set as CRON_SECRET for the function>';

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule(
      'rxmunshi-daily-0800-ist',
      '30 2 * * *',
      $job$
        select net.http_post(
          url := current_setting('app.functions_url', true) || '/daily-run',
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)),
          body := '{}'::jsonb
        );
      $job$
    );
  end if;
end $$;

-- The same digest numbers, as SQL, for dashboards and the function.
create or replace view public.expiry_digest as
select shop_id,
       count(*) filter (where expiry_date < current_date)                              as expired,
       count(*) filter (where expiry_date - current_date = 30)                         as crossing_30,
       count(*) filter (where expiry_date - current_date = 60)                         as crossing_60,
       count(*) filter (where expiry_date - current_date = 90)                         as crossing_90,
       coalesce(sum(qty * cost_inr) filter (where expiry_date <= current_date + 90), 0) as value_at_risk_inr
from public.inventory_batches
where status = 'active' and qty > 0
group by shop_id;

alter view public.expiry_digest set (security_invoker = true);
