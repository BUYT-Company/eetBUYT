# Kaart van bestellingen (Analytics)

Op de pagina **Analytics** staat een Google Maps-kaart met een stip per bestelling en een grote cirkel om het (voorlopige) bezorggebied. Stippen **binnen** de cirkel zijn Lentelimoen (`#D8ED36`), stippen **erbuiten** zijn Paprikakoraal (`#FF6652`). Klik op een stip voor het bestelnummer en de plaats.

## Eenmalig instellen

**1. Database bijwerken**
Voer `supabase/migrations/0009_bestelkaart.sql` uit in Supabase (SQL Editor). Opnieuw uitvoeren kan zonder schade. Tot dan toont de kaart de melding "De kaart werkt pas nadat de database is bijgewerkt".

**2. Google Maps-sleutel**
In het Google Cloud-project `BUYT-beheer` (hetzelfde als voor Analytics):
1. **API's en services → Bibliotheek:** zet **Maps JavaScript API** aan.
2. **Facturering:** koppel een betaalrekening aan het project. Google vraagt dit voor Maps, ook voor het gratis tegoed. Een beheerkaart die door een paar mensen wordt bekeken, blijft ruim binnen het maandelijkse tegoed (op moment van schrijven 200 dollar). Zet bij **Facturering → Budgetten en meldingen** een melding op bijvoorbeeld 5 euro, zodat je het merkt als dat verandert.
3. **API's en services → Inloggegevens → Inloggegevens maken → API-sleutel.**
4. Beperk de sleutel (belangrijk, want hij staat in de pagina):
   - **Toepassingsbeperkingen:** Websites (HTTP-verwijzers) met `https://eetbuyt.nl/*` en `https://www.eetbuyt.nl/*`.
   - **API-beperkingen:** alleen **Maps JavaScript API**.
5. Zet de sleutel in [wrangler.jsonc](../wrangler.jsonc) bij `GOOGLE_MAPS_KEY` en push. Dit is een gewone instelling: een Maps-sleutel hoort in de browser te staan en is daarom geen geheim, mits hij beperkt is zoals hierboven.
6. Optioneel: zet bij **Kwota** van de Maps JavaScript API een dagelijkse limiet als extra veiligheid tegen onverwachte kosten.

## Hoe het werkt
- **Van adres naar punt:** het beheer zoekt het adres op via **PDOK Locatieserver**, een gratis dienst van de Nederlandse overheid (Kadaster). Er is geen sleutel voor nodig en adressen gaan niet naar Google voor het opzoeken. Het punt wordt bij de bestelling bewaard (`lat`, `lng`, `geocoded_at`), dus het gebeurt per bestelling één keer. Bij elke keer openen van de pagina worden maximaal 40 nog niet opgezochte bestellingen verwerkt; staan er meer, dan zie je een melding en vernieuw je de pagina.
- **Nauwkeurigheid:** het resultaat moet in dezelfde postcode liggen als het adres. Lukt dat niet, dan wordt het midden van de postcode gebruikt. Vindt PDOK niets, dan staat de bestelling niet op de kaart en zie je dat in een melding.
- **De cirkel:** de kleinste cirkel om de middelpunten van Amsterdam, Amstelveen, Haarlem, Utrecht, Rotterdam en Den Haag, plus 6 km marge (`worker/lib/geo.js`). Het middelpunt ligt rond Leiden/Alphen en de straal is ongeveer 35 km. Plaatsen tussen de steden (zoals Zaandam, Leiden, Delft, Hoofddorp) vallen er dus ook binnen. Dit is bewust ruw: zodra TringTring definitief is, vervangen we de cirkel door postcodes.
- **Privacy:** op de pagina staan alleen bestelnummer, plaats en een punt (afgerond op ongeveer 10 meter). Geen naam, straat, postcode of e-mailadres.
- **Beveiliging:** alleen de kaartpagina krijgt een iets ruimere `Content-Security-Policy` (Google Maps heeft extra bronnen nodig). Alle andere beheerpagina's blijven streng.

## Aanpassen
- **Andere steden of een ander gebied:** pas `DELIVERY_CITIES` in `worker/lib/cities.js` en de middelpunten in `worker/lib/geo.js` (`CITY_CENTERS`) aan. De cirkel wordt vanzelf opnieuw berekend. De marge staat in `AREA_MARGIN_KM`.
- **Later op de afrekenpagina:** `DELIVERY_AREA` en `insideArea()` uit `worker/lib/geo.js` en `geocodeOrder()` uit `worker/lib/geocode.js` zijn los van het beheer te hergebruiken om bij het bestellen te controleren of een adres binnen het bezorggebied valt. Houd er rekening mee dat Google Maps op de publieke site de privacyverklaring en de cookiekeuze raakt (zie hieronder).

## Als het niet lukt
| Je ziet | Oorzaak |
|---|---|
| "De kaart is nog niet gekoppeld" | `GOOGLE_MAPS_KEY` in `wrangler.jsonc` is leeg. |
| "De kaart werkt pas nadat de database is bijgewerkt" | Migratie 0009 is nog niet uitgevoerd. |
| "Google Maps kon niet laden. Controleer de API-sleutel…" | De Maps JavaScript API staat niet aan, er hangt geen betaalrekening aan het project, of `eetbuyt.nl` staat niet bij de toegestane websites van de sleutel. |
| Een grijs vlak met "De kaart wordt geladen…" blijft staan | Een extensie of adblocker blokkeert Google Maps, of de sleutel is niet goed overgenomen. Kijk in de browserconsole (F12). |
| "Nog N adressen worden opgezocht" | PDOK was even niet bereikbaar of er waren meer dan 40 nieuwe adressen. Vernieuw de pagina. |

## Privacyverklaring bijwerken
- **PDOK (Kadaster):** straat, postcode en plaats van besteladressen gaan naar PDOK om er een punt van te maken. Noem dit bij de partijen met wie gegevens worden gedeeld.
- **Google Maps:** de kaartbeelden komen van Google en jouw browser maakt verbinding met Google. Dat speelt nu alleen in het beheer. Zet je Google Maps later op de publieke afrekenpagina, dan moet de privacyverklaring dat noemen en moet je beoordelen of dat toestemming vraagt in de cookiebanner.
