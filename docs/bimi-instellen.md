# BUYT-logo in de mailbox (BIMI), stap voor stap

Doel: het BUYT-logo naast elke mail van `@eetbuyt.nl` en `@mail.eetbuyt.nl` (bestelbevestigingen via Resend en gewone mail via TransIP).
Het blauwe vinkje (VMC) valt buiten deze stappen en volgt later.

Stand van zaken op 5 okt 2026 (zo uitgelezen uit de DNS):

| Onderdeel | Nu | Nodig |
|---|---|---|
| SPF `eetbuyt.nl` | `v=spf1 include:_spf.transip.email ~all` | goed |
| SPF `send.mail.eetbuyt.nl` (Resend) | aanwezig | goed |
| DKIM TransIP (`transip-A`, `transip-B`) | aanwezig | goed |
| DKIM Resend (`resend._domainkey.mail`) | aanwezig | goed |
| DMARC `_dmarc.eetbuyt.nl` | `v=DMARC1; p=none;` | **streng maken** |
| DMARC `_dmarc.mail.eetbuyt.nl` | `v=DMARC1; p=none;` | **streng maken** |
| BIMI-record | bestaat niet | **toevoegen** |
| Logo-bestand | `public/assets/bimi-logo.svg` (nieuw) | online zetten |

## Stap 1. Test eerst of alle mail door de controle komt
Stuur een testmail vanaf elke afzender (je TransIP-mailbox, `orders@`, en een testbestelling via de site) naar een Gmail-adres.
Open de mail in Gmail, kies "Origineel weergeven" en kijk of er staat: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
Pas als alles PASS is, ga je door. Zo niet, dan zou een strenger DMARC die mail in de spam zetten.
Stuurt er nog een andere dienst mail namens `@eetbuyt.nl` (bijvoorbeeld een nieuwsbrieftool of een boekhoudpakket)? Controleer die ook.

## Stap 2. DMARC streng zetten (TransIP, DNS)
Pas twee bestaande TXT-records aan (niet extra toevoegen):

| Naam | Type | Waarde |
|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; pct=100; rua=mailto:JOUW-ADRES@eetbuyt.nl` |
| `_dmarc.mail` | TXT | `v=DMARC1; p=quarantine; pct=100; rua=mailto:JOUW-ADRES@eetbuyt.nl` |

`rua` is optioneel: je krijgt dagelijks een rapport over wie er namens jouw domein mailt. Laat het weg als je geen rapporten wilt.
BIMI vereist `pct=100` en `p=quarantine` of `p=reject`.

## Stap 3. Logo online zetten
Het bestand staat in `public/assets/bimi-logo.svg`. Het moet bereikbaar zijn op:
`https://eetbuyt.nl/assets/bimi-logo.svg`
Eisen: https met geldig certificaat, geen doorverwijzing, bestand wordt als SVG geleverd.
Open die url in je browser; je moet het logo op een crèmekleurige achtergrond zien.
Deze url werkt zodra de Cloudflare-versie van de site op `eetbuyt.nl` draait.

## Stap 4. BIMI-record toevoegen (TransIP, DNS)
Twee TXT-records met dezelfde waarde (het tweede dekt de bestelmails):

| Naam | Type | Waarde |
|---|---|---|
| `default._bimi` | TXT | `v=BIMI1; l=https://eetbuyt.nl/assets/bimi-logo.svg; a=;` |
| `default._bimi.mail` | TXT | `v=BIMI1; l=https://eetbuyt.nl/assets/bimi-logo.svg; a=;` |

## Stap 5. Controleren
- Plak `eetbuyt.nl` in de BIMI Inspector (bimigroup.org/bimi-generator) en `mail.eetbuyt.nl` ook.
- Wacht 24 tot 48 uur; ontvangers bewaren oude antwoorden in hun cache.

## Wie het logo toont, en wat daarvoor nodig is
| Dienst | Zonder certificaat | Met certificaat |
|---|---|---|
| Yahoo / AOL | ja | ja |
| Gmail | nee | VMC (met vinkje) of CMC (zonder vinkje) |
| Apple Mail (iCloud) | nee | VMC of CMC |
| Outlook | nee | nee (geen BIMI) |

Voor Gmail en Apple Mail is dus een certificaat nodig, ook voor het logo zonder vinkje.
Een **CMC** vraagt geen merkregistratie en is goedkoper dan een **VMC**. Dit is een latere, aparte stap.
