import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoint, normPostcode, geocodeOrder } from '../lib/geocode.js';

test('POINT uit PDOK wordt lengte en breedte, en rare waarden worden geweigerd', () => {
  assert.deepEqual(parsePoint('POINT(4.90516681 52.37777968)'), { lat: 52.37777968, lng: 4.90516681 });
  assert.equal(parsePoint('POINT(100 10)'), null);
  assert.equal(parsePoint('iets anders'), null);
  assert.equal(parsePoint(null), null);
  assert.equal(normPostcode(' 1011 ab '), '1011AB');
});

const reply = (docs) => ({ ok: true, json: async () => ({ response: { docs } }) });
const order = { postcode: '1011 AB', street: 'Kerkstraat 1' };

test('adres gevonden in dezelfde postcode: precisie adres', async () => {
  const f = async (url) => { assert.match(url, /fq=type:adres/); assert.match(url, /q=1011AB%20Kerkstraat%201/); return reply([{ weergavenaam: 'Kerkstraat 1, 1011AB Amsterdam', centroide_ll: 'POINT(4.9 52.37)' }]); };
  assert.deepEqual(await geocodeOrder(order, f), { status: 'ok', lat: 52.37, lng: 4.9, precision: 'adres' });
});

test('resultaat in een andere postcode wordt niet vertrouwd: terugval op het midden van de postcode', async () => {
  const f = async (url) => (url.includes('fq=type:adres')
    ? reply([{ weergavenaam: 'Kerkstraat 1, 9999ZZ Verweggistan', centroide_ll: 'POINT(6.5 53.2)' }])
    : reply([{ weergavenaam: 'Straat, 1011AB Amsterdam', centroide_ll: 'POINT(4.91 52.38)' }]));
  const r = await geocodeOrder(order, f);
  assert.equal(r.precision, 'postcode'); assert.equal(r.lat, 52.38);
});

test('niets gevonden, een kapotte postcode en geen antwoord worden onderscheiden', async () => {
  assert.deepEqual(await geocodeOrder(order, async () => reply([])), { status: 'none' });
  assert.deepEqual(await geocodeOrder({ postcode: 'abc', street: 'x' }, async () => { throw new Error('mag niet'); }), { status: 'none' });
  assert.deepEqual(await geocodeOrder(order, async () => { throw new Error('netwerk'); }), { status: 'error' });
  assert.deepEqual(await geocodeOrder(order, async () => ({ ok: false })), { status: 'error' });
});
