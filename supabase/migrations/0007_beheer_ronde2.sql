-- Beheer ronde 2 (zie docs/ontwerp-beheerportaal.md): gedeelde bezorglijst, vervolg op de Home, en
-- het verloop van zakelijke aanvragen. Alleen via de Worker bereikbaar (service_role).
-- Veilig om opnieuw uit te voeren.

-- 1. Zakelijke aanvragen en berichten: statussen en wie het afhandelde -----------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.business_requests'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) like '%beantwoord%'
  loop
    execute format('alter table public.business_requests drop constraint %I', c);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.business_requests'::regclass and conname = 'business_requests_status_beheer_check') then
    alter table public.business_requests add constraint business_requests_status_beheer_check
      check (status in ('nieuw', 'beantwoord', 'in_gesprek', 'offerte_verstuurd', 'gewonnen', 'verloren'));
  end if;
end $$;

alter table public.business_requests add column if not exists updated_at timestamptz not null default now();
alter table public.business_requests add column if not exists handled_by text;

create or replace function public.set_request_status(p_id uuid, p_to text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_from text; v_type text;
begin
  if p_to not in ('nieuw', 'beantwoord', 'in_gesprek', 'offerte_verstuurd', 'gewonnen', 'verloren') then
    raise exception 'invalid_status';
  end if;
  select status, type into v_from, v_type from public.business_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  -- Berichten van particulieren kennen alleen nieuw en beantwoord; het zakelijke verloop is voor zakelijk.
  if v_type = 'particulier' and p_to not in ('nieuw', 'beantwoord') then raise exception 'invalid_status'; end if;
  if v_type = 'zakelijk' and p_to = 'beantwoord' then raise exception 'invalid_status'; end if;
  if v_from = p_to then return jsonb_build_object('changed', false, 'from', v_from, 'to', p_to); end if;
  update public.business_requests
     set status = p_to, updated_at = now(), handled_by = left(coalesce(nullif(p_actor, ''), 'systeem'), 60)
   where id = p_id;
  return jsonb_build_object('changed', true, 'from', v_from, 'to', p_to);
end $$;

-- 2. Gedeelde bezorglijst voor de bezorgdienst --------------------------------------------------------------
-- In de database staat alleen een hash van de code; de code zelf zie je maar één keer, bij het maken.
create table if not exists public.delivery_shares (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null unique,
  delivery_date  date not null,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  opened_count   int not null default 0,
  last_opened_at timestamptz
);
create index if not exists delivery_shares_date_idx on public.delivery_shares (delivery_date, created_at desc);
alter table public.delivery_shares enable row level security;
grant select on public.delivery_shares to service_role;

create or replace function public.delivery_share_create(p_hash text, p_date date, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_exp timestamptz;
begin
  insert into public.delivery_shares (token_hash, delivery_date, created_by, expires_at)
  values (p_hash, p_date, left(coalesce(nullif(p_by, ''), 'onbekend'), 60), now() + interval '24 hours')
  returning id, expires_at into v_id, v_exp;
  return jsonb_build_object('id', v_id, 'expires_at', v_exp);
end $$;

-- Opent een link: geeft de bezorgdatum terug (en telt het bezoek), of null als de link onbekend, verlopen of ingetrokken is.
create or replace function public.delivery_share_open(p_hash text) returns date
language plpgsql security definer set search_path = public as $$
declare v_date date;
begin
  update public.delivery_shares
     set opened_count = opened_count + 1, last_opened_at = now()
   where token_hash = p_hash and revoked_at is null and expires_at > now()
   returning delivery_date into v_date;
  return v_date;
end $$;

create or replace function public.delivery_share_revoke(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.delivery_shares set revoked_at = now() where id = p_id and revoked_at is null
$$;

-- 3. Home: ook onbeantwoorde berichten en zakelijke aanvragen meetellen -------------------------------------
create or replace function public.admin_todo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_new int; v_next jsonb; v_biz int; v_msg int;
begin
  select count(*) into v_new from public.orders where status = 'nieuw';
  select jsonb_build_object('date', delivery_date, 'window', delivery_window, 'count', count(*))
    into v_next
    from public.orders
    where status in ('nieuw', 'klaargemaakt') and delivery_date >= v_today
    group by delivery_date, delivery_window
    order by delivery_date, delivery_window
    limit 1;
  select count(*) into v_biz from public.business_requests where type = 'zakelijk' and status = 'nieuw';
  select count(*) into v_msg from public.business_requests where type = 'particulier' and status = 'nieuw';
  return jsonb_build_object('new_orders', v_new, 'next_delivery', v_next, 'new_business', v_biz, 'new_messages', v_msg);
end $$;

-- Rechten ---------------------------------------------------------------------------------------------------------
revoke all on function public.set_request_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delivery_share_create(text, date, text) from public, anon, authenticated;
revoke all on function public.delivery_share_open(text) from public, anon, authenticated;
revoke all on function public.delivery_share_revoke(uuid) from public, anon, authenticated;
revoke all on function public.admin_todo() from public, anon, authenticated;
grant execute on function public.set_request_status(uuid, text, text) to service_role;
grant execute on function public.delivery_share_create(text, date, text) to service_role;
grant execute on function public.delivery_share_open(text) to service_role;
grant execute on function public.delivery_share_revoke(uuid) to service_role;
grant execute on function public.admin_todo() to service_role;
