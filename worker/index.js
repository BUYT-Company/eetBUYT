// Worker voor eetbuyt.nl: alleen /api/*. Alle andere paden komen uit de statische bestanden (env.ASSETS).
// Fase 1: bestelaanvragen (POST /api/order) en zakelijke aanvragen (POST /api/request) vastleggen in Supabase.
import { validateOrder, validateRequest, formatEuro } from './lib/validate.js';
import { verifyTurnstile } from './lib/turnstile.js';
import { rpc, insert, select, SupabaseError } from './lib/supabase.js';
import { notifyOwner } from './lib/notify.js';
import { sendOrderConfirmation } from './lib/resend.js';
import { upcomingDates } from './lib/delivery.js';
import { listOrders, orderDetail } from './lib/admin.js';
import { currentUserName, handleLogin, handleLogout, redirectToLogin, setup2fa } from './lib/adminAuth.js';

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

const formatDelivery = (dateStr, window) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${label}, ${window.replace('-', '–')} uur`;
};

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

// Bevestigingsmail aan de klant: kort en feitelijk (wat besteld, bezorgmoment, geschat bedrag).
// Bij een indicatief bedrag ("ca.") wordt uitgelegd dat het definitieve bedrag na het wegen volgt
// (zie ontwerp §7, stroom C) — geen valse belofte van een vast bedrag.
// Alleen nodig voor de HTML-mail: klantnaam komt van de klant en mag geen opmaak kunnen
// inbreken in de e-mail. Productnaam/verpakking komen uit de eigen catalogus, niet van de klant.
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function orderConfirmationEmail(order, result) {
  const c = order.customer;
  const safeName = escapeHtml(c.customer_name);
  const itemsHtml = order.lines.map((l) => `<li>${l.qty}× ${l.name}${l.pack ? ` (${l.pack})` : ''}</li>`).join('');
  const itemsText = order.lines.map((l) => `- ${l.qty}x ${l.name}${l.pack ? ` (${l.pack})` : ''}`).join('\n');
  const total = order.has_unpriced && order.total_estimate_cents === 0
    ? 'we laten je het bedrag weten na het wegen'
    : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  const delivery = formatDelivery(order.delivery_date, order.delivery_window);
  // Regeleindes eruit: de naam komt in de e-mail-subject terecht en mag daar geen headers kunnen injecteren.
  const firstName = c.customer_name.replace(/[\r\n]/g, ' ').trim().split(' ')[0];
  const subject = `Bedankt voor je bestelling, ${firstName}! — BUYT-${result.order_number}`;
  const indicativeNote = order.is_indicative
    ? '<p style="color:#555;font-size:0.9rem">Dit bedrag is een schatting, want het gewicht per verpakking varieert. We nemen contact met je op na het wegen.</p>'
    : '';
  const indicativeNoteText = order.is_indicative
    ? '\nDit bedrag is een schatting, want het gewicht per verpakking varieert. We nemen contact met je op na het wegen.\n'
    : '';

  const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:32rem;margin:0 auto;padding:2rem 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">Bedankt voor je bestelling, ${c.customer_name}!</h1>
<p>We hebben je bestelling <strong>BUYT-${result.order_number}</strong> ontvangen.</p>
<p><strong>Bezorgmoment:</strong> ${delivery}</p>
<p><strong>Wat je besteld hebt:</strong></p>
<ul>${itemsHtml}</ul>
<p><strong>Geschat bedrag:</strong> ${total}</p>
${indicativeNote}
<p>Heb je een vraag over je bestelling? Antwoord gerust op deze e-mail.</p>
<p>Tot snel,<br>Team BUYT</p>
</body></html>`;

  const text = `Bedankt voor je bestelling, ${c.customer_name}!

We hebben je bestelling BUYT-${result.order_number} ontvangen.

Bezorgmoment: ${delivery}

Wat je besteld hebt:
${itemsText}

Geschat bedrag: ${total}
${indicativeNoteText}
Heb je een vraag over je bestelling? Antwoord gerust op deze e-mail.

Tot snel,
Team BUYT`;

  return { to: c.email, subject, html, text };
}

async function handleOrder(request, env, ctx) {
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
    ctx.waitUntil(notifyOwner(env, orderMessage(order, result, new URL(request.url).origin)));
    ctx.waitUntil(sendOrderConfirmation(env, orderConfirmationEmail(order, result)));
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
  ctx.waitUntil(notifyOwner(env, {
    title: `Nieuwe ${v.type === 'zakelijk' ? 'zakelijke aanvraag' : 'vraag'}`,
    message: `${v.name} · ${v.email}\n${v.message.slice(0, 200)}`,
    url: SUPABASE_DASHBOARD_URL,
    urlTitle: 'Bekijk in Supabase'
  }));

  return wantsRedirect ? redirect(request, '/bedankt.html?s=aanvraag') : json(200, { ok: true });
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
  '/api/delivery-slots': { GET: handleDeliverySlots }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith('/admin/')) {
      if (pathname === '/admin/login') {
        if (request.method === 'GET' || request.method === 'POST') return handleLogin(request, env);
        return error(405, 'method_not_allowed');
      }
      if (pathname === '/admin/logout') return handleLogout();
      if (request.method !== 'GET') return error(405, 'method_not_allowed');
      const userName = await currentUserName(request, env);
      if (!userName) return redirectToLogin(pathname);
      if (pathname === '/admin/orders') return listOrders(env, userName);
      if (pathname === '/admin/setup-2fa') return setup2fa(url, userName);
      const m = /^\/admin\/orders\/(\d+)$/.exec(pathname);
      if (m) return orderDetail(env, m[1], userName);
      return error(404, 'not_found');
    }

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
