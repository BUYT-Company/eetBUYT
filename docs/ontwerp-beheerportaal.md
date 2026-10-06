# Ontwerp: BUYT Beheer

Bevestigd door de vennoten op 6 oktober 2026. Dit is een ontwerpbrief, geen code. Bouwen gebeurt in de rondes onderaan.
Lees ook: [ontwerp-cloudflare-supabase.md](ontwerp-cloudflare-supabase.md) (techniek van de site) en [openstaande-taken.md](openstaande-taken.md).

## 1. Wie en waarvoor
De drie vennoten (VOF) gebruiken het beheer op telefoon en laptop even vaak, vaak tussen andere werkzaamheden door. Het scherm beantwoordt in vijf seconden: hoe gaat het, en wat moet nu? Modus: **Operate**. Het moet vanzelf spreken, zonder uitleg.

## 2. Wat telt als geslaagd
- Een bestelling gaat in twee tikken van Nieuw naar Bezorgd, zonder Supabase.
- Op de dag van bezorging is er een bezorglijst per tijdvak (wie, producten, adres, telefoon) die als gedeelde link naar de bezorgdienst kan.
- De Home beantwoordt: wat moet er nu gebeuren, en hoe gaat het (omzet, bestellingen, gemiddelde bestelwaarde, populairste producten, nieuw versus terugkerend).
- Later automatisch: de bezorger meldt "bezorgd", het beheer zet de status en mailt de klant. Handmatig en automatisch lopen door dezelfde statusfunctie.
- De Home is een eerste versie die we na twee weken met echte bestellingen bijsturen.

## 3. Indeling
**Navigatie, laptop:** vaste balk links met Home, Bestellingen, Bezorging, Klanten, Zakelijk en Analytics. Onderaan de ingelogde naam en Uitloggen. Een klein getal bij Bestellingen en Zakelijk als er iets nieuws is.
**Navigatie, telefoon:** tabbalk onderaan met Home, Bestellingen, Bezorging, Klanten, Meer. Meer bevat Zakelijk, Analytics en Uitloggen. Knoppen minstens 44 px hoog.

**Home**, van boven naar beneden:
1. Begroeting met naam en datum.
2. **Te doen**, aantikbare regels ("2 nieuwe bestellingen", "Volgende bezorging: donderdag 17-19 uur, 3 bestellingen", "1 aanvraag onbeantwoord"). Is er niets, dan zegt het dat kort.
3. **Cijferrij** met periodekeuze (vandaag, 7 dagen, 30 dagen): omzet, bestellingen, gemiddelde bestelwaarde, elk met delta ten opzichte van de vorige periode (pijl en percentage). Bij te weinig bestellingen staat er "nog te weinig bestellingen om te vergelijken", geen percentage op twee bestellingen.
4. **Populairste producten** als lijst met aantallen.
5. **Klanten:** nieuw versus terugkerend.

**Bestellingen:** tabbladen Nieuw, Klaargemaakt, Onderweg, Bezorgd, Alle; zoeken; per rij nummer, klant, bezorgmoment, totaal, label en één knop voor de volgende stap. Detail: bovenaan de bestelling met de limoenknop voor de volgende stap, daaronder klant, adres, producten, bezorgmoment, en onderaan de tijdlijn (wie, wat, hoe, wanneer) met notitie. Geen betaalkolom tot Mollie live is.

**Bezorging:** per dag en tijdvak een lijst met naam, adres, telefoon, producten en een afvinkvakje (afvinken = Bezorgd). Per adres een link naar Maps. "Start route" zet een heel tijdvak op Onderweg. Bezetting per tijdvak (3 van 5). Knop **Delen** (zie 6).

**Klanten:** lijst per klant met aantal bestellingen en laatste bestelling. Tabblad **Berichten** voor vragen van particulieren uit het contactformulier (Nieuw, Beantwoord).
Klant is **nieuw** bij de eerste bestelling en **terugkerend** daarna. Dezelfde klant wordt herkend aan hetzelfde e-mailadres (hoofdletters negeren) **of** hetzelfde telefoonnummer (genormaliseerd, bijvoorbeeld +31 en 0 gelijkgetrokken).

**Zakelijk (B2B):** eigen afdeling met offertes en aanvragen (formulier en `zakelijk-bestellen.html`) en zakelijke klanten. Verloop: Nieuw, In gesprek, Offerte verstuurd, Gewonnen of Verloren. Een gewonnen deal blijft voorlopig in Zakelijk; er wordt niet automatisch een bestelling van gemaakt.

**Analytics (ronde 3):** website en zoekverkeer met delta's. Bron: Google Analytics Data API en Search Console API. Eerste versie toont bezoek vanuit socials (via links met herkomstcode), niet de cijfers van de platforms zelf. Bezoekcijfers dekken alleen bezoekers die cookies accepteerden en zijn dus lager dan de werkelijkheid. Een conversiepercentage staat als indicatie op het scherm.

## 4. Statussen
| Status | Betekenis | Wie of wat zet hem |
|---|---|---|
| Nieuw | Binnengekomen | Systeem |
| Klaargemaakt | Ingepakt | Een vennoot |
| Onderweg | Bij de bezorger of in de bus | Een vennoot, of "Start route" |
| Bezorgd | Bij de klant | Een vennoot, afvinklijst of later de bezorgdienst |
| Geannuleerd | Niet doorgegaan | Een vennoot, met reden |

Regels: standaard alleen vooruit; terugzetten kan via een kleiner menu en komt in de tijdlijn; annuleren kan tot Bezorgd en maakt het bezorgslot vrij (de database telt alleen niet-geannuleerde bestellingen); dezelfde status opnieuw geven doet niets en mailt niet nog eens.

Mails (Resend, afzender `orders@mail.eetbuyt.nl`, antwoordadres `orders@eetbuyt.nl`): Nieuw (bevestiging, bestaat), Onderweg (heel kort, met tijdvak), Bezorgd, en Geannuleerd alleen als het bij annuleren wordt aangevinkt. Klaargemaakt: geen mail. Een mislukte mail laat een statuswijziging nooit mislukken en staat in de tijdlijn.
Betaalstatus is apart en verschijnt pas als Mollie live is.
Berichten: Nieuw, Beantwoord.

## 5. Stijl
- Witte achtergrond overal, rustig en strak naar het voorbeeld van packhelp.com (veel witruimte, dunne lijnen, afgeronde pillenvormen), niet hun kleuren of lettertype.
- **Poldergroen `#007F4F`** is de hoofdkleur (actieve navigatie, links, kerncijfers). **Lentelimoen `#D8ED36`** voor de ene hoofdactieknop per scherm, met inkttekst `#123326` (nooit als tekstkleur op wit). Koraal alleen voor aandacht: het "nieuw"-getal en foutmeldingen.
- **DM Sans** overal, geen Bricolage Grotesque. Kopjes gewicht 500, lopende tekst 400, vaste lettergroottes.
- Labels: Nieuw koraal-getint, Klaargemaakt neutraal grijs, Onderweg limoen-getint met donkere tekst, Bezorgd poldergroen, Geannuleerd grijs doorgehaald. De tekst staat er altijd bij.
- Kaarten met dunne rand, geen schaduw. Veranderingen 150 tot 250 ms, geen animaties bij het laden.
- **Inlogpagina:** wit, BUYT-logo, smalle kolom met Wachtwoord en Code, één limoenknop.

## 6. Techniek en veiligheid
- De Worker rendert HTML met één gedeelde indeling. Acties zijn formulieren die ook zonder JavaScript werken, met een beetje JavaScript voor wijzigen zonder herladen. Eén CSS-bestand, lettertypen van de eigen site, strikte `Content-Security-Policy` op de beheerpagina's.
- Zelfde login (wachtwoord, 2FA, sessiecookie, `SameSite=Lax`, `Path=/`). Formulieren krijgen een **CSRF-token** en een `Origin`-controle.
- **Inlogaanscherping:** (1) rem op raden: na 5 mislukte pogingen 15 minuten wachttijd per account; (2) een 2FA-code werkt maar één keer; (3) 2FA verplicht voor elk account, geen inloggen met alleen een wachtwoord; (4) de code wordt zonder spaties en letters gefilterd, maximaal 6 cijfers, door de telefoon automatisch herkend; (5) de 2FA-instelpagina in dezelfde stijl met duidelijke stappen.
- **Gedeelde bezorglink:** pad `/bezorging/<code>` buiten de login (de Worker draait voor dit pad als eerste). Code van minstens 128 bit, in de database alleen een hash. Verloopt na 24 uur, kan worden ingetrokken, teller voor het aantal keer geopend, `noindex` en `no-store`. Toont alleen naam, adres, telefoon, producten en opmerking, nooit e-mailadres of bedragen. Geen aparte pincode (kan later optioneel). **Eén actieve link per dag** (besluit 6 okt 2026): een nieuwe link trekt de oude voor die dag in (migratie 0008).
- Geen persoonsgegevens in webadressen of logboeken; een bestelling is `/admin/orders/<nummer>`.
- **Database (migratie 0006 e.v.):** `orders.status` wordt nieuw, klaargemaakt, onderweg, bezorgd, geannuleerd (er zijn nog geen echte bestellingen). Nieuw: `order_events` (tijdlijn), `delivery_shares` (links), een tabel voor mislukte inlogpogingen en gebruikte 2FA-codes. `business_requests` krijgt de zakelijke statussen. Klanten komen uit de bestellingen. Alle nieuwe tabellen alleen via de Worker bereikbaar.
- **Statusfunctie:** één functie wijzigt de status in één databasestap (status, tijdlijn), mailt daarna, en is idempotent. Handmatig, afvinklijst, "Start route" en de latere bezorgkoppeling gebruiken haar allemaal.
- **Cijfers** worden in de database berekend, in tijdzone Amsterdam, zonder geannuleerde bestellingen. Prijzen "op gewicht" maken sommige bestelwaardes een schatting (dan "ca."; verdwijnt als de definitieve prijzen er zijn).
- **Analytics:** servicegebruik met alleen leesrechten, sleutel als Worker-geheim, antwoorden een half uur bewaard.
- Tests: geautomatiseerd voor de statusfunctie en de linkcontrole, verder echte testbestellingen als beheerder. Geen aparte testdatabase: maak vóór migraties met echte data een back-up of Supabase-branch.

## 7. Wat niet mag
- Geen kopie van Shopify of Packhelp, alleen het gevoel (rustig, wit, ruim).
- Geen roomkleurige vlakken, geen paars of blauw, geen Bricolage Grotesque of sierlettertype in labels en cijfers, geen emoji als pictogram, geen kleurverloop op tekst, zijstreep-kaarten, blur of harde schaduwen.
- Geen modals voor gewone taken (bevestigingen staan inline). Geen animaties bij het laden.
- Geen verzonnen cijfers; geen percentages op weinig data. Grote getallen met sparklines als decoratie niet toegestaan; een grafiek alleen bij echte reeksen, met assen en labels.
- Geen bestellingen verwijderen, alleen annuleren. Geen bulkacties die iets onomkeerbaars doen.
- Geen mail zonder afgesproken regel.
- De bezorglink toont nooit e-mailadressen of bedragen en wordt nooit geïndexeerd.
- Ongemoeid: de publieke site, `SALES_OPEN`, de bestaande `/api`-routes, Pushover en Resend, en de link `/admin/orders/<nummer>` in de pushmelding. Het nieuwe ontwerp van de bevestigingsmail is een aparte taak.

## 8. Besluiten
- Klant nieuw of terugkerend: op e-mailadres of telefoonnummer.
- Gewonnen zakelijke deal: blijft in Zakelijk, wordt niet automatisch een bestelling.
- Onderweg-mail: ja, heel kort.
- Terugzetten van een status: ja, via een menu.
- Testen met echte testbestellingen, geen voorbeeldgegevens-knop.

**Nog in te vullen:** de namen van de drie vennootaccounts voor de tijdlijn en de inlog. Elk account krijgt een eigen wachtwoord en 2FA-sleutel.

## 9. Rondes
**Stand 6 oktober 2026: ronde 1 is gebouwd en live, ronde 2 (Bezorging, Klanten, Zakelijk) is gebouwd** (code in `worker/lib/adminDelivery.js`, `adminPeople.js`, migratie `0007_beheer_ronde2.sql`; eerst de migratie uitvoeren, dan uitrollen). Ronde 1 was: (code in `worker/lib/admin*.js`, `orderStatus.js`, migratie `supabase/migrations/0006_beheer_ronde1.sql`). Eerst de migratie uitvoeren, daarna de Worker uitrollen (zie de oplevernotitie in openstaande-taken.md). Tests: `node --test worker/test/orderStatus.test.mjs worker/test/adminFormat.test.mjs worker/test/people.test.mjs`.

1. **Fundament en bestellingen:** indeling en stijl, inlogpagina en aanscherping, bestellingen met statusfunctie en tijdlijn, Home, de Onderweg- en Bezorgd-mail, migratie 0006.
2. **Bezorging, klanten, zakelijk:** bezorglijst met afvinken en "Start route", gedeelde link, Klanten met Berichten, Zakelijk.
3. **Analytics:** website en zoekverkeer met delta's. Vooraf door de vennoten in te stellen: Google Cloud-project, Data API aan, servicegebruik met leesrechten, toevoegen als lezer in Analytics en Search Console.

## 10. Later, buiten dit plan
- Definitieve prijzen (geen "circa") en definitieve productfoto's, ook op de publieke site.
- **Voorraad:** inkoop registreren, voorraad per product en automatisch afboeken bij verkoop. Eigen ontwerp nodig, vooral het moment van afboeken (bij nieuwe bestelling of bij bezorgd).
- Online betalen met Mollie (betaalstatus in het beheer).
- Echte socials-cijfers via Meta (zakelijk Instagram-account gekoppeld aan een Facebook-pagina).
- Koppeling met de bezorgdienst, waarschijnlijk Tring Tring, zodra die definitief is. Dan ook een verwerkersovereenkomst en een bijgewerkte privacyverklaring.
