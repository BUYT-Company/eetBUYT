-- BUYT fase 1: bestellingen en zakelijke aanvragen.
-- Toepassen in het Supabase-project (regio EU Frankfurt), zie supabase/README.md.
-- Alleen de Worker (service-rol) leest en schrijft. De browser praat nooit met de database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         bigint generated always as identity (start with 1001),
  lookup_token         uuid not null unique default gen_random_uuid(),
  client_request_id    uuid not null unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  status               text not null default 'aanvraag'
    check (status in ('aanvraag', 'wacht_op_betaling', 'betaald', 'betaling_mislukt', 'in_behandeling', 'verzonden', 'geannuleerd')),
  customer_name        text not null check (char_length(customer_name) between 1 and 120),
  email                text not null check (char_length(email) between 3 and 200),
  phone                text not null default '' check (char_length(phone) <= 40),
  street               text not null check (char_length(street) between 1 and 160),
  postcode             text not null check (char_length(postcode) between 6 and 7),
  city                 text not null check (char_length(city) between 1 and 100),
  note                 text not null default '' check (char_length(note) <= 1000),
  total_estimate_cents integer not null check (total_estimate_cents >= 0),
  is_indicative        boolean not null default false,
  has_unpriced         boolean not null default false,
  total_final_cents    integer check (total_final_cents >= 0),
  mollie_payment_id    text unique,
  mollie_status        text,
  paid_at              timestamptz,
  terms_accepted_at    timestamptz
);

create index orders_email_created_idx on public.orders (lower(email), created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

-- ----------------------------------------------------------- order_lines
create table public.order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       text not null,
  name             text not null,
  pack             text not null default '',
  qty              integer not null check (qty between 1 and 50),
  unit_price_cents integer check (unit_price_cents >= 0), -- null = prijs op gewicht
  price_approx     boolean not null default false,
  price_label      text not null default ''
);
-- Naam, verpakking en prijs zijn een momentopname: een latere prijswijziging raakt oude bestellingen niet.

create index order_lines_order_idx on public.order_lines (order_id);

-- ------------------------------------------------------ business_requests
create table public.business_requests (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 200),
  type       text not null check (type in ('particulier', 'zakelijk')),
  message    text not null default '' check (char_length(message) <= 3000),
  status     text not null default 'nieuw' check (status in ('nieuw', 'beantwoord'))
);

-- --------------------------------------------------------- payment_events
-- Logboek voor de Mollie-webhook (fase 2). Alleen status en id, geen persoonsgegevens.
create table public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  received_at       timestamptz not null default now(),
  mollie_payment_id text not null,
  mollie_status     text not null,
  order_id          uuid references public.orders (id) on delete set null
);

create index payment_events_payment_idx on public.payment_events (mollie_payment_id);

-- ------------------------------------------------------------ updated_at
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- create_order
-- Schrijft de bestelling en alle regels in één transactie.
-- Bestaat client_request_id al, dan komt de bestaande bestelling terug (dubbelklik-bescherming).
-- Meer dan 5 bestellingen per e-mailadres per uur geeft de fout 'rate_limited'.
-- Verwacht: { client_request_id, customer{customer_name,email,phone,street,postcode,city,note},
--             total_estimate_cents, is_indicative, has_unpriced,
--             lines[{product_id,name,pack,qty,unit_price_cents,price_approx,price_label}] }
create function public.create_order(payload jsonb) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id      uuid;
  v_number  bigint;
  v_token   uuid;
  v_request uuid := (payload ->> 'client_request_id')::uuid;
  v_email   text := payload #>> '{customer,email}';
begin
  select id, order_number, lookup_token into v_id, v_number, v_token
  from orders where client_request_id = v_request;
  if found then
    return jsonb_build_object('order_number', v_number, 'lookup_token', v_token, 'existing', true);
  end if;

  if (select count(*) from orders
      where lower(email) = lower(v_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into orders (
    client_request_id, customer_name, email, phone, street, postcode, city, note,
    total_estimate_cents, is_indicative, has_unpriced
  ) values (
    v_request,
    payload #>> '{customer,customer_name}',
    v_email,
    coalesce(payload #>> '{customer,phone}', ''),
    payload #>> '{customer,street}',
    payload #>> '{customer,postcode}',
    payload #>> '{customer,city}',
    coalesce(payload #>> '{customer,note}', ''),
    (payload ->> 'total_estimate_cents')::integer,
    coalesce((payload ->> 'is_indicative')::boolean, false),
    coalesce((payload ->> 'has_unpriced')::boolean, false)
  )
  on conflict (client_request_id) do nothing
  returning id, order_number, lookup_token into v_id, v_number, v_token;

  if v_id is null then
    -- Gelijktijdig dubbel verzoek: de andere transactie was net eerder.
    select id, order_number, lookup_token into v_id, v_number, v_token
    from orders where client_request_id = v_request;
    return jsonb_build_object('order_number', v_number, 'lookup_token', v_token, 'existing', true);
  end if;

  insert into order_lines (order_id, product_id, name, pack, qty, unit_price_cents, price_approx, price_label)
  select v_id,
         l ->> 'product_id',
         l ->> 'name',
         coalesce(l ->> 'pack', ''),
         (l ->> 'qty')::integer,
         (l ->> 'unit_price_cents')::integer,
         coalesce((l ->> 'price_approx')::boolean, false),
         coalesce(l ->> 'price_label', '')
  from jsonb_array_elements(payload -> 'lines') as l;

  return jsonb_build_object('order_number', v_number, 'lookup_token', v_token, 'existing', false);
end;
$$;

-- ----------------------------------------------------------- beveiliging
-- Row Level Security aan op elke tabel, bewust zonder policies: alles is standaard geweigerd
-- voor anon en authenticated. De service-rol (de Worker) omzeilt RLS.
alter table public.orders            enable row level security;
alter table public.order_lines       enable row level security;
alter table public.business_requests enable row level security;
alter table public.payment_events    enable row level security;

-- Extra vangnet: ook de rechten zelf intrekken.
revoke all on public.orders, public.order_lines, public.business_requests, public.payment_events from anon, authenticated;

revoke execute on function public.create_order(jsonb) from public, anon, authenticated;
grant  execute on function public.create_order(jsonb) to service_role;
