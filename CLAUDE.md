# CLAUDE.md: eetBUYT (eetbuyt.nl)

Elke nieuwe chat begint hier. Lees dit bestand en de gelinkte documenten voordat je iets voorstelt of bouwt. De eigenaar (Skip) spreekt Nederlands: antwoord in het Nederlands.

## Wat is dit
BUYT brengt de wilde gans terug op het bord ("van polder naar bord"). De site verkoopt ganzenproducten aan thuiskoks (webshop) en wint zakelijke klanten (horeca, via formulier). Merk, doelgroepen, bevestigde feiten en wat nog open staat: @PRODUCT.md

## Harde regels
1. **Nooit zelf committen of pushen.** Vraag eerst en wacht op een duidelijk ja. Een eerder ja geldt niet voor latere wijzigingen. Pushes naar `cloudflare-supabase` gaan direct live.
2. **Alleen waar is.** Gebruik op de site alleen feiten uit "Bevestigde feiten" in PRODUCT.md. Verzin geen testimonials, cijfers, leverbeloftes of recensies. Open beslissingen blijven zichtbaar open in de bron.
3. **Cijfers over ganzen:** alleen citeerbare cijfers met bron (>330.000 geschoten per jaar, Dierenbescherming feb. 2024). Op de site staat geen percentage voor onbenut vlees: gebruik daar "het overgrote deel" (besluit eigenaar, 21 okt 2026). "~70%" is alleen een eigen berekening. **Nooit "95%" of "80%".** Zie het bronnenoverzicht hieronder.
4. **Geen geheimen in bestanden of chat.** Sleutels en secrets staan in Cloudflare (Workers & Pages, buyt-website, Settings, Variables and Secrets). De repository is openbaar: `intern/verwerkingsregister.xlsx` staat bewust niet in git.
5. **Geen wapens, bloed of jachtbeeld** op de site. De gans die geschoten is, wordt feitelijk benoemd waar relevant.
6. **Winkel staat bewust dicht** (`SALES_OPEN: "false"` in `wrangler.jsonc`). Pas openzetten als de eigenaar dat zegt, en dan volgens [docs/verkoop-openzetten.md](docs/verkoop-openzetten.md).

## Techniek en deploy
- Site: statische HTML/CSS/JS in `public/`, geen buildstap, geen npm voor de site. Vanilla animaties (WAAPI, CSS, IntersectionObserver), geen GSAP of Lenis. Respecteer `prefers-reduced-motion` en no-JS-fallbacks.
- Backend: Cloudflare Worker `buyt-website` (`worker/index.js`, `worker/lib/*`), config in `wrangler.jsonc`. Alleen `public/` wordt geserveerd. Supabase (EU) bewaart bestellingen: de browser praat nooit met Supabase, alleen de Worker (gewone `fetch` naar PostgREST, geen SDK). Migraties in `supabase/migrations/`.
- **Live staat op Cloudflare, branch `cloudflare-supabase`.** Netlify is helemaal weg (map `netlify/` en `netlify.toml` zijn verwijderd) en `main` is achterhaald: stel niets voor voor Netlify. Mollie moet nog in de Worker gebouwd worden.
- Prijzen van de 5 losse producten komen uit een privé Google Sheet via `worker/lib/sheetPrices.js` (`/api/products`, wijzigingen binnen ~5 min live). `public/data/products.json` is alleen de reserve en moet af en toe gelijkgetrokken worden. Zie [docs/prijzen-sheet-koppelen.md](docs/prijzen-sheet-koppelen.md).
- Beheerportaal onder `/admin` (wachtwoord plus code): bestellingen, bezorging, klanten, zakelijk, analytics. Zie [docs/ontwerp-beheerportaal.md](docs/ontwerp-beheerportaal.md).
- Tests: `node --test worker/test/*.test.mjs` (53 tests, allemaal geslaagd op 21 okt 2026).
- Lokaal bekijken: `.claude/launch.json` heeft `buyt-public` (poort 8124, map `public`). Let op: de Browser-pane toont verkeerde screenshots na echt scrollen; scroll met `document.body.style.marginTop = -Ypx` en wacht een paar seconden.

## Merk (bindend)
Bron: `C:\Users\hrski\OneDrive\Documenten\Zakelijk\BUYT\Inspiratie website\BUYT-huisstijlvoorstel-herzien3.pdf` (actuele versie; de oudere `buyt-huisstijlvoorstel.html` staat in dezelfde map). Tokens staan in `:root` van `public/css/style.css`.
- Kleuren: Poldergroen #007F4F, Lentelimoen #D8ED36, Paprikakoraal #FF6652, Room #FFF8E8, Diepgroen #123326.
- Lettertypes: Bricolage Grotesque 700-800 (koppen), DM Sans 400-700 (tekst en knoppen), zelf gehost.
- Regels: groene hero, roomkleurige panelen, koraal knoppen met donkere tekst, limoen alleen voor korte labels, grote tekst en campagneblokken, nooit roomkleurige tekst op koraal, maximaal één accentkleur per blok.
- Contrast: diepgroen op koraal (4,76:1), room op groen (4,78:1) en diepgroen op limoen zijn goed; roomwitte tekst op koraal (2,73:1) is te laag; limoen op poldergroen alleen voor grote tekst of decoratie.
- Toon (herzien3): warm en helder, uitnodigend en verbindend, niet confronterend of activistisch (BUYT is "De Ontdekker" met "De Zorger" eronder). Woorden als ontdekken, herkomst, benutten, delen. De slogan is **"Daar word je wild van!"** (volgens de eigenaar, 21 okt 2026; het huisstijl-PDF noemt "Wild van hier. Met zorg op tafel." en vervangt daarmee de oude slogan "Van prullenbak naar bord", die niet meer gebruikt wordt). Onderbouw duurzaamheidsclaims; leg herkomst en verantwoord gebruik concreet uit.
- Logo altijd één kleur (groen op room, room op groen, donker op limoen). Bestanden `public/assets/logo-animatie.svg` en `logo-still.svg` blijven enkelkleurig poldergroen.
- Verdienprincipe: wat geld oplevert (producten, mandje, afrekenen, zakelijke aanvraag) zo hoog mogelijk op de pagina, bestellen in zo min mogelijk klikken. B2C koopt online, B2B vraagt een offerte aan; meng die twee routes niet.

## Merkidee, doelgroep en kanalen
Bron: `C:\Users\hrski\OneDrive\Documenten\Zakelijk\BUYT\Inspiratie website\BUYT-merkidee-doelgroep-en-kanalen.pdf` (strategisch voorstel, 3 pagina's).
- **Idee:** wilde gans uit de Noord-Hollandse polder krijgt een plek aan tafel. Een onbekend product dat je kunt ontdekken via herkenbare producten en gerechten. Smaak opent de deur, transparantie en zorg geven vertrouwen. Belofte: bijzonder vlees, dichtbij en begrijpelijk.
- **Doelgroep:** de bewuste vleeseter. Eet vlees, wil weten waar het vandaan komt, heeft ruimte om anders te kiezen en betaalt meer voor kwaliteit en duidelijke herkomst. Remmers: onbekende smaak, bereiding en prijs. Dus: proeven, herkenbare producten (burger, shoarma, pastrami), behapbare porties, een heldere prijs per maaltijd en een eenvoudig recept. Premium, maar toegankelijk.
- **Golden Circle (volgorde in het merkverhaal: eerst waarom):** WHY waarde geven aan wat de polder biedt, met respect voor dier, natuur en de mensen in de keten. HOW herkomst, zorg en smaak: educatie, samenwerken met jagers en wildverwerkers, de route van polder naar bord inzichtelijk maken, laten proeven, bereidingstips. WHAT producten van wilde gans voor thuis en horeca, plus recepten, proeverijen, diners, interviews en een mini-docu. Bij een eerste proefmoment mag smaak de opening zijn.
- **Kanalen:** verkoop (horeca, consumenten via de eigen website, marktverkoop), eigen media (social voor nieuwsgierigheid, website voor verdieping en houvast; elk bericht krijgt één concrete vervolgstap) en beleving (diners, interviews, mini-docu, bijvoorbeeld met Daan van der Lecq).
- **Route:** ontdekken via verhalen en educatie, dan vertrouwen door herkomst, proeven, kopen, opnieuw kiezen.
- De PDF noemt ganzenburgers; op de site staan nu alleen de 5 producten uit PRODUCT.md. Gebruik de PDF voor toon en richting, niet als productlijst.

## Waar staat wat
| Onderwerp | Plek |
|---|---|
| Producten, feiten, merk | [PRODUCT.md](PRODUCT.md) |
| Openstaande taken (juridisch, analytics, beheer, mail) | [docs/openstaande-taken.md](docs/openstaande-taken.md) |
| Verkoop openzetten (checklist) | [docs/verkoop-openzetten.md](docs/verkoop-openzetten.md) |
| Architectuur Cloudflare plus Supabase | [docs/ontwerp-cloudflare-supabase.md](docs/ontwerp-cloudflare-supabase.md) |
| Beheerportaal | [docs/ontwerp-beheerportaal.md](docs/ontwerp-beheerportaal.md) |
| Google Analytics en Search Console koppelen | [docs/analytics-koppelen.md](docs/analytics-koppelen.md) |
| Kaart van bestellingen | [docs/kaart-bestellingen.md](docs/kaart-bestellingen.md) |
| Prijzen uit Google Sheet | [docs/prijzen-sheet-koppelen.md](docs/prijzen-sheet-koppelen.md) |
| Zakelijke pagina (briefing) | [docs/zakelijk-pagina-brief.md](docs/zakelijk-pagina-brief.md) |
| BIMI (mailbeeldmerk) | [docs/bimi-instellen.md](docs/bimi-instellen.md) |
| Supabase-opzet en migraties | [supabase/README.md](supabase/README.md) |
| Privacy en verwerkingsregister (niet in git) | `intern/verwerkingsregister.xlsx` |

## Onderzoek en bronnen (buiten de repo)
Map `C:\Users\hrski\OneDrive\Documenten\Zakelijk\Onderzoek\`:
- `Buyt-Bronnenoverzicht-Ganzencijfers.pdf`: welke cijfers hard/citeerbaar zijn (22 sept 2026). Lees dit voordat je een ganzencijfer op de site of social zet.
- `minor eindverslag.docx`: Hanze-minorproject "Eet de oplossing" (juni 2026). Conclusie: de vraag is er (lokale pilot: 150 kopers, vanaf €20/kg), de drempels zijn onbekendheid, bereidingskennis en regelgeving. Bruikbaar als inspiratie (bereidingskaart, verwerkte producten), niet letterlijk overnemen. Opmerking uit de bijlage: rosé serveren alleen bij betrouwbare herkomst.
- `FBE Ganzenonderzoek 138.pdf` en `Factsheet-Schade-door-ganzen-in-landelijk-gebied-Dierenbescherming-feb-24.pdf`: onderliggende bronnen.

## Bijhouden
- Verandert er iets aan de feiten, prijzen, planning of werkwijze, werk dan PRODUCT.md, dit bestand of het juiste document in `docs/` bij, zodat de volgende chat het weet.
- Afgeronde taken afvinken in [docs/openstaande-taken.md](docs/openstaande-taken.md).
