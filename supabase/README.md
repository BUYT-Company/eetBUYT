# Supabase voor BUYT

De database voor bestellingen en zakelijke aanvragen. Alleen de Worker (`worker/`) praat ermee, met de service-rol. De browser krijgt nooit een Supabase-sleutel.

## Migratie toepassen

1. Maak een Supabase-project in de regio **EU (Frankfurt)** (eerst een testproject om mee te bouwen).
2. Open in het dashboard **SQL Editor**, plak de inhoud van `migrations/0001_init.sql` en voer die uit. Doe dit één keer; een tweede keer geeft "already exists".
3. Zet 2FA aan op je Supabase-account.

## Sleutels als geheimen zetten

Zet ze nooit in bestanden, commits of chats.

- `SUPABASE_URL` en `OWNER_EMAIL`: Worker-variabelen (Cloudflare dashboard > Worker > Settings > Variables).
- `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET`: Worker-**geheimen** (zelfde plek, type "Secret").
- Lokaal testen: kopieer `.dev.vars.example` naar `.dev.vars` (staat in `.gitignore`) en vul in.

## Verplichte test na het aanmaken

Controleer dat de publieke (anon) sleutel niets kan lezen of schrijven. Vervang `<PROJECT>` en `<ANON_KEY>` in je eigen terminal (de anon-sleutel staat onder Project Settings > API):

```bash
curl -s "https://<PROJECT>.supabase.co/rest/v1/orders?select=id" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
curl -s -X POST "https://<PROJECT>.supabase.co/rest/v1/orders" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" -d "{}"
curl -s -X POST "https://<PROJECT>.supabase.co/rest/v1/rpc/create_order" -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" -d "{\"payload\":{}}"
```

Alle drie moeten een fout geven (`permission denied` of `42501`), nooit rijen of een succes.

## Bestellingen inzien

Dashboard > Table Editor > `orders` en `order_lines`. Status van een bestelling pas je daar handmatig aan.
