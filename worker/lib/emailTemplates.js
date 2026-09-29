// HTML-e-mails in de BUYT-huisstijl (kleuren/fonts overgenomen uit public/css/style.css).
// Tabel-gebaseerde opmaak met alles inline: e-mailclients (vooral Outlook desktop) ondersteunen
// geen flexbox/grid en negeren <style>-blokken vaak, dus geen CSS-variabelen of externe classes.
import { formatEuro } from './validate.js';
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
<p style="margin:0;color:rgba(255,248,232,.75);font-size:.82rem;">Gans verdient beter &middot; Amsterdam</p>
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
    : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  return `<tr>
<td style="padding:14px 0 0;font-weight:800;font-size:.98rem;color:${COLOR.ink};">Totaal${order.is_indicative ? ' (indicatief)' : ''}</td>
<td style="padding:14px 0 0;text-align:right;font-weight:800;font-size:.98rem;color:${COLOR.green};">${label}</td>
</tr>`;
}

// Drie stappen zoals bij een pakketbezorger, maar met wat we écht weten: er is geen live tracking
// (dit is fase 1, geen vervoerder-koppeling), dus "Bezorgd" toont de gekozen datum, niet een status
// die we niet kunnen bijhouden.
function statusSteps(order) {
  const dateLabel = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(`${order.delivery_date}T00:00:00`));
  const step = (label, sub, done) => `<td align="center" valign="top" style="width:33%;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="width:26px;height:26px;border-radius:50%;background:${done ? COLOR.lime : COLOR.cream};border:2px solid ${done ? COLOR.lime : 'rgba(18,51,38,.3)'};text-align:center;vertical-align:middle;font-weight:800;color:${COLOR.ink};font-size:.78rem;line-height:22px;">${done ? '&#10003;' : ''}</td>
</tr></table>
<div style="margin-top:6px;font-size:.65rem;font-weight:700;color:${COLOR.ink};text-transform:uppercase;letter-spacing:.03em;">${label}</div>
${sub ? `<div style="font-size:.65rem;color:${MUTED};">${sub}</div>` : ''}
</td>`;
  const line = `<td valign="top" style="padding-top:12px;"><div style="border-top:2px solid rgba(18,51,38,.18);font-size:0;line-height:0;">&nbsp;</div></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
<tr>${step('Besteld', 'Vandaag', true)}${line}${step('Klaargemaakt', '', false)}${line}${step('Bezorgd', dateLabel, false)}</tr>
</table>`;
}

function deliveryChip(order) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.sand};border-radius:16px;margin:0 0 22px;">
<tr><td style="padding:14px 18px;">
<span style="font-weight:700;color:${COLOR.ink};font-size:.9rem;">&#x1FABF; Bezorgmoment</span><br>
<span style="color:${MUTED};font-size:.9rem;">${formatDelivery(order.delivery_date, order.delivery_window)}</span>
</td></tr>
</table>`;
}

function indicativeNote() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.sand};border-radius:16px;margin:20px 0 0;">
<tr><td style="padding:14px 18px;color:${MUTED};font-size:.85rem;line-height:1.5;">Dit bedrag is een schatting, want het gewicht per verpakking varieert. We nemen contact met je op na het wegen.</td></tr>
</table>`;
}

function contactBox() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFE7E1;border-radius:16px;margin:24px 0 0;">
<tr><td style="padding:16px 18px;">
<span style="font-weight:700;color:${COLOR.ink};font-size:.9rem;">&#9993;&#65039; Vraag over je bestelling?</span><br>
<span style="color:${MUTED};font-size:.85rem;">Antwoord gerust op deze e-mail, we reageren snel.</span>
</td></tr>
</table>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
<tr><td style="background:${COLOR.coral};border-radius:999px;">
<a href="${url}" style="display:inline-block;padding:12px 28px;font-weight:700;color:${COLOR.cream};text-decoration:none;font-size:.9rem;">${label}</a>
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

// Bevestigingsmail aan de klant: persoonlijk, in de speelse merktoon. Bij een indicatief bedrag
// ("ca.") wordt uitgelegd dat het definitieve bedrag na het wegen volgt (zie ontwerp §7, stroom C)
// — geen valse belofte van een vast bedrag. Nog geen foto van de oprichters (volgt later, zie
// ontwerp): voor nu alleen tekst.
export function orderConfirmationEmail(order, result, origin) {
  const c = order.customer;
  // Regeleindes eruit: de naam komt in de e-mail-subject terecht en mag daar geen headers injecteren.
  const firstName = c.customer_name.replace(/[\r\n]/g, ' ').trim().split(' ')[0];
  const safeFirstName = escapeHtml(firstName);
  const subject = `Bedankt voor je bestelling, ${firstName}! — BUYT-${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);

  const headerHtml = `<div style="font:800 1.85rem/1.15 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">Bedankt, <span style="color:${COLOR.lime};">${safeFirstName}</span>!</div>
<p style="margin:12px 0 0;color:rgba(255,248,232,.88);font-size:.92rem;">Je bestelling <strong>BUYT-${result.order_number}</strong> is bij ons binnen.</p>`;

  const bodyHtml = `${statusSteps(order)}
${deliveryChip(order)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${order.lines.map(itemRow).join('')}
${totalsRow(order)}
</table>
${order.is_indicative ? indicativeNote() : ''}
<p style="margin:24px 0 0;color:${COLOR.ink};font-size:.92rem;line-height:1.6;">We gaan voor je aan de slag. Tot bezorging!</p>
<p style="margin:14px 0 0;color:${COLOR.ink};font-size:.92rem;">Tot snel,<br><strong>Team BUYT</strong></p>
${contactBox()}`;

  const html = shell({
    origin,
    preheader: `Bestelling BUYT-${result.order_number} ontvangen — bezorging ${delivery}`,
    headerHtml,
    bodyHtml,
    footerNote: `Deze e-mail hoort bij bestelling BUYT-${result.order_number}.`,
    showGeese: true
  });

  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''} — ${l.price_label}`).join('\n');
  const totalText = order.has_unpriced && order.total_estimate_cents === 0
    ? 'we laten je het bedrag weten na het wegen'
    : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  const indicativeText = order.is_indicative
    ? '\nDit bedrag is een schatting, want het gewicht per verpakking varieert. We nemen contact met je op na het wegen.\n'
    : '';
  const text = `Bedankt voor je bestelling, ${c.customer_name}!

We hebben je bestelling BUYT-${result.order_number} ontvangen.

Bezorgmoment: ${delivery}

Wat je besteld hebt:
${itemsText}

Geschat bedrag: ${totalText}
${indicativeText}
Heb je een vraag over je bestelling? Antwoord gerust op deze e-mail.

Tot snel,
Team BUYT`;

  return { to: c.email, subject, html, text };
}

// Interne mail naar de eigenaar met de volledige bestelgegevens (naast de korte pushmelding via
// Pushover), zodat een bestelling ook terug te vinden is in de mailbox van orders@eetbuyt.nl —
// zoals bij de meeste webshops naast het beheerscherm. Zelfde huisstijl, maar soberder: dit is
// voor snel scannen, geen verkooplaag nodig.
const OWNER_ORDER_EMAIL = 'orders@eetbuyt.nl';

export function orderInternalEmail(order, result, origin) {
  const c = order.customer;
  const adminUrl = `${origin}/admin/orders/${result.order_number}`;
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);
  const subject = `Nieuwe bestelling BUYT-${result.order_number} — ${c.customer_name.replace(/[\r\n]/g, ' ').trim()}`;

  const headerHtml = `<div style="font:800 1.5rem/1.15 ${FONT_DISPLAY};letter-spacing:-.03em;color:${COLOR.cream};">Nieuwe bestelling</div>
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
    : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  const noteText = c.note ? `\nOpmerking:\n${c.note}\n` : '';
  const text = `Nieuwe bestelling BUYT-${result.order_number}

Klant: ${c.customer_name}
E-mail: ${c.email}
Telefoon: ${c.phone}
Adres: ${c.street}, ${c.postcode} ${c.city}

Bezorgmoment: ${delivery}

Producten:
${itemsText}

Geschat bedrag: ${totalText}
${noteText}
Bekijk in het beheerscherm: ${adminUrl}`;

  return { to: OWNER_ORDER_EMAIL, subject, html, text };
}
