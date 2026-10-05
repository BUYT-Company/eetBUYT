# Brief: pagina `zakelijk-bestellen.html`

Startpunt voor het ontwerp van de zakelijke pagina. Stand 5 oktober 2026. Nog niets gebouwd: de link op de homepage geeft bewust een 404 tot de pagina er is.

## Doel en doelgroep
- Horeca, chefs, evenementen en bars winnen en laten bestellen of een offerte aanvragen. Geen winkelmandje, geen online betaling (zie `PRODUCT.md`, principe 3: de stromen niet mengen).
- Succes: een zakelijke aanvraag in zo min mogelijk klikken (`generate_lead` in GA4 staat al klaar).

## Wat er al ligt
| Onderdeel | Waar |
|---|---|
| Ingang vanaf de homepage | `public/index.html` regel ~264–275: blok `#zakelijk`, knop "Naar zakelijk bestellen" → `zakelijk-bestellen.html`, tweede knop "Word partner" → `#vragen` |
| Foto voor dit blok | `public/assets/zakelijk-ganzen-v-formatie.jpg` |
| Aanvraagformulier (voorbeeld) | `public/index.html` regel ~605: `form[name="bestellen"]`, POST `/api/request`, Turnstile, verborgen honeypot `bot-field`, radio `type` (`particulier`/`zakelijk`), optioneel telefoonnummer |
| Formulierlogica | `public/js/main.js` regel ~422–452 (let op: zoekt `form[name="bestellen"]`; telefoon gaat bovenaan het bericht mee, want de database heeft geen telefoonkolom) |
| Backend | `worker/index.js` (`/api/request`), validatie in `worker/lib/validate.js`, opslag in Supabase `business_requests`, melding naar de eigenaar |
| Gedeelde kop, footer, stijl | `public/verhaal.html` is de beste sjabloon voor een subpagina (header, skip-link, `js/subpage.js`, `css/style.css`) |
| Productdata | `public/data/products.json` (5 producten, per kilo, prijzen nog concept) |
| Huisstijl (bindend) | `Inspiratie website/buyt-huisstijlvoorstel.html`; tokens in `public/css/style.css` (`--green`, `--lime`, `--coral`, `--cream`, `--ink`; Bricolage Grotesque + DM Sans) |

## Beslissingen die jij nog moet nemen
Dit zijn de vragen waar de inspiratie antwoord op moet geven.
1. **Bestellen of offerte?** Een vast assortiment met zakelijke prijzen en een bestellijst, of alleen "vertel wat je nodig hebt" met een offerte?
2. **Zakelijke prijzen en afname**: staffels, minimale afname, verpakking (bijvoorbeeld per 5 kg of per hele gans), levertijd? Staat nu nergens vast.
3. **Levering aan horeca**: gelden de donderdag- en zaterdagslots ook voor zakelijk, of komt er een eigen route? Gebied en kosten zijn nog open.
4. **Welke velden** moet het formulier hebben (bedrijfsnaam, type zaak, gewenste producten en hoeveelheden, gewenste leverdatum, KvK/btw-nummer)? Elk extra veld vraagt een aanpassing in `validate.js` en de database.
5. **Bewijs**: er zijn geen echte foto's, klantcases of reviews. Alleen ophalen wat waar is (zie `PRODUCT.md`, "Evidence on Hand").
6. **Wat met de knop "Word partner"** op de homepage? Zelfde pagina, of een eigen route voor partners en evenementen?

## Mogelijke opbouw (om bij de inspiratie te toetsen)
1. Kop met één belofte en één knop naar het formulier.
2. Waarom BUYT voor de keuken (wild, Nederlands, van prullenbak naar bord), alleen bevestigde feiten.
3. Producten voor de keuken: de vijf producten, per kilo, met een regel over gebruik.
4. Zo werkt zakelijk bestellen (aanvraag → bevestiging → levering).
5. Aanvraagformulier, bovenaan bereikbaar via een kleverige knop op mobiel.
6. Veelgestelde vragen (pas invullen als de antwoorden vaststaan).

## Inspiratie verzamelen: waar op letten
Per voorbeeldsite noteren (screenshot in `Inspiratie website/zakelijk/`):
- Wat zie je in de eerste scherm-hoogte, en wat is de ene actie?
- Prijzen openbaar, of pas na inloggen of aanvragen?
- Hoeveel velden heeft het aanvraagformulier, en wat volgt na verzenden?
- Hoe tonen ze producten voor professionals (specificaties, gewichten, snijwijze, bereidingstips)?
- Hoe zetten ze vertrouwen neer zonder klantcases (herkomst, certificeringen, proefpakket)?

Goede soorten referenties: slagers en wildhandelaren met een horecapagina, B2B-bestelpagina's van versleveranciers, bezorgers van verse producten aan restaurants, en merken die kleine batches verkopen aan chefs.

## Als je terug bent
Stuur de screenshots of links en je antwoorden op de punten hierboven. Dan:
1. kies ik een opbouw en laat die zien als schets;
2. bouw ik `public/zakelijk-bestellen.html` op basis van `verhaal.html`, met hergebruik van formulier en stijl;
3. pas ik zo nodig `validate.js` en de Supabase-migratie aan voor extra velden;
4. voeg ik de pagina toe aan `sitemap.xml`, de navigatie en `docs/openstaande-taken.md`.
