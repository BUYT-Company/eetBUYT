// Worker voor eetbuyt.nl: alleen /api/*. Alle andere paden komen uit de statische bestanden (env.ASSETS).
// Fase 1: bestelaanvragen (POST /api/order) en zakelijke aanvragen (POST /api/request) vastleggen in Supabase.
import { validateOrder, validateRequest, formatEuro, isValidEmail } from './lib/validate.js';
import { verifyTurnstile } from './lib/turnstile.js';
import { rpc, insert, select, SupabaseError } from './lib/supabase.js';
import { notifyOwner } from './lib/notify.js';
import { sendOrderConfirmation, sendBusinessRequestMail } from './lib/resend.js';
import { orderConfirmationEmail, orderInternalEmail } from './lib/emailTemplates.js';
import { upcomingDates, formatDelivery } from './lib/delivery.js';
import { currentUserName, handleLogin, logoutResponse, redirectToLogin, setup2fa, csrfToken, checkPost } from './lib/adminAuth.js';
import { assetResponse } from './lib/adminUi.js';
import { homePage, ordersPage, searchOrders, orderDetailPage, postStatus, postNote } from './lib/adminOrders.js';
import { deliveryPage, postShare, postRevoke, postRoute, sharedList } from './lib/adminDelivery.js';
import { analyticsPage } from './lib/adminAnalytics.js';
import { customersPage, customerDetailPage, businessPage, postRequestStatus, morePage } from './lib/adminPeople.js';

// Verkoopschakelaar: SALES_OPEN staat in wrangler.jsonc. Staat die niet op "true", dan kunnen alleen
// ingelogde beheerders (/admin/login) bestellen. Dit is de echte afsluiting; de blur op de site is alleen de weergave.
const salesOpen = (env) => env.SALES_OPEN === 'true';
const isDeveloper = async (request, env) => Boolean(await currentUserName(request, env));

async function handleShopStatus(request, env) {
  const open = salesOpen(env);
  return json(200, { ok: true, open, dev: !open && (await isDeveloper(request, env)) });
}

const MAX_PER_SLOT = 5; // zelfde getal als in supabase/migrations/0004 (daar is het de echte grens)

const MAX_BODY_BYTES = 20 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
const error = (status, code) => json(status, { ok: false, error: code });

const redirect = (request, path) => new Response(null, { status: 303, headers: { Location: new URL(path, request.url).toString() } });

const formPage = (status, text) =>
  new Response(`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BUYT</title><p style="font:16px/1.5 system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${text} <a href="/">Terug naar de site</a></p>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });

// Alleen verzoeken vanaf de eigen site (als de browser een Origin meestuurt).
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

// Leest de aanvraag als JSON of (voor bezoekers zonder JavaScript) als gewoon formulier.
async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MAX_BODY_BYTES) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { tooLarge: true };

  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    try { return { data: JSON.parse(text), form: false }; } catch (_) { return { bad: true }; }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { data: Object.fromEntries(new URLSearchParams(text)), form: true };
  }
  return { bad: true };
}

const turnstileToken = (data) => data.turnstile ?? data['cf-turnstile-response'];

// Opent het Supabase-dashboard (project buyt) op de tabel met bestellingen. Geen geheim:
// het projectadres staat toch al in elke API-aanroep die deze Worker doet.
const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard/project/hfaaufsdonsitjfwzvrk/editor';

// Kort en scanbaar: alleen genoeg om te weten dát er iets is en of het druk wordt. De volledige
// bestelling (adres, telefoon, opmerking) staat achter de link, niet in de pushmelding zelf.
function orderMessage(order, result, origin) {
  const c = order.customer;
  const items = order.lines.map((l) => `${l.qty}x ${l.name}`).join(', ');
  const total = order.has_unpriced && order.total_estimate_cents === 0 ? 'volgt' : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  return {
    title: `\u{1F7E2} Nieuwe BUYT-bestelling \u{1FABF} — ${total}`,
    message: `${c.customer_name} · ${c.city}\n${items}\n${formatDelivery(order.delivery_date, order.delivery_window)}`,
    url: `${origin}/admin/orders/${result.order_number}`,
    urlTitle: 'Bekijk bestelling'
  };
}

async function handleOrder(request, env, ctx) {
  if (!salesOpen(env) && !(await isDeveloper(request, env))) return error(403, 'sales_closed');

  const body = await readBody(request);
  if (body.tooLarge) return error(413, 'invalid_input');
  if (body.bad || body.form) return error(400, 'invalid_input');
  const data = body.data;
  if (!data || typeof data !== 'object') return error(400, 'invalid_input');

  if (data['bot-field']) return error(400, 'invalid_input');
  if (!(await verifyTurnstile(env, turnstileToken(data), request.headers.get('CF-Connecting-IP')))) return error(400, 'turnstile_failed');

  const checked = validateOrder(data);
  if (!checked.ok) return error(400, 'invalid_input');
  const order = checked.value;

  let result;
  try {
    result = await rpc(env, 'create_order', { payload: order });
  } catch (e) {
    if (e instanceof SupabaseError && e.detail?.message === 'rate_limited') return error(429, 'rate_limited');
    if (e instanceof SupabaseError && e.detail?.message === 'slot_full') return error(409, 'slot_full');
    console.error('create_order_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return error(500, 'server_error');
  }

  // Alleen de eerste keer melden/mailen; een herhaald verzoek (dubbelklik) geeft dezelfde bestelling terug.
  if (!result.existing) {
    const origin = new URL(request.url).origin;
    ctx.waitUntil(notifyOwner(env, orderMessage(order, result, origin)));
    ctx.waitUntil(sendOrderConfirmation(env, orderConfirmationEmail(order, result, origin)));
    ctx.waitUntil(sendOrderConfirmation(env, orderInternalEmail(order, result, origin)));
  }

  return json(200, { ok: true, order_number: result.order_number, token: result.lookup_token });
}

async function handleRequest(request, env, ctx) {
  const body = await readBody(request);
  const wantsRedirect = body.form === true;
  const reject = (status, code, text) => (wantsRedirect ? formPage(status, text) : error(status, code));

  if (body.tooLarge) return reject(413, 'invalid_input', 'Je bericht is te groot.');
  if (body.bad || !body.data || typeof body.data !== 'object') return reject(400, 'invalid_input', 'Je bericht kon niet worden verwerkt.');
  const data = body.data;

  if (data['bot-field']) return reject(400, 'invalid_input', 'Je bericht kon niet worden verwerkt.');
  if (!(await verifyTurnstile(env, turnstileToken(data), request.headers.get('CF-Connecting-IP')))) {
    return reject(400, 'turnstile_failed', 'We konden niet controleren dat je geen robot bent. Probeer het opnieuw.');
  }

  const checked = validateRequest(data);
  if (!checked.ok) return reject(400, 'invalid_input', 'Controleer je naam, e-mailadres en soort aanvraag en probeer het opnieuw.');

  try {
    await insert(env, 'business_requests', checked.value);
  } catch (e) {
    console.error('business_request_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return reject(500, 'server_error', 'Je bericht is niet verstuurd. Probeer het later opnieuw.');
  }

  const v = checked.value;
  if (v.type === 'zakelijk') ctx.waitUntil(sendBusinessRequestMail(env, v));
  ctx.waitUntil(notifyOwner(env, {
    title: `Nieuwe ${v.type === 'zakelijk' ? 'zakelijke aanvraag' : 'vraag'}`,
    message: `${v.name} · ${v.email}\n${v.message.slice(0, 200)}`,
    url: SUPABASE_DASHBOARD_URL,
    urlTitle: 'Bekijk in Supabase'
  }));

  return wantsRedirect ? redirect(request, '/bedankt.html?s=aanvraag') : json(200, { ok: true });
}

async function handleNewsletter(request, env) {
  const body = await readBody(request);
  if (body.tooLarge || body.bad || !body.data || typeof body.data !== 'object') return error(400, 'invalid_input');
  const data = body.data;

  if (data['bot-field']) return error(400, 'invalid_input');
  if (!(await verifyTurnstile(env, turnstileToken(data), request.headers.get('CF-Connecting-IP')))) {
    return error(400, 'turnstile_failed');
  }

  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!isValidEmail(email)) return error(400, 'invalid_input');

  try {
    await insert(env, 'newsletter_signups', { email, source: 'website' });
  } catch (e) {
    // 409 = dit adres stond er al in: voor de bezoeker is dat hetzelfde als net ingeschreven.
    if (!(e instanceof SupabaseError && e.status === 409)) {
      console.error('newsletter_failed', e instanceof SupabaseError ? e.status : 'unknown');
      return error(500, 'server_error');
    }
  }

  return json(200, { ok: true });
}

// Openbare, alleen-lezen lijst met de eerstvolgende boekbare bezorgmomenten en hun vrije plekken.
// Geen persoonsgegevens, dus geen Turnstile/honeypot nodig voor dit ene, informatieve endpoint.
async function handleDeliverySlots(request, env) {
  const dates = upcomingDates();
  if (!dates.length) return json(200, { slots: [] });

  const from = dates[0].date;
  let counts = [];
  try {
    counts = await select(
      env,
      'orders',
      `select=delivery_date,delivery_window&delivery_date=gte.${from}&status=neq.geannuleerd`
    );
  } catch (e) {
    console.error('delivery_slots_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return error(500, 'server_error');
  }

  const taken = new Map();
  for (const row of counts) {
    const key = `${row.delivery_date}|${row.delivery_window}`;
    taken.set(key, (taken.get(key) || 0) + 1);
  }

  const slots = dates.flatMap((d) =>
    d.windows.map((window) => ({
      date: d.date,
      weekday: d.weekday,
      window,
      remaining: Math.max(0, MAX_PER_SLOT - (taken.get(`${d.date}|${window}`) || 0))
    }))
  );
  return json(200, { slots });
}

const routes = {
  '/api/order': { POST: handleOrder },
  '/api/request': { POST: handleRequest },
  '/api/newsletter': { POST: handleNewsletter },
  '/api/delivery-slots': { GET: handleDeliverySlots },
  '/api/shop-status': { GET: handleShopStatus }
};

// Beheer: /admin/* (zie docs/ontwerp-beheerportaal.md). Alleen /admin/login en de stijl/script zijn open;
// al het andere vraagt een geldige sessie. POST-verzoeken dragen een CSRF-token (adminAuth.checkPost).
async function readForm(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  return new URLSearchParams(text);
}

async function handleAdmin(request, env, ctx, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/admin/admin.css' && method === 'GET') return assetResponse('css');
  if (pathname === '/admin/admin.js' && method === 'GET') return assetResponse('js');
  if (pathname === '/admin/map.js' && method === 'GET') return assetResponse('map');
  if (pathname === '/admin/login') {
    if (method === 'GET' || method === 'POST') return handleLogin(request, env);
    return error(405, 'method_not_allowed');
  }

  const user = await currentUserName(request, env);
  if (!user) return redirectToLogin(pathname);

  if (pathname === '/admin/logout') {
    if (method !== 'POST') return redirect(request, '/admin');
    const form = await readForm(request);
    if (!form || !(await checkPost(request, env, form))) return error(403, 'forbidden');
    return logoutResponse();
  }

  if (method === 'GET') {
    if (pathname === '/admin' || pathname === '/admin/') return homePage(env, request, user, url);
    if (pathname === '/admin/orders') return ordersPage(env, request, user, url);
    if (pathname === '/admin/setup-2fa') return setup2fa(url, user, await csrfToken(request, env));
    if (pathname === '/admin/delivery') return deliveryPage(env, request, user, url);
    if (pathname === '/admin/customers') return customersPage(env, request, user, url);
    if (pathname === '/admin/business') return businessPage(env, request, user, url);
    if (pathname === '/admin/more') return morePage(env, request, user);
    if (pathname === '/admin/analytics') return analyticsPage(env, request, user, url);
    const c = /^\/admin\/customers\/(\d+)$/.exec(pathname);
    if (c) return customerDetailPage(env, request, user, c[1]);
    const m = /^\/admin\/orders\/(\d+)$/.exec(pathname);
    if (m) return orderDetailPage(env, request, user, m[1], url);
    return error(404, 'not_found');
  }

  if (method === 'POST') {
    const form = await readForm(request);
    if (!form) return error(413, 'invalid_input');
    if (pathname === '/admin/orders') return searchOrders(env, request, user, form);
    if (pathname === '/admin/delivery/share') return postShare(env, request, user, form);
    if (pathname === '/admin/delivery/revoke') return postRevoke(env, request, form);
    if (pathname === '/admin/delivery/route') return postRoute(env, ctx, request, user, form);
    const q = /^\/admin\/requests\/([0-9a-f-]{36})\/status$/.exec(pathname);
    if (q) return postRequestStatus(env, request, user, q[1], form);
    const s = /^\/admin\/orders\/(\d+)\/(status|note)$/.exec(pathname);
    if (s) return s[2] === 'status' ? postStatus(env, ctx, request, user, s[1], form) : postNote(env, request, user, s[1], form);
    return error(404, 'not_found');
  }
  return error(405, 'method_not_allowed');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Gedeelde bezorglijst voor de bezorgdienst: geen login, wel een code die niet te raden is (adminDelivery.js).
    const share = /^\/bezorging\/([A-Za-z0-9_-]{1,64})$/.exec(pathname);
    if (share && request.method === 'GET') return sharedList(env, share[1]);

    if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdmin(request, env, ctx, url);

    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const route = routes[pathname];
    if (!route) return error(404, 'not_found');
    const handler = route[request.method];
    if (!handler) return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: Object.keys(route).join(', '), 'Cache-Control': 'no-store' }
    });
    if (request.method === 'POST' && !sameOrigin(request)) return error(403, 'forbidden');

    try {
      return await handler(request, env, ctx);
    } catch (_) {
      console.error('unhandled_error');
      return error(500, 'server_error');
    }
  }
};
