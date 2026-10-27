// HTML-e-mails in de BUYT-huisstijl, ontwerp van 27 okt 2026 (Claude Design "BUYT bestelmails"): groene kop met logo,
// kartelrand naar een wit vlak, voortgangsbalk (betaald, onderweg, bezorgd) en een donkergroene voet met de polder
// en de socials. Dezelfde reeks voor de bevestiging, de betaalherinnering, de drie statusmails en de interne mail.
//
// Tabel-gebaseerde opmaak met alles inline: e-mailclients (vooral Outlook desktop) ondersteunen geen flexbox/grid en
// negeren <style>-blokken vaak. Alle afbeeldingen zijn PNG (Gmail toont geen SVG) en staan in public/assets/email/,
// verwezen via `origin`. Afgeronde hoeken en de polderachtergrond vallen in Outlook (Windows) terug op vlakke vormen.
import { formatEuro } from './money.js';
import { formatDelivery } from './delivery.js';

const COLOR = {
  green: '#007F4F', // Poldergroen
  lime: '#D8ED36', // Lentelimoen (alleen voor korte labels en cijfertjes)
  coral: '#FF6652', // Paprikakoraal: knoppen, met donkere tekst
  cream: '#FFF8E8', // Room: tekst op donkere vlakken
  ink: '#123326', // Diepgroen: hoofdtekst en voet
  panel: '#F2F6E6', // lichte vlakken (bezorgmoment)
  tile: '#DDEBD3', // contacttegel, donkerder dan het lichte vlak
  outer: '#EAF3D8' // achtergrond om de kaart
};
const MUTED = '#4D6456';
const LINE = '#D3DAD6';
const FONT_DISPLAY = "'Bricolage Grotesque','Arial Black',Arial,sans-serif";
const FONT_BODY = "'DM Sans',Verdana,Arial,sans-serif";

// Illustratie onder het logo in de groene kop (de inpakkende gans). Nog niet aangeleverd: dan blijft de kop zonder.
// Zet hier bijvoorbeeld { file: 'gans-inpakken', width: 330, height: 120 } nadat public/assets/email/gans-inpakken.png er staat.
const HEADER_ILLUSTRATION = null;

// Klantnaam/opmerking/adres komen van de klant en mogen geen opmaak kunnen inbreken in de e-mail.
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PAY_METHOD = { ideal: 'iDEAL', creditcard: 'creditcard', applepay: 'Apple Pay', googlepay: 'Google Pay', bancontact: 'Bancontact', paypal: 'PayPal' };
const dutchDate = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(d);
const shortDate = (d) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' }).format(d);
const dayOf = (dateStr) => new Date(`${dateStr}T12:00:00`);

// "Zaterdag 31 oktober, 10:00–12:00 uur"
function longDelivery(dateStr, window) {
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(dayOf(dateStr));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${window.replace('-', '–')} uur`;
}

const lineTotal = (l) => (Number.isInteger(l.unit_price_cents) ? formatEuro(l.unit_price_cents * l.qty) : l.price_label);
const FIXED_PRICE_NOTE = 'Je betaalt de vaste prijs per verpakking. Het gewicht is een richtgewicht en kan maximaal 10% afwijken, zonder verrekening.';
const firstNameOf = (c) => (String(c.customer_name || '').replace(/[\r\n]/g, ' ').trim().split(' ')[0] || 'daar');

// Een rij uit de tabel orders (met order_lines) in de vorm die de templates verwachten.
export function mailOrderFromRow(row) {
  return {
    customer: { customer_name: row.customer_name, email: row.email, phone: row.phone, street: row.street, postcode: row.postcode, city: row.city, note: row.note },
    lines: row.order_lines || [],
    total_estimate_cents: row.total_estimate_cents,
    has_unpriced: row.has_unpriced,
    is_indicative: row.is_indicative,
    delivery_date: row.delivery_date,
    delivery_window: row.delivery_window
  };
}

// ------------------------------------------------------------------------------------------ bouwstenen
const img = (origin, name, w, h, extra = '') => `<img src="${origin}/assets/email/${name}.png" width="${w}" height="${h}" alt="" style="display:block;border:0;${extra}">`;
const h2 = (text, size = '1.25rem') => `<div style="font:800 ${size}/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};">${text}</div>`;
const highlight = (text) => `<span style="color:${COLOR.green};">${text}</span>`;

function titleBlock(titleHtml, introHtml) {
  return `<div style="font:800 2.5rem/1.1 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.ink};">${titleHtml}</div>
<p style="margin:12px 0 0;font-size:1rem;line-height:1.5;color:${MUTED};">${introHtml}</p>`;
}

function circle(origin, kind, state) {
  const icons = { check: ['icoon-vinkje-room', 'icoon-vinkje-room'], truck: ['icoon-vrachtwagen-room', 'icoon-vrachtwagen'], box: ['icoon-pakket-room', 'icoon-pakket'] };
  let bg = COLOR.green;
  let border = COLOR.green;
  let icon = icons[kind]?.[0];
  if (state === 'todo') { bg = '#FFFFFF'; border = LINE; icon = icons[kind][1]; }
  if (state === 'pay') { bg = '#FFFFFF'; border = COLOR.coral; icon = 'icoon-kaart'; }
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${bg}" style="width:40px;height:40px;border-radius:22px;background:${bg};border:2px solid ${border};">${img(origin, icon, 22, 22, 'margin:0 auto;')}</td></tr></table>`;
}

// steps: 3x { kind: 'check'|'truck'|'box', state: 'done'|'now'|'todo'|'pay', label, sub }
function track(origin, steps) {
  const cell = (s) => `<td width="92" valign="top" align="center" style="width:92px;">${circle(origin, s.kind, s.state)}
<div style="margin-top:8px;font-size:.875rem;font-weight:700;color:${COLOR.ink};">${s.label}</div>
${s.sub ? `<div style="font-size:.75rem;color:${MUTED};">${s.sub}</div>` : ''}</td>`;
  const line = (next) => `<td valign="top" style="padding-top:21px;"><div style="height:2px;line-height:2px;font-size:0;background:${next.state === 'done' || next.state === 'now' ? COLOR.green : LINE};">&nbsp;</div></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr>${cell(steps[0])}${line(steps[1])}${cell(steps[1])}${line(steps[2])}${cell(steps[2])}</tr></table>`;
}

function deliveryPanel(order, { withAddress, label }) {
  const c = order.customer;
  const address = withAddress ? `<div style="font-size:.95rem;color:${MUTED};margin-top:4px;">${escapeHtml(c.street)}, ${escapeHtml(c.postcode)} ${escapeHtml(c.city)}</div>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr><td bgcolor="${COLOR.panel}" style="background:${COLOR.panel};border-radius:16px;padding:18px 20px;">
<div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};">${label}</div>
<div style="font:800 1.375rem/1.25 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};margin-top:4px;">${longDelivery(order.delivery_date, order.delivery_window)}</div>
${address}
</td></tr></table>`;
}

// totalLabel null: alleen de regels (statusmails). extraRows: losse <tr>'s onder het totaal (zie noteRow).
function orderTable(order, totalLabel, extraRows = '') {
  const rows = order.lines.map((l) => `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:.95rem;color:${COLOR.ink};"><strong>${l.qty}&times;</strong> ${escapeHtml(l.name)}${l.pack ? `<div style="font-size:.8rem;color:${MUTED};">${escapeHtml(l.pack)}</div>` : ''}</td>
<td style="padding:12px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;font-size:.95rem;color:${COLOR.ink};vertical-align:top;">${lineTotal(l)}</td>
</tr>`).join('');
  const total = totalLabel
    ? `<tr><td style="padding:14px 0 0;font:800 1.375rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.ink};">${totalLabel}</td>
<td style="padding:14px 0 0;text-align:right;white-space:nowrap;font:800 1.375rem/1.2 ${FONT_DISPLAY};letter-spacing:-.02em;color:${COLOR.green};">${formatEuro(order.total_estimate_cents)}</td></tr>`
    : '';
  return `<div style="margin:0 0 6px;">${h2('Je bestelling')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
${rows}
${total}
${extraRows}
</table>`;
}

const noteRow = (text) => `<tr><td colspan="2" style="padding:8px 0 0;font-size:.82rem;line-height:1.5;color:${MUTED};">${text}</td></tr>`;

function nextSteps(items) {
  const row = (n, text) => `<tr>
<td valign="top" width="36" style="width:36px;padding:0 12px 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="24" height="24" align="center" valign="middle" bgcolor="${COLOR.lime}" style="width:24px;height:24px;border-radius:12px;background:${COLOR.lime};font-weight:700;font-size:.8rem;color:${COLOR.ink};">${n}</td></tr></table></td>
<td style="padding:0 0 10px;font-size:.95rem;line-height:1.5;color:${COLOR.ink};">${text}</td></tr>`;
  return `<div style="margin:0 0 12px;">${h2('Wat gebeurt er nu?')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${items.map((t, i) => row(i + 1, t)).join('')}</table>`;
}

function contactSection(origin, title) {
  return `<div style="text-align:center;margin:8px 0 14px;">${h2(title, '1.5rem')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${COLOR.tile}" style="background:${COLOR.tile};border-radius:16px;padding:16px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="44" height="44" align="center" valign="middle" bgcolor="${COLOR.ink}" style="width:44px;height:44px;border-radius:22px;background:${COLOR.ink};">${img(origin, 'icoon-mail-room', 22, 22, 'margin:0 auto;')}</td>
<td style="padding-left:14px;text-align:left;"><div style="font-weight:700;font-size:1.05rem;color:${COLOR.ink};">Mail ons</div><a href="mailto:orders@eetbuyt.nl" style="font-size:.95rem;color:${COLOR.ink};">orders@eetbuyt.nl</a></td>
</tr></table></td></tr></table>
<div style="margin:12px 0 0;text-align:center;font-size:.875rem;color:${MUTED};">Je kunt ook gewoon antwoorden op deze mail. Noem je bestelnummer erbij.</div>`;
}

const signoff = (word) => `<p style="margin:28px 0 0;color:${COLOR.ink};font-size:.95rem;line-height:1.5;">${word},<br><strong>Team BUYT</strong></p>`;

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td bgcolor="${COLOR.coral}" style="background:${COLOR.coral};border-radius:999px;">
<a href="${url}" style="display:inline-block;padding:16px 40px;font-weight:700;color:${COLOR.ink};text-decoration:none;font-size:1.05rem;">${label}</a>
</td></tr></table>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
<td style="padding:4px 0;color:${MUTED};font-size:.85rem;width:90px;vertical-align:top;">${label}</td>
<td style="padding:4px 0;color:${COLOR.ink};font-size:.92rem;">${value}</td>
</tr>`;
}

const SOCIALS = [
  ['instagram', 'https://www.instagram.com/eetbuyt/', 'Instagram'],
  ['facebook', 'https://www.facebook.com/profile.php?id=61594777830564', 'Facebook'],
  ['linkedin', 'https://www.linkedin.com/company/eetbuyt/', 'LinkedIn'],
  ['tiktok', 'https://www.tiktok.com/@eetbuyt', 'TikTok']
];

function footer(origin, number) {
  const socials = SOCIALS.map(([key, href, name]) => `<td style="padding:0 6px;"><a href="${href}" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="38" height="38" align="center" valign="middle" style="width:38px;height:38px;border-radius:20px;border:1px solid #6B8576;"><img src="${origin}/assets/email/social-${key}.png" width="20" height="20" alt="${name}" style="display:block;border:0;margin:0 auto;"></td></tr></table></a></td>`).join('');
  const link = (href, text) => `<a href="${href}" style="color:${COLOR.cream};">${text}</a>`;
  return `<td align="center" bgcolor="${COLOR.ink}" background="${origin}/assets/email/polder-achtergrond.png" style="background:${COLOR.ink} url('${origin}/assets/email/polder-achtergrond.png') center bottom / cover no-repeat;padding:36px 36px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td align="center">${img(origin, 'logo-cream', 56, 53, 'margin:0 auto;')}</td></tr></table>
<div style="margin-top:14px;font-size:1rem;font-weight:700;color:${COLOR.cream};">Daar word je wild van!</div>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 0;"><tr>${socials}</tr></table>
<div style="margin-top:14px;font-size:.8rem;line-height:1.6;color:#D6DCCF;">BUYT &middot; Vondelstraat 130, 1054 GS Amsterdam &middot; KvK 42196561</div>
<div style="margin-top:6px;font-size:.75rem;line-height:1.6;color:#C3CCBF;">${number ? `Deze mail hoort bij bestelling ${number}.<br>` : ''}${link(`${origin}/voorwaarden`, 'Algemene voorwaarden')} &nbsp;&middot;&nbsp; ${link(`${origin}/privacy`, 'Privacy')}</div>
</td>`;
}

// Omhulsel om elke mail: groene kop met logo (en later de illustratie), kartelrand, wit vlak, kartelrand, donkergroene voet.
function shell({ origin, preheader, bodyHtml, number }) {
  const illustration = HEADER_ILLUSTRATION
    ? `<tr><td align="center" bgcolor="${COLOR.green}" style="background:${COLOR.green};padding:18px 36px 14px;">${img(origin, HEADER_ILLUSTRATION.file, HEADER_ILLUSTRATION.width, HEADER_ILLUSTRATION.height, 'margin:0 auto;')}</td></tr>`
    : '';
  const zigzag = (name) => `<img src="${origin}/assets/email/${name}.png" width="560" alt="" style="display:block;width:100%;height:auto;border:0;">`;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>BUYT</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.outer};font-family:${FONT_BODY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLOR.outer}" style="background:${COLOR.outer};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:24px;overflow:hidden;">
<tr><td bgcolor="${COLOR.green}" style="background:${COLOR.green};padding:28px 36px ${HEADER_ILLUSTRATION ? '0' : '20px'};">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle">${img(origin, 'logo-cream', 40, 38)}</td>
<td valign="middle" style="padding-left:10px;font:800 1.6rem/1 ${FONT_DISPLAY};letter-spacing:-.04em;color:${COLOR.cream};">BUYT</td>
</tr></table>
</td></tr>
${illustration}
<tr><td style="padding:0;line-height:0;font-size:0;background:${COLOR.green};">${zigzag('zigzag-groen')}</td></tr>
<tr><td style="padding:20px 36px 40px;font-family:${FONT_BODY};color:${COLOR.ink};">
${bodyHtml}
</td></tr>
<tr><td style="padding:0;line-height:0;font-size:0;background:#FFFFFF;">${zigzag('zigzag-wit')}</td></tr>
<tr>${footer(origin, number)}</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ------------------------------------------------------------------------------------------ klantmails
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

  const intro = paid ? `Je betaling is binnen en je bestelling <strong style="color:${COLOR.ink};">${number}</strong> is bevestigd.` : `Je bestelling <strong style="color:${COLOR.ink};">${number}</strong> is bij ons binnen.`;
  const paidRow = paid ? noteRow(`Betaald${method ? ` met ${method}` : ''} op ${dutchDate(paidAt)}`) : '';
  const steps = paid
    ? ['Wij maken je bestelling klaar.', 'Gaat je bestelling onderweg, dan krijg je daar een mail over.', 'Je ontvangt je bestelling in het gekozen tijdvak. Zorg dat er iemand thuis is.']
    : ['We nemen contact met je op over de betaling.', 'Wij maken je bestelling klaar.', 'Je ontvangt je bestelling in het gekozen tijdvak. Zorg dat er iemand thuis is.'];

  const bodyHtml = `${titleBlock(`Bedankt, ${highlight(escapeHtml(firstName))}!`, intro)}
<div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
${track(origin, [
    { kind: 'check', state: 'done', label: paid ? 'Betaald' : 'Besteld', sub: shortDate(paidAt) },
    { kind: 'truck', state: 'todo', label: 'Onderweg' },
    { kind: 'box', state: 'todo', label: 'Bezorgd', sub: shortDate(dayOf(order.delivery_date)) }
  ])}
${deliveryPanel(order, { withAddress: true, label: 'Bezorgmoment' })}
${orderTable(order, paid ? 'Totaal betaald' : 'Totaal', paidRow + noteRow(FIXED_PRICE_NOTE))}
${nextSteps(steps)}
${contactSection(origin, 'Vragen over je bestelling?')}
${signoff('Eet smakelijk')}`;

  const html = shell({ origin, preheader: paid ? `Betaling ontvangen voor ${number} — bezorging ${delivery}` : `Bestelling ${number} ontvangen — bezorging ${delivery}`, bodyHtml, number });

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
${steps.map((t, i) => `${i + 1}. ${t}`).join('\n')}

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

  const bodyHtml = `${titleBlock(`Bijna klaar, ${highlight(escapeHtml(firstName))}!`, `Je bestelling <strong style="color:${COLOR.ink};">${number}</strong> staat klaar, maar we hebben je betaling nog niet binnen.`)}
<div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
<div style="text-align:center;margin:0 0 28px;">${button(payUrl, 'Betaling afronden')}
<div style="margin-top:12px;font-size:.875rem;line-height:1.5;color:${MUTED};">Heb je al betaald? Dan kan het even duren voordat wij dat zien. Je krijgt dan vanzelf een bevestiging.</div></div>
${track(origin, [
    { kind: 'check', state: 'pay', label: 'Betalen', sub: 'nog te doen' },
    { kind: 'truck', state: 'todo', label: 'Onderweg' },
    { kind: 'box', state: 'todo', label: 'Bezorgd', sub: shortDate(dayOf(order.delivery_date)) }
  ])}
${deliveryPanel(order, { withAddress: false, label: 'Gekozen bezorgmoment' })}
${orderTable(order, 'Nog te betalen')}
${contactSection(origin, 'Lukt het betalen niet?')}
${signoff('Tot snel')}`;

  const html = shell({ origin, preheader: `Rond je betaling af voor ${number}`, bodyHtml, number });

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

// Statusmails vanuit het beheer (zie docs/ontwerp-beheerportaal.md §4). `order` is een rij uit de tabel orders met
// order_lines (select=*,order_lines(*)); ontbreken de regels, dan laat de mail dat deel weg.
function statusMail(order, origin, { kind, subject, title, intro, steps, closing, preheader }) {
  const row = mailOrderFromRow(order);
  const first = firstNameOf(row.customer);
  const number = `BUYT-${order.order_number}`;
  const hasDelivery = Boolean(order.delivery_date && order.delivery_window);
  const hasLines = row.lines.length > 0;
  const withAddress = Boolean(row.customer.street);

  const bodyHtml = `${titleBlock(title(escapeHtml(first)), `${intro(number)}`)}
<div style="height:28px;line-height:28px;font-size:0;">&nbsp;</div>
${steps && hasDelivery ? track(origin, steps(order)) : ''}
${kind === 'onderweg' && hasDelivery ? deliveryPanel(row, { withAddress, label: 'Bezorgmoment' }) : ''}
<p style="margin:0 0 28px;color:${COLOR.ink};font-size:.95rem;line-height:1.6;">${closing}</p>
${hasLines ? orderTable(row, null) : ''}
${contactSection(origin, kind === 'geannuleerd' ? 'Vragen hierover?' : 'Vragen over je bestelling?')}
${signoff(kind === 'bezorgd' ? 'Eet smakelijk' : 'Groet')}`;

  const html = shell({ origin, preheader, bodyHtml, number });
  const itemsText = hasLines ? `\nJe bestelling:\n${row.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${lineTotal(l)}`).join('\n')}\n` : '';
  const delivery = hasDelivery ? `\nBezorgmoment: ${longDelivery(order.delivery_date, order.delivery_window)}\n` : '';
  const text = `Hoi ${first},\n\n${intro(number).replace(/<[^>]+>/g, '')}\n${kind === 'onderweg' ? delivery : ''}\n${closing.replace(/<[^>]+>/g, '')}\n${itemsText}\nVragen? Antwoord op deze mail of mail orders@eetbuyt.nl, met je bestelnummer erbij.\n\n${kind === 'bezorgd' ? 'Eet smakelijk' : 'Groet'},\nTeam BUYT`;
  return { to: order.email, subject, html, text };
}

const deliveryStep = (order) => ({ kind: 'box', label: 'Bezorgd', sub: shortDate(dayOf(order.delivery_date)) });

export function orderOnTheWayEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    kind: 'onderweg',
    subject: `Je BUYT-bestelling is onderweg — ${number}`,
    title: (n) => `Onderweg, ${highlight(n)}!`,
    intro: (num) => `Je bestelling <strong style="color:${COLOR.ink};">${num}</strong> is onderweg naar je toe.`,
    steps: (o) => [
      { kind: 'check', state: 'done', label: 'Betaald' },
      { kind: 'truck', state: 'now', label: 'Onderweg', sub: 'nu' },
      { ...deliveryStep(o), state: 'todo' }
    ],
    closing: 'Zorg dat er iemand thuis is. Lukt dat niet? Antwoord dan op deze mail, dan zoeken we samen een oplossing.',
    preheader: `Bestelling ${number} is onderweg`
  });
}

export function orderDeliveredEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    kind: 'bezorgd',
    subject: `Je BUYT-bestelling is bezorgd — ${number}`,
    title: (n) => `Bezorgd, ${highlight(n)}!`,
    intro: (num) => `Je bestelling <strong style="color:${COLOR.ink};">${num}</strong> is bezorgd. Eet smakelijk!`,
    steps: (o) => [
      { kind: 'check', state: 'done', label: 'Betaald' },
      { kind: 'truck', state: 'done', label: 'Onderweg' },
      { ...deliveryStep(o), state: 'done' }
    ],
    closing: 'Is er iets niet in orde met je bestelling? Antwoord op deze mail, dan lossen we het op.',
    preheader: `Bestelling ${number} is bezorgd`
  });
}

export function orderCancelledEmail(order, origin) {
  const number = `BUYT-${order.order_number}`;
  return statusMail(order, origin, {
    kind: 'geannuleerd',
    subject: `Je BUYT-bestelling is geannuleerd — ${number}`,
    title: () => `Je bestelling is ${highlight('geannuleerd')}`,
    intro: (num) => `Je bestelling <strong style="color:${COLOR.ink};">${num}</strong> is geannuleerd.`,
    steps: null,
    closing: 'Heb je hier vragen over? Antwoord op deze mail, dan helpen we je verder.',
    preheader: `Bestelling ${number} is geannuleerd`
  });
}

// ------------------------------------------------------------------------------------------ interne mail
// Naar de eigenaar met de volledige bestelgegevens (naast de korte pushmelding), zodat een bestelling ook terug te vinden
// is in de mailbox van orders@eetbuyt.nl. Zelfde omhulsel, maar soberder: dit is voor snel scannen.
const OWNER_ORDER_EMAIL = 'orders@eetbuyt.nl';

export function orderInternalEmail(order, result, origin, opts = {}) {
  const c = order.customer;
  const number = `BUYT-${result.order_number}`;
  const adminUrl = `${origin}/admin/orders/${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);
  const title = opts.paid ? 'Betaalde bestelling' : 'Nieuwe bestelling';
  const subject = `${title} ${number} — ${String(c.customer_name).replace(/[\r\n]/g, ' ').trim()}`;

  const noteHtml = c.note
    ? `<p style="margin:0 0 24px;color:${COLOR.ink};font-size:.9rem;line-height:1.5;"><strong>Opmerking:</strong><br>${escapeHtml(c.note).replace(/\n/g, '<br>')}</p>`
    : '';

  const bodyHtml = `${titleBlock(title, `<strong style="color:${COLOR.green};">${number}</strong>`)}
<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>
${deliveryPanel(order, { withAddress: false, label: 'Bezorgmoment' })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
${detailRow('Klant', escapeHtml(c.customer_name))}
${detailRow('E-mail', escapeHtml(c.email))}
${detailRow('Telefoon', c.phone ? escapeHtml(c.phone) : '—')}
${detailRow('Adres', `${escapeHtml(c.street)}, ${escapeHtml(c.postcode)} ${escapeHtml(c.city)}`)}
</table>
${orderTable(order, 'Totaal')}
${noteHtml}
${button(adminUrl, 'Bekijk in het beheerscherm')}`;

  const html = shell({ origin, preheader: `${c.customer_name} · ${delivery}`, bodyHtml, number });

  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${lineTotal(l)}`).join('\n');
  const totalText = order.has_unpriced && order.total_estimate_cents === 0 ? 'volgt (prijs op gewicht)' : formatEuro(order.total_estimate_cents);
  const noteText = c.note ? `\nOpmerking:\n${c.note}\n` : '';
  const text = `${title} ${number}

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
