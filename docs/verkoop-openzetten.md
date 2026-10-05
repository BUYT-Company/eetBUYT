# Verkoop openzetten (en weer dichtzetten)

De winkel heeft één schakelaar: `SALES_OPEN` in [wrangler.jsonc](../wrangler.jsonc) onder `vars`.

| Stand | Wat bezoekers zien | Wat de server doet |
|---|---|---|
| `"false"` (nu) | Productenblok geblurd met "Binnenkort bestellen mogelijk", slotje in plaats van pijltje bij Bestel nu, Naar je mandje en Afrekenen. De afrekenpagina stuurt ze terug naar de producten. | `POST /api/order` geeft `403 sales_closed`. |
| `"true"` | De site precies zoals voor de schakelaar: geen blur, pijltjes terug, afrekenen werkt. | Bestellingen worden gewoon aangenomen. |

Een ontbrekende of anders gespelde waarde (`"True"`, `true` zonder aanhalingstekens) telt als **dicht**. Alleen exact `"true"` opent de winkel.

## Als developer doorwerken terwijl de winkel dicht is

1. Log één keer in via `https://eetbuyt.nl/admin/login` (wachtwoord + 2FA-code).
2. Ga daarna naar de site. Je ziet geen blur, de pijltjes staan terug en afrekenen werkt. Rechtsonder staat een klein label "Ontwikkelmodus: de winkel is dicht voor bezoekers".
3. Bezoekers merken hier niets van. Uitloggen kan via `/admin/logout`.

De login-cookie geldt voor de hele site (`Path=/`), omdat `/api/order` hem moet kunnen lezen.

## Standaardprompt: verkoop openzetten

Plak dit in een nieuwe chat in deze map:

```
Ik wil de verkoop van eetBUYT openzetten. Volg docs/verkoop-openzetten.md.

1. Loop eerst de checklist "Voor de livegang" uit dat document af en vertel me wat nog open staat. Zet de schakelaar pas om als ik bevestig.
2. Zet SALES_OPEN in wrangler.jsonc op "true", commit dat in een eigen commit en push naar de branch waarvan Cloudflare deployt.
3. Controleer na de deploy op https://eetbuyt.nl:
   - /api/shop-status geeft "open": true
   - de productenpagina is niet geblurd, de slotjes zijn weer pijltjes
   - een testbestelling lukt van mandje tot bedankpagina
4. Meld me wat je gedaan en gecontroleerd hebt, en wat ik zelf nog moet doen.
```

## Voor de livegang (checklist)

- [ ] KvK-nummer ingeschreven (19 oktober 2026) en ingevuld in `public/privacy.html` en in de footer.
- [ ] Algemene voorwaarden, herroepingsrecht en allergeneninformatie staan online.
- [ ] Privacyverklaring bijgewerkt voor alles wat er sinds 5 oktober bij kwam (bezorgdienst, betaalprovider, ...).
- [ ] Verwerkersovereenkomsten gecontroleerd: Supabase, Cloudflare, Resend, Google.
- [ ] Prijzen, verzendkosten en bezorggebied definitief (`public/data/products.json`).
- [ ] Zakelijke rekening en Mollie ingesteld, `MOLLIE_API_KEY` gezet (alleen als online betalen mee live gaat).
- [ ] Resend, Pushover en Turnstile werken (testbestelling levert mail en melding op).
- [ ] GA4 Measurement ID ingevuld in `public/js/consent.js`.
- [ ] Search Console geverifieerd en sitemap ingediend.
- [ ] Logistiek en voorraad staan.

## Alles weer weghalen

De schakelaar zelf is genoeg om de oude site terug te krijgen. Wil je de code erachter ook weg, dan zit alles in één commit ("Verkoopschakelaar ..."): `git revert <hash>`. Het gaat om `worker/index.js`, `worker/lib/adminAuth.js`, `wrangler.jsonc`, `public/js/shop-gate.js` en de bijbehorende regels in `public/index.html`, `public/css/style.css`, `public/js/cart.js` en `public/js/checkout.js`.

## Terugzetten naar dicht

Zet `SALES_OPEN` weer op `"false"` en deploy. Bestaande bestellingen blijven in Supabase staan.
