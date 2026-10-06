// Klanten (met Berichten), Zakelijk en Meer (ronde 2, zie docs/ontwerp-beheerportaal.md).
import { select, rpc, SupabaseError } from './supabase.js';
import { esc, layout, flash, ICON } from './adminUi.js';
import { eur, fmtDateTime, isUuid } from './adminFormat.js';
import { groupCustomers } from './customers.js';
import { REQUEST_LABEL, BUSINESS_STATUSES, nextRequestStep, canSet, parseRequestMessage } from './requestStatus.js';
import { checkPost } from './adminAuth.js';
import { chrome, csrfField, redirect, withMsg, MESSAGES } from './adminOrders.js';

const requestBadge = (status) => `<span class="badge badge--r-${esc(status)}">${esc(REQUEST_LABEL[status] || status)}</span>`;
const mailto = (email, subject) => `mailto:${esc(email)}?subject=${encodeURIComponent(subject)}`;

// ---------------------------------------------------------------------------------------------
// Klanten
// ---------------------------------------------------------------------------------------------
export async function customersPage(env, request, user, url) {
  const tab = url.searchParams.get('tab') === 'berichten' ? 'berichten' : 'klanten';
  const msg = MESSAGES[url.searchParams.get('m')] || null;
  const { csrf, counts } = await chrome(env, request);
  let body = `<div class="page-head"><div><h1>Klanten</h1><p>Wie bestelt bij jullie, en wat ze ons vragen.</p></div></div>
<nav class="tabs" aria-label="Klanten"><a href="/admin/customers"${tab === 'klanten' ? ' aria-current="page"' : ''}>Klanten</a><a href="/admin/customers?tab=berichten"${tab === 'berichten' ? ' aria-current="page"' : ''}>Berichten${counts.newMessages ? `<span class="count">${counts.newMessages}</span>` : ''}</a></nav>`;
  if (msg) body += flash(msg[1], msg[0]);

  if (tab === 'klanten') {
    let orders = [];
    let failed = false;
    try {
      orders = await select(env, 'orders', 'select=order_number,customer_name,email,phone,city,status,created_at,total_estimate_cents,total_final_cents&order=created_at.desc&limit=5000');
    } catch (_) {
      failed = true;
    }
    const list = groupCustomers(orders);
    if (failed) {
      body += '<p class="card card__pad error" role="alert">Kon de klanten niet ophalen. Probeer het later opnieuw.</p>';
    } else if (!list.length) {
      body += '<div class="card empty"><h2>Nog geen klanten</h2><p>Zodra iemand bestelt, staat de klant hier. Dezelfde klant wordt herkend aan het e-mailadres of het telefoonnummer.</p></div>';
    } else {
      body += `<div class="card table-wrap"><table class="table"><thead><tr><th scope="col">Klant</th><th scope="col">Plaats</th><th scope="col" class="num">Bestellingen</th><th scope="col" class="num">Besteed</th><th scope="col">Laatste bestelling</th><th scope="col">Soort</th></tr></thead><tbody>${list.map((c) => `<tr>
<td class="c-main"><a class="row-link" href="/admin/customers/${c.key}">${esc(c.name)}</a><span class="cell-sub">${esc(c.email)}</span></td>
<td class="c-wide" data-label="Plaats:">${esc(c.city)}</td>
<td class="num tnum c-wide" data-label="Bestellingen:">${c.orders}</td>
<td class="num tnum c-wide" data-label="Besteed:">${esc(eur(c.totalCents))}</td>
<td class="c-wide" data-label="Laatste:">${esc(fmtDateTime(c.lastAt))}</td>
<td class="c-status"><span class="badge badge--${c.returning ? 'c-ret' : 'c-new'}">${c.returning ? 'Terugkerend' : 'Nieuw'}</span></td>
</tr>`).join('')}</tbody></table></div>`;
    }
  } else {
    let rows = [];
    let failed = false;
    try {
      rows = await select(env, 'business_requests', 'select=id,created_at,name,email,message,status,handled_by&type=eq.particulier&order=created_at.desc&limit=100');
    } catch (_) {
      failed = true;
    }
    if (failed) body += '<p class="card card__pad error" role="alert">Kon de berichten niet ophalen. Probeer het later opnieuw.</p>';
    else if (!rows.length) body += '<div class="card empty"><h2>Geen berichten</h2><p>Vragen uit het contactformulier staan hier, met een knop om te antwoorden.</p></div>';
    else body += `<div class="stack">${rows.map((q) => requestCard(q, 'particulier', csrf, '/admin/customers?tab=berichten')).join('')}</div>`;
  }
  return layout('Klanten', body, { user, csrf, active: 'customers', counts });
}

export async function customerDetailPage(env, request, user, key) {
  const { csrf, counts } = await chrome(env, request);
  const back = '<a class="back" href="/admin/customers">← Alle klanten</a>';
  let orders = [];
  try {
    orders = await select(env, 'orders', 'select=order_number,customer_name,email,phone,street,postcode,city,status,created_at,total_estimate_cents,total_final_cents,is_indicative,has_unpriced&order=created_at.desc&limit=5000');
  } catch (_) {
    return layout('Klant', `${back}<p class="card card__pad error" role="alert">Kon de klant niet ophalen. Probeer het later opnieuw.</p>`, { user, csrf, active: 'customers', counts, status: 500 });
  }
  const customer = groupCustomers(orders).find((c) => c.orderNumbers.includes(Number(key)));
  if (!customer) return layout('Klant', `${back}<div class="card empty"><h2>Klant niet gevonden</h2></div>`, { user, csrf, active: 'customers', counts, status: 404 });
  const mine = orders.filter((o) => customer.orderNumbers.includes(Number(o.order_number)) || (o.status === 'geannuleerd' && o.email && o.email.toLowerCase() === String(customer.email).toLowerCase()));
  const latest = mine[0];
  const rows = mine.map((o) => `<tr><td class="c-main"><a class="row-link" href="/admin/orders/${o.order_number}">BUYT-${o.order_number}</a><span class="cell-sub">${esc(fmtDateTime(o.created_at))}</span></td><td class="c-status"><span class="badge badge--${esc(o.status)}">${esc({ nieuw: 'Nieuw', klaargemaakt: 'Klaargemaakt', onderweg: 'Onderweg', bezorgd: 'Bezorgd', geannuleerd: 'Geannuleerd' }[o.status] || o.status)}</span></td><td class="num tnum c-wide" data-label="Totaal:">${esc(eur(o.total_final_cents ?? o.total_estimate_cents))}</td></tr>`).join('');
  const body = `${back}
<div class="page-head"><div><h1>${esc(customer.name)} <span class="badge badge--${customer.returning ? 'c-ret' : 'c-new'}">${customer.returning ? 'Terugkerend' : 'Nieuw'}</span></h1><p>Eerste bestelling ${esc(fmtDateTime(customer.firstAt))}</p></div></div>
<div class="detail"><div class="stack"><section class="card table-wrap"><table class="table"><thead><tr><th scope="col">Bestelling</th><th scope="col">Status</th><th scope="col" class="num">Totaal</th></tr></thead><tbody>${rows}</tbody></table></section></div>
<div class="stack"><section class="card card__pad"><h2>Gegevens</h2><dl class="dl">
<dt>E-mail</dt><dd><a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a></dd>
${customer.phone ? `<dt>Telefoon</dt><dd><a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a></dd>` : ''}
${latest ? `<dt>Adres</dt><dd>${esc(latest.street)}<br>${esc(latest.postcode)} ${esc(latest.city)}</dd>` : ''}
<dt>Bestellingen</dt><dd class="tnum">${customer.orders}</dd>
<dt>Besteed</dt><dd class="tnum">${esc(eur(customer.totalCents))}</dd>
</dl></section></div></div>`;
  return layout(customer.name, body, { user, csrf, active: 'customers', counts });
}

// ---------------------------------------------------------------------------------------------
// Berichten en zakelijke aanvragen (zelfde kaart)
// ---------------------------------------------------------------------------------------------
function requestCard(q, type, csrf, back) {
  const p = parseRequestMessage(q.message);
  const next = nextRequestStep(type, q.status);
  const nextForm = next
    ? `<form method="post" action="/admin/requests/${esc(q.id)}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="${next.to}"><input type="hidden" name="back" value="${esc(back)}"><button class="btn btn--sm" type="submit">${esc(next.label)}</button></form>`
    : '';
  const lostForm = type === 'zakelijk' && canSet(type, 'verloren') && q.status !== 'verloren' && q.status !== 'gewonnen'
    ? `<form method="post" action="/admin/requests/${esc(q.id)}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="verloren"><input type="hidden" name="back" value="${esc(back)}"><button class="btn btn--sm btn--ghost" type="submit">Markeer als verloren</button></form>`
    : '';
  const reopen = (type === 'particulier' && q.status === 'beantwoord') || (type === 'zakelijk' && (q.status === 'verloren' || q.status === 'gewonnen'))
    ? `<form method="post" action="/admin/requests/${esc(q.id)}/status" data-once>${csrfField(csrf)}<input type="hidden" name="to" value="${type === 'zakelijk' ? 'in_gesprek' : 'nieuw'}"><input type="hidden" name="back" value="${esc(back)}"><button class="linklike" type="submit">${type === 'zakelijk' ? 'Weer in gesprek zetten' : 'Terugzetten naar nieuw'}</button></form>`
    : '';
  const title = type === 'zakelijk' && p.company ? p.company : q.name;
  return `<article class="card card__pad req">
<header class="req__head"><div><h2>${esc(title)}</h2><p class="muted">${type === 'zakelijk' && p.company ? `${esc(q.name)} · ` : ''}<a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${p.phone ? ` · <a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''} · ${esc(fmtDateTime(q.created_at))}</p></div>${requestBadge(q.status)}</header>
${p.body ? `<p class="req__body">${esc(p.body)}</p>` : '<p class="muted">Geen bericht.</p>'}
<div class="actions"><a class="btn btn--sm" href="${mailto(q.email, type === 'zakelijk' ? 'Je aanvraag bij BUYT' : 'Je vraag aan BUYT')}">Antwoorden via e-mail</a>${nextForm}${lostForm}${reopen}</div>
${q.handled_by && q.status !== 'nieuw' ? `<p class="note">Laatst bijgewerkt door ${esc(q.handled_by)}</p>` : ''}
</article>`;
}

// ---------------------------------------------------------------------------------------------
// Zakelijk
// ---------------------------------------------------------------------------------------------
const BIZ_TABS = [...BUSINESS_STATUSES, 'alle', 'contacten'];
const bizTab = (t) => (BIZ_TABS.includes(t) ? t : 'nieuw');

export async function businessPage(env, request, user, url) {
  const tab = bizTab(url.searchParams.get('tab'));
  const msg = MESSAGES[url.searchParams.get('m')] || null;
  const { csrf, counts } = await chrome(env, request);
  let rows = [];
  let failed = false;
  try {
    rows = await select(env, 'business_requests', 'select=id,created_at,name,email,message,status,handled_by&type=eq.zakelijk&order=created_at.desc&limit=500');
  } catch (_) {
    failed = true;
  }
  const tally = {};
  for (const q of rows) tally[q.status] = (tally[q.status] || 0) + 1;
  const label = (t) => (t === 'alle' ? 'Alle' : t === 'contacten' ? 'Contacten' : REQUEST_LABEL[t]);
  const tabsHtml = BIZ_TABS.map((t) => `<a href="/admin/business?tab=${t}"${t === tab ? ' aria-current="page"' : ''}>${esc(label(t))}${t === 'contacten' ? '' : `<span class="n">${t === 'alle' ? rows.length : tally[t] || 0}</span>`}</a>`).join('');

  let body = `<div class="page-head"><div><h1>Zakelijk</h1><p>Aanvragen van horeca en bedrijven, van eerste vraag tot gewonnen deal.</p></div></div>`;
  if (msg) body += flash(msg[1], msg[0]);
  body += `<nav class="tabs" aria-label="Verloop">${tabsHtml}</nav>`;

  if (failed) {
    body += '<p class="card card__pad error" role="alert">Kon de aanvragen niet ophalen. Probeer het later opnieuw.</p>';
  } else if (tab === 'contacten') {
    const byMail = new Map();
    for (const q of rows) {
      const k = q.email.trim().toLowerCase();
      const p = parseRequestMessage(q.message);
      const cur = byMail.get(k) || { name: q.name, company: p.company, email: q.email, count: 0, last: q.created_at, status: q.status };
      cur.count += 1;
      if (!cur.company && p.company) cur.company = p.company;
      byMail.set(k, cur);
    }
    const list = [...byMail.values()];
    body += list.length
      ? `<div class="card table-wrap"><table class="table"><thead><tr><th scope="col">Contact</th><th scope="col">Bedrijf</th><th scope="col" class="num">Aanvragen</th><th scope="col">Laatste aanvraag</th><th scope="col">Laatste status</th></tr></thead><tbody>${list.map((c) => `<tr><td class="c-main"><strong>${esc(c.name)}</strong><span class="cell-sub"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></span></td><td class="c-wide" data-label="Bedrijf:">${esc(c.company || '–')}</td><td class="num tnum c-wide" data-label="Aanvragen:">${c.count}</td><td class="c-wide" data-label="Laatste:">${esc(fmtDateTime(c.last))}</td><td class="c-status">${requestBadge(c.status)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty"><h2>Nog geen contacten</h2><p>Bedrijven die een aanvraag doen, komen hier te staan.</p></div>';
  } else {
    const shown = tab === 'alle' ? rows : rows.filter((q) => q.status === tab);
    body += shown.length
      ? `<div class="stack">${shown.map((q) => requestCard(q, 'zakelijk', csrf, `/admin/business?tab=${tab}`)).join('')}</div>`
      : `<div class="card empty"><h2>${tab === 'nieuw' ? 'Geen nieuwe aanvragen' : 'Niets in deze lijst'}</h2><p>Aanvragen van het zakelijke formulier en de pagina Zakelijk bestellen staan hier, met een eigen verloop.</p></div>`;
  }
  return layout('Zakelijk', body, { user, csrf, active: 'business', counts });
}

// ---------------------------------------------------------------------------------------------
// Status van een bericht of aanvraag wijzigen
// ---------------------------------------------------------------------------------------------
const backTo = (back) => {
  if (back === '/admin/customers?tab=berichten') return back;
  const m = /^\/admin\/business\?tab=([a-z_]+)$/.exec(back || '');
  return m && bizTab(m[1]) === m[1] ? back : '/admin/business';
};

export async function postRequestStatus(env, request, user, id, form) {
  const back = backTo(form.get('back'));
  if (!isUuid(id) || !(await checkPost(request, env, form))) return redirect(back);
  const to = form.get('to') || '';
  let row;
  try {
    [row] = await select(env, 'business_requests', `select=type,status&id=eq.${id}`);
  } catch (_) {
    return redirect(withMsg(back, 'mislukt'));
  }
  if (!row || !canSet(row.type, to)) return redirect(withMsg(back, 'geen_wijziging'));
  try {
    await rpc(env, 'set_request_status', { p_id: id, p_to: to, p_actor: user });
  } catch (e) {
    return redirect(withMsg(back, e instanceof SupabaseError && e.status === 404 ? 'geen_tabel' : 'mislukt'));
  }
  return redirect(withMsg(back, 'aanvraag'));
}

// ---------------------------------------------------------------------------------------------
// Meer (telefoon): wat niet in de tabbalk past
// ---------------------------------------------------------------------------------------------
export async function morePage(env, request, user) {
  const { csrf, counts } = await chrome(env, request);
  const body = `<div class="page-head"><div><h1>Meer</h1></div></div>
<section class="card"><ul class="todo">
<li><a href="/admin/business"><span>Zakelijk${counts.newBusiness ? ` <span class="count">${counts.newBusiness}</span>` : ''}</span>${ICON.chevron}</a></li>
<li><a href="/admin/setup-2fa"><span>2FA-sleutel maken</span>${ICON.chevron}</a></li>
</ul></section>
<form method="post" action="/admin/logout" class="more-out">${csrfField(csrf)}<button class="btn btn--block" type="submit">Uitloggen (${esc(user)})</button></form>`;
  return layout('Meer', body, { user, csrf, active: 'more', counts });
}
