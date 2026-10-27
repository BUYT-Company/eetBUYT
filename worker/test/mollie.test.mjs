import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountValue, orderStatusFor, canPayOnline, createPayment, syncPayment, retryPayment } from '../lib/mollie.js';

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
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, mollie_status: 'open', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '42.50' }, paidAt: '2026-10-27T10:00:00+00:00' } },
    { match: '/rest/v1/payment_events', method: 'POST', body: null },
    { match: '/rest/v1/orders?mollie_payment_id', method: 'PATCH', body: [{ order_number: 1001 }] }
  ]);
  const out = await syncPayment(env, 'tr_abc123');
  assert.deepEqual(out, { status: 'betaald', checkoutUrl: null, justPaid: true, orderNumber: 1001 });
  const patch = calls.find((c) => c.init.method === 'PATCH');
  assert.match(patch.url, /mollie_status\.neq\.paid/);
  const sent = JSON.parse(patch.init.body);
  assert.equal(sent.mollie_status, 'paid');
  assert.equal(sent.paid_at, '2026-10-27T10:00:00+00:00');
  // De bestelstatus van het beheer (nieuw/klaargemaakt/...) blijft ongemoeid: anders weigert de database het.
  assert.equal('status' in sent, false);
});

test('syncPayment: al betaalde bestelling wordt niet nog eens als nieuw betaald gemeld', async () => {
  fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, mollie_status: 'paid', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '42.50' } } },
    { match: '/rest/v1/payment_events', method: 'POST', body: null },
    { match: '/rest/v1/orders?mollie_payment_id', method: 'PATCH', body: [] }
  ]);
  const out = await syncPayment(env, 'tr_abc123');
  assert.deepEqual(out, { status: 'betaald', checkoutUrl: null, justPaid: false, orderNumber: 1001 });
});

test('syncPayment: webhook was ons voor, toch geeft de bedankpagina "betaald"', async () => {
  fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, mollie_status: 'open', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '42.50' } } },
    { match: '/rest/v1/payment_events', method: 'POST', body: null },
    { match: '/rest/v1/orders?mollie_payment_id', method: 'PATCH', body: [] }
  ]);
  const out = await syncPayment(env, 'tr_abc123');
  assert.deepEqual(out, { status: 'betaald', checkoutUrl: null, justPaid: false, orderNumber: 1001 });
});

test('syncPayment: afwijkend bedrag wordt geweigerd', async () => {
  fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, mollie_status: 'open', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'paid', amount: { currency: 'EUR', value: '1.00' } } }
  ]);
  await assert.rejects(() => syncPayment(env, 'tr_abc123'), /amount_mismatch/);
});

test('syncPayment: bij een nog open betaling komt de betaallink mee, zodat de klant verder kan', async () => {
  fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1001, mollie_status: 'open', total_estimate_cents: 4250 }] },
    { match: '/v2/payments/tr_abc123', body: { status: 'open', amount: { currency: 'EUR', value: '42.50' }, _links: { checkout: { href: 'https://www.mollie.com/checkout/select-method/x' } } } },
    { match: '/rest/v1/payment_events', method: 'POST', body: null },
    { match: '/rest/v1/orders?mollie_payment_id', method: 'PATCH', body: [{ order_number: 1001 }] }
  ]);
  const out = await syncPayment(env, 'tr_abc123');
  assert.deepEqual(out, { status: 'wacht_op_betaling', checkoutUrl: 'https://www.mollie.com/checkout/select-method/x', justPaid: false, orderNumber: 1001 });
});

const TOKEN = '412fc29f-2506-4388-9a4a-1623239328cc';

test('retryPayment: afgebroken betaling krijgt een nieuwe betaling voor dezelfde bestelling', async () => {
  const calls = fakeFetch([
    { match: '/rest/v1/orders?select', body: [{ order_number: 1015, status: 'nieuw', mollie_status: 'canceled', mollie_payment_id: 'tr_old', total_estimate_cents: 3494, has_unpriced: false }] },
    { match: '/v2/payments', method: 'POST', body: { id: 'tr_new123', _links: { checkout: { href: 'https://www.mollie.com/checkout/select-method/n' } } } },
    { match: '/rest/v1/orders?order_number', method: 'PATCH', body: [{ order_number: 1015 }] }
  ]);
  const out = await retryPayment(env, TOKEN, 'https://eetbuyt.nl');
  assert.deepEqual(out, { checkoutUrl: 'https://www.mollie.com/checkout/select-method/n' });
  assert.equal(JSON.parse(calls.find((c) => c.url.includes('/v2/payments')).init.body).amount.value, '34.94');
  assert.equal(JSON.parse(calls.find((c) => c.init.method === 'PATCH').init.body).mollie_payment_id, 'tr_new123');
});

test('retryPayment: betaald, geannuleerd of onbekend token geeft niets', async () => {
  for (const row of [
    { order_number: 1, status: 'nieuw', mollie_status: 'paid', total_estimate_cents: 100, has_unpriced: false },
    { order_number: 1, status: 'geannuleerd', mollie_status: 'canceled', total_estimate_cents: 100, has_unpriced: false }
  ]) {
    fakeFetch([{ match: '/rest/v1/orders?select', body: [row] }]);
    assert.equal(await retryPayment(env, TOKEN, 'https://eetbuyt.nl'), null);
  }
  fakeFetch([{ match: '/rest/v1/orders?select', body: [] }]);
  assert.equal(await retryPayment(env, TOKEN, 'https://eetbuyt.nl'), null);
});
