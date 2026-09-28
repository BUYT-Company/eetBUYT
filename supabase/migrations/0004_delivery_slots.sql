-- Bezorgmomenten: donderdag 17-19u/19-21u, zaterdag 10-12u/12-14u/14-16u (worker/lib/delivery.js
-- is de bron voor welke sloten geldig zijn; hier wordt alleen de capaciteit bewaakt).
alter table public.orders
  add column if not exists delivery_date date,
  add column if not exists delivery_window text
    check (delivery_window is null or delivery_window in (
      '17:00-19:00', '19:00-21:00', '10:00-12:00', '12:00-14:00', '14:00-16:00'
    ));

create index if not exists orders_delivery_idx on public.orders (delivery_date, delivery_window);

-- create_order() opnieuw gedefinieerd: zelfde inhoud als 0001, met een capaciteitscontrole
-- (max. 5 bestellingen per bezorgmoment, met een advisory lock zodat twee gelijktijdige
-- bestellingen voor hetzelfde slot elkaar niet kunnen inhalen) en de twee nieuwe kolommen.
-- "security definer" moet hier opnieuw expliciet bij staan: create or replace neemt dat niet
-- vanzelf over uit de vorige versie (0002).
create or replace function public.create_order(payload jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_number   bigint;
  v_token    uuid;
  v_request  uuid := (payload ->> 'client_request_id')::uuid;
  v_email    text := payload #>> '{customer,email}';
  v_date     date := (payload ->> 'delivery_date')::date;
  v_window   text := payload ->> 'delivery_window';
  v_count    int;
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

  if v_date is not null and v_window is not null then
    -- Serialiseert per bezorgmoment: twee gelijktijdige bestellingen voor hetzelfde slot
    -- wachten hier op elkaar, zodat de telling hieronder nooit een race-conditie heeft.
    perform pg_advisory_xact_lock(hashtext(v_date::text || v_window));
    select count(*) into v_count from orders
      where delivery_date = v_date and delivery_window = v_window
        and status <> 'geannuleerd';
    if v_count >= 5 then
      raise exception 'slot_full';
    end if;
  end if;

  insert into orders (
    client_request_id, customer_name, email, phone, street, postcode, city, note,
    total_estimate_cents, is_indicative, has_unpriced, delivery_date, delivery_window
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
    coalesce((payload ->> 'has_unpriced')::boolean, false),
    v_date,
    v_window
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
