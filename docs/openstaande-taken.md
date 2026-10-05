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

## Search Console
Domein-eigenschap `eetbuyt.nl` is geverifieerd (DNS-record in Cloudflare, niet verwijderen). Gekoppeld aan GA4.

- [ ] **Sitemap**: `https://eetbuyt.nl/sitemap.xml` is ingediend en stond op "Kan niet ophalen". Controleer of dat naar "Geslaagd" verandert. Zo niet na twee dagen: opnieuw bekijken.
- [ ] **Indexering aanvragen** voor `https://eetbuyt.nl/` via de URL-inspectie (optioneel, versnelt het).
- [ ] Zorg dat het **juiste e-mailadres Eigenaar** is (Instellingen → Gebruikers en rechten), net als bij Analytics.

## Overige
- [ ] **Netlify** minimaal twee weken laten staan als terugval. Daarna Netlify Forms en Functions opruimen, en `netlify.toml` en `netlify/` uit de repo halen (zie het ontwerpdocument §12).
- [ ] **BIMI-certificaat** (CMC of VMC) voor Gmail en Apple Mail: bewust uitgesteld, zie [bimi-instellen.md](bimi-instellen.md).
- [ ] **Privacyverklaring** bijwerken zodra er iets verandert aan partijen of gegevens (bezorgdienst, Mollie, nieuwsbriefprogramma).
- [ ] **Pagina `zakelijk-bestellen.html` maken** (besluit 5 okt 2026). De knop "Naar zakelijk bestellen" in het zakelijke blok op de homepage (`public/index.html`, regel ~271) verwijst er al naar; tot de pagina er is geeft die link bewust een 404. Eerst inspiratie verzamelen. Als de site druk bezocht wordt voordat de pagina klaar is, overweeg dan de link tijdelijk naar `#vragen` te laten wijzen.

## Klaar
- [x] Domein `eetbuyt.nl` en `www.eetbuyt.nl` op Cloudflare; `www` stuurt door naar `eetbuyt.nl`, `http` naar `https`.
- [x] Verkoopschakelaar (`SALES_OPEN`): productenblok geblurd, bestellen dicht voor bezoekers, beheerders kunnen doorwerken.
- [x] Cookiebanner met Consent Mode v2; GA4 laadt alleen na toestemming.
- [x] Privacyverklaring online (`/privacy`), gelinkt in de banner en de footer.
- [x] Search Console geverifieerd en gekoppeld aan GA4; `robots.txt`, `sitemap.xml` en canonical-tags staan.
- [x] Turnstile werkt op `eetbuyt.nl` (nieuwsbriefaanmelding getest).
- [x] BIMI-records wijzen naar `https://eetbuyt.nl/assets/bimi-logo.svg`; DMARC staat streng.
