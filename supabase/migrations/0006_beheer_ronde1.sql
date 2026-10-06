-- Beheer ronde 1 (zie docs/ontwerp-beheerportaal.md):
--  1. bestellingen krijgen de statussen nieuw / klaargemaakt / onderweg / bezorgd / geannuleerd
--  2. tijdlijn per bestelling (order_events)
--  3. één atomaire functie om de status te wijzigen (set_order_status) en een voor notities/mails
--  4. cijfers voor de Home (admin_home_stats, admin_todo)
--  5. inlogbeveiliging: rem op raden en eenmalige 2FA-codes
-- Alles is alleen bereikbaar via de Worker (service_role); anon en authenticated krijgen niets.
-- Veilig om opnieuw uit te voeren: elke stap controleert eerst of hij al gedaan is.

-- 1. Statussen ------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) like '%aanvraag%'
  loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end $$;

update public.orders set status = case status
  when 'aanvraag' then 'nieuw'
  when 'wacht_op_betaling' then 'nieuw'
  when 'betaling_mislukt' then 'nieuw'
  when 'betaald' then 'nieuw'
  when 'in_behandeling' then 'klaargemaakt'
  when 'verzonden' then 'onderweg'
  else status end
where status in ('aanvraag', 'wacht_op_betaling', 'betaling_mislukt', 'betaald', 'in_behandeling', 'verzonden');

alter table public.orders alter column status set default 'nieuw';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_status_beheer_check') then
    alter table public.orders add constraint orders_status_beheer_check
      check (status in ('nieuw', 'klaargemaakt', 'onderweg', 'bezorgd', 'geannuleerd'));
  end if;
end $$;

-- 2. Tijdlijn ------------------------------------------------------------------------------
create table if not exists public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  at          timestamptz not null default now(),
  type        text not null check (type in ('status', 'note', 'mail')),
  from_status text,
  to_status   text,
  actor       text not null default 'systeem' check (char_length(actor) <= 60),
  source      text not null default 'handmatig' check (source in ('handmatig', 'afvinklijst', 'route', 'bezorger', 'systeem')),
  note        text not null default '' check (char_length(note) <= 1000)
);
create index if not exists order_events_order_idx on public.order_events (order_id, at);
alter table public.order_events enable row level security;
grant select, insert on public.order_events to service_role;

-- 3. Status wijzigen (één databasestap: bestelling vergrendelen, status zetten, tijdlijn bijwerken) --
-- Dezelfde status opnieuw opgeven doet niets (changed = false): nodig voor herhaalde meldingen van
-- een bezorger later. De regels over welke stap mag (vooruit, terugzetten, annuleren) staan in de
-- Worker (worker/lib/orderStatus.js); hier wordt alleen de waarde gecontroleerd.
create or replace function public.set_order_status(
  p_order_number bigint, p_to text, p_actor text, p_source text, p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_from  text;
begin
  if p_to not in ('nieuw', 'klaargemaakt', 'onderweg', 'bezorgd', 'geannuleerd') then
    raise exception 'invalid_status';
  end if;
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception 'not_found'; end if;
  v_from := v_order.status;
  if v_from = p_to then
    return jsonb_build_object('changed', false, 'from', v_from, 'to', p_to);
  end if;
  update public.orders set status = p_to, updated_at = now() where id = v_order.id;
  insert into public.order_events (order_id, type, from_status, to_status, actor, source, note)
  values (v_order.id, 'status', v_from, p_to, left(coalesce(nullif(p_actor, ''), 'systeem'), 60), p_source, left(coalesce(p_note, ''), 1000));
  return jsonb_build_object('changed', true, 'from', v_from, 'to', p_to);
end $$;

create or replace function public.add_order_event(
  p_order_number bigint, p_type text, p_actor text, p_source text, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_type not in ('note', 'mail') then raise exception 'invalid_type'; end if;
  select id into v_id from public.orders where order_number = p_order_number;
  if v_id is null then raise exception 'not_found'; end if;
  insert into public.order_events (order_id, type, actor, source, note)
  values (v_id, p_type, left(coalesce(nullif(p_actor, ''), 'systeem'), 60), p_source, left(coalesce(p_note, ''), 1000));
end $$;

-- 4. Cijfers voor de Home -----------------------------------------------------------------------
-- Telefoonnummers vergelijken op de laatste 9 cijfers, zodat +31 6 12 34 56 78 en 06-12345678
-- als hetzelfde nummer tellen. Te korte nummers tellen niet mee.
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 9
              then right(regexp_replace(p, '\D', '', 'g'), 9) end
$$;

-- p_period: 'dag' (vandaag tot nu, tegenover gisteren tot dezelfde tijd), '7d' of '30d' (tegenover de
-- periode ervoor). Geannuleerde bestellingen tellen niet mee. Een klant is "terugkerend" als er vóór
-- de periode al een niet-geannuleerde bestelling met hetzelfde e-mailadres of telefoonnummer was.
create or replace function public.admin_home_stats(p_period text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_now        timestamptz := now();
  v_today      timestamptz := date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam';
  v_start      timestamptz;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;
  v_cur  jsonb; v_prev jsonb; v_top jsonb; v_cust jsonb;
begin
  if p_period = 'dag' then
    v_start := v_today; v_prev_start := v_today - interval '1 day'; v_prev_end := v_now - interval '1 day';
  elsif p_period = '7d' then
    v_start := v_now - interval '7 days'; v_prev_start := v_now - interval '14 days'; v_prev_end := v_start;
  elsif p_period = '30d' then
    v_start := v_now - interval '30 days'; v_prev_start := v_now - interval '60 days'; v_prev_end := v_start;
  else
    raise exception 'invalid_period';
  end if;

  select jsonb_build_object(
           'orders', count(*),
           'revenue_cents', coalesce(sum(coalesce(total_final_cents, total_estimate_cents)), 0),
           'indicative', coalesce(bool_or(is_indicative or has_unpriced), false))
    into v_cur
    from public.orders where created_at >= v_start and created_at <= v_now and status <> 'geannuleerd';

  select jsonb_build_object(
           'orders', count(*),
           'revenue_cents', coalesce(sum(coalesce(total_final_cents, total_estimate_cents)), 0),
           'indicative', coalesce(bool_or(is_indicative or has_unpriced), false))
    into v_prev
    from public.orders where created_at >= v_prev_start and created_at < v_prev_end and status <> 'geannuleerd';

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top from (
    select l.name, sum(l.qty)::int as qty
    from public.order_lines l join public.orders o on o.id = l.order_id
    where o.created_at >= v_start and o.created_at <= v_now and o.status <> 'geannuleerd'
    group by l.product_id, l.name
    order by sum(l.qty) desc, l.name
    limit 5) t;

  with w as (
    select distinct on (lower(o.email)) lower(o.email) as em, public.norm_phone(o.phone) as ph
    from public.orders o
    where o.created_at >= v_start and o.created_at <= v_now and o.status <> 'geannuleerd'
    order by lower(o.email), o.created_at
  ), flagged as (
    select w.*, exists (
      select 1 from public.orders p
      where p.status <> 'geannuleerd' and p.created_at < v_start
        and (lower(p.email) = w.em or (w.ph is not null and public.norm_phone(p.phone) = w.ph))
    ) as ret from w
  )
  select jsonb_build_object('new', count(*) filter (where not ret), 'returning', count(*) filter (where ret))
    into v_cust from flagged;

  return jsonb_build_object('current', v_cur, 'previous', v_prev, 'top', v_top, 'customers', v_cust,
                            'period', p_period);
end $$;

-- Wat er nu aandacht vraagt: nieuwe bestellingen en het eerstvolgende bezorgmoment met open bestellingen.
create or replace function public.admin_todo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_new int; v_next jsonb;
begin
  select count(*) into v_new from public.orders where status = 'nieuw';
  select jsonb_build_object('date', delivery_date, 'window', delivery_window, 'count', count(*))
    into v_next
    from public.orders
    where status in ('nieuw', 'klaargemaakt') and delivery_date >= v_today
    group by delivery_date, delivery_window
    order by delivery_date, delivery_window
    limit 1;
  return jsonb_build_object('new_orders', v_new, 'next_delivery', v_next);
end $$;

-- 5. Inlogbeveiliging --------------------------------------------------------------------------------
create table if not exists public.admin_login_failures (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists admin_login_failures_idx on public.admin_login_failures (ip_hash, at);
alter table public.admin_login_failures enable row level security;

create table if not exists public.admin_totp_used (
  account text not null,
  step    bigint not null,
  at      timestamptz not null default now(),
  primary key (account, step)
);
alter table public.admin_totp_used enable row level security;

-- Na 5 mislukte pogingen in 15 minuten vanaf hetzelfde adres: wachten.
create or replace function public.admin_login_blocked(p_ip_hash text) returns boolean
language sql security definer set search_path = public as $$
  select count(*) >= 5 from public.admin_login_failures
  where ip_hash = p_ip_hash and at > now() - interval '15 minutes'
$$;

create or replace function public.admin_record_failure(p_ip_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.admin_login_failures where at < now() - interval '1 day';
  insert into public.admin_login_failures (ip_hash) values (p_ip_hash);
end $$;

-- Een 2FA-code werkt maar één keer: true = nieuw gebruikt, false = was al gebruikt.
create or replace function public.admin_use_totp(p_account text, p_step bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_done int;
begin
  delete from public.admin_totp_used where at < now() - interval '1 day';
  insert into public.admin_totp_used (account, step) values (p_account, p_step) on conflict do nothing;
  get diagnostics v_done = row_count;
  return v_done = 1;
end $$;

-- Rechten: alleen de Worker (service_role).
revoke all on function public.set_order_status(bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.add_order_event(bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_home_stats(text) from public, anon, authenticated;
revoke all on function public.admin_todo() from public, anon, authenticated;
revoke all on function public.admin_login_blocked(text) from public, anon, authenticated;
revoke all on function public.admin_record_failure(text) from public, anon, authenticated;
revoke all on function public.admin_use_totp(text, bigint) from public, anon, authenticated;
grant execute on function public.set_order_status(bigint, text, text, text, text) to service_role;
grant execute on function public.add_order_event(bigint, text, text, text, text) to service_role;
grant execute on function public.admin_home_stats(text) to service_role;
grant execute on function public.admin_todo() to service_role;
grant execute on function public.admin_login_blocked(text) to service_role;
grant execute on function public.admin_record_failure(text) to service_role;
grant execute on function public.admin_use_totp(text, bigint) to service_role;
grant select, insert, delete on public.admin_login_failures, public.admin_totp_used to service_role;
