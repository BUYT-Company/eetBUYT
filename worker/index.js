// Worker voor eetbuyt.nl: alleen /api/*. Alle andere paden komen uit de statische bestanden (env.ASSETS).
// Fase 1: bestelaanvragen (POST /api/order) en zakelijke aanvragen (POST /api/request) vastleggen in Supabase.
import { validateOrder, validateRequest, formatEuro } from './lib/validate.js';
import { verifyTurnstile } from './lib/turnstile.js';
import { rpc, insert, SupabaseError } from './lib/supabase.js';
import { notifyOwner } from './lib/notify.js';

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

function orderMessage(order, result) {
  const c = order.customer;
  const lines = order.lines.map((l) => `${l.qty}x ${l.name}${l.pack ? ', ' + l.pack : ''} (${l.price_label})`).join('\n');
  const total = order.has_unpriced && order.total_estimate_cents === 0 ? 'Volgt' : (order.is_indicative ? 'ca. ' : '') + formatEuro(order.total_estimate_cents);
  return {
    subject: `Nieuwe bestelaanvraag BUYT-${result.order_number}`,
    text: [
      `Bestelaanvraag BUYT-${result.order_number}`,
      '',
      lines,
      `Totaal (indicatief): ${total}${order.has_unpriced ? ' (prijs volgt voor sommige producten)' : ''}`,
      '',
      c.customer_name,
      c.email,
      c.phone,
      `${c.street}, ${c.postcode} ${c.city}`,
      c.note ? `Opmerking: ${c.note}` : ''
    ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')
  };
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
    console.error('create_order_failed', e instanceof SupabaseError ? e.status : 'unknown');
    return error(500, 'server_error');
  }

  // Alleen de eerste keer melden; een herhaald verzoek (dubbelklik) geeft dezelfde bestelling terug.
  if (!result.existing) ctx.waitUntil(notifyOwner(env, orderMessage(order, result)));

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
    subject: `Nieuwe ${v.type === 'zakelijk' ? 'zakelijke aanvraag' : 'vraag'} via eetbuyt.nl`,
    text: [v.name, v.email, `Soort: ${v.type}`, '', v.message].join('\n')
  }));

  return wantsRedirect ? redirect(request, '/bedankt.html?s=aanvraag') : json(200, { ok: true });
}

const routes = {
  '/api/order': handleOrder,
  '/api/request': handleRequest
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const handler = routes[pathname];
    if (!handler) return error(404, 'not_found');
    if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'POST', 'Cache-Control': 'no-store' }
    });
    if (!sameOrigin(request)) return error(403, 'forbidden');

    try {
      return await handler(request, env, ctx);
    } catch (_) {
      console.error('unhandled_error');
      return error(500, 'server_error');
    }
  }
};
