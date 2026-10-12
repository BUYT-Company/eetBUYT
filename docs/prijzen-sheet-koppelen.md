# Prijzen uit Google Sheets

De prijzen van de losse producten komen uit een **privé Google Sheet**. Pas je daar een prijs aan, dan staat hij binnen ongeveer 5 minuten op de site, zonder dat er iets gepusht of gedeployd hoeft te worden.

## Hoe het werkt
- De Worker logt in met hetzelfde serviceaccount als de Analytics-koppeling (`GOOGLE_SA_JSON`, zie [analytics-koppelen.md](analytics-koppelen.md)) en leest het eerste tabblad, alleen lezen.
- Het sheet bepaalt **alleen** de prijs per kilo, het gewicht en de prijs per verpakking. Namen, foto's, ingrediënten en allergenen blijven in [public/data/products.json](../public/data/products.json).
- Winkelwagen en productkaarten halen de prijzen op bij `/api/products`. Een bestelling wordt op de server nagerekend met dezelfde prijzen, dus de browser kan nooit een eigen prijs doorgeven.
- Elke waarde wordt gecontroleerd. Geen getal, nul, negatief of boven € 500 (gewicht boven 20 kg)? Dan wordt die cel genegeerd en geldt de waarde uit `products.json`. Is Google even niet bereikbaar, dan blijven de laatst gelezen prijzen staan.

## Het sheet
Eerste tabblad, kopregel met deze kolommen (volgorde en lege kolommen maken niet uit, de kopregel mag ook lager staan):

| id | gram | verkoopprijs | prijs_per_kg |
|---|---|---|---|

- **id**: de productnaam. Hoofdletters, spaties en tekst tussen haakjes ("(2st)") tellen niet mee, dus "Ganzen biefstuk (2st)" hoort bij Ganzenbiefstuk. Je kunt ook het id van de site gebruiken (`ganzenbiefstuk`).
- **verkoopprijs**: prijs per verpakking. Ontbreekt die, dan rekent de Worker `prijs_per_kg × gram`.
- Bedragen mogen `12`, `12,50`, `12.50` of `€ 12,50` zijn.
- Rijen voor producten die niet op de site staan (nu: alles behalve de vijf losse producten) worden genegeerd. Een product dat niet in het sheet staat, houdt de prijs uit `products.json`.
- Andere kolomnamen kan de Worker ook herkennen, zie `COLUMNS` in [worker/lib/sheetPrices.js](../worker/lib/sheetPrices.js).

## Eenmalig instellen
1. **Sheets API aanzetten:** Google Cloud-project van het serviceaccount (`buyt-beheer`) → API's en services → Bibliotheek → **Google Sheets API** → Inschakelen.
2. **Sheet delen met het serviceaccount:** open het sheet → Delen → het e-mailadres van het serviceaccount (eindigt op `iam.gserviceaccount.com`) → rol **Lezer**.
3. **Sheet weer privé maken:** Delen → Algemene toegang → **Beperkt**. Het serviceaccount houdt zijn toegang. Controleer ook dat **Bestand → Delen → Publiceren op internet** uit staat.
4. **Deployen:** `PRICES_SHEET_ID` staat al in [wrangler.jsonc](../wrangler.jsonc). Het geheim `GOOGLE_SA_JSON` staat al in Cloudflare.

## Controleren en problemen
- Open `https://eetbuyt.nl/api/products`: daar staan de prijzen zoals de site ze nu gebruikt, in centen.
- Staat daar nog de oude prijs? Wacht 5 minuten. Daarna: Cloudflare → Workers → `buyt-website` → Logs. `prijzen_sheet_fout niet_gevonden` = sheet niet gedeeld met het serviceaccount; `api_uit` = Sheets API staat nog uit; `geen_toegang` = rol of account fout; `prijzen_sheet_leeg_of_onleesbaar` = kopregel niet herkend.
- Lokaal (zonder Worker) gebruikt de site gewoon `products.json`.
