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
- [x] **Bewaring 14 maanden** voor gebeurtenis- en gebruikersgegevens, met "Resetten bij nieuwe gebruikersactiviteit" **uit**, zodat 14 maanden een harde grens is (ingesteld 6 okt 2026; gaat na 24 uur in).
- [x] **Verwerkingsregister** (art. 30 AVG) opgesteld op 6 okt 2026: `intern/verwerkingsregister.xlsx` is de hoofdversie (staat bewust **niet** in git, want de repository is openbaar); Word en PDF zijn kopieën. Zet een kopie op een gedeelde plek voor de drie vennoten en herzie het jaarlijks en bij elke wijziging.
- [x] **TransIP** staat in de privacyverklaring (mailhost van `@eetbuyt.nl`).
- [ ] **Netlify**: controleren of er nog opgeslagen formulierdata is die je bij het opruimen moet verwijderen.
- [ ] **Verwerkersovereenkomsten vastleggen** voor Supabase, Cloudflare, Resend, Pushover en TransIP (Google is al geaccepteerd); noteer de datum in het register.
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
- [ ] **BUYT Beheer, ronde 1 uitrollen** (gebouwd op 6 okt 2026, zie [ontwerp-beheerportaal.md](ontwerp-beheerportaal.md)). Volgorde is belangrijk:
  1. Voer `supabase/migrations/0006_beheer_ronde1.sql` uit in Supabase (SQL Editor). Pas daarna uitrollen, anders kan niemand inloggen (de login gebruikt de nieuwe tabellen).
  2. Push de branch; wacht tot Cloudflare klaar is.
  3. Controleer: inloggen met wachtwoord en code, Home, een testbestelling plaatsen (als beheerder) en doorzetten naar Onderweg en Bezorgd, controleer de twee mails en de tijdlijn.
  4. Controleer of de oude statussen in Supabase netjes zijn omgezet (`select status, count(*) from orders group by 1`).
- [ ] **BUYT Beheer, ronde 2 uitrollen** (gebouwd op 6 okt 2026: Bezorging met gedeelde link, Klanten met Berichten, Zakelijk). Volgorde:
  1. Voer `supabase/migrations/0007_beheer_ronde2.sql` uit in Supabase (SQL Editor). Opnieuw uitvoeren kan zonder schade.
  2. Push de branch; wacht tot Cloudflare klaar is.
  3. Controleer: Bezorging toont de dagen en tijdvakken; afvinken zet een bestelling op Bezorgd; "Start route" zet klaargemaakte bestellingen op Onderweg; **Delen met bezorgdienst** geeft een link die je in een privévenster opent (zonder login) en die na intrekken niet meer werkt; Klanten en Berichten; Zakelijk met een testaanvraag via het formulier.
  4. Voordat je de link echt met een bezorgdienst deelt: verwerkersovereenkomst en bijgewerkte privacyverklaring (zie hierboven).
- [ ] **BUYT Beheer, ronde 3 (Analytics) koppelen**: de pagina is gebouwd (6 okt 2026). Volg [analytics-koppelen.md](analytics-koppelen.md): Google Cloud-project, twee API's aan, serviceaccount met JSON-sleutel, toegang in Analytics (Kijker) en Search Console (Beperkt), geheim `GOOGLE_SA_JSON` in de Worker en het Property-ID in `wrangler.jsonc` (`GA4_PROPERTY_ID`). Daarna pushen.
- [ ] **Instagram-bezoek meetbaar maken**: zet in het Instagram-profiel de link `https://eetbuyt.nl/?utm_source=instagram&utm_medium=bio`, dan zie je Instagram als bron bij Analytics.
- [ ] **Later: echte socials-cijfers** (volgers, bereik) via Meta. Het Instagram-account is al zakelijk en gekoppeld aan een Facebook-pagina.
- [ ] **E-mail "Bedankt voor je bestelling"** opnieuw ontwerpen. De huidige template staat in `worker/lib/emailTemplates.js` (`orderConfirmationEmail` voor de klant, `orderInternalEmail` voor jullie zelf), verstuurd via Resend (`worker/lib/resend.js`). Denk aan huisstijl, een duidelijke samenvatting, bezorgmoment en contactgegevens, en test in Gmail, Outlook en Apple Mail, zowel licht als donker.
- [ ] **Later (na het beheer):** definitieve prijzen zonder "circa" en definitieve productfoto's (ook op de publieke site); voorraad gekoppeld aan inkoop en verkoop; Mollie; echte socials-cijfers via Meta; koppeling met de bezorgdienst (waarschijnlijk Tring Tring). Zie sectie 10 van het beheerontwerp.

## Klaar
- [x] Domein `eetbuyt.nl` en `www.eetbuyt.nl` op Cloudflare; `www` stuurt door naar `eetbuyt.nl`, `http` naar `https`.
- [x] Verkoopschakelaar (`SALES_OPEN`): productenblok geblurd, bestellen dicht voor bezoekers, beheerders kunnen doorwerken.
- [x] Cookiebanner met Consent Mode v2; GA4 laadt alleen na toestemming.
- [x] Privacyverklaring online (`/privacy`), gelinkt in de banner en de footer.
- [x] Search Console geverifieerd en gekoppeld aan GA4; `robots.txt`, `sitemap.xml` en canonical-tags staan.
- [x] Turnstile werkt op `eetbuyt.nl` (nieuwsbriefaanmelding getest).
- [x] BIMI-records wijzen naar `https://eetbuyt.nl/assets/bimi-logo.svg`; DMARC staat streng.
