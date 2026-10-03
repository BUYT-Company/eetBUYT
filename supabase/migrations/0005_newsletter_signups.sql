-- Nieuwsbrief "Blijf op de hoogte": e-mailadressen van de inschrijvingen op de site.
-- Toepassen in het Supabase-project via SQL Editor, zie supabase/README.md.
-- Alleen de Worker (service-rol) schrijft hier; de browser krijgt nooit toegang.

create table public.newsletter_signups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email      text not null check (char_length(email) between 3 and 200),
  source     text not null default 'website' check (char_length(source) <= 40)
);

create unique index newsletter_signups_email_key on public.newsletter_signups (lower(email));

alter table public.newsletter_signups enable row level security;

grant insert, select on public.newsletter_signups to service_role;
