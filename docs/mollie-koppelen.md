# Mollie koppelen (online betalen)

De code staat in `worker/lib/mollie.js` en `worker/index.js`. Zolang de sleutel of de schakelaar ontbreekt, blijft elke bestelling gewoon een bestelaanvraag.

## Hoe het werkt
1. `POST /api/order` legt de bestelling vast. Is online betalen aan, dan maakt de Worker een Mollie-betaling (`POST /v2/payments`) en geeft `checkoutUrl` terug. De bestelling krijgt status `wacht_op_betaling` en `mollie_payment_id`.
2. `checkout.js` stuurt de klant naar Mollie. Daarna komt de klant terug op `bedankt.html?o=<token>`.
3. Mollie roept `POST /api/mollie-webhook` aan met alleen een `id`. De Worker haalt de echte status bij Mollie op, controleert het bedrag en zet de bestelling op `betaald` of `betaling_mislukt`. Bij `betaald` komt er een pushmelding.
4. De bedankpagina vraagt `GET /api/order-status?t=<token>`; staat de bestelling nog open, dan vraagt de Worker Mollie meteen (de webhook kan later zijn dan de klant).
5. Gaat het aanmaken van de betaling mis, dan blijft de bestelling een aanvraag en nemen we contact op.

Een bestelling die al verwerkt of betaald is, wordt nooit meer teruggezet.

## Waar staat de betaalstatus?
Niet in `orders.status`: sinds migratie `0006` is dat de beheerstatus (nieuw, klaargemaakt, onderweg, bezorgd, geannuleerd) en weigert de database andere waarden. De betaling staat in `mollie_status` (`open`, `paid`, `failed`, `canceled`, `expired`) en `paid_at`. In het beheer is die nog niet zichtbaar (open punt).

## Online betalen staat alleen aan als alles klopt
`MOLLIE_API_KEY` is gezet, `"paymentsLive": true` in `public/data/products.json`, en de bestelling heeft geen regel met "prijs op gewicht".

## Ontwikkelmodus (winkel dicht)
Is `SALES_OPEN` `"false"` en ben je ingelogd via `/admin/login`, dan staat online betalen voor jou aan zodra `MOLLIE_API_KEY` bestaat, ook met `paymentsLive: false` (de Worker meldt dat via `/api/products`, zonder cache). Bezoekers zien niets en kunnen toch niet bestellen. Zo test je de hele betaalstroom met de `test_`-sleutel zonder de winkel open te zetten.

## Instellen
1. Cloudflare, Workers & Pages, buyt-website, Settings, Variables and Secrets: voeg het geheim `MOLLIE_API_KEY` toe. Begin met de `test_`-sleutel. Plak de sleutel nooit in een bestand of chat.
2. Zet `paymentsLive` op `true` in `public/data/products.json` (en `SALES_OPEN` pas als de eigenaar dat zegt, zie [verkoop-openzetten.md](verkoop-openzetten.md)).
3. Test met de testsleutel: bestel, kies een testbetaling bij Mollie, controleer dat de status in `/admin` op betaald springt.
4. Live: vervang de sleutel door de `live_`-sleutel (pas nadat Mollie het account heeft goedgekeurd).

## Nog open (beslissingen eigenaar)
- **Verzendkosten:** `shippingCents` is `null`. De betaling bevat nu alleen het productbedrag.
- **Betaalmethoden:** iDEAL, kaarten, Apple Pay en Google Pay; Klarna, Riverty, PayPal en overboeking niet.
- **Bevestigingsmail** gaat nu al bij het plaatsen van de bestelling, niet pas na betaling. Nieuw ontwerp staat op de to-do lijst.

Prijzen: een product heeft een vaste prijs per verpakking. Het "ca." bij het gewicht is een richtgewicht (max. 10% afwijking, zonder verrekening, zie `public/voorwaarden.html` artikel 4). Het bedrag dat Mollie int is dus gewoon het bedrag van de bestelling.
