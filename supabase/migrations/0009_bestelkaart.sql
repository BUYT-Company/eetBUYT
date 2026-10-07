-- Kaart van bestellingen (Analytics): coördinaten per bestelling, opgezocht via PDOK (zie worker/lib/geocode.js).
-- geocoded_at is gevuld zodra PDOK is geraadpleegd, ook als er niets gevonden is (lat en lng blijven dan leeg),
-- zodat een adres niet bij elke keer opnieuw wordt opgezocht. Veilig om opnieuw uit te voeren.
alter table public.orders add column if not exists lat double precision;
alter table public.orders add column if not exists lng double precision;
alter table public.orders add column if not exists geocoded_at timestamptz;

create or replace function public.set_order_geo(p_order_number bigint, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Alleen punten in en rond Nederland; alles anders wordt als "niet gevonden" bewaard.
  if p_lat is null or p_lng is null or p_lat not between 49 and 54 or p_lng not between 2 and 8 then
    p_lat := null;
    p_lng := null;
  end if;
  update public.orders set lat = p_lat, lng = p_lng, geocoded_at = now() where order_number = p_order_number;
end $$;

revoke all on function public.set_order_geo(bigint, double precision, double precision) from public, anon, authenticated;
grant execute on function public.set_order_geo(bigint, double precision, double precision) to service_role;
