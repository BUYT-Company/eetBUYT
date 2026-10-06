// Gedeelde indeling van het beheer: navigatie links (laptop) of tabbalk onderaan (telefoon), kop, en
// de beveiligingskoppen. De stijl komt uit adminCss.js, het beetje JavaScript uit adminJs.js.
import { esc } from './adminFormat.js';
import { STATUS_LABEL } from './orderStatus.js';
import css from './adminCss.js';
import js from './adminJs.js';

export { esc };

// Korte vingerafdruk van de bestanden, zodat een nieuwe versie niet uit de browsercache komt.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const CSS_V = hash(css);
const JS_V = hash(js);

export const assetResponse = (kind) =>
  new Response(kind === 'css' ? css : js, {
    headers: {
      'Content-Type': kind === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });

// Getekende pictogrammen, één lijndikte en stijl.
const ico = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
export const ICON = {
  home: ico('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/><path d="M10 19v-5h4v5"/>'),
  orders: ico('<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7z"/><path d="M4 8.5 12 13l8-4.5"/><path d="M12 13v7"/>'),
  delivery: ico('<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'),
  people: ico('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.3c1.8.5 3 2.1 3.5 4.7"/>'),
  business: ico('<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5"/><path d="M3.5 12.5h17"/>'),
  more: ico('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'),
  check: ico('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  chevron: ico('<path d="m9 6 6 6-6 6"/>'),
  logout: ico('<path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>')
};

// Pagina's die al gebouwd zijn. Volgende rondes voegen Bezorging, Klanten, Zakelijk en Analytics toe.
// Zijbalk (laptop) en tabbalk (telefoon). Op telefoon passen vijf tabs: Zakelijk staat daar onder Meer.
const NAV = [
  { key: 'home', href: '/admin', label: 'Home', icon: ICON.home },
  { key: 'orders', href: '/admin/orders', label: 'Bestellingen', icon: ICON.orders, count: 'newOrders' },
  { key: 'delivery', href: '/admin/delivery', label: 'Bezorging', icon: ICON.delivery },
  { key: 'customers', href: '/admin/customers', label: 'Klanten', icon: ICON.people, count: 'newMessages' },
  { key: 'business', href: '/admin/business', label: 'Zakelijk', icon: ICON.business, count: 'newBusiness' }
];
const TABS = [
  ...NAV.slice(0, 4),
  { key: 'more', href: '/admin/more', label: 'Meer', icon: ICON.more, count: 'newBusiness' }
];

export const badge = (status) => `<span class="badge badge--${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;

export const flash = (msg, kind = 'ok') => (msg ? `<p class="flash${kind === 'err' ? ' flash--err' : ''}" role="${kind === 'err' ? 'alert' : 'status'}">${esc(msg)}</p>` : '');

// Beveiligingskoppen voor elke beheerpagina. Geen inline script of stijl; de QR-pagina mag daarnaast
// de bekende qrcode-bibliotheek van cdnjs laden.
function headers(extraScript = '') {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; style-src 'self'; script-src 'self'${extraScript}; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
  };
}

const head = (title, brand = 'BUYT Beheer') => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light"><title>${esc(title)} · ${esc(brand)}</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/admin.css?v=${CSS_V}"></head>`;

// Pagina zonder navigatie (inloggen).
export function bare(title, body, { qr = false, brand = 'BUYT Beheer' } = {}) {
  const scripts = `${qr ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' : ''}<script src="/admin/admin.js?v=${JS_V}" defer></script>`;
  return new Response(`${head(title, brand)}<body>${body}${scripts}</body></html>`, { headers: headers(qr ? ' https://cdnjs.cloudflare.com' : '') });
}

// Pagina met navigatie. `user` is de naam van de ingelogde beheerder, `csrf` het token voor formulieren.
export function layout(title, body, { user, csrf, active = '', counts = {}, status = 200, qr = false } = {}) {
  const link = (n, cls = '', alias = '') => {
    const c = n.count && counts[n.count] > 0 ? `<span class="count" aria-label="${counts[n.count]} nieuw">${counts[n.count]}</span>` : '';
    return `<a href="${n.href}"${active === n.key || (alias && active === alias) ? ' aria-current="page"' : ''}${cls}>${n.icon}<span>${esc(n.label)}</span>${c}</a>`;
  };
  const logout = `<form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="linklike" type="submit">Uitloggen</button></form>`;
  const logo = `<a class="brand" href="/admin"><img src="/assets/logo-still.svg" alt="" width="34" height="32"><span>BUYT <small>Beheer</small></span></a>`;
  const html = `${head(title)}<body><a class="skip" href="#main">Naar de inhoud</a>
<div class="app">
<aside class="side" aria-label="Hoofdmenu">${logo}<nav class="nav">${NAV.map((n) => link(n)).join('')}</nav>
<div class="side__foot"><span class="who">${esc(user)}</span><a href="/admin/setup-2fa" class="linklike">2FA-sleutel maken</a>${logout}</div></aside>
<header class="top">${logo}${logout}</header>
<main id="main" class="main">${body}</main>
<nav class="tabbar" aria-label="Hoofdmenu">${TABS.map((n) => link(n, '', n.key === 'more' ? 'business' : '')).join('')}</nav>
</div>${qr ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' : ''}<script src="/admin/admin.js?v=${JS_V}" defer></script></body></html>`;
  return new Response(html, { status, headers: headers(qr ? ' https://cdnjs.cloudflare.com' : '') });
}
