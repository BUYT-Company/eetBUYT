# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, equally important, confirmed by the owner:

- **Thuiskoks (b2c):** consumers who want to cook with goose at home. They browse products, put them in the cart and pay online. They need to be able to order in as few clicks as possible.
- **Horeca en zakelijke afnemers (b2b):** chefs, restaurants and other business buyers. They order or ask for an offer through a contact form; they do not use the cart.

## Product Purpose

BUYT brings the goose back on the plate. In the Netherlands roughly 330,000 geese are shot each year and roughly 95% of the meat ends up in the bin. BUYT makes wild, Dutch goose meat popular with consumers and with horeca, through campaigns, dinners and chefs cooking with the products. The website has to sell the products (webshop) and win business customers.

Success: visitors order, ideally in as few clicks as possible, and goose becomes as normal a choice as chicken or beef.

## Positioning

Wild goose from Dutch soil that would otherwise be thrown away: "van prullenbak naar bord". A neighbouring meat brand cannot truthfully claim this origin and this mission.

## Operating Context

- Company: BUYT, based in Amsterdam, Netherlands.
- Site is static HTML/CSS/JS in a GitHub repository, deployed by Netlify (eetbuyt.nl). No build step.
- Orders: Netlify Forms record every order and every business request. Online payment through Mollie is prepared (Netlify Functions) but not active until a Mollie API key is set.
- Delivery: pick-up or local delivery, in or around Amsterdam. Exact area, costs and pick-up arrangements are not decided yet.
- Content, prices and imagery are still being defined by the owner; ChatGPT will be used to generate photos and product images.

## Capabilities and Constraints

Confirmed facts that may be stated on the site:

- About 330,000 geese are shot in the Netherlands every year; about 95% ends up in the bin.
- The meat is wild and from Dutch soil.
- Products (21 Sept 2026, owner's choice, data taken from natuurlijkwild.com/bestellen and marked as draft in `data/products.json`): ganzenshoarma, gerookte ganzenborst (pastrami), ganzenborstfilet, ganzenbiefstuk, ganzenpoten. The mixed goose/wild boar products (half-om-half gehakt, saucijzen, hamburger, gehaktballen) were considered and removed by the owner.
- Products are priced per kilo; pack weights are "ca." (approximate), so the cart shows indicative prices. Ganzenbiefstuk has no known pack weight (priceCents null, "Prijs op gewicht"). Gerookte ganzenborst is sold per piece (€ 7,50, ca. 250 g); its per-kilo price (€ 30) is derived.
- Ingredient lines are only the composition stated by natuurlijkwild.com plus their allergen note (soja, mosterdzaad, selderij, tarwe for products marked #). The owner must verify these for BUYT's own products.
- Photos for all five products: Media/buyt-productfotos-grote-plank ("stijl B", top-down on a large organic wooden board on grass).
- The "ganzen met een goede bestemming" counter (currently 113) is fictive for now. Later it will count one per sold whole goose, so it grows with each order.

Explicitly undecided (do not present as fact): final prices, shipping costs and delivery area, the FAQ questions and answers, the mini-documentary content, the final wording of all copy.

Terminology: Dutch throughout; "gans/ganzen", "thuiskok", "horeca".

## Brand Commitments

- Name and logo: BUYT with the archer figure; the logo is one colour, never several tints (`assets/logo-animatie.svg`, `assets/logo-still.svg`).
- The owner's brand board is the binding reference for palette and typefaces: `Inspiratie website/buyt-huisstijlvoorstel.html`.
- Tone: honest and positive about the origin. The goose being shot is stated factually where relevant, but the site shows no weapons, blood or hunting imagery.

## Evidence on Hand

- Logo and logo animation (SVG) from the owner.
- Brand board (HTML) with palette, typefaces and application rules.
- Owner's inspiration folder (screenshots) is planned.
- No real photography, product photos, testimonials, press or customer reviews yet. Illustrations in the site are temporary placeholders. Do not fabricate testimonials, sales figures or delivery promises.

## Product Principles

1. **Money first.** What earns money (products, cart, checkout, business orders) sits as high as possible on the page, and ordering takes as few clicks as possible.
2. **Only state what is true.** Facts stay limited to the confirmed list; open decisions stay visibly open in the source, not on the page as invented claims.
3. **Serve both audiences without mixing their flows.** Consumers buy online; business customers ask or order through the contact route.
4. **Honest and positive about origin.** Wild and Dutch, from bin to plate, without shock imagery.
5. **A draft that stays easy to change.** Content, prices and palette will change; keep them in one place (tokens, `data/products.json`) so the owner can update them.

## Accessibility & Inclusion

No product-specific standard was set by the owner. The site has been built with WCAG AA contrast, keyboard access and reduced-motion support in mind (not yet formally audited); keep that as the baseline.
