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
  chevron: ico('<path d="m9 6 6 6-6 6"/>'),
  logout: ico('<path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>')
};

// Pagina's die al gebouwd zijn. Volgende rondes voegen Bezorging, Klanten, Zakelijk en Analytics toe.
const NAV = [
  { key: 'home', href: '/admin', label: 'Home', icon: ICON.home },
  { key: 'orders', href: '/admin/orders', label: 'Bestellingen', icon: ICON.orders, count: 'newOrders' }
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
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; style-src 'self'; script-src 'self'${extraScript}; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
  };
}

const head = (title) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light"><title>${esc(title)} · BUYT Beheer</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/admin/admin.css?v=${CSS_V}"></head>`;

// Pagina zonder navigatie (inloggen).
export function bare(title, body, { qr = false } = {}) {
  const scripts = `${qr ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' : ''}<script src="/admin/admin.js?v=${JS_V}" defer></script>`;
  return new Response(`${head(title)}<body>${body}${scripts}</body></html>`, { headers: headers(qr ? ' https://cdnjs.cloudflare.com' : '') });
}

// Pagina met navigatie. `user` is de naam van de ingelogde beheerder, `csrf` het token voor formulieren.
export function layout(title, body, { user, csrf, active = '', counts = {}, status = 200, qr = false } = {}) {
  const link = (n, cls = '') => {
    const c = n.count && counts[n.count] > 0 ? `<span class="count" aria-label="${counts[n.count]} nieuw">${counts[n.count]}</span>` : '';
    return `<a href="${n.href}"${active === n.key ? ' aria-current="page"' : ''}${cls}>${n.icon}<span>${esc(n.label)}</span>${c}</a>`;
  };
  const logout = `<form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="linklike" type="submit">Uitloggen</button></form>`;
  const logo = `<a class="brand" href="/admin"><img src="/assets/logo-still.svg" alt="" width="34" height="32"><span>BUYT <small>Beheer</small></span></a>`;
  const html = `${head(title)}<body><a class="skip" href="#main">Naar de inhoud</a>
<div class="app">
<aside class="side" aria-label="Hoofdmenu">${logo}<nav class="nav">${NAV.map((n) => link(n)).join('')}</nav>
<div class="side__foot"><span class="who">${esc(user)}</span><a href="/admin/setup-2fa" class="linklike">2FA-sleutel maken</a>${logout}</div></aside>
<header class="top">${logo}${logout}</header>
<main id="main" class="main">${body}</main>
<nav class="tabbar" aria-label="Hoofdmenu">${NAV.map((n) => link(n)).join('')}</nav>
</div>${qr ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>' : ''}<script src="/admin/admin.js?v=${JS_V}" defer></script></body></html>`;
  return new Response(html, { status, headers: headers(qr ? ' https://cdnjs.cloudflare.com' : '') });
}
