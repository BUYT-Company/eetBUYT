# Ontwerp: eetbuyt.nl op Cloudflare met Supabase als bestelopslag

Status: ontwerp (22-25 sept 2026). Branch: `cloudflare-supabase`. De site op `main` (Netlify) blijft ongewijzigd tot de livegang in hoofdstuk 12.

Dit document is ook de overdracht voor een nieuwe chat: lees dit en `PRODUCT.md` (het projectgeheugen laadt vanzelf), dan kun je meteen bouwen.

---

## 1. Doel en uitgangspunten

**Doel:** bestellen en betalen kunnen draaien op Cloudflare, met bestellingen in een echte database (Supabase), zodat de opslag niet meer aan één host vastzit.

Uitgangspunten:

1. **Geen bestelling mag verloren gaan.** Eerst vastleggen, dan pas betalen (zoals nu in `checkout.js`).
2. **De browser praat nooit rechtstreeks met de database.** Alleen de Worker schrijft en leest. Er komt geen Supabase-sleutel in de site.
3. **Prijzen worden altijd op de server bepaald**, nooit uit de browser.
4. **Zo min mogelijk nieuwe onderdelen:** geen npm-build, geen framework, geen Supabase-SDK. Gewone JavaScript-bestanden en `fetch`.
5. **De klantervaring blijft gelijk:** zo min mogelijk klikken, mandje in de browser, dezelfde pagina's.
6. **Stap voor stap:** fase 1 (bestellingen vastleggen), fase 2 (online betalen), fase 3 (producten/voorraad/teller in de database).

## 2. Wat verandert er

| Onderdeel | Nu (Netlify, `main`) | Straks (branch) |
|---|---|---|
| Hosting | Netlify, `publish = "."` | Cloudflare Workers met statische bestanden, dezelfde map |
| Bestellingen opslaan | Netlify Forms (`bestelling`) | Supabase (tabellen `orders`, `order_lines`) |
| Zakelijke aanvragen | Netlify Forms (`bestellen`) | Supabase (`business_requests`) |
| Betaalfuncties | 3 Netlify Functions (`exports.handler`) | 1 Worker met routes onder `/api/` |
| Adressen in de site | `/.netlify/functions/...` en `POST /` | `/api/order`, `/api/request`, `/api/mollie-webhook`, `/api/order-status` |
| Spamfilter | Netlify honeypot | Honeypot + Cloudflare Turnstile |
| Prijslijst | `data/products.json` | Zelfde bestand (fase 1 en 2), later de database (fase 3) |
| Geheimen | Netlify environment variables | Cloudflare secrets (Worker) |
| Bestellingen inzien | Netlify > Forms | Supabase dashboard (met 2FA) |

## 3. Architectuur

```
Browser (statische site: index.html, afrekenen.html, bedankt.html, js/*)
   |
   |  fetch('/api/...')
   v
Cloudflare Worker  (worker/index.js)
   |-- serveert alle andere paden uit de statische bestanden (env.ASSETS)
   |-- valideert invoer, controleert Turnstile, bepaalt prijzen uit products.json
   |-- schrijft/leest Supabase via PostgREST (service-rol, alleen server-side)
   |-- praat met Mollie (betaling aanmaken, status ophalen)
   |-- stuurt melding (e-mail) naar de eigenaar
   v
Supabase (Postgres, regio EU Frankfurt)      Mollie (betaalpagina van Mollie zelf)
```

De Worker draait alleen voor `/api/*` (`run_worker_first`), alles daarbuiten komt rechtstreeks uit de statische bestanden. Dat houdt de site snel en het verbruik laag.

## 4. Structuur van de branch

```
wrangler.jsonc                      # naam, main, assets, run_worker_first, vars
.assetsignore                       # sluit niet-publieke bestanden uit (zie hieronder)
.dev.vars.example                   # voorbeeld voor lokale geheimen (echte .dev.vars staat in .gitignore)
worker/index.js                     # router en handlers
worker/lib/supabase.js              # dunne fetch-wrapper voor PostgREST
worker/lib/mollie.js                # betaling aanmaken en status ophalen
worker/lib/validate.js              # invoercontrole en bedragen
worker/lib/turnstile.js             # token controleren
worker/lib/notify.js                # melding naar eigenaar (provider-onafhankelijk)
supabase/migrations/0001_init.sql   # tabellen, functie, beveiliging
supabase/README.md                  # hoe je de migratie toepast
docs/ontwerp-cloudflare-supabase.md # dit document
```

`.assetsignore` (in `.gitignore`-formaat) houdt de volgende zaken **uit de openbare site**: `.git`, `node_modules`, `worker`, `supabase`, `docs`, `netlify`, `netlify.toml`, `wrangler.jsonc`, `.assetsignore`, `.dev.vars*`, `*.md`, `exports`, `.impeccable`. Dit lost meteen op dat de functiecode nu op Netlify openbaar downloadbaar is (`eetbuyt.nl/netlify/functions/create-payment.js`). Terugvaloptie als dit niet werkt zoals verwacht: alle openbare bestanden verhuizen naar een `public/`-map.

## 5. Database (Supabase, regio EU Frankfurt)

Gasten bestellen zonder account, dus klantgegevens staan op de bestelling zelf. Er is geen `customers`-tabel.

### `orders`
| Kolom | Type | Toelichting |
|---|---|---|
| `id` | uuid, pk | `gen_random_uuid()` |
| `order_number` | bigint identity | begint bij 1001, getoond als `BUYT-1001` |
| `lookup_token` | uuid, unique | geheim, voor de bedankpagina (geen volgnummer in de url) |
| `client_request_id` | uuid, unique | voorkomt dubbele bestellingen bij dubbelklikken |
| `created_at` / `updated_at` | timestamptz | |
| `status` | text | `aanvraag`, `wacht_op_betaling`, `betaald`, `betaling_mislukt`, `in_behandeling`, `verzonden`, `geannuleerd` |
| `customer_name`, `email`, `phone`, `street`, `postcode`, `city`, `note` | text | uit het afrekenformulier (`naam`, `email`, `telefoon`, `adres`, `postcode`, `plaats`, `opmerking`) |
| `total_estimate_cents` | integer | som van de bekende prijzen, in centen |
| `is_indicative` | boolean | minstens één "ca."-prijs of "prijs op gewicht" |
| `has_unpriced` | boolean | minstens één product zonder prijs per verpakking |
| `total_final_cents` | integer, null | definitief bedrag na wegen (fase 2) |
| `mollie_payment_id` | text, unique, null | |
| `mollie_status` | text, null | laatste status van Mollie |
| `paid_at` | timestamptz, null | |
| `terms_accepted_at` | timestamptz, null | voor als er voorwaarden komen |

### `order_lines`
`id`, `order_id` (fk, on delete cascade), `product_id`, `name`, `pack`, `qty` (1 t/m 50), `unit_price_cents` (null = prijs op gewicht), `price_approx` (boolean), `price_label`. Naam, verpakking en prijs zijn een **momentopname**: verandert een product later van prijs, dan blijft de oude bestelling kloppen.

### `business_requests` (vervangt formulier `bestellen`)
`id`, `created_at`, `name`, `email`, `type` (`particulier` of `zakelijk`), `message`, `status` (`nieuw`, `beantwoord`).

### `payment_events` (logboek voor de webhook)
`id`, `received_at`, `mollie_payment_id`, `mollie_status`, `order_id`. Alleen status en id, geen persoonsgegevens.

### Functie `create_order(payload jsonb)`
Eén Postgres-functie die de bestelling en alle regels **in één transactie** schrijft (PostgREST kan dat niet in één gewone aanroep). Ze regelt ook de dubbele-bestelling-check: bestaat `client_request_id` al, dan geeft ze de bestaande bestelling terug. Alleen de service-rol mag haar uitvoeren.

### Beveiliging van de tabellen
- Row Level Security **aan** op elke tabel, **zonder** policies (alles is standaard geweigerd voor `anon` en `authenticated`).
- Extra vangnet: `revoke all` op de tabellen voor `anon` en `authenticated`, en `revoke execute` op `create_order` voor iedereen behalve de service-rol.
- Verplichte test na het aanmaken: met de publieke (anon) sleutel de tabellen proberen te lezen. Dat moet niets opleveren.

### Instellingen bij het aanmaken van het Supabase-project (gekozen 25 sept 2026)
- Naam "BUYT Website", regio **Central EU (Frankfurt)**.
- **Enable Data API: aan** (de Worker gebruikt PostgREST).
- **Automatically expose new tables: uit.** Geen enkele tabel wordt vanzelf voor `anon` of `authenticated` zichtbaar.
- **Enable automatic RLS: aan.** Extra vangnet naast de eigen `enable row level security` in de migratie.
- Gevolg voor de migratie: omdat tabellen niet automatisch worden gedeeld, moet `0001_init.sql` **expliciet** de rechten geven aan de service-rol (`grant select, insert, update on ... to service_role`, en `grant execute on function create_order to service_role`). Vergeten leidt tot "permission denied" in de Worker.
- Het databasewachtwoord staat alleen in de wachtwoordmanager van de eigenaar; de Worker gebruikt het niet.

## 6. API van de Worker

Alle antwoorden zijn JSON. Foutcodes zijn korte codes (`invalid_input`, `turnstile_failed`, `server_error`), nooit interne details.

### `POST /api/order`
Aanvraag (JSON): `client_request_id`, `items` (`[{id, qty}]`), `customer` (velden zoals hierboven), `turnstile` (token), `bot-field` (honeypot, moet leeg zijn).

De Worker:
1. controleert honeypot en Turnstile (token is 5 minuten geldig en eenmalig te gebruiken),
2. valideert alles (lengtes, e-mail, postcode, `qty` 1 t/m 50 als geheel getal, bekende product-id's),
3. bepaalt de prijzen uit `data/products.json` (prijzen uit de browser worden genegeerd),
4. roept `create_order` aan,
5. stuurt een melding naar de eigenaar,
6. antwoordt met `{ ok: true, order_number, token, checkoutUrl? }`.

Fase 1: altijd status `aanvraag`, geen `checkoutUrl`. Fase 2: zie hoofdstuk 7, stroom B.

### `POST /api/request`
Zakelijke aanvraag of vraag: `name`, `email`, `type`, `message`, `turnstile`, `bot-field`. Voor bezoekers zonder JavaScript accepteert deze route ook een gewone formulierpost en stuurt dan een `303`-redirect naar `bedankt.html?s=aanvraag`.

### `POST /api/mollie-webhook` (fase 2)
Mollie stuurt `id=tr_...`. De Worker vertrouwt de inhoud niet, maar haalt de betaling zelf bij Mollie op en werkt dan de bestelling bij. Antwoordt altijd `200` bij een geldig id (Mollie probeert het anders opnieuw), en de verwerking is herhaalbaar zonder schade.

### `GET /api/order-status?t=<token>` (fase 2)
Geeft alleen `{ status }` terug, geen persoonsgegevens. Als de betaalstatus nog open staat, vraagt de Worker Mollie om de actuele status.

## 7. Stromen

**A. Bestelaanvraag (fase 1, komt overeen met de site van nu)**
1. Klant vult het afrekenformulier in en klikt op "Bestelling plaatsen".
2. `checkout.js` stuurt `POST /api/order` (met `client_request_id` uit `sessionStorage`).
3. Worker valideert, slaat op (status `aanvraag`), stuurt een melding naar de eigenaar.
4. Site leegt het mandje en gaat naar `bedankt.html?s=aanvraag`.
5. De eigenaar ziet de bestelling in het Supabase-dashboard en in zijn mail, weegt af en neemt contact op.

**B. Online betalen (fase 2)**
1. Zelfde begin, maar als online betalen aan staat én alle regels een vaste prijs hebben, maakt de Worker de Mollie-betaling aan met het bedrag dat op de server is berekend.
2. Bestelling krijgt status `wacht_op_betaling`, de Worker geeft `checkoutUrl` terug, de klant betaalt bij Mollie.
3. Mollie roept de webhook aan, de Worker haalt de betaling op en zet de bestelling op `betaald` of `betaling_mislukt`, en legt een regel vast in `payment_events`.
4. Klant komt terug op `bedankt.html?o=<token>` en ziet de status via `/api/order-status`.
5. Bij `betaald`: bevestigingsmail naar de klant, en de ganzenteller kan worden opgehoogd (zie fase 3).

**C. Betaallink na het wegen (fase 2, aanbevolen)**
Omdat de gewichten "ca." zijn, kun je vooraf geen definitief bedrag afrekenen. Daarom: de bestelling komt binnen als `aanvraag`, de eigenaar weegt af, zet `total_final_cents`, maakt een Mollie-betaallink en mailt die naar de klant. De webhook zet de status daarna automatisch op `betaald`. Zie beslissing 1.

**D. Zakelijke aanvraag**
`POST /api/request`, opslaan in `business_requests`, melding naar de eigenaar, melding in het formulier "Bedankt, je bericht is verstuurd."

## 8. Wijzigingen in de site (branch)

| Bestand | Wijziging |
|---|---|
| `afrekenen.html` | `data-netlify` en `netlify-honeypot` weg; Turnstile-widget erbij; verborgen velden `bestelling_regels` en `bestelling_totaal` vervallen (de server bouwt die zelf) |
| `index.html` (formulier `bestellen`) | `action="/api/request"`, Turnstile-widget, `data-netlify` weg |
| `js/checkout.js` | stap 1 en 2 samen tot één `fetch('/api/order')`; Netlify-adressen weg; foutmeldingen behouden |
| `js/bedankt.js` | `?o=<token>` en `/api/order-status`; `localStorage['buyt-pending']` vervalt |
| `js/main.js` (formulierblok) | versturen naar `/api/request` |
| `js/cart.js` | geen wijziging (mandje blijft in de browser) |
| `netlify/functions/*`, `netlify.toml` | blijven op de branch staan tot de livegang (dan pas weg), maar worden niet meer gebruikt |

## 9. Geheimen en instellingen

| Naam | Waar | Wie zet het |
|---|---|---|
| `SUPABASE_URL` | Worker-variabele | eigenaar (uit Supabase-project) |
| `SUPABASE_SECRET_KEY` (de nieuwe `sb_secret_...`-sleutel; de oude `service_role` wordt eind 2026 uitgefaseerd) | **Worker-geheim** (nooit in de repo of browser) | eigenaar |
| `MOLLIE_API_KEY` | Worker-geheim | eigenaar (eerst `test_`-sleutel) |
| `TURNSTILE_SECRET` | Worker-geheim | eigenaar |
| `TURNSTILE_SITEKEY` | staat openbaar in de HTML | eigenaar levert, ik zet hem erin |
| `NOTIFY_*` (afhankelijk van e-mailprovider) | Worker-geheim | eigenaar (na beslissing 2) |
| `OWNER_EMAIL` | Worker-variabele | eigenaar |

Lokaal testen gebeurt met een `.dev.vars`-bestand dat in `.gitignore` staat. Sleutels worden nooit in het gesprek of in commits gezet.

## 10. Beveiliging en privacy

- **Bewaarplicht en AVG:** klantgegevens (naam, adres, e-mail, telefoon) zijn persoonsgegevens. Supabase-project in **EU (Frankfurt)**, de verwerkersovereenkomst (DPA) van Supabase geldt zodra je hun voorwaarden accepteert (geen aparte handtekening; leg de versie en datum vast in je verwerkingsregister), privacyverklaring op de site (die ontbreekt nu). Een Amerikaans bedrijf kan door de CLOUD Act ook data uit Frankfurt moeten geven; dat hoort in de privacyverklaring.
- **Bewaartermijn:** bestellingen meestal 7 jaar (fiscale administratieplicht, controleren met de boekhouder); zakelijke aanvragen voorstel 12 maanden.
- **Spam en misbruik:** honeypot, Turnstile, strikte invoercontrole, en een simpele begrenzing per e-mailadres (bijvoorbeeld maximaal 5 bestellingen per uur, gecontroleerd in de database).
- **Webhook:** nooit de inhoud van de aanvraag vertrouwen, altijd de betaling zelf bij Mollie ophalen.
- **Geen persoonsgegevens in logboeken.**
- **Toegang tot het dashboard:** Supabase en Cloudflare beide met 2FA aan.
- **Beveiligingskoppen** (`X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`): bij het bouwen bekijken hoe dat het handigst kan met Workers (bestand `_headers` of in de Worker); Turnstile en Mollie moeten geladen kunnen worden.

## 11. Fasering en wanneer een fase klaar is

**Fase 1: bestellingen en aanvragen vastleggen** (bouwen in de eerste bouwsessie)
Klaar als: de aanvraagstroom (A) en zakelijke aanvraag (D) werken op de Cloudflare-preview met een testproject in Supabase, de eigenaar krijgt een melding, en de tests in hoofdstuk 13 slagen.

**Fase 2: online betalen**
Klaar als: met een Mollie-testsleutel de stromen B en/of C werken, de webhook herhaalbaar is, en de bedankpagina de juiste status toont.

**Fase 3: producten, voorraad, teller**
Tabel `products` (prijs per kilo, verpakking, gewicht, ingrediënten, actief, voorraad) zodat de eigenaar dat zonder code kan aanpassen, en de ganzenteller ("113") echt maken. De regel wanneer "één gans verkocht" telt is nog niet bepaald (beslissing 5).

## 12. Livegang en terugval

Voorwaarden: fase 1 (en liefst 2) getest op de preview, privacyverklaring staat online, eigenaar heeft toegang tot beide dashboards.

1. **Vooraf:** TTL van de DNS-records verlagen, alle huidige DNS-records en de e-mailinstellingen (MX, SPF, DKIM) vastleggen.
2. **Cloudflare-project** laten bouwen vanaf de branch. Tijdens de parallelle fase is die branch de "productiebranch" van het Cloudflare-project (dus op een `*.workers.dev`-adres), terwijl Netlify `main` blijft bedienen.
3. **Testronde op het `workers.dev`-adres** met echte telefoons (Amsterdam- en niet-Amsterdam-postcode, dubbelklikken, mislukte betaling, lege mandjes).
4. **Domein omzetten:** `eetbuyt.nl` toevoegen aan het Cloudflare-project. Verhuist de DNS mee naar Cloudflare, dan eerst alle bestaande records overnemen, zeker MX/e-mail.
5. **Samenvoegen:** de branch in `main` mergen en de productiebranch-instelling van het Cloudflare-project op `main` zetten.
6. **Netlify laten bestaan** (site niet verwijderen) als terugval, minimaal twee weken.
7. **Terugval:** DNS terugzetten naar Netlify. Omdat Supabase de bestellingen bewaart, blijft alles wat via Cloudflare is binnengekomen bewaard.
8. **Opruimen** na de proefperiode: Netlify Forms en Functions verwijderen, `netlify.toml` en `netlify/` uit de repo.

## 13. Testplan

Fase 1:
- Gewone aanvraag komt in `orders` en `order_lines`, met de juiste prijzen en "ca."-vlaggen (bijvoorbeeld: 2× shoarma, 1× biefstuk, 1× gerookte ganzenborst).
- Prijzen uit de browser aanpassen heeft geen effect.
- Ongeldige invoer (lege naam, slechte e-mail, `qty` 0 of 51, onbekend product) wordt geweigerd met een nette melding.
- Honeypot gevuld en verlopen of hergebruikt Turnstile-token worden geweigerd.
- Tweemaal snel op de knop klikken maakt één bestelling.
- Supabase tijdelijk onbereikbaar: klant ziet een duidelijke melding en het mandje blijft staan.
- **Beveiligingstest:** met de anon-sleutel via de REST-API van Supabase proberen `orders` te lezen en te schrijven: moet geweigerd worden.
- Er staat nergens een geheim in de repo (zoeken op `sb_secret`, `service_role`, `test_`, `live_`).
- `.assetsignore` werkt: `/worker/index.js`, `/supabase/...`, `/docs/...` en `/wrangler.jsonc` geven 404 op de preview.
- Zakelijke aanvraag zonder JavaScript werkt ook (redirect).

Fase 2:
- Mollie-testbetaling: geslaagd, mislukt, geannuleerd, verlopen.
- Webhook twee keer met dezelfde betaling: status blijft correct en er komt geen dubbele regel of mail.
- Webhook met een verzonnen id: geen fout, geen wijziging.
- Bedankpagina toont de juiste status voor elke uitkomst; verkeerd of verlopen token toont "onbekend".
- Let op: Mollie kan `localhost` niet bereiken, dus de webhook wordt op de preview getest (niet lokaal).

## 14. Beslissingen die alleen de eigenaar kan nemen

1. **Online betalen met "ca."-prijzen.** De prijs per verpakking is een schatting, dus een bedrag vooraf afrekenen kan te veel of te weinig zijn. Opties: (a) betaallink na het wegen (stroom C, mijn advies), (b) een vaste prijs per verpakking invoeren (en het gewicht als richtgewicht noemen), (c) alleen aanvragen blijven doen. Met de huidige productlijst zou online betalen alleen werken voor een mandje met uitsluitend gerookte ganzenborst (de enige met een vaste prijs).
2. **E-mailprovider** voor meldingen en klantbevestigingen (bijvoorbeeld Resend of een vergelijkbare dienst; actuele prijzen en voorwaarden nog na te lopen). Vereist ook DNS-instellingen (SPF/DKIM) voor `eetbuyt.nl`.
3. **Waar staat `eetbuyt.nl` geregistreerd** en heb je e-mail op dat domein? Bepalend voor de livegang.
4. **Supabase gratis of Pro ($25 per maand) bij de start.** Gratis projecten worden na een week zonder verzoeken gepauzeerd. Mijn advies: gratis voor het bouwen, Pro bij livegang.
5. **Regel voor de ganzenteller:** hoeveel producten tellen als één gans? (Nu is dat niet vastgelegd.)
6. **Juridisch vóór livegang** (buiten de code, met advies): privacyverklaring, algemene voorwaarden, herroepingsrecht (versheid/bederfelijke waar), allergeneninformatie, KvK- en btw-gegevens op de site.

## 15. Wat jij doet en wat ik doe

Jij (kan ik niet doen):
- Supabase-account en project aanmaken (regio EU Frankfurt), 2FA aanzetten, DPA-versie en datum vastleggen.
- Cloudflare-project koppelen aan de GitHub-repo, productiebranch op `cloudflare-supabase` zetten.
- Turnstile-widget aanmaken.
- Sleutels als geheimen in Cloudflare zetten (Mollie-testsleutel, Supabase service-sleutel, Turnstile-geheim).
- E-mailprovider kiezen en account aanmaken.
- Beslissingen uit hoofdstuk 14.

Ik:
- Alle code, de SQL-migratie, de testscripts en de handleiding.
- De branch bijhouden en de wijzigingen uitleggen (in Nederlands).
- De tests uitvoeren die lokaal kunnen, en jou de tests op de preview laten doen die alleen daar kunnen.

## 16. Nog te verifiëren tijdens het bouwen

Deze punten heb ik in de documentatie gezien maar niet zelf in de praktijk getest:
- De nieuwe Supabase-sleutel (`sb_secret_...`) moet bij PostgREST in de **`apikey`-header** worden meegestuurd (niet als Bearer-token). Er is een meldbaar probleem dat nieuwe secret-sleutels op sommige nieuwe projecten "Invalid API key" geven; dat testen we meteen, met de oude `service_role`-sleutel als terugval.
- Of `_headers` en `_redirects` in Workers-statische-bestanden werken zoals in Pages (de samenvatting van de documentatie was hierover onduidelijk).
- Of `.assetsignore` alle genoemde paden weghoudt (test staat in het testplan).
- Hoe geheimen precies worden gezet bij Workers Builds (dashboard, per Worker).
- Prijzen en limieten van de gekozen e-mailprovider, Turnstile en Cloudflare-logboeken.
- Of Supabase-back-ups bij het gratis of Pro-plan aan staan en hoe lang.
- Een reeds gevonden risico op `main`: `create-payment.js` weigert nu alleen producten zonder prijs, maar een mandje met "ca."-prijzen zou bij `paymentsLive: true` worden afgerekend alsof het een vast bedrag is. Nu staat online betalen uit, dus dit slaapt. In de branch wordt dit direct dichtgezet (geen betaling voor indicatieve mandjes).

## 17. Handoff naar een nieuwe chat

Plak dit als eerste bericht:

> We bouwen fase 1 van `docs/ontwerp-cloudflare-supabase.md` op de branch `cloudflare-supabase` (repo `BUYT-Company/eetBUYT`). Lees dat document en `PRODUCT.md` eerst. Raak `main` en de Netlify-site niet aan. Werk in het Nederlands. Commit en push alleen als ik het vraag. Zet nooit sleutels in bestanden of in het gesprek. Begin met `wrangler.jsonc`, `.assetsignore`, `worker/` en `supabase/migrations/0001_init.sql`.
