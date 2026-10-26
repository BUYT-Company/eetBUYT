// Worker voor eetbuyt.nl: alleen /api/*. Alle andere paden komen uit de statische bestanden (env.ASSETS).
// Fase 1: bestelaanvragen (POST /api/order) en zakelijke aanvragen (POST /api/request) vastleggen in Supabase.
import baseCatalog from '../public/data/products.json';
import { currentCatalog } from './lib/sheetPrices.js';
import { validateOrder, validateRequest, formatEuro, isValidEmail } from './lib/validate.js';
import { validateWaitlist } from './lib/waitlist.js';
import { verifyTurnstile } from './lib/turnstile.js';
import { rpc, insert, select, update, SupabaseError } from './lib/supabase.js';
import { canPayOnline, createPayment, getPayment, syncPayment } from './lib/mollie.js';
import { notifyOwner } from './lib/notify.js';
import { sendOrderConfirmation, sendBusinessRequestMail } from './lib/resend.js';
import { orderConfirmationEmail, orderInternalEmail } from './lib/emailTemplates.js';
import { upcomingDates } from './lib/delivery.js';
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

// Dataminimalisatie (art. 5 lid 1 sub c AVG): de pushmelding bevat alleen bestelnummer en bedrag,
// geen naam, plaats, e-mailadres, producten of berichttekst. De details staan achter de link
// (beheer), in Supabase en in de mail naar orders@eetbuyt.nl.
function orderMessage(order, result, origin) {
  const total = order.has_unpriced && order.total_estimate_cents === 0 ? 'volgt' : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  return {
    title: 'Nieuwe bestelling',
    message: `Nieuwe bestelling #${result.order_number} – ${total}`,
    url: `${origin}/admin/orders/${result.order_number}`,
    urlTitle: 'Bekijk bestelling'
  };
}

// De prijslijst zoals deze aanvrager hem krijgt. Ontwikkelmodus: is de winkel dicht en is de beheerder ingelogd, dan staat
// online betalen aan zodra MOLLIE_API_KEY er is (met de test_-sleutel), ook als "paymentsLive" nog uit staat.
// Bezoekers merken daar niets van; voor hen beslist alleen "paymentsLive" in products.json.
async function effectiveCatalog(request, env) {
  const catalog = await currentCatalog(env, baseCatalog);
  if (!salesOpen(env) && env.MOLLIE_API_KEY && (await isDeveloper(request, env))) return { ...catalog, paymentsLive: true, devPayments: true };
  return catalog;
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

  const catalog = await effectiveCatalog(request, env);
  const checked = validateOrder(data, catalog);
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

  // Online betalen (Mollie): maak een betaling en stuur de klant naar de betaalpagina. Lukt dat niet, dan blijft de
  // bestelling gewoon als aanvraag staan en nemen we contact op.
  let checkoutUrl = null;
  if (canPayOnline(env, catalog, order)) {
    try {
      const origin = new URL(request.url).origin;
      const [row] = await select(env, 'orders', `select=status,mollie_payment_id&order_number=eq.${result.order_number}`);
      if (row?.status === 'betaald') return json(200, { ok: true, order_number: result.order_number, token: result.lookup_token, paid: true });
      const existing = row?.mollie_payment_id ? await getPayment(env, row.mollie_payment_id) : null;
      if (existing?.status === 'open' && existing._links?.checkout?.href) {
        checkoutUrl = existing._links.checkout.href;
      } else {
        const payment = await createPayment(env, { orderNumber: result.order_number, token: result.lookup_token, cents: order.total_estimate_cents, origin });
        await update(env, 'orders', `order_number=eq.${result.order_number}`, { status: 'wacht_op_betaling', mollie_payment_id: payment.id, mollie_status: 'open' });
        checkoutUrl = payment.checkoutUrl;
      }
    } catch (e) {
      console.error('mollie_create_failed', e instanceof Error ? e.message : 'unknown');
    }
  }

  return json(200, { ok: true, order_number: result.order_number, token: result.lookup_token, ...(checkoutUrl ? { checkoutUrl } : {}) });
}

// Mollie meldt hier dat een betaling is veranderd: alleen een ID, de echte status halen we zelf bij Mollie op.
async function handleMollieWebhook(request, env, ctx) {
  const text = await request.text();
  const id = text.length <= 200 ? new URLSearchParams(text).get('id') : null;
  try {
    const synced = await syncPayment(env, id);
    if (synced?.justPaid) {
      ctx.waitUntil(notifyOwner(env, {
        title: 'Betaling ontvangen',
        message: `Bestelling #${synced.orderNumber} is betaald`,
        url: `${new URL(request.url).origin}/admin/orders/${synced.orderNumber}`,
        urlTitle: 'Bekijk bestelling'
      }));
    }
  } catch (e) {
    // Een fout geven we door aan Mollie (niet-200), dan probeert Mollie het later opnieuw.
    console.error('mollie_webhook_failed', e instanceof Error ? e.message : 'unknown');
    return new Response('error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
}

// De bedankpagina vraagt hier de betaalstatus op met het geheime token uit de redirect. Staat de bestelling nog
// op "wacht op betaling", dan vragen we Mollie meteen (de webhook kan later zijn dan de klant).
async function handleOrderStatus(request, env, ctx) {
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return error(400, 'invalid_input');
  try {
    const [row] = await select(env, 'orders', `select=status,mollie_payment_id&lookup_token=eq.${token}`);
    if (!row) return error(404, 'not_found');
    let status = row.status;
    if (status === 'wacht_op_betaling' && row.mollie_payment_id) {
      const synced = await syncPayment(env, row.mollie_payment_id);
      if (synced) status = synced.status;
      if (synced?.justPaid) {
        ctx.waitUntil(notifyOwner(env, {
          title: 'Betaling ontvangen',
          message: `Bestelling #${synced.orderNumber} is betaald`,
          url: `${new URL(request.url).origin}/admin/orders/${synced.orderNumber}`,
          urlTitle: 'Bekijk bestelling'
        }));
      }
    }
    return json(200, { ok: true, status });
  } catch (e) {
    console.error('order_status_failed', e instanceof Error ? e.message : 'unknown');
    return error(500, 'server_error');
  }
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
    // Geen naam, e-mailadres of berichttekst in de melding (dataminimalisatie).
    message: v.type === 'zakelijk' ? 'Nieuwe zakelijke aanvraag binnen' : 'Nieuwe vraag binnen',
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

// Wachtlijst: een e-mailadres (en thuis of zakelijk) in waitlist_signups. Staat het nieuwsbriefvakje aan, dan komt het adres
// ook in newsletter_signups (source 'wachtlijst'). Een zakelijke aanmelding komt ook binnen als zakelijke aanvraag.
async function handleWaitlist(request, env, ctx) {
  const body = await readBody(request);
  if (body.tooLarge || body.bad || !body.data || typeof body.data !== 'object') return error(400, 'invalid_input');
  const data = body.data;

  if (data['bot-field']) return error(400, 'invalid_input');
  if (!(await verifyTurnstile(env, turnstileToken(data), request.headers.get('CF-Connecting-IP')))) {
    return error(400, 'turnstile_failed');
  }

  const checked = validateWaitlist(data);
  if (!checked.ok) return error(400, 'invalid_input');
  const { email, segment, newsletter } = checked.value;

  let isNew = true;
  try {
    await insert(env, 'waitlist_signups', { email, segment, newsletter });
  } catch (e) {
    // 409 = dit adres stond er al in: voor de bezoeker is dat hetzelfde als net aangemeld.
    if (e instanceof SupabaseError && e.status === 409) isNew = false;
    else {
      console.error('waitlist_failed', e instanceof SupabaseError ? e.status : 'unknown');
      return error(500, 'server_error');
    }
  }

  if (newsletter) {
    try {
      await insert(env, 'newsletter_signups', { email, source: 'wachtlijst' });
    } catch (e) {
      if (!(e instanceof SupabaseError && e.status === 409)) console.error('waitlist_newsletter_failed', e instanceof SupabaseError ? e.status : 'unknown');
    }
  }

  if (isNew && segment === 'zakelijk') {
    try {
      await insert(env, 'business_requests', {
        name: 'Wachtlijst (zakelijk)',
        email,
        type: 'zakelijk',
        message: 'Aangemeld via de wachtlijst op de homepage. Geen bericht.'
      });
    } catch (e) {
      console.error('waitlist_business_failed', e instanceof SupabaseError ? e.status : 'unknown');
    }
  }

  if (isNew) {
    ctx.waitUntil(notifyOwner(env, {
      title: segment === 'zakelijk' ? 'Wachtlijst: zakelijk' : 'Wachtlijst: nieuwe aanmelding',
      // Geen e-mailadres in de melding (dataminimalisatie).
      message: segment === 'zakelijk' ? 'Nieuwe zakelijke aanmelding op de wachtlijst' : 'Nieuwe aanmelding op de wachtlijst',
      url: SUPABASE_DASHBOARD_URL,
      urlTitle: 'Bekijk in Supabase'
    }));
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

// De winkel (mandje en productkaarten) leest de prijzen hier. Zonder koppeling met het sheet is dit gewoon products.json.
async function handleProducts(request, env) {
  const catalog = await effectiveCatalog(request, env);
  const res = json(200, catalog);
  // Voor een ontwikkelaar (winkel dicht, beheerder ingelogd) staat online betalen aan; dat antwoord mag nooit gedeeld worden.
  res.headers.set('Cache-Control', catalog.devPayments ? 'private, no-store' : 'public, max-age=60');
  return res;
}

const routes = {
  '/api/products': { GET: handleProducts },
  '/api/order': { POST: handleOrder },
  '/api/order-status': { GET: handleOrderStatus },
  '/api/mollie-webhook': { POST: handleMollieWebhook },
  '/api/request': { POST: handleRequest },
  '/api/newsletter': { POST: handleNewsletter },
  '/api/waitlist': { POST: handleWaitlist },
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

// Tabbladen krijgen het crème cirkel-icoon; zoekmachines (Google, Bing, DuckDuckGo, Yandex, Baidu, enz.; herkend aan de user-agent) krijgen op dezelfde adressen het donkergroene icoon uit /assets/google/.
// Alleen de iconen worden zo geserveerd; zie wrangler.jsonc (run_worker_first) voor de paden.
const SEARCH_BOT = /bot|crawl|spider|slurp|google|bing|duckduck|yandex|baidu|seznam|qwant|ecosia|favicon/i;
const FAVICON_PATHS = new Set(['/favicon.ico', '/assets/favicon-32.png', '/assets/favicon-48.png', '/assets/favicon-96.png', '/assets/favicon-192.png']);

async function serveFavicon(request, env, url) {
  const forSearch = SEARCH_BOT.test(request.headers.get('User-Agent') || '');
  const target = forSearch ? new URL(`/assets/google/${url.pathname.split('/').pop()}`, url) : url;
  const res = await env.ASSETS.fetch(forSearch ? new Request(target, request) : request);
  const out = new Response(res.body, res);
  out.headers.set('Vary', 'User-Agent');
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Gedeelde bezorglijst voor de bezorgdienst: geen login, wel een code die niet te raden is (adminDelivery.js).
    const share = /^\/bezorging\/([A-Za-z0-9_-]{1,64})$/.exec(pathname);
    if (share && request.method === 'GET') return sharedList(env, share[1]);

    if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdmin(request, env, ctx, url);

    if (FAVICON_PATHS.has(pathname) && (request.method === 'GET' || request.method === 'HEAD')) return serveFavicon(request, env, url);

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
