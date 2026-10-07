# Analytics in het beheer koppelen (Google Analytics en Search Console)

De pagina **Analytics** in het beheer leest de cijfers zelf uit Google. Dat gebeurt met een **serviceaccount** dat alleen leesrechten heeft. Zonder deze koppeling toont de pagina een uitleg in plaats van cijfers.

## Eenmalig instellen

Doe dit ingelogd met het Google-account dat eigenaar is van Analytics en Search Console.

**1. Google Cloud-project en API's**
1. Ga naar [console.cloud.google.com](https://console.cloud.google.com) en maak een project, bijvoorbeeld `buyt-beheer`.
2. Ga naar **API's en services → Bibliotheek** en zet **Google Analytics Data API** en **Google Search Console API** aan.

**2. Serviceaccount met sleutel**
3. **IAM en beheer → Serviceaccounts → Serviceaccount maken**, naam bijvoorbeeld `buyt-beheer-lezen`. Rollen zijn niet nodig.
4. Open het serviceaccount, tabblad **Sleutels → Sleutel toevoegen → Nieuwe sleutel maken → JSON**. Het bestand dat je downloadt, is een **geheim**: niet delen, niet in git, veilig bewaren.
5. Kopieer het e-mailadres van het serviceaccount (eindigt op `iam.gserviceaccount.com`).

**3. Toegang geven**
6. Analytics: Beheer → **Toegangsbeheer voor property** → `+` → het e-mailadres, rol **Kijker**.
7. Search Console: Instellingen → **Gebruikers en rechten** → Gebruiker toevoegen → het e-mailadres, rechten **Beperkt**.
8. Analytics: Beheer → **Property-details** → noteer het **Property-ID** (alleen cijfers).

**4. In de Worker**
9. Cloudflare → Workers & Pages → `buyt-website` → Settings → **Variables and Secrets** → **Secret** `GOOGLE_SA_JSON` met als waarde de **volledige inhoud** van het JSON-bestand.
10. Zet het Property-ID in [wrangler.jsonc](../wrangler.jsonc) bij `GA4_PROPERTY_ID` (een gewone instelling, geen geheim) en push. De Search Console-eigenschap staat al op `sc-domain:eetbuyt.nl`.

## Wat de pagina toont
- **Bezoek:** bezoekers, sessies, bekeken pagina's, en de gebeurtenissen `add_to_cart`, `purchase`, `generate_lead` en `sign_up`, elk met de verandering ten opzichte van de vorige periode (even lang). Een grafiek van bezoekers per dag, herkomst van bezoekers, bronnen (bijvoorbeeld `instagram / bio`) en de best bezochte pagina's.
- **Verkoop (uit de database, geen Google nodig):** bestellingen, omzet en gemiddelde bestelwaarde, met grafieken van bestellingen en omzet per dag.
- **Waar wordt besteld?** Een rangschikking per plaats. De zes steden van het bezorggebied (Amsterdam, Amstelveen, Haarlem, Utrecht, Rotterdam en Den Haag) staan altijd bovenaan, ook met nul bestellingen, en alle andere plaatsen staan ernaast. Verschillende schrijfwijzen worden samengevoegd ("amsterdam", "Amsterdam Zuidoost", "'s-Gravenhage" voor Den Haag). Kies tussen deze periode en sinds het begin. Het bezorggebied staat in `worker/lib/cities.js` (`DELIVERY_CITIES`) en is aan te passen.
- **Zoekverkeer:** klikken, vertoningen, gemiddelde positie, een grafiek van klikken per dag en de zoektermen waarop jullie gevonden worden.
- **Grafieken:** elke grafiek toont deze periode als staven en de vorige periode als lichte lijn erachter (dag 1 naast dag 1). Zo zie je in één blik of het beter of slechter gaat. Beweeg over een staaf voor het exacte getal.
- De periode loopt t/m gisteren. Search Console loopt twee tot drie dagen achter.

## Wat je moet weten
- **Het is een deel van de bezoekers.** Analytics telt alleen bezoekers die cookies accepteren. Bestellingen komen uit de database en zijn leidend.
- **Bezoek vanuit socials** zie je pas als links een herkomstcode hebben. Gebruik bijvoorbeeld in je Instagram-profiel `https://eetbuyt.nl/?utm_source=instagram&utm_medium=bio`.
- De antwoorden van Google worden een half uur bewaard. De eerste cijfers van een nieuwe koppeling kunnen een dag op zich laten wachten.
- **Alleen bezoek aan `eetbuyt.nl` telt mee.** Bezoek vanaf je eigen ontwikkelomgeving (`localhost`) of een voorbeeldadres wordt eruit gefilterd.
- Zonder genoeg gegevens in de vorige periode (minder dan 3) staat er geen percentage.

## Als het niet lukt
| Melding op de pagina | Oorzaak |
|---|---|
| Geen toegang | Het e-mailadres van het serviceaccount is niet toegevoegd (Analytics: Kijker, Search Console: Beperkt). |
| Deze Google-API staat nog uit | De Data API of de Search Console API is niet aangezet in het Google Cloud-project. |
| Niet gevonden | Het Property-ID klopt niet of `SEARCH_CONSOLE_SITE` hoort bij een andere eigenschap. |
| De sleutel voor Google is niet geldig | `GOOGLE_SA_JSON` is niet de volledige inhoud van het JSON-bestand, of de sleutel is ingetrokken. |

## Sleutel vervangen of intrekken
Maak in Google Cloud een nieuwe sleutel, zet hem in `GOOGLE_SA_JSON`, en verwijder daarna de oude sleutel bij het serviceaccount.
