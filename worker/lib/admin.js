// Alleen-lezen beheerpagina's (/admin/orders, /admin/orders/:nummer). De toegang zelf (inloggen,
// cookie) zit in adminAuth.js, dat ook deze page()-wrapper gebruikt voor de inlogpagina.
import { select, SupabaseError } from './supabase.js';
import { formatEuro } from './validate.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_LABEL = {
  aanvraag: 'Nieuw',
  wacht_op_betaling: 'Wacht op betaling',
  betaald: 'Betaald',
  betaling_mislukt: 'Betaling mislukt',
  in_behandeling: 'In behandeling',
  verzonden: 'Verzonden',
  geannuleerd: 'Geannuleerd'
};

const fmtDateTime = (iso) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDelivery = (date, window) => {
  if (!date || !window) return '–';
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00`));
  return `${label}, ${window.replace('-', '–')} uur`;
};
const fmtTotal = (o) => (o.has_unpriced && !o.total_final_cents ? `${o.is_indicative ? 'ca. ' : ''}${formatEuro(o.total_estimate_cents)} (+ prijs op gewicht)` : `${o.is_indicative ? 'ca. ' : ''}${formatEuro(o.total_final_cents ?? o.total_estimate_cents)}`);

// bare: true laat de topbalk (titel + uitloggen) weg — gebruikt door de inlogpagina zelf.
export function page(title, body, { bare = false } = {}) {
  return new Response(
    `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · BUYT beheer</title>
<style>
  :root { color-scheme: light; }
  body { font: 16px/1.5 system-ui, sans-serif; color: #123326; background: #FFF8E8; margin: 0; padding: 0 16px 64px; }
  a { color: #007F4F; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .back { display: inline-block; margin-bottom: 18px; font-size: .9rem; }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 0; margin-bottom: 8px; border-bottom: 1px solid rgba(18,51,38,.12); font-size: .85rem; }
  .topbar strong { font-weight: 800; }
  .topbar a { color: #4D6456; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 0 0 1.5px rgba(18,51,38,.16); }
  th, td { text-align: left; padding: 10px 12px; font-size: .92rem; border-bottom: 1px solid rgba(18,51,38,.1); }
  th { background: rgba(18,51,38,.05); font-weight: 700; }
  tr:last-child td { border-bottom: none; }
  .status { display: inline-block; padding: .2em .6em; border-radius: 999px; font-size: .8rem; font-weight: 700; background: rgba(216,237,54,.5); }
  .panel { background: #fff; border-radius: 16px; padding: 20px 22px; box-shadow: 0 0 0 1.5px rgba(18,51,38,.16); margin-bottom: 16px; }
  .panel h2 { font-size: 1rem; margin: 0 0 10px; }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: .92rem; }
  dt { color: #4D6456; }
  dd { margin: 0; }
  .empty { color: #4D6456; }
</style>
<body>
${bare ? '' : '<div class="topbar"><strong>BUYT beheer</strong><a href="/admin/logout">Uitloggen</a></div>'}
<div style="padding-top:${bare ? '0' : '24px'}">${body}</div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
  );
}

export async function listOrders(env) {
  let orders;
  try {
    orders = await select(
      env,
      'orders',
      'select=order_number,customer_name,city,status,total_estimate_cents,total_final_cents,is_indicative,has_unpriced,delivery_date,delivery_window,created_at&order=created_at.desc&limit=50'
    );
  } catch (e) {
    console.error('admin_list_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return page('Bestellingen', '<h1>Bestellingen</h1><p class="empty">Kon de bestellingen niet ophalen. Probeer het later opnieuw.</p>');
  }

  const rows = orders.map((o) => `
    <tr>
      <td><a href="/admin/orders/${o.order_number}">BUYT-${o.order_number}</a></td>
      <td>${esc(o.customer_name)}<br><small>${esc(o.city)}</small></td>
      <td>${fmtDelivery(o.delivery_date, o.delivery_window)}</td>
      <td>${fmtTotal(o)}</td>
      <td><span class="status">${esc(STATUS_LABEL[o.status] || o.status)}</span></td>
      <td>${fmtDateTime(o.created_at)}</td>
    </tr>`).join('');

  return page('Bestellingen', `
    <h1>Bestellingen</h1>
    <p class="empty">Laatste ${orders.length} bestellingen. Status wijzigen doe je nog in <a href="https://supabase.com/dashboard/project/hfaaufsdonsitjfwzvrk/editor" target="_blank" rel="noopener">Supabase</a>.</p>
    ${orders.length ? `<table><thead><tr><th>Bestelling</th><th>Klant</th><th>Bezorgmoment</th><th>Totaal</th><th>Status</th><th>Geplaatst</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">Nog geen bestellingen.</p>'}
  `);
}

export async function orderDetail(env, orderNumber) {
  let rows;
  try {
    rows = await select(env, 'orders', `select=*,order_lines(*)&order_number=eq.${orderNumber}`);
  } catch (e) {
    console.error('admin_detail_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return page('Bestelling', '<a class="back" href="/admin/orders">&larr; Alle bestellingen</a><p class="empty">Kon de bestelling niet ophalen. Probeer het later opnieuw.</p>');
  }

  const o = rows[0];
  if (!o) return page('Bestelling', '<a class="back" href="/admin/orders">&larr; Alle bestellingen</a><p class="empty">Deze bestelling bestaat niet (meer).</p>');

  const lines = (o.order_lines || [])
    .map((l) => `<div><dt>${l.qty}× ${esc(l.name)}</dt><dd>${esc(l.pack)} · ${esc(l.price_label)}</dd></div>`)
    .join('');

  return page(`BUYT-${o.order_number}`, `
    <a class="back" href="/admin/orders">&larr; Alle bestellingen</a>
    <h1>Bestelling BUYT-${o.order_number}</h1>
    <p class="empty">${fmtDateTime(o.created_at)} · <span class="status">${esc(STATUS_LABEL[o.status] || o.status)}</span></p>

    <div class="panel">
      <h2>Klant</h2>
      <dl>
        <dt>Naam</dt><dd>${esc(o.customer_name)}</dd>
        <dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
        ${o.phone ? `<dt>Telefoon</dt><dd>${esc(o.phone)}</dd>` : ''}
        <dt>Adres</dt><dd>${esc(o.street)}, ${esc(o.postcode)} ${esc(o.city)}</dd>
        ${o.note ? `<dt>Opmerking</dt><dd>${esc(o.note)}</dd>` : ''}
      </dl>
    </div>

    <div class="panel">
      <h2>Bezorgmoment</h2>
      <dl><dt>Wanneer</dt><dd>${fmtDelivery(o.delivery_date, o.delivery_window)}</dd></dl>
    </div>

    <div class="panel">
      <h2>Bestelling</h2>
      <dl>${lines || '<div><dt>–</dt><dd>Geen regels gevonden</dd></div>'}</dl>
      <p style="margin:14px 0 0;font-weight:700">Totaal: ${fmtTotal(o)}${o.has_unpriced ? ' — sommige producten zijn "prijs op gewicht"' : ''}</p>
    </div>
  `);
}
