import test from 'node:test';
import assert from 'node:assert/strict';
import { newToken, isTokenShape, hashToken } from '../lib/shareToken.js';
import { groupCustomers, normPhone } from '../lib/customers.js';
import { nextRequestStep, canSet, parseRequestMessage } from '../lib/requestStatus.js';

test('bezorglink: code van 43 tekens, uniek, en alleen de hash wordt bewaard', async () => {
  const a = newToken();
  const b = newToken();
  assert.ok(isTokenShape(a));
  assert.notEqual(a, b);
  assert.equal(isTokenShape('te-kort'), false);
  assert.equal(isTokenShape(`${a}x`), false);
  assert.equal(isTokenShape(null), false);
  assert.equal(isTokenShape(`${a.slice(0, 42)}!`), false);
  const h = await hashToken(a);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, a);
  assert.equal(h, await hashToken(a));
});

test('telefoonnummers worden op de laatste 9 cijfers vergeleken', () => {
  assert.equal(normPhone('+31 6 12345678'), normPhone('06-12345678'));
  assert.equal(normPhone('12345'), null);
  assert.equal(normPhone(''), null);
});

const o = (n, name, email, phone, at, extra = {}) => ({
  order_number: n, customer_name: name, email, phone, city: 'Amsterdam', status: 'nieuw', created_at: at,
  total_estimate_cents: 1000, total_final_cents: null, ...extra
});

test('klanten: zelfde e-mailadres (hoofdletters negeren) of telefoonnummer is dezelfde klant', () => {
  const list = groupCustomers([
    o(1001, 'Jan de Vries', 'Jan@Example.nl', '0612345678', '2026-10-01T10:00:00Z'),
    o(1002, 'J. de Vries', 'jan@example.nl', '', '2026-10-03T10:00:00Z'),
    o(1003, 'Jan', 'ander@example.nl', '+31 6 12345678', '2026-10-05T10:00:00Z'),
    o(1004, 'Piet', 'piet@example.nl', '', '2026-10-04T10:00:00Z')
  ]);
  assert.equal(list.length, 2);
  const jan = list.find((c) => c.orders === 3);
  assert.ok(jan);
  assert.equal(jan.returning, true);
  assert.equal(jan.key, 1001);
  assert.equal(jan.totalCents, 3000);
  assert.equal(jan.lastOrderNumber, 1003);
  assert.equal(list.find((c) => c.name === 'Piet').returning, false);
  assert.equal(list[0].lastOrderNumber, 1003);
});

test('klanten: geannuleerde bestellingen tellen niet mee, definitief bedrag gaat voor schatting', () => {
  const list = groupCustomers([
    o(1, 'A', 'a@x.nl', '', '2026-10-01T10:00:00Z', { status: 'geannuleerd' }),
    o(2, 'A', 'a@x.nl', '', '2026-10-02T10:00:00Z', { total_final_cents: 2500 })
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].orders, 1);
  assert.equal(list[0].totalCents, 2500);
  assert.equal(list[0].returning, false);
});

test('zakelijk verloop en berichten', () => {
  assert.equal(nextRequestStep('zakelijk', 'nieuw').to, 'in_gesprek');
  assert.equal(nextRequestStep('zakelijk', 'offerte_verstuurd').to, 'gewonnen');
  assert.equal(nextRequestStep('zakelijk', 'gewonnen'), null);
  assert.equal(nextRequestStep('particulier', 'nieuw').to, 'beantwoord');
  assert.equal(canSet('zakelijk', 'beantwoord'), false);
  assert.equal(canSet('particulier', 'gewonnen'), false);
  assert.equal(canSet('zakelijk', 'verloren'), true);
});

test('bedrijf en telefoon worden uit het bericht gehaald', () => {
  const p = parseRequestMessage('Bedrijf: Restaurant Gans\n\nTelefoon: 0612345678\n\nWij willen graag 20 kilo.');
  assert.equal(p.company, 'Restaurant Gans');
  assert.equal(p.phone, '0612345678');
  assert.equal(p.body, 'Wij willen graag 20 kilo.');
  assert.deepEqual(parseRequestMessage('Gewoon een vraag'), { company: '', phone: '', body: 'Gewoon een vraag' });
});
