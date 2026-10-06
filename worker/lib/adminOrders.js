// Home en Bestellingen van het beheer (ronde 1, zie docs/ontwerp-beheerportaal.md). Alle pagina's zijn
// gewone HTML van de Worker; wijzigingen gaan via formulieren (POST) met een CSRF-token. Statusregels
// staan in orderStatus.js, de wijziging zelf gebeurt in één databasestap (set_order_status).
import { select, rpc } from './supabase.js';
import { esc, layout, badge, flash, ICON } from './adminUi.js';
import {
  eur, fmtDateTime, fmtDelivery, fmtDeliveryShort, orderTotal, delta, PERIODS, periodOr, TABS, tabOr,
  PAGE_SIZE, pageOr, cleanQuery, greeting
} from './adminFormat.js';
import {
  STATUS_LABEL, SOURCE_LABEL, nextStep, previousSteps, canCancel, canChange, isBackward, mailFor
} from './orderStatus.js';
import { csrfToken, checkPost } from './adminAuth.js';
import { sendOrderConfirmation } from './resend.js';
import { orderOnTheWayEmail, orderDeliveredEmail, orderCancelledEmail } from './emailTemplates.js';

const LIST_COLUMNS = 'order_number,customer_name,city,status,total_estimate_cents,total_final_cents,is_indicative,has_unpriced,delivery_date,delivery_window,created_at';

const MESSAGES = {
  status: ['ok', 'Status bijgewerkt.'],
  note: ['ok', 'Notitie opgeslagen.'],
  geen_wijziging: ['err', 'Die wijziging is niet mogelijk voor deze bestelling.'],
  reden: ['err', 'Vul een korte reden in om te annuleren.'],
  notitie_leeg: ['err', 'Schrijf eerst een notitie.'],
  mislukt: ['err', 'Het opslaan is niet gelukt. Probeer het opnieuw.']
};

const redirect = (path) => new Response(null, { status: 303, headers: { Location: path } });
const valid = (n) => /^\d{1,12}$/.test(String(n));

// Wat elke pagina nodig heeft: CSRF-token en het aantal nieuwe bestellingen voor het getal in de navigatie.
async function chrome(env, request) {
  const csrf = await csrfToken(request, env);
  let newOrders = 0;
  try {
    const rows = await select(env, 'orders', 'select=order_number&status=eq.nieuw&limit=100');
    newOrders = rows.length;
  } catch (_) { /* navigatie werkt ook zonder getal */ }
  return { csrf, counts: { newOrders } };
}

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

// ---------------------------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------------------------
function deltaHtml(d) {
  return `<span class="delta delta--${d.dir}">${d.dir === 'up' ? '▲ ' : d.dir === 'down' ? '▼ ' : ''}${esc(d.text)}</span>`;
}

function kpiHtml(label, value, d) {
  return `<div class="kpi"><div class="kpi__label">${esc(label)}</div><div class="kpi__value">${value}</div>${deltaHtml(d)}</div>`;
}

export async function homePage(env, request, user, url) {
  const period = periodOr(url.searchParams.get('periode'));
  const { csrf, counts } = await chrome(env, request);
  let stats = null;
  let todo = null;
  let failed = false;
  try {
    [stats, todo] = await Promise.all([rpc(env, 'admin_home_stats', { p_period: period }), rpc(env, 'admin_todo', {})]);
  } catch (_) {
    failed = true;
  }

  const today = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date());
  let body = `<div class="hello"><h1>${esc(greeting())}, ${esc(user)}</h1><p>${esc(today)}</p></div>`;

  if (failed) {
    body += flash('De cijfers konden niet worden opgehaald. Is de database bijgewerkt (migratie 0006)?', 'err');
  } else {
    // Te doen
    const items = [];
    if (todo.new_orders > 0) {
      items.push(`<li><a href="/admin/orders?tab=nieuw"><span><strong>${todo.new_orders} ${todo.new_orders === 1 ? 'nieuwe bestelling' : 'nieuwe bestellingen'}</strong> om te verwerken</span>${ICON.chevron}</a></li>`);
    }
    const nd = todo.next_delivery;
    if (nd && nd.date) {
      items.push(`<li><a href="/admin/orders?tab=alle&amp;bezorging=${esc(nd.date)}"><span>Volgende bezorging: <strong>${esc(fmtDeliveryShort(nd.date, nd.window))}</strong> · ${nd.count} ${nd.count === 1 ? 'bestelling' : 'bestellingen'}</span>${ICON.chevron}</a></li>`);
    }
    body += `<section class="card" aria-labelledby="todo-h"><div class="card__pad card__pad--head"><h2 id="todo-h">Te doen</h2></div>${
      items.length ? `<ul class="todo">${items.join('')}</ul>` : '<p class="todo__empty">Niets te doen. Alles is verwerkt.</p>'
    }</section>`;

    // Cijfers
    const cur = stats.current;
    const prev = stats.previous;
    const aov = cur.orders > 0 ? Math.round(cur.revenue_cents / cur.orders) : 0;
    const aovPrev = prev.orders > 0 ? Math.round(prev.revenue_cents / prev.orders) : 0;
    const tabs = Object.entries(PERIODS).map(([k, label]) => `<a href="/admin?periode=${k}"${k === period ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
    body += `<div class="page-head page-head--section"><h2>Cijfers</h2><nav class="period" aria-label="Periode">${tabs}</nav></div>
<section class="card"><div class="kpis">
${kpiHtml('Omzet', eur(cur.revenue_cents), delta(cur.revenue_cents, prev.revenue_cents, prev.orders))}
${kpiHtml('Bestellingen', String(cur.orders), delta(cur.orders, prev.orders, prev.orders))}
${kpiHtml('Gemiddelde bestelwaarde', cur.orders > 0 ? eur(aov) : '–', delta(aov, aovPrev, prev.orders))}
</div></section>
${cur.indicative ? '<p class="note">Een deel van de bedragen is een schatting, omdat sommige producten op gewicht worden berekend. Geannuleerde bestellingen tellen niet mee.</p>' : '<p class="note">Geannuleerde bestellingen tellen niet mee.</p>'}`;

    // Populairste producten en klanten
    const top = stats.top || [];
    const max = top.length ? Math.max(...top.map((t) => t.qty)) : 1;
    const topHtml = top.length
      ? `<ol class="rank">${top.map((t) => `<li><div class="rank__row"><span>${esc(t.name)}</span><span class="tnum"><strong>${t.qty}</strong></span></div><progress class="bar" max="100" value="${Math.max(4, Math.round((t.qty / max) * 100))}" aria-hidden="true"></progress></li>`).join('')}</ol>`
      : '<p class="muted">Nog geen bestellingen in deze periode.</p>';
    const c = stats.customers || { new: 0, returning: 0 };
    const totalC = c.new + c.returning;
    const custHtml = totalC
      ? `<p><strong class="tnum">${totalC}</strong> ${totalC === 1 ? 'klant' : 'klanten'} in deze periode</p><progress class="bar bar--split" max="${totalC}" value="${c.new}" aria-label="${c.new} nieuw, ${c.returning} terugkerend"></progress><div class="legend"><span><i class="dot dot--new"></i>${c.new} nieuw</span><span><i class="dot dot--ret"></i>${c.returning} terugkerend</span></div>`
      : '<p class="muted">Nog geen klanten in deze periode.</p>';
    body += `<div class="grid-2 grid-2--gap"><section class="card card__pad"><h2>Populairste producten</h2>${topHtml}</section><section class="card card__pad"><h2>Klanten</h2>${custHtml}<p class="note">Terugkerend: had al eerder een bestelling, herkend op e-mailadres of telefoonnummer.</p></section></div>`;
  }
  return layout('Home', body, { user, csrf, active: 'home', counts });
}

// ---------------------------------------------------------------------------------------------
// Bestellingenlijst
// ---------------------------------------------------------------------------------------------
function rowHtml(o, csrf, back) {
  const next = nextStep(o.status);
  const action = next
    ? `<form method="post" action="/admin/orders/${o.order_number}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="${next.to}"><input type="hidden" name="back" value="${esc(back)}"><button class="btn btn--sm" type="submit">${esc(next.label)}</button></form>`
    : '';
  return `<tr>
<td class="c-main"><a class="row-link" href="/admin/orders/${o.order_number}">BUYT-${o.order_number}</a><span class="cell-sub">${esc(fmtDateTime(o.created_at))}</span></td>
<td class="c-status" data-label="">${badge(o.status)}</td>
<td class="c-wide">${esc(o.customer_name)}<span class="cell-sub">${esc(o.city)}</span></td>
<td class="c-wide" data-label="Bezorging:">${esc(fmtDeliveryShort(o.delivery_date, o.delivery_window))}</td>
<td class="num tnum c-wide" data-label="Totaal:">${esc(orderTotal(o))}</td>
<td class="c-act"><div class="row-actions">${action}</div></td>
</tr>`;
}

function tableHtml(rows, csrf, back) {
  return `<div class="card table-wrap"><table class="table"><thead><tr><th scope="col">Bestelling</th><th scope="col">Status</th><th scope="col">Klant</th><th scope="col">Bezorging</th><th scope="col" class="num">Totaal</th><th scope="col"><span class="sr">Actie</span></th></tr></thead><tbody>${rows.map((o) => rowHtml(o, csrf, back)).join('')}</tbody></table></div>`;
}

const EMPTY = {
  nieuw: ['Geen nieuwe bestellingen', 'Zodra iemand bestelt, staat de bestelling hier en krijg je een melding.'],
  klaargemaakt: ['Niets klaargemaakt', 'Bestellingen die ingepakt zijn, staan hier tot ze onderweg gaan.'],
  onderweg: ['Niets onderweg', 'Bestellingen die onderweg zijn, staan hier tot ze bezorgd zijn.'],
  bezorgd: ['Nog niets bezorgd', 'Bezorgde bestellingen komen hier te staan.'],
  alle: ['Nog geen bestellingen', 'Zodra de winkel open is en iemand bestelt, staan ze hier.']
};

const searchForm = (csrf, q = '') => `<form class="toolbar" method="post" action="/admin/orders" role="search">${csrfField(csrf)}<label class="sr" for="q">Zoek een bestelling</label><input class="input" id="q" name="q" type="search" value="${esc(q)}" placeholder="Zoek een bestelling" autocomplete="off" maxlength="60"><button class="btn" type="submit">Zoeken</button></form>`;

export async function ordersPage(env, request, user, url, msg) {
  const tab = tabOr(url.searchParams.get('tab'));
  const page = pageOr(url.searchParams.get('pagina'));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('bezorging') || '') ? url.searchParams.get('bezorging') : null;
  const { csrf, counts } = await chrome(env, request);

  let rows = [];
  let tally = {};
  let failed = false;
  try {
    let q = `select=${LIST_COLUMNS}&order=created_at.desc&limit=${PAGE_SIZE + 1}&offset=${(page - 1) * PAGE_SIZE}`;
    if (tab !== 'alle') q += `&status=eq.${tab}`;
    if (date) q += `&delivery_date=eq.${date}`;
    const [list, statuses] = await Promise.all([select(env, 'orders', q), select(env, 'orders', 'select=status&limit=5000')]);
    rows = list;
    for (const s of statuses) tally[s.status] = (tally[s.status] || 0) + 1;
  } catch (_) {
    failed = true;
  }

  const hasNext = rows.length > PAGE_SIZE;
  rows = rows.slice(0, PAGE_SIZE);
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const base = date ? `&amp;bezorging=${date}` : '';
  const tabsHtml = TABS.map((t) => {
    const n = t === 'alle' ? total : tally[t] || 0;
    return `<a href="/admin/orders?tab=${t}${base}"${t === tab ? ' aria-current="page"' : ''}>${esc(t === 'alle' ? 'Alle' : STATUS_LABEL[t])}<span class="n">${n}</span></a>`;
  }).join('');

  let body = `<div class="page-head"><div><h1>Bestellingen</h1>${date ? `<p>Bezorging op ${esc(fmtDelivery(date, '00:00-00:00').split(',')[0])}. <a href="/admin/orders?tab=${tab}">Filter wissen</a></p>` : ''}</div></div>`;
  if (msg) body += flash(msg[1], msg[0]);
  body += `${searchForm(csrf)}<nav class="tabs" aria-label="Status">${tabsHtml}</nav>`;

  if (failed) {
    body += '<p class="card card__pad error" role="alert">Kon de bestellingen niet ophalen. Probeer het later opnieuw.</p>';
  } else if (!rows.length) {
    body += `<div class="card empty"><h2>${esc(EMPTY[tab][0])}</h2><p>${esc(EMPTY[tab][1])}</p></div>`;
  } else {
    body += tableHtml(rows, csrf, tab);
    if (page > 1 || hasNext) {
      const prev = page > 1 ? `<a href="/admin/orders?tab=${tab}${base}&amp;pagina=${page - 1}">← Vorige</a>` : '<span></span>';
      const next = hasNext ? `<a href="/admin/orders?tab=${tab}${base}&amp;pagina=${page + 1}">Volgende →</a>` : '<span></span>';
      body += `<div class="pager">${prev}<span>Pagina ${page}</span>${next}</div>`;
    }
  }
  return layout('Bestellingen', body, { user, csrf, active: 'orders', counts });
}

// Zoeken gaat met een formulier (POST) zodat namen en e-mailadressen niet in het webadres terechtkomen.
export async function searchOrders(env, request, user, form) {
  const { csrf, counts } = await chrome(env, request);
  if (!(await checkPost(request, env, form))) return redirect('/admin/orders');
  const q = cleanQuery(form.get('q'));
  let rows = [];
  let failed = false;
  if (q) {
    try {
      const enc = encodeURIComponent(q);
      const number = /^(buyt-)?(\d{1,12})$/i.exec(q);
      const filters = [`customer_name.ilike.*${enc}*`, `email.ilike.*${enc}*`, `city.ilike.*${enc}*`, `phone.ilike.*${enc}*`];
      if (number) filters.unshift(`order_number.eq.${number[2]}`);
      rows = await select(env, 'orders', `select=${LIST_COLUMNS}&or=(${filters.join(',')})&order=created_at.desc&limit=50`);
    } catch (_) {
      failed = true;
    }
  }
  let body = `<div class="page-head"><div><h1>Bestellingen</h1><p>${q ? `Zoekresultaten voor “${esc(q)}”` : 'Vul een zoekterm in.'} · <a href="/admin/orders">Alle bestellingen</a></p></div></div>${searchForm(csrf, q)}`;
  if (failed) body += '<p class="card card__pad error" role="alert">Zoeken is niet gelukt. Probeer het opnieuw.</p>';
  else if (!rows.length) body += `<div class="card empty"><h2>Niets gevonden</h2><p>Probeer een ander deel van de naam, het e-mailadres of het bestelnummer.</p></div>`;
  else body += tableHtml(rows, csrf, 'alle');
  return layout('Zoeken', body, { user, csrf, active: 'orders', counts });
}

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------
function timelineHtml(order, events) {
  const items = events.map((e) => {
    const by = `<span class="by">door ${esc(e.actor)} · ${esc(SOURCE_LABEL[e.source] || e.source)}</span>`;
    const when = `<span class="when">${esc(fmtDateTime(e.at))}</span>`;
    if (e.type === 'status') {
      const text = `${esc(STATUS_LABEL[e.from_status] || e.from_status)} → <strong>${esc(STATUS_LABEL[e.to_status] || e.to_status)}</strong>`;
      return `<li class="t-status">${when}<span>${text}</span> ${by}${e.note ? `<div class="tnote">${esc(e.note)}</div>` : ''}</li>`;
    }
    if (e.type === 'note') return `<li>${when}<span>Notitie</span> ${by}<div class="tnote">${esc(e.note)}</div></li>`;
    return `<li>${when}<span>${esc(e.note)}</span></li>`;
  });
  items.push(`<li class="t-status"><span class="when">${esc(fmtDateTime(order.created_at))}</span><span>Bestelling geplaatst</span></li>`);
  return `<ol class="timeline" reversed>${items.join('')}</ol>`;
}

export async function orderDetailPage(env, request, user, number, url) {
  const { csrf, counts } = await chrome(env, request);
  const back = '<a class="back" href="/admin/orders">← Alle bestellingen</a>';
  if (!valid(number)) return layout('Bestelling', `${back}<div class="card empty"><h2>Bestelling niet gevonden</h2></div>`, { user, csrf, active: 'orders', counts, status: 404 });

  let o;
  let events = [];
  try {
    const rows = await select(env, 'orders', `select=*,order_lines(*)&order_number=eq.${number}`);
    o = rows[0];
    if (o) events = await select(env, 'order_events', `select=*&order_id=eq.${o.id}&order=at.desc,id.desc`);
  } catch (_) {
    return layout('Bestelling', `${back}<p class="card card__pad error" role="alert">Kon de bestelling niet ophalen. Probeer het later opnieuw.</p>`, { user, csrf, active: 'orders', counts, status: 500 });
  }
  if (!o) return layout('Bestelling', `${back}<div class="card empty"><h2>Bestelling niet gevonden</h2><p>Deze bestelling bestaat niet (meer).</p></div>`, { user, csrf, active: 'orders', counts, status: 404 });

  const msgKey = url.searchParams.get('m');
  const msg = MESSAGES[msgKey] || null;
  const action = `/admin/orders/${o.order_number}`;
  const next = nextStep(o.status);
  const prevs = previousSteps(o.status);

  const primary = next
    ? `<form method="post" action="${action}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="${next.to}"><input type="hidden" name="back" value="detail"><button class="btn btn--primary" type="submit">${esc(next.label)}</button></form>`
    : '';

  const mailHint = (kind) => ({ onderweg: 'De klant krijgt een korte mail dat de bestelling onderweg is.', bezorgd: 'De klant krijgt een mail dat de bestelling bezorgd is.' }[kind] || '');
  const nextMail = next ? mailHint(mailFor(o.status, next.to)) : '';

  const more = [];
  if (prevs.length) {
    more.push(`<details class="more"><summary>Status terugzetten</summary><div class="more__body"><form method="post" action="${action}/status" data-once class="stack">${csrfField(csrf)}<input type="hidden" name="back" value="detail">
<div class="field"><label for="to">Terug naar</label><select id="to" name="to">${prevs.map((s) => `<option value="${s}">${esc(STATUS_LABEL[s])}</option>`).join('')}</select></div>
<div class="field"><label for="why">Reden (optioneel)</label><textarea id="why" name="note" maxlength="500" rows="2"></textarea></div>
<p class="hint">Er wordt geen mail gestuurd bij terugzetten.</p>
<button class="btn" type="submit">Terugzetten</button></form></div></details>`);
  }
  if (canCancel(o.status)) {
    more.push(`<details class="more"><summary>Bestelling annuleren</summary><div class="more__body"><form method="post" action="${action}/status" data-once class="stack">${csrfField(csrf)}<input type="hidden" name="to" value="geannuleerd"><input type="hidden" name="back" value="detail">
<div class="field"><label for="reason">Reden</label><textarea id="reason" name="note" maxlength="500" rows="2" required></textarea></div>
<label class="check"><input type="checkbox" name="mail"> Stuur de klant een mail dat de bestelling is geannuleerd</label>
<p class="hint">Het bezorgmoment komt weer vrij. Een geannuleerde bestelling kan niet worden heropend.</p>
<button class="btn btn--danger" type="submit">Annuleren</button></form></div></details>`);
  }

  const lines = (o.order_lines || []).map((l) => `<tr><td><strong class="tnum">${l.qty}×</strong> ${esc(l.name)}${l.pack ? `<span class="cell-sub">${esc(l.pack)}</span>` : ''}</td><td class="r tnum">${esc(l.price_label)}</td></tr>`).join('');

  const main = `
<section class="card card__pad"><h2>Producten</h2><table class="lines"><tbody>${lines || '<tr><td>Geen regels gevonden</td><td></td></tr>'}</tbody></table>
<div class="total"><span>Totaal</span><span class="tnum">${esc(orderTotal(o))}</span></div>${o.has_unpriced ? '<p class="note">Sommige producten worden op gewicht berekend; het definitieve bedrag volgt na het wegen.</p>' : ''}</section>
<section class="card card__pad"><h2>Klant</h2><dl class="dl">
<dt>Naam</dt><dd>${esc(o.customer_name)}</dd>
<dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
${o.phone ? `<dt>Telefoon</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd>` : ''}
<dt>Adres</dt><dd>${esc(o.street)}<br>${esc(o.postcode)} ${esc(o.city)}</dd>
${o.note ? `<dt>Opmerking</dt><dd>${esc(o.note)}</dd>` : ''}
</dl></section>
<section class="card card__pad"><h2>Bezorging</h2><dl class="dl"><dt>Wanneer</dt><dd>${esc(fmtDelivery(o.delivery_date, o.delivery_window))}</dd></dl></section>`;

  const side = `
<section class="card card__pad"><h2>Tijdlijn</h2>
<form method="post" action="${action}/note" class="stack stack--note">${csrfField(csrf)}<div class="field"><label for="note">Notitie toevoegen</label><textarea id="note" name="note" maxlength="1000" rows="2" required></textarea></div><button class="btn btn--sm btn--start" type="submit">Opslaan</button></form>
${timelineHtml(o, events)}</section>`;

  const body = `${back}
<div class="page-head"><div><h1>BUYT-${o.order_number} ${badge(o.status)}</h1><p>Geplaatst op ${esc(fmtDateTime(o.created_at))}</p></div>
<div class="actions">${primary}</div></div>
${msg ? flash(msg[1], msg[0]) : ''}
${nextMail ? `<p class="note note--tight">${esc(nextMail)}</p>` : ''}
<div class="detail"><div class="stack">${main}</div><div class="stack">${side}${more.length ? `<div class="stack">${more.join('')}</div>` : ''}</div></div>`;
  return layout(`BUYT-${o.order_number}`, body, { user, csrf, active: 'orders', counts });
}

// ---------------------------------------------------------------------------------------------
// Wijzigingen (POST)
// ---------------------------------------------------------------------------------------------
const backPath = (back, number) => {
  if (back === 'detail') return `/admin/orders/${number}`;
  return `/admin/orders?tab=${tabOr(back)}`;
};
const withMsg = (path, key) => `${path}${path.includes('?') ? '&' : '?'}m=${key}`;

const MAIL_BUILDERS = { onderweg: orderOnTheWayEmail, bezorgd: orderDeliveredEmail, geannuleerd: orderCancelledEmail };
const MAIL_NAME = { onderweg: 'Onderweg-mail', bezorgd: 'Bezorgd-mail', geannuleerd: 'Annuleringsmail' };

// Verstuurt de statusmail en zet het resultaat in de tijdlijn. Een mislukte mail laat de statuswijziging
// nooit mislukken.
async function sendStatusMail(env, order, kind, actor, origin) {
  let sent = false;
  try {
    const mail = MAIL_BUILDERS[kind](order, origin);
    ({ sent } = await sendOrderConfirmation(env, mail));
  } catch (_) {
    sent = false;
  }
  try {
    await rpc(env, 'add_order_event', {
      p_order_number: order.order_number, p_type: 'mail', p_actor: actor, p_source: 'systeem',
      p_note: sent ? `${MAIL_NAME[kind]} verstuurd naar de klant` : `${MAIL_NAME[kind]} kon niet worden verstuurd`
    });
  } catch (_) { /* tijdlijn is aanvullend */ }
}

export async function postStatus(env, ctx, request, user, number, form) {
  if (!valid(number)) return redirect('/admin/orders');
  const back = backPath(form.get('back'), number);
  if (!(await checkPost(request, env, form))) return redirect('/admin/orders');

  let order;
  try {
    [order] = await select(env, 'orders', `select=order_number,status,email,customer_name,delivery_date,delivery_window&order_number=eq.${number}`);
  } catch (_) {
    return redirect(withMsg(back, 'mislukt'));
  }
  if (!order) return redirect('/admin/orders');

  const to = form.get('to') || '';
  const note = (form.get('note') || '').trim().slice(0, 500);
  if (!canChange(order.status, to)) return redirect(withMsg(back, 'geen_wijziging'));
  if (to === 'geannuleerd' && !note) return redirect(withMsg(back, 'reden'));

  let result;
  try {
    result = await rpc(env, 'set_order_status', { p_order_number: Number(number), p_to: to, p_actor: user, p_source: 'handmatig', p_note: note });
  } catch (_) {
    return redirect(withMsg(back, 'mislukt'));
  }

  if (result && result.changed) {
    const kind = mailFor(result.from, to, { sendCancelMail: form.get('mail') === 'on' });
    if (kind && !isBackward(result.from, to)) {
      ctx.waitUntil(sendStatusMail(env, order, kind, user, new URL(request.url).origin));
    }
  }
  return redirect(withMsg(back, 'status'));
}

export async function postNote(env, request, user, number, form) {
  if (!valid(number)) return redirect('/admin/orders');
  const back = `/admin/orders/${number}`;
  if (!(await checkPost(request, env, form))) return redirect('/admin/orders');
  const note = (form.get('note') || '').trim().slice(0, 1000);
  if (!note) return redirect(withMsg(back, 'notitie_leeg'));
  try {
    await rpc(env, 'add_order_event', { p_order_number: Number(number), p_type: 'note', p_actor: user, p_source: 'handmatig', p_note: note });
  } catch (_) {
    return redirect(withMsg(back, 'mislukt'));
  }
  return redirect(withMsg(back, 'note'));
}
