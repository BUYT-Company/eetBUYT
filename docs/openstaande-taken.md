# Openstaande taken (stand 5 oktober 2026)

Wat al klaar is staat onderaan. Vink af en verwijder wat klaar is.

## Vóór de verkoop opengaat
Volg daarvoor [verkoop-openzetten.md](verkoop-openzetten.md), met de standaardprompt en de volledige checklist.

- [ ] **KvK-nummer**: inschrijving op 19 oktober 2026. Daarna invullen in `public/privacy.html` (zin "KvK-nummer: volgt na inschrijving ...") en in de footer.
- [ ] **Verwerkersovereenkomsten (DPA's)** controleren en vastleggen: Supabase, Cloudflare, Resend, Google (Analytics). De privacyverklaring zegt dat die er zijn.
- [ ] **Algemene voorwaarden, herroepingsrecht, allergeneninformatie** online zetten.
- [ ] **Zakelijke rekening** openen, daarna Mollie instellen (`MOLLIE_API_KEY`).
- [ ] **Bezorgdienst** kiezen. Zodra die vaststaat: privacyverklaring bijwerken.
- [ ] **Prijzen, verzendkosten en bezorggebied** definitief maken (`public/data/products.json`).
- [ ] **Verkoop openzetten** (`SALES_OPEN` op `"true"`) pas als logistiek en supply chain staan.

## Google Analytics (GA4)
Property `eetbuyt.nl`, Meetwaarde-ID `G-6250HQTQH2`. De bewaartermijn staat op 14 maanden.

- [ ] **Eigen IP-adressen uitsluiten** (thuis en kantoor): Google-tag → Alle instellingen weergeven → Intern verkeer definiëren. Daarna in Beheer → Gegevensinstellingen → Gegevensfilters het filter "Intern verkeer" van Testen op Actief zetten.
- [ ] **Juiste e-mailadres als Beheerder** toevoegen in Analytics (Beheer → Toegangsbeheer voor account) en daarna het verkeerde adres verwijderen. Dubbelcheck dat het juiste adres Beheerder is voor je het oude verwijdert.
- [ ] **Sleutelgebeurtenissen**: zodra `purchase` en `generate_lead` voor het eerst binnenkomen, markeren als sleutelgebeurtenis (Beheer → Gebeurtenissen).
- [ ] **Search Console-rapporten zichtbaar maken**: Rapporten → Bibliotheek → collectie "Search Console" toevoegen. Verschijnt pas na ongeveer een dag met zoekverkeer.
- [ ] **Realtime-test** op `https://eetbuyt.nl`: privévenster, Accepteren, kijken of je verschijnt. En Weigeren: dan mag er niets verschijnen.

### Analytics en privacy: wat je zelf in Google moet controleren
De privacyverklaring (`/privacy`) zegt dat Google als verwerker werkt en geen gegevens voor eigen doeleinden gebruikt. Dat moet in je account ook zo staan:
- [x] **Gegevensverwerkingsvoorwaarden geaccepteerd** (6 okt 2026 gecontroleerd: geaccepteerd op 5 oktober 2026).
- [x] **Instellingen voor gegevens delen:** alle vier de vinkjes uit (gecontroleerd 6 okt 2026).
- [x] **Google-signalen uit** (knop "Aanzetten" niet gebruikt), **advertentiepersonalisatie uit** voor alle regio's (0 van 307), en de "Erkenning van verzameling van gebruikersgegevens" is bewust niet bevestigd (gecontroleerd 6 okt 2026). Laat dat zo, tenzij we later Google-signalen of advertenties gaan gebruiken; dan eerst de privacyverklaring en de banner aanpassen.
- [ ] **Verzameling van gedetailleerde locatie- en apparaatgegevens** staat aan; dat klopt met de verklaring ("globale locatie (stad)"). Zet je het uit, pas dan de verklaring aan.
- [ ] **Bewaring 14 maanden:** staat al goed (Beheer → Gegevensbewaring), en zet "Gebruikersgegevens opnieuw instellen bij nieuwe activiteit" aan.
- [ ] **Verwerkingsregister** bijhouden (art. 30 AVG): per verwerking wat, waarom, wie, hoelang, welke partijen. De tabel in de privacyverklaring is een goede basis; ik kan er een intern document van maken.
- [ ] **Cookiekeuze en bewaartermijn horen bij elkaar:** de banner onthoudt de keuze 12 maanden en vraagt daarna opnieuw; de verklaring zegt hetzelfde. Wijzig je het één, pas dan het ander aan (`public/js/consent.js`, `MAX_AGE`, en de alinea Cookies in `public/privacy.html`).

## Search Console
Domein-eigenschap `eetbuyt.nl` is geverifieerd (DNS-record in Cloudflare, niet verwijderen). Gekoppeld aan GA4.

- [ ] **Sitemap**: `https://eetbuyt.nl/sitemap.xml` is ingediend en stond op "Kan niet ophalen". Controleer of dat naar "Geslaagd" verandert. Zo niet na twee dagen: opnieuw bekijken.
- [ ] **Indexering aanvragen** voor `https://eetbuyt.nl/` via de URL-inspectie (optioneel, versnelt het).
- [ ] Zorg dat het **juiste e-mailadres Eigenaar** is (Instellingen → Gebruikers en rechten), net als bij Analytics.

## Overige
- [ ] **Netlify** minimaal twee weken laten staan als terugval. Daarna Netlify Forms en Functions opruimen, en `netlify.toml` en `netlify/` uit de repo halen (zie het ontwerpdocument §12).
- [ ] **BIMI-certificaat** (CMC of VMC) voor Gmail en Apple Mail: bewust uitgesteld, zie [bimi-instellen.md](bimi-instellen.md).
- [ ] **Privacyverklaring** bijwerken zodra er iets verandert aan partijen of gegevens (bezorgdienst, Mollie, nieuwsbriefprogramma).
- [ ] **Pagina `zakelijk-bestellen.html`**: eerste versie staat er (offerteaanvraag, 5 producten, 3 stappen, Timme/Skip/Hidde met e-mail, formulier). Nog te doen: echte portretfoto's in plaats van de uitsneden uit de teamfoto (`public/assets/team/`), controleren of de namen bij de juiste gezichten staan, zakelijke prijzen/afname/levering invullen zodra ze vaststaan, een FAQ zodra de antwoorden er zijn. De worker moet opnieuw uitgerold worden (`validate.js` voegt nu de bedrijfsnaam toe aan het bericht).

## Ontwerp en bouw (later)
- [ ] **BUYT Beheer-portaal en dashboard** (in de stijl van Shopify) ontwerpen en bouwen. Nu is er alleen een eenvoudige bestellijst en detailpagina: `worker/lib/admin.js` (`listOrders`, `orderDetail`) achter de login in `worker/lib/adminAuth.js` (wachtwoord + 2FA, `/admin/...`). Een dashboard zou onder andere kunnen tonen: bestellingen van vandaag en deze week, omzet, openstaande aanvragen en bezorgmomenten per dag. Dit hoort bij het ontwerpdocument ("Fase 3: producten, voorraad, teller").
- [ ] **E-mail "Bedankt voor je bestelling"** opnieuw ontwerpen. De huidige template staat in `worker/lib/emailTemplates.js` (`orderConfirmationEmail` voor de klant, `orderInternalEmail` voor jullie zelf), verstuurd via Resend (`worker/lib/resend.js`). Denk aan huisstijl, een duidelijke samenvatting, bezorgmoment en contactgegevens, en test in Gmail, Outlook en Apple Mail, zowel licht als donker.

## Klaar
- [x] Domein `eetbuyt.nl` en `www.eetbuyt.nl` op Cloudflare; `www` stuurt door naar `eetbuyt.nl`, `http` naar `https`.
- [x] Verkoopschakelaar (`SALES_OPEN`): productenblok geblurd, bestellen dicht voor bezoekers, beheerders kunnen doorwerken.
- [x] Cookiebanner met Consent Mode v2; GA4 laadt alleen na toestemming.
- [x] Privacyverklaring online (`/privacy`), gelinkt in de banner en de footer.
- [x] Search Console geverifieerd en gekoppeld aan GA4; `robots.txt`, `sitemap.xml` en canonical-tags staan.
- [x] Turnstile werkt op `eetbuyt.nl` (nieuwsbriefaanmelding getest).
- [x] BIMI-records wijzen naar `https://eetbuyt.nl/assets/bimi-logo.svg`; DMARC staat streng.
