-- Wachtlijst voor de webshop: e-mailadressen van bezoekers die willen weten wanneer bestellen kan.
-- Toepassen in het Supabase-project via SQL Editor, zie supabase/README.md. Veilig om opnieuw uit te voeren.
-- Alleen de Worker (service-rol) schrijft hier; de browser krijgt nooit toegang.
--
--  * segment: 'particulier' of 'zakelijk'. Een zakelijke aanmelding komt ook als zakelijke aanvraag binnen
--    in business_requests (naam 'Wachtlijst (zakelijk)'), zodat die in het beheerportaal verschijnt.
--  * newsletter: true als de bezoeker het vakje "Stuur me ook de nieuwsbrief" liet staan. Dat adres staat dan
--    ook in newsletter_signups met source 'wachtlijst'.
--  * mailed_at: invullen zodra de livegangsmail is verstuurd, dan is zichtbaar wie nog niet gemaild is.

create table if not exists public.waitlist_signups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email      text not null check (char_length(email) between 3 and 200),
  segment    text not null default 'particulier' check (segment in ('particulier', 'zakelijk')),
  newsletter boolean not null default false,
  source     text not null default 'homepage' check (char_length(source) <= 40),
  mailed_at  timestamptz
);

create unique index if not exists waitlist_signups_email_key on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

grant select, insert, update, delete on public.waitlist_signups to service_role;
