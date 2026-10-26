import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountValue, orderStatusFor, canPayOnline, createPayment, syncPayment } from '../lib/mollie.js';

const env = { MOLLIE_API_KEY: 'test_x', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };

test('bedrag als tekst met twee decimalen', () => {
  assert.equal(amountValue(1250), '12.50');
  assert.equal(amountValue(5), '0.05');
  assert.equal(amountValue(3000), '30.00');
});

test('Mollie-status naar bestelstatus', () => {
  assert.equal(orderStatusFor('paid'), 'betaald');
  for (const s of ['failed', 'canceled', 'expired']) assert.equal(orderStatusFor(s), 'betaling_mislukt');
  for (const s of ['open', 'pending']) assert.equal(orderStatusFor(s), 'wacht_op_betaling');
  assert.equal(orderStatusFor('authorized'), null);
});

test('online betalen alleen met sleutel, schakelaar en vast bedrag', () => {
  const order = { has_unpriced: false, total_estimate_cents: 2000 };
  assert.equal(canPayOnline(env, { paymentsLive: true }, order), true);
  assert.equal(canPayOnline({}, { paymentsLive: true }, order), false);
  assert.equal(canPayOnline(env, { paymentsLive: false }, order), false);
  assert.equal(canPayOnline(env, { paymentsLive: true }, { ...order, has_unpriced: true }), false);
  assert.equal(canPayOnline(env, { paymentsLive: true }, { ...order, total_estimate_cents: 0 }), false);
});

// Vervangt fetch door een nepserver; geeft de aanroepen terug.
function fakeFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const handler = routes.find((r) => String(url).includes(r.match) && (r.method || 'GET') === (init.method || 'GET'));
    const body = handler ? handler.body : null;
    return new Response(JSON.stringify(body), { status: handler?.status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('betaling aanmaken stuurt bedrag, redirect en webhook mee', async () => {
  const calls = fakeFetch([{ match: '/v2/payments', method: 'POST', body: { id: 'tr_abc123', _links: { checkout: { href: 'https://pay.example/c' } } } }]);
  const out = await createPayment(env, { orderNumber: 1001, token: 'tok', cents: 4250, origin: 'https://eetbuyt.nl' });
  assert.deepEqual(out, { id: 'tr_abc123', checkoutUrl: 'https://pay.example/c' });
  const sent = JSON.parse(calls[0].init.body);
  assert.deepEqual(sent.amount, { currency: 'EUR', value: '42.50' });
  assert.equal(sent.redirectUrl, 'https://eetbuyt.nl/bedankt.html?o=tok');
  assert.equal(sent.webhookUrl, 'https://eetbuyt.nl/api/mollie-webhook');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test_x');
});

test('lokaal geen webhookUrl (Mollie kan localhost niet bereiken)', async () => {
  const calls = fakeFetch([{ match: '/v2/payments', method: 'POST', body: { id: 'tr_abc123', _links: { checkout: { href: 'x' } } } }]);
  await createPayment(env, { orderNumber: 1, token: 't', cents: 100, origin: 'http://localhost:8787' });
  assert.equal(JSON.parse(calls[0].init.body).webhookUrl, undefined);
});

test('syncPayment: ongeldig of onbekend ID doet niets', async () => {
  fakeFetch([{ match: '/rest/v1/orders', body: [] }]);
  assert.equal(await syncPayment(env, 'niet-een-id'), null);
  assert.equal(await syncPayment(env, 'tr_abc123'), null);
});

test('syncPayment: betaald zet de bestelling op betaald', async () => {
  const calls = fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, status: 'wacht_op_betaling', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '42.50' }, paidAt: '2026-10-27T10:00:00+00:00' } },
    { match: '/rest/v1/payment_events', method: 'POST', body: null },
    { match: '/rest/v1/orders?mollie_payment_id', method: 'PATCH', body: [{ order_number: 1001 }] }
  ]);
  const out = await syncPayment(env, 'tr_abc123');
  assert.deepEqual(out, { status: 'betaald', justPaid: true, orderNumber: 1001 });
  const patch = calls.find((c) => c.init.method === 'PATCH');
  assert.match(patch.url, /status=in\.\(aanvraag,wacht_op_betaling,betaling_mislukt\)/);
  assert.equal(JSON.parse(patch.init.body).status, 'betaald');
});

test('syncPayment: afwijkend bedrag wordt geweigerd', async () => {
  fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, status: 'wacht_op_betaling', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '1.00' } } }
  ]);
  await assert.rejects(() => syncPayment(env, 'tr_abc123'), /amount_mismatch/);
});
