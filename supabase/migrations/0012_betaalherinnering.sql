-- Betaalherinnering (zie docs/mollie-koppelen.md): een klant die een betaling startte maar niet afrondde,
-- krijgt één keer een herinnering. Hier staat wanneer die verstuurd is, zodat het nooit twee keer gebeurt.
-- Veilig om opnieuw uit te voeren.

alter table public.orders add column if not exists reminder_sent_at timestamptz;

-- Houdt de zoekvraag van de geplande controle snel: alleen onbetaalde bestellingen zonder herinnering.
create index if not exists orders_reminder_idx on public.orders (created_at)
  where paid_at is null and reminder_sent_at is null;
