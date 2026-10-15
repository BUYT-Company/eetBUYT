-- Bewaartermijnen (zie public/privacy.html):
--  * Bestellingen: 2 jaar na de bezorgdatum worden alle gegevens gewist die naar de klant verwijzen
--    (naam, e-mail, telefoon, adres, opmerking, coördinaten, notities in de tijdlijn). De bestelling zelf blijft
--    7 jaar staan met alleen bestelnummer, datum, producten, bedragen en betaalstatus (administratieplicht).
--  * Zakelijke aanvragen en vragen: 12 maanden na afhandeling worden ze verwijderd.
-- Dit draait elke nacht automatisch (pg_cron). Veilig om opnieuw uit te voeren.
--
-- Eerst kijken wat er zou gebeuren, zonder iets te wijzigen:
--     select public.retention_preview();
-- Handmatig uitvoeren (normaal niet nodig, de nachtelijke taak doet dit):
--     select public.retention_run();

-- 1. Markering + logboek ----------------------------------------------------------------------------
alter table public.orders add column if not exists anonymized_at timestamptz;

-- Logboek zonder persoonsgegevens: alleen aantallen.
create table if not exists public.retention_log (
  id                 bigint generated always as identity primary key,
  run_at             timestamptz not null default now(),
  orders_anonymized  int not null,
  requests_deleted   int not null
);
alter table public.retention_log enable row level security;
grant select on public.retention_log to service_role;

-- 2. Wat valt eronder? ------------------------------------------------------------------------------
-- Bezorgdatum + 2 jaar; zonder bezorgdatum (bijv. oude of geannuleerde bestelling) telt de besteldatum.
create or replace function public.retention_preview() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'orders_to_anonymize', (
      select count(*) from public.orders
      where anonymized_at is null
        and coalesce(delivery_date, created_at::date) < current_date - interval '2 years'),
    'oldest_order_number', (
      select min(order_number) from public.orders
      where anonymized_at is null
        and coalesce(delivery_date, created_at::date) < current_date - interval '2 years'),
    'requests_to_delete', (
      select count(*) from public.business_requests
      where status = 'beantwoord' and updated_at < now() - interval '12 months')
  );
$$;

-- 3. Uitvoeren --------------------------------------------------------------------------------------
create or replace function public.retention_run() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orders   int;
  v_requests int;
begin
  -- Bestellingen: persoonsgegevens vervangen. De kolommen zijn verplicht (not null + lengtecontrole),
  -- dus naam/adres/plaats krijgen de tekst 'verwijderd' en het e-mailadres een uniek leeg adres per
  -- bestelling, zodat verwijderde klanten in lijsten niet tot één "klant" samensmelten.
  -- geocoded_at blijft gevuld zodat het adres nooit opnieuw wordt opgezocht.
  with todo as (
    select id from public.orders
    where anonymized_at is null
      and coalesce(delivery_date, created_at::date) < current_date - interval '2 years'
    for update
  ), ev as (
    update public.order_events e set note = ''
    where e.order_id in (select id from todo) and e.note <> ''
    returning 1
  ), upd as (
    update public.orders o set
      customer_name = 'verwijderd',
      email         = 'verwijderd-' || o.order_number || '@invalid',
      phone         = '',
      street        = 'verwijderd',
      postcode      = '000000',
      city          = 'verwijderd',
      note          = '',
      lat           = null,
      lng           = null,
      geocoded_at   = coalesce(o.geocoded_at, now()),
      lookup_token  = gen_random_uuid(),   -- oude bedankpagina-link werkt niet meer
      anonymized_at = now()
    where o.id in (select id from todo)
    returning 1
  )
  select count(*) into v_orders from upd;

  -- Zakelijke aanvragen en vragen: 12 maanden na afhandeling weg.
  with del as (
    delete from public.business_requests
    where status = 'beantwoord' and updated_at < now() - interval '12 months'
    returning 1
  )
  select count(*) into v_requests from del;

  insert into public.retention_log (orders_anonymized, requests_deleted) values (v_orders, v_requests);
  return jsonb_build_object('orders_anonymized', v_orders, 'requests_deleted', v_requests);
end $$;

revoke all on function public.retention_preview() from public, anon, authenticated;
revoke all on function public.retention_run() from public, anon, authenticated;
grant execute on function public.retention_preview() to service_role;
grant execute on function public.retention_run() to service_role;

-- 4. Elke nacht om 03:15 (UTC) automatisch ---------------------------------------------------------
-- pg_cron is een Supabase-extensie. Lukt het aanzetten hier niet, zet hem dan aan via
-- Dashboard > Database > Extensions > pg_cron en voer deze migratie opnieuw uit.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('bewaartermijnen', '15 3 * * *', 'select public.retention_run()');
exception when others then
  raise notice 'pg_cron niet beschikbaar (%): zet de extensie aan en voer deze migratie opnieuw uit.', sqlerrm;
end $$;
