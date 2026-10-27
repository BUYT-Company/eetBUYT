// HTML-e-mails in de BUYT-huisstijl (kleuren/fonts overgenomen uit public/css/style.css).
// Tabel-gebaseerde opmaak met alles inline: e-mailclients (vooral Outlook desktop) ondersteunen
// geen flexbox/grid en negeren <style>-blokken vaak, dus geen CSS-variabelen of externe classes.
import { formatEuro } from './money.js';
import { formatDelivery } from './delivery.js';

const COLOR = {
  green: '#007F4F', // Poldergroen: herkenning
  lime: '#D8ED36', // Lentelimoen: energie/highlight
  coral: '#FF6652', // Paprikakoraal: actie/knoppen
  cream: '#FFF8E8', // Room: tekst op donkere vlakken
  ink: '#123326', // Diepgroen: hoofdtekst en voettekst-achtergrond
  sand: '#F0EADB', // rustig vlak voor kaartjes
  bgOuter: '#EAF3D8' // zachte limoentint achter de kaart, kleurrijker dan een neutrale achtergrond
};
const MUTED = '#4D6456';
const FONT_DISPLAY = "'Bricolage Grotesque','Arial Black',Arial,sans-serif";
const FONT_BODY = "'DM Sans',Verdana,Arial,sans-serif";

// Klantnaam/opmerking komen van de klant en mogen geen opmaak kunnen inbreken in de e-mail.
// Productnaam/verpakking/prijs komen uit de eigen catalogus (data/products.json), niet van de
// klant, en hoeven daarom niet geëscaped te worden.
export const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Omhulsel om elke mail heen: kop in merkkleur, crèmekleurige kaart met een "bon"-scheurrand
// (zigzag, zoals bij een kassabon), donkere voettekst — hetzelfde voor de klantmail en de interne
// mail, alleen de inhoud van de kop en de kaart verschilt. De ganzenillustratie en de gekleurde
// achtergrond gebruiken bestanden op de eigen site (public/assets/email/), verwezen via `origin`
// zodat de link vanzelf meegaat naar eetbuyt.nl bij de livegang. Ze zijn SVG: in de meeste
// e-mailclients zichtbaar, in Outlook (Windows-desktop) niet — daar blijft de rest van het
// ontwerp gewoon overeind (alt="" laat een lege ruimte achter, geen kapotte-afbeelding-icoon).
function shell({ origin, preheader, headerHtml, bodyHtml, footerNote, showGeese }) {
  const geese = showGeese
    ? `<img src="${origin}/assets/email/geese-flying.svg" width="160" height="50" alt="" style="display:block;width:160px;height:50px;margin:16px auto 0;border:0;">`
    : '';
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>BUYT</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bgOuter};font-family:${FONT_BODY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bgOuter};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLOR.cream};border-radius:24px;overflow:hidden;">
<tr><td style="background:${COLOR.green};padding:32px 32px 0;text-align:center;">
<div style="font:800 1.4rem/1 ${FONT_DISPLAY};letter-spacing:-.04em;color:${COLOR.cream};margin-bottom:22px;">BUYT</div>
${headerHtml}
${geese}
<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
</td></tr>
<tr><td style="background:${COLOR.green};line-height:0;font-size:0;padding:0;">
<img src="${origin}/assets/email/zigzag-cream.svg" width="560" height="20" alt="" style="display:block;width:100%;height:20px;border:0;">
</td></tr>
<tr><td style="padding:26px 32px 32px;">
${bodyHtml}
</td></tr>
</table>
<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="background:${COLOR.ink};border-radius:24px;padding:26px 32px;text-align:center;">
<div style="font:800 1.15rem/1 ${FONT_DISPLAY};letter-spacing:-.04em;color:${COLOR.cream};margin-bottom:6px;">BUYT</div>
<p style="margin:0;color:rgba(255,248,232,.75);font-size:.82rem;">Daar word je wild van! &middot; Amsterdam</p>
${footerNote ? `<p style="margin:10px 0 0;color:rgba(255,248,232,.55);font-size:.75rem;">${footerNote}</p>` : ''}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function itemRow(line) {
  const packLabel = line.pack ? ` <span style="color:${MUTED};font-weight:400;">(${line.pack})</span>` : '';
  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid rgba(18,51,38,.12);font-size:.92rem;color:${COLOR.ink};">
<strong>${line.qty}&times;</strong> ${line.name}${packLabel}
</td>
<td style="padding:10px 0;border-bottom:1px solid rgba(18,51,38,.12);text-align:right;white-space:nowrap;font-size:.92rem;color:${COLOR.ink};">${line.price_label}</td>
</tr>`;
}

function totalsRow(order) {
  const label = order.has_unpriced && order.total_estimate_cents === 0
    ? 'Volgt (prijs op gewicht)'
    : formatEuro(order.total_estimate_cents);
  return `<tr>
<td style="padding:14px 0 0;font-weight:800;font-size:.98rem;color:${COLOR.ink};">Totaal</td>
<td style="padding:14px 0 0;text-align:right;font-weight:800;font-size:.98rem;color:${COLOR.green};">${label}</td>
</tr>`;
}

function deliveryChip(order) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.sand};border-radius:16px;margin:0 0 22px;">
<tr><td style="padding:14px 18px;">
<span style="font-weight:700;color:${COLOR.ink};font-size:.9rem;">&#x1FABF; Bezorgmoment</span><br>
<span style="color:${MUTED};font-size:.9rem;">${formatDelivery(order.delivery_date, order.delivery_window)}</span>
</td></tr>
</table>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
<tr><td style="background:${COLOR.coral};border-radius:999px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;font-weight:700;color:${COLOR.ink};text-decoration:none;font-size:.95rem;">${label}</a>
</td></tr>
</table>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
<td style="padding:4px 0;color:${MUTED};font-size:.82rem;width:90px;vertical-align:top;">${label}</td>
<td style="padding:4px 0;color:${COLOR.ink};font-size:.88rem;">${value}</td>
</tr>`;
}

// ---------------------------------------------------------------------------------------------
// Bevestigings- en herinneringsmail (ontwerp van 27 okt 2026, Claude Design "BUYT bevestigingsmail").
// De bevestiging gaat pas na betaling; wie een betaling startte maar niet afrondde krijgt één keer een
// herinnering (worker/lib/payMail.js). Prijzen zijn vast per verpakking: geen "schatting"-tekst meer.
// ---------------------------------------------------------------------------------------------
const PAY_METHOD = { ideal: 'iDEAL', creditcard: 'creditcard', applepay: 'Apple Pay', googlepay: 'Google Pay', bancontact: 'Bancontact', paypal: 'PayPal' };
const dutchDate = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(d);
const shortDate = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' }).format(d);

// "Zaterdag 31 oktober, 10:00–12:00 uur"
function longDelivery(dateStr, window) {
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${dateStr}T12:00:00`));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${window.replace('-', '–')} uur`;
}

const lineTotal = (l) => (Number.isInteger(l.unit_price_cents) ? formatEuro(l.unit_price_cents * l.qty) : l.price_label);

const FIXED_PRICE_NOTE = 'Je betaalt de vaste prijs per verpakking. Het gewicht is een richtgewicht en kan maximaal 10% afwijken, zonder verrekening.';

function stepDot(state) {
  const fill = state === 'done' ? COLOR.lime : COLOR.cream;
  const border = state === 'done' ? COLOR.lime : state === 'now' ? COLOR.coral : 'rgba(18,51,38,.3)';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="width:28px;height:28px;border-radius:50%;background:${fill};border:2px solid ${border};text-align:center;vertical-align:middle;font-weight:800;color:${COLOR.ink};font-size:.8rem;line-height:24px;">${state === 'done' ? '&#10003;' : ''}</td></tr></table>`;
}

function stepsRow(steps) {
  const cells = steps.map((s) => `<td align="center" valign="top" style="width:33%;">
${stepDot(s.state)}
<div style="margin-top:8px;font-size:.7rem;font-weight:700;color:${COLOR.ink};text-transform:uppercase;letter-spacing:.04em;">${s.label}</div>
${s.sub ? `<div style="font-size:.72rem;color:${MUTED};">${s.sub}</div>` : ''}
</td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>${cells}</tr></table>`;
}

function deliveryPanel(order, { withAddress }) {
  const c = order.customer;
  const address = withAddress
    ? `<div style="font-size:.92rem;color:${MUTED};margin-top:4px;">${escapeHtml(c.street)}, ${escapeHtml(c.postcode)} ${escapeHtml(c.city)}</div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.sand};border-radius:16px;margin:0 0 24px;"><tr><td style="padding:18px 20px;">
<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};">${withAddress ? 'Bezorgmoment' : 'Gekozen bezorgmoment'}</div>
<div style="font:800 1.3rem/1.25 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};margin-top:4px;">${longDelivery(order.delivery_date, order.delivery_window)}</div>
${address}
</td></tr></table>`;
}

function orderTable(order, totalLabel, afterTotal = '') {
  const rows = order.lines.map((l) => `<tr>
<td style="padding:12px 0;border-bottom:1px solid rgba(18,51,38,.15);font-size:.95rem;color:${COLOR.ink};"><strong>${l.qty}&times;</strong> ${l.name}${l.pack ? `<div style="font-size:.82rem;color:${MUTED};">${l.pack}</div>` : ''}</td>
<td style="padding:12px 0;border-bottom:1px solid rgba(18,51,38,.15);text-align:right;white-space:nowrap;font-size:.95rem;color:${COLOR.ink};vertical-align:top;">${lineTotal(l)}</td>
</tr>`).join('');
  return `<div style="font:800 1.1rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};margin:0 0 6px;">Je bestelling</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
<tr><td style="padding:14px 0 0;font:800 1.2rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};">${totalLabel}</td>
<td style="padding:14px 0 0;text-align:right;white-space:nowrap;font:800 1.2rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.green};">${formatEuro(order.total_estimate_cents)}</td></tr>
</table>
${afterTotal}`;
}

function nextSteps(items) {
  const row = (n, text) => `<tr>
<td valign="top" style="width:24px;padding:0 12px 10px 0;"><div style="width:24px;height:24px;border-radius:50%;background:${COLOR.lime};text-align:center;font-weight:700;font-size:.8rem;line-height:24px;color:${COLOR.ink};">${n}</div></td>
<td style="padding:0 0 10px;font-size:.95rem;line-height:1.5;color:${COLOR.ink};">${text}</td></tr>`;
  return `<div style="font:800 1.1rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};margin:24px 0 10px;">Wat gebeurt er nu?</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map((t, i) => row(i + 1, t)).join('')}</table>`;
}

const contactPanel = (title) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFE7E1;border-radius:16px;margin:24px 0 0;"><tr><td style="padding:16px 20px;">
<div style="font-weight:700;color:${COLOR.ink};font-size:.95rem;">${title}</div>
<div style="color:${MUTED};font-size:.88rem;margin-top:2px;">Antwoord op deze mail of mail <a href="mailto:orders@eetbuyt.nl" style="color:${COLOR.ink};">orders@eetbuyt.nl</a>. Noem je bestelnummer erbij.</div>
</td></tr></table>`;

const mailFooter = (origin, number) => `Deze mail hoort bij bestelling ${number}.<br><a href="${origin}/voorwaarden" style="color:${COLOR.cream};">Algemene voorwaarden</a> &nbsp;&middot;&nbsp; <a href="${origin}/privacy" style="color:${COLOR.cream};">Privacy</a>`;

const firstNameOf = (c) => c.customer_name.replace(/[\r\n]/g, ' ').trim().split(' ')[0];

// opts.paid: de betaling is binnen (opts.method, opts.paidAt). Zonder opts.paid is dit de bevestiging van een bestelling
// zonder online betaling (de betaalkoppeling staat uit of mislukte): we nemen dan contact op over de betaling.
export function orderConfirmationEmail(order, result, origin, opts = {}) {
  const c = order.customer;
  const firstName = firstNameOf(c); // regeleindes eruit: de naam komt in de subject terecht
  const number = `BUYT-${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);
  const paid = opts.paid === true;
  const paidAt = opts.paidAt ? new Date(opts.paidAt) : new Date();
  const method = PAY_METHOD[opts.method];

  const headerHtml = `<div style="font:800 2.2rem/1.1 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">Bedankt, <span style="color:${COLOR.lime};">${escapeHtml(firstName)}</span>!</div>
<p style="margin:14px 0 0;color:${COLOR.cream};font-size:1rem;line-height:1.5;">${paid ? `Je betaling is binnen en je bestelling <strong>${number}</strong> is bevestigd.` : `Je bestelling <strong>${number}</strong> is bij ons binnen.`}</p>`;

  const steps = stepsRow([
    { label: paid ? 'Betaald' : 'Besteld', sub: shortDate(paidAt), state: 'done' },
    { label: 'Klaargemaakt', sub: '', state: 'todo' },
    { label: 'Bezorgd', sub: shortDate(new Date(`${order.delivery_date}T12:00:00`)), state: 'todo' }
  ]);

  const paidLine = paid
    ? `<div style="margin-top:6px;font-size:.82rem;color:${MUTED};">Betaald${method ? ` met ${method}` : ''} op ${dutchDate(paidAt)}</div>`
    : '';
  const note = `<p style="margin:16px 0 0;font-size:.82rem;line-height:1.5;color:${MUTED};">${FIXED_PRICE_NOTE}</p>`;
  const steps2 = paid
    ? ['Wij maken je bestelling klaar.', 'Gaat je bestelling onderweg, dan krijg je daar een mail over.', 'Je ontvangt je bestelling in het gekozen tijdvak. Zorg dat er iemand thuis is.']
    : ['We nemen contact met je op over de betaling.', 'Wij maken je bestelling klaar.', 'Je ontvangt je bestelling in het gekozen tijdvak. Zorg dat er iemand thuis is.'];

  const bodyHtml = `${steps}
${deliveryPanel(order, { withAddress: true })}
${orderTable(order, paid ? 'Totaal betaald' : 'Totaal', paidLine)}
${note}
${nextSteps(steps2)}
${contactPanel('Vragen over je bestelling?')}
<p style="margin:24px 0 0;color:${COLOR.ink};font-size:.95rem;line-height:1.5;">Eet smakelijk,<br><strong>Team BUYT</strong></p>`;

  const html = shell({
    origin,
    preheader: paid ? `Betaling ontvangen voor ${number} — bezorging ${delivery}` : `Bestelling ${number} ontvangen — bezorging ${delivery}`,
    headerHtml,
    bodyHtml,
    footerNote: mailFooter(origin, number),
    showGeese: false
  });

  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${lineTotal(l)}`).join('\n');
  const text = `Bedankt, ${firstName}!

${paid ? `Je betaling is binnen en je bestelling ${number} is bevestigd.` : `Je bestelling ${number} is bij ons binnen.`}

Bezorgmoment: ${longDelivery(order.delivery_date, order.delivery_window)}
Adres: ${c.street}, ${c.postcode} ${c.city}

Je bestelling:
${itemsText}

${paid ? 'Totaal betaald' : 'Totaal'}: ${formatEuro(order.total_estimate_cents)}${paid ? `\nBetaald${method ? ` met ${method}` : ''} op ${dutchDate(paidAt)}` : ''}

${FIXED_PRICE_NOTE}

Wat gebeurt er nu?
${steps2.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Vragen over je bestelling? Antwoord op deze mail of mail orders@eetbuyt.nl, met je bestelnummer erbij.

Eet smakelijk,
Team BUYT`;

  return { to: c.email, subject: `Bedankt voor je bestelling, ${firstName}! — ${number}`, html, text };
}

// Herinnering: de klant startte een betaling, rondde die niet af en annuleerde niet. payUrl is de bedankpagina van de
// bestelling (met het geheime token): daar staat "Betaling afronden" of "Opnieuw betalen".
export function paymentReminderEmail(order, result, origin, payUrl) {
  const c = order.customer;
  const firstName = firstNameOf(c);
  const number = `BUYT-${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);

  const headerHtml = `<div style="font:800 2.2rem/1.1 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">Bijna klaar, <span style="color:${COLOR.lime};">${escapeHtml(firstName)}</span>!</div>
<p style="margin:14px 0 0;color:${COLOR.cream};font-size:1rem;line-height:1.5;">Je bestelling <strong>${number}</strong> staat klaar, maar we hebben je betaling nog niet binnen.</p>`;

  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${COLOR.coral};border-radius:999px;"><a href="${payUrl}" style="display:inline-block;padding:16px 36px;font-weight:700;color:${COLOR.ink};text-decoration:none;font-size:1.05rem;">Betaling afronden</a></td></tr></table>
<div style="margin-top:12px;font-size:.88rem;line-height:1.5;color:${MUTED};">Heb je al betaald? Dan kan het even duren voordat wij dat zien. Je krijgt dan vanzelf een bevestiging.</div>
</td></tr></table>
${stepsRow([
    { label: 'Betalen', sub: 'nog te doen', state: 'now' },
    { label: 'Klaargemaakt', sub: '', state: 'todo' },
    { label: 'Bezorgd', sub: shortDate(new Date(`${order.delivery_date}T12:00:00`)), state: 'todo' }
  ])}
${deliveryPanel(order, { withAddress: false })}
${orderTable(order, 'Nog te betalen')}
${contactPanel('Lukt het betalen niet?')}
<p style="margin:24px 0 0;color:${COLOR.ink};font-size:.95rem;line-height:1.5;">Tot snel,<br><strong>Team BUYT</strong></p>`;

  const html = shell({
    origin,
    preheader: `Rond je betaling af voor ${number}`,
    headerHtml,
    bodyHtml,
    footerNote: mailFooter(origin, number),
    showGeese: false
  });

  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${lineTotal(l)}`).join('\n');
  const text = `Bijna klaar, ${firstName}!

Je bestelling ${number} staat klaar, maar we hebben je betaling nog niet binnen.

Betaling afronden: ${payUrl}

Heb je al betaald? Dan kan het even duren voordat wij dat zien. Je krijgt dan vanzelf een bevestiging.

Gekozen bezorgmoment: ${longDelivery(order.delivery_date, order.delivery_window)}

Je bestelling:
${itemsText}

Nog te betalen: ${formatEuro(order.total_estimate_cents)}

Lukt het betalen niet? Antwoord op deze mail of mail orders@eetbuyt.nl, met je bestelnummer erbij.

Tot snel,
Team BUYT`;

  return { to: c.email, subject: `Rond je betaling af — ${number}`, html, text };
}

// Interne mail naar de eigenaar met de volledige bestelgegevens (naast de korte pushmelding via
// Pushover), zodat een bestelling ook terug te vinden is in de mailbox van orders@eetbuyt.nl —
// zoals bij de meeste webshops naast het beheerscherm. Zelfde huisstijl, maar soberder: dit is
// voor snel scannen, geen verkooplaag nodig.
const OWNER_ORDER_EMAIL = 'orders@eetbuyt.nl';

export function orderInternalEmail(order, result, origin, opts = {}) {
  const c = order.customer;
  const adminUrl = `${origin}/admin/orders/${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);
  const title = opts.paid ? 'Betaalde bestelling' : 'Nieuwe bestelling';
  const subject = `${title} BUYT-${result.order_number} — ${c.customer_name.replace(/[\r\n]/g, ' ').trim()}`;

  const headerHtml = `<div style="font:800 1.5rem/1.15 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">${title}</div>
<p style="margin:8px 0 0;color:${COLOR.lime};font-weight:700;font-size:1rem;">BUYT-${result.order_number}</p>`;

  const noteHtml = c.note
    ? `<p style="margin:20px 0 0;color:${COLOR.ink};font-size:.88rem;line-height:1.5;"><strong>Opmerking:</strong><br>${escapeHtml(c.note).replace(/\n/g, '<br>')}</p>`
    : '';

  const bodyHtml = `${deliveryChip(order)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
${detailRow('Klant', escapeHtml(c.customer_name))}
${detailRow('E-mail', escapeHtml(c.email))}
${detailRow('Telefoon', c.phone ? escapeHtml(c.phone) : '—')}
${detailRow('Adres', `${escapeHtml(c.street)}, ${escapeHtml(c.postcode)} ${escapeHtml(c.city)}`)}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${order.lines.map(itemRow).join('')}
${totalsRow(order)}
</table>
${noteHtml}
${button(adminUrl, 'Bekijk in het beheerscherm')}`;

  const html = shell({
    origin,
    preheader: `${c.customer_name} · ${delivery}`,
    headerHtml,
    bodyHtml
  });

  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${l.price_label}`).join('\n');
  const totalText = order.has_unpriced && order.total_estimate_cents === 0
    ? 'volgt (prijs op gewicht)'
    : formatEuro(order.total_estimate_cents);
  const noteText = c.note ? `\nOpmerking:\n${c.note}\n` : '';
  const text = `${title} BUYT-${result.order_number}

Klant: ${c.customer_name}
E-mail: ${c.email}
Telefoon: ${c.phone}
Adres: ${c.street}, ${c.postcode} ${c.city}

Bezorgmoment: ${delivery}

Producten:
${itemsText}

Totaal: ${totalText}
${noteText}
Bekijk in het beheerscherm: ${adminUrl}`;

  return { to: OWNER_ORDER_EMAIL, subject, html, text };
}

// Statusmails aan de klant, vanuit het beheer (zie docs/ontwerp-beheerportaal.md §4). Bewust kort. Hergebruiken
// het huidige omhulsel; het nieuwe ontwerp van alle klantmails staat als aparte taak op de lijst.
// `order` is een rij uit de tabel orders: customer_name, email, order_number, delivery_date, delivery_window.
function statusMail(order, origin, { subject, title, intro, closing, preheader, footer }) {
  const first = String(order.customer_name || '').replace(/[\r\n]/g, ' ').trim().split(' ')[0] || 'daar';
  const number = `BUYT-${order.order_number}`;
  const delivery = order.delivery_date && order.delivery_window ? formatDelivery(order.delivery_date, order.delivery_window) : '';
  const headerHtml = `<div style="font:800 1.7rem/1.15 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">${title}</div>
<p style="margin:12px 0 0;color:rgba(255,248,232,.88);font-size:.92rem;">Bestelling <strong>${number}</strong></p>`;
  const bodyHtml = `<p style="margin:0;color:${COLOR.ink};font-size:.95rem;line-height:1.6;">Hoi ${escapeHtml(first)},</p>
<p style="margin:12px 0 0;color:${COLOR.ink};font-size:.95rem;line-height:1.6;">${intro}</p>
${delivery ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.sand};border-radius:16px;margin:20px 0 0;"><tr><td style="padding:14px 18px;"><span style="font-weight:700;color:${COLOR.ink};font-size:.9rem;">Bezorgmoment</span><br><span style="color:${MUTED};font-size:.9rem;">${delivery}</span></td></tr></table>` : ''}
<p style="margin:20px 0 0;color:${COLOR.ink};font-size:.92rem;line-height:1.6;">${closing}</p>
<p style="margin:14px 0 0;color:${COLOR.ink};font-size:.92rem;">Groet,<br><strong>Team BUYT</strong></p>`;
  const html = shell({ origin, preheader, headerHtml, bodyHtml, footerNote: footer || `Deze e-mail hoort bij bestelling ${number}.`, showGeese: false });
  const text = `Hoi ${first},\n\n${intro.replace(/<[^>]+>/g, '')}\n${delivery ? `\nBezorgmoment: ${delivery}\n` : ''}\n${closing.replace(/<[^>]+>/g, '')}\n\nGroet,\nTeam BUYT`;
  return { to: order.email, subject, html, text };
}

export function orderOnTheWayEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    subject: `Je BUYT-bestelling is onderweg — ${number}`,
    title: 'Onderweg!',
    intro: `Je bestelling ${number} is onderweg naar je toe.`,
    closing: 'Zorg dat er iemand thuis is. Lukt dat niet? Antwoord op deze e-mail.',
    preheader: `Bestelling ${number} is onderweg`
  });
}

export function orderDeliveredEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    subject: `Je BUYT-bestelling is bezorgd — ${number}`,
    title: 'Bezorgd!',
    intro: `Je bestelling ${number} is bezorgd. Eet smakelijk!`,
    closing: 'Is er iets niet in orde? Antwoord op deze e-mail, dan lossen we het op.',
    preheader: `Bestelling ${number} is bezorgd`
  });
}

export function orderCancelledEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    subject: `Je BUYT-bestelling is geannuleerd — ${number}`,
    title: 'Geannuleerd',
    intro: `Je bestelling ${number} is geannuleerd.`,
    closing: 'Heb je hier vragen over? Antwoord op deze e-mail, dan helpen we je verder.',
    preheader: `Bestelling ${number} is geannuleerd`
  });
}
