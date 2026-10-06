// Bezorging (ronde 2, zie docs/ontwerp-beheerportaal.md): per dag en tijdvak wie wat krijgt, afvinken,
// de route starten en een gedeelde link voor de bezorgdienst. De gedeelde pagina staat buiten de login
// en toont alleen wat de bezorger nodig heeft (geen e-mailadres, geen bedragen).
import { select, rpc, SupabaseError } from './supabase.js';
import { esc, layout, bare, badge, flash, ICON } from './adminUi.js';
import {
  amsterdamToday, fmtLongDay, fmtDateTime, isYmd, isWindow, isUuid, addressLine, mapsUrl, linesSummary
} from './adminFormat.js';
import { checkPost } from './adminAuth.js';
import { newToken, isTokenShape, hashToken } from './shareToken.js';
import { chrome, csrfField, redirect, withMsg, MESSAGES, sendStatusMail } from './adminOrders.js';

const MAX_PER_SLOT = 5; // zelfde getal als in supabase/migrations/0004
const COLUMNS = 'order_number,customer_name,phone,street,postcode,city,note,status,delivery_date,delivery_window,order_lines(qty,name)';

const windowLabel = (w) => w.replace('-', '–');

// Groepeert bestellingen per dag en dan per tijdvak.
function groupByDay(orders) {
  const days = new Map();
  for (const o of orders) {
    if (!days.has(o.delivery_date)) days.set(o.delivery_date, new Map());
    const slots = days.get(o.delivery_date);
    if (!slots.has(o.delivery_window)) slots.set(o.delivery_window, []);
    slots.get(o.delivery_window).push(o);
  }
  return days;
}

function stopHtml(o, csrf) {
  const done = o.status === 'bezorgd';
  const check = done
    ? `<span class="check-btn check-btn--done" role="img" aria-label="Bezorgd">${ICON.check}</span>`
    : `<form method="post" action="/admin/orders/${o.order_number}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="bezorgd"><input type="hidden" name="back" value="bezorging"><input type="hidden" name="src" value="afvinklijst"><button class="check-btn" type="submit" aria-label="Markeer BUYT-${o.order_number} als bezorgd" title="Markeer als bezorgd">${ICON.check}</button></form>`;
  return `<li class="stop${done ? ' stop--done' : ''}">
${check}
<div class="stop__main">
<div class="stop__top"><a class="row-link" href="/admin/orders/${o.order_number}">${esc(o.customer_name)}</a> ${badge(o.status)}</div>
<div class="stop__line"><a href="${esc(mapsUrl(o))}" target="_blank" rel="noopener noreferrer">${esc(addressLine(o))}</a>${o.phone ? ` · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ''}</div>
<div class="stop__line muted">${esc(linesSummary(o.order_lines))}</div>
${o.note ? `<div class="stop__note">${esc(o.note)}</div>` : ''}
</div></li>`;
}

function slotHtml(date, window, orders, csrf, canRoute) {
  const ready = orders.filter((o) => o.status === 'klaargemaakt').length;
  const open = orders.filter((o) => o.status === 'nieuw').length;
  const route = canRoute && ready > 0
    ? `<form method="post" action="/admin/delivery/route" data-once>${csrfField(csrf)}<input type="hidden" name="date" value="${esc(date)}"><input type="hidden" name="window" value="${esc(window)}"><button class="btn btn--sm" type="submit">Start route (${ready})</button></form>`
    : '';
  return `<section class="slot" aria-label="${esc(windowLabel(window))}">
<header class="slot__head"><div><h3>${esc(windowLabel(window))} uur</h3><span class="muted tnum">${orders.length} van ${MAX_PER_SLOT}${open ? ` · ${open} nog niet klaargemaakt` : ''}</span></div>${route}</header>
<ul class="stops">${orders.map((o) => stopHtml(o, csrf)).join('')}</ul></section>`;
}

function sharesHtml(date, shares, csrf, ok) {
  if (!ok) return '<p class="note">Links delen werkt pas nadat de database is bijgewerkt (migratie 0007).</p>';
  const now = Date.now();
  const active = shares.filter((s) => !s.revoked_at && new Date(s.expires_at).getTime() > now);
  const list = active.map((s) => `<li><span>Link van ${esc(s.created_by)}, verloopt ${esc(fmtDateTime(s.expires_at))}, ${s.opened_count}× geopend</span>
<form method="post" action="/admin/delivery/revoke" data-once>${csrfField(csrf)}<input type="hidden" name="id" value="${esc(s.id)}"><button class="linklike" type="submit">Intrekken</button></form></li>`).join('');
  return `<div class="share"><form method="post" action="/admin/delivery/share" data-once>${csrfField(csrf)}<input type="hidden" name="date" value="${esc(date)}"><button class="btn btn--sm" type="submit">Delen met bezorgdienst</button></form>${active.length ? `<ul class="share__list">${list}</ul>` : ''}</div>`;
}

export async function deliveryPage(env, request, user, url) {
  const tab = url.searchParams.get('tab') === 'eerder' ? 'eerder' : 'komend';
  const msg = MESSAGES[url.searchParams.get('m')] || null;
  const { csrf, counts } = await chrome(env, request);
  const today = amsterdamToday();
  const since = amsterdamToday(new Date(Date.now() - 30 * 86400000));

  let orders = [];
  let failed = false;
  try {
    const range = tab === 'komend' ? `delivery_date=gte.${today}` : `delivery_date=lt.${today}&delivery_date=gte.${since}`;
    orders = await select(env, 'orders', `select=${COLUMNS}&status=neq.geannuleerd&${range}&order=delivery_date.${tab === 'komend' ? 'asc' : 'desc'},delivery_window.asc,order_number.asc`);
  } catch (_) {
    failed = true;
  }

  const days = groupByDay(orders);
  let shares = [];
  let sharesOk = true;
  if (tab === 'komend' && days.size) {
    try {
      shares = await select(env, 'delivery_shares', `select=id,delivery_date,created_by,created_at,expires_at,revoked_at,opened_count&delivery_date=in.(${[...days.keys()].join(',')})&order=created_at.desc`);
    } catch (_) {
      sharesOk = false;
    }
  }

  let body = `<div class="page-head"><div><h1>Bezorging</h1><p>Wie krijgt wat, per dag en tijdvak.</p></div></div>
<nav class="tabs" aria-label="Periode"><a href="/admin/delivery"${tab === 'komend' ? ' aria-current="page"' : ''}>Komende bezorgingen</a><a href="/admin/delivery?tab=eerder"${tab === 'eerder' ? ' aria-current="page"' : ''}>Afgelopen 30 dagen</a></nav>`;
  if (msg) body += flash(msg[1], msg[0]);

  if (failed) {
    body += '<p class="card card__pad error" role="alert">Kon de bezorgingen niet ophalen. Probeer het later opnieuw.</p>';
  } else if (!days.size) {
    body += `<div class="card empty"><h2>${tab === 'komend' ? 'Geen bezorgingen gepland' : 'Geen bezorgingen in de afgelopen 30 dagen'}</h2><p>${tab === 'komend' ? 'Zodra iemand een bezorgmoment kiest, staat de bestelling hier.' : 'Bezorgde bestellingen van de afgelopen maand komen hier te staan.'}</p></div>`;
  } else {
    for (const [date, slots] of days) {
      const count = [...slots.values()].reduce((n, l) => n + l.length, 0);
      body += `<section class="card day"><header class="day__head"><div><h2>${esc(fmtLongDay(date))}</h2><span class="muted">${count} ${count === 1 ? 'bestelling' : 'bestellingen'}</span></div>${tab === 'komend' ? sharesHtml(date, shares.filter((s) => s.delivery_date === date), csrf, sharesOk) : ''}</header>
${[...slots].map(([w, list]) => slotHtml(date, w, list, csrf, tab === 'komend')).join('')}</section>`;
    }
  }
  return layout('Bezorging', body, { user, csrf, active: 'delivery', counts });
}

// Maakt een link voor één bezorgdag. De code wordt maar één keer getoond; daarna is alleen de hash bekend.
export async function postShare(env, request, user, form) {
  if (!(await checkPost(request, env, form))) return redirect('/admin/delivery');
  const date = form.get('date');
  if (!isYmd(date)) return redirect(withMsg('/admin/delivery', 'mislukt'));
  const token = newToken();
  let result;
  try {
    result = await rpc(env, 'delivery_share_create', { p_hash: await hashToken(token), p_date: date, p_by: user });
  } catch (e) {
    return redirect(withMsg('/admin/delivery', e instanceof SupabaseError && e.status === 404 ? 'geen_tabel' : 'mislukt'));
  }
  const link = `${new URL(request.url).origin}/bezorging/${token}`;
  const { csrf, counts } = await chrome(env, request);
  return layout('Link voor de bezorgdienst', `<a class="back" href="/admin/delivery">← Terug naar Bezorging</a>
<div class="page-head"><div><h1>Link voor de bezorgdienst</h1><p>${esc(fmtLongDay(date))}</p></div></div>
<section class="card card__pad card--narrow">
<p><strong>Kopieer deze link nu.</strong> Hij wordt maar één keer getoond. Wie de link heeft, ziet de bezorglijst van deze dag: namen, adressen, telefoonnummers, producten en opmerkingen. Geen e-mailadressen en geen bedragen.</p>
<div class="field field--section"><label for="link">Link</label><input class="input" id="link" type="text" readonly value="${esc(link)}" data-select></div>
<div class="actions"><button class="btn btn--primary" type="button" data-copy="link">Kopieer link</button><a class="btn" href="/admin/delivery">Klaar</a></div>
<p class="note">De link werkt tot ${esc(fmtDateTime(result.expires_at))} (24 uur) en kan op de pagina Bezorging worden ingetrokken. Deel hem alleen met de bezorgdienst.</p>
</section>`, { user, csrf, active: 'delivery', counts });
}

export async function postRevoke(env, request, form) {
  if (!(await checkPost(request, env, form))) return redirect('/admin/delivery');
  const id = form.get('id');
  if (!isUuid(id)) return redirect('/admin/delivery');
  try {
    await rpc(env, 'delivery_share_revoke', { p_id: id });
  } catch (_) {
    return redirect(withMsg('/admin/delivery', 'mislukt'));
  }
  return redirect(withMsg('/admin/delivery', 'ingetrokken'));
}

// Alle klaargemaakte bestellingen van één tijdvak op Onderweg zetten; elke klant krijgt de korte mail.
export async function postRoute(env, ctx, request, user, form) {
  if (!(await checkPost(request, env, form))) return redirect('/admin/delivery');
  const date = form.get('date');
  const window = form.get('window');
  if (!isYmd(date) || !isWindow(window)) return redirect('/admin/delivery');
  let rows;
  try {
    rows = await select(env, 'orders', `select=order_number,status,email,customer_name,delivery_date,delivery_window&delivery_date=eq.${date}&delivery_window=eq.${encodeURIComponent(window)}&status=eq.klaargemaakt`);
  } catch (_) {
    return redirect(withMsg('/admin/delivery', 'mislukt'));
  }
  if (!rows.length) return redirect(withMsg('/admin/delivery', 'geen_route'));
  const origin = new URL(request.url).origin;
  for (const order of rows) {
    try {
      const res = await rpc(env, 'set_order_status', { p_order_number: Number(order.order_number), p_to: 'onderweg', p_actor: user, p_source: 'route', p_note: '' });
      if (res && res.changed) ctx.waitUntil(sendStatusMail(env, order, 'onderweg', user, origin));
    } catch (_) { /* de rest van de route gaat gewoon door */ }
  }
  return redirect(withMsg('/admin/delivery', 'route'));
}

// De gedeelde bezorglijst voor de bezorgdienst: geen login, wel een code die niet te raden is.
export async function sharedList(env, token) {
  const notFound = () => {
    const r = bare('Bezorglijst', '<div class="auth"><div class="auth__box"><h1>Deze link werkt niet</h1><p class="auth__lead">De link is verlopen, ingetrokken of niet juist. Vraag een nieuwe link bij BUYT.</p></div></div>');
    return new Response(r.body, { status: 404, headers: r.headers });
  };
  if (!isTokenShape(token)) return notFound();
  let date;
  try {
    date = await rpc(env, 'delivery_share_open', { p_hash: await hashToken(token) });
  } catch (_) {
    return notFound();
  }
  if (!date) return notFound();

  let orders = [];
  try {
    orders = await select(env, 'orders', `select=order_number,customer_name,phone,street,postcode,city,note,status,delivery_window,order_lines(qty,name)&delivery_date=eq.${date}&status=neq.geannuleerd&order=delivery_window.asc,order_number.asc`);
  } catch (_) {
    return bare('Bezorglijst', '<div class="auth"><div class="auth__box"><h1>Even geduld</h1><p class="auth__lead">De lijst kon niet worden geladen. Probeer het zo opnieuw.</p></div></div>');
  }
  const slots = new Map();
  for (const o of orders) {
    if (!slots.has(o.delivery_window)) slots.set(o.delivery_window, []);
    slots.get(o.delivery_window).push(o);
  }
  const stop = (o) => `<li class="stop${o.status === 'bezorgd' ? ' stop--done' : ''}"><div class="stop__main">
<div class="stop__top"><strong>${esc(o.customer_name)}</strong>${o.status === 'bezorgd' ? ' <span class="badge badge--bezorgd">Bezorgd</span>' : ''}</div>
<div class="stop__line"><a href="${esc(mapsUrl(o))}" target="_blank" rel="noopener noreferrer">${esc(addressLine(o))}</a></div>
${o.phone ? `<div class="stop__line"><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div>` : ''}
<div class="stop__line muted">${esc(linesSummary(o.order_lines))}</div>
${o.note ? `<div class="stop__note">${esc(o.note)}</div>` : ''}</div></li>`;
  const sections = [...slots].map(([w, list]) => `<section class="slot"><header class="slot__head"><div><h3>${esc(windowLabel(w))} uur</h3><span class="muted">${list.length} ${list.length === 1 ? 'adres' : 'adressen'}</span></div></header><ul class="stops">${list.map(stop).join('')}</ul></section>`).join('');
  return bare(`Bezorglijst ${fmtLongDay(date)}`, `<main class="shared">
<a class="auth__logo" href="/"><img src="/assets/logo-still.svg" alt="" width="44" height="41"><span>BUYT</span></a>
<h1>Bezorglijst</h1><p class="auth__lead">${esc(fmtLongDay(date))}</p>
${orders.length ? `<div class="stack">${sections}</div>` : '<p class="muted">Er zijn voor deze dag geen bestellingen.</p>'}
<p class="note">Deze link is 24 uur geldig en is alleen voor de bezorgdienst. Verwijder de gegevens na de bezorging.</p></main>`);
}
