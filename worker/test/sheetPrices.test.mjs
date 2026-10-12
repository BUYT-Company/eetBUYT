import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEuroCents, parseGrams, parseSheet, applySheet } from '../lib/sheetPrices.js';

const catalog = {
  currency: 'EUR',
  products: [
    { id: 'ganzenshoarma', name: 'Ganzenshoarma', pricePerKgCents: 1500, packGrams: 500, priceCents: 750, priceApprox: true },
    { id: 'ganzenbiefstuk', name: 'Ganzenbiefstuk', pricePerKgCents: 2000, packGrams: null, priceCents: null }
  ]
};

test('bedragen: komma, punt, euroteken en duizendtallen', () => {
  assert.equal(parseEuroCents('€ 7,50'), 750);
  assert.equal(parseEuroCents('7.5'), 750);
  assert.equal(parseEuroCents('1.050,00'), 105000 > 50000 ? null : 105000);
  assert.equal(parseEuroCents('12,99'), 1299);
  assert.equal(parseEuroCents(15), 1500);
  assert.equal(parseEuroCents(7.1), 710);
});

test('bedragen: onzin, nul, negatief en absurd hoog worden geweigerd', () => {
  for (const v of ['', 'gratis', '0', 0, -5, '-3', null, undefined, 501, '9999', NaN]) assert.equal(parseEuroCents(v), null, String(v));
});

test('gewicht: getal of tekst met gram', () => {
  assert.equal(parseGrams(500), 500);
  assert.equal(parseGrams('ca. 700 g'), 700);
  assert.equal(parseGrams(0), null);
  assert.equal(parseGrams('veel'), null);
  assert.equal(parseGrams(99999), null);
});

test('sheet: kopregel wordt gevonden, ook met lege rijen erboven, en rijen zonder product vallen weg', () => {
  const items = parseSheet([[], ['Product', 'Gewicht (gram)', 'Prijs per kg'], ['Ganzenshoarma', 600, 17], ['', 1, 1]]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { key: 'Ganzenshoarma', perKgCents: 1700, grams: 600, packCents: null });
});

test('sheet: zonder herkenbare kolommen geeft null', () => {
  assert.equal(parseSheet([['a', 'b'], [1, 2]]), null);
  assert.equal(parseSheet([]), null);
});

test('toepassen: prijzen per kg en gewicht geven de prijs per verpakking', () => {
  const items = parseSheet([['product', 'gewicht', 'prijs per kg'], ['Ganzenshoarma', 600, 17]]);
  const { catalog: out, missing } = applySheet(catalog, items);
  const p = out.products[0];
  assert.equal(p.pricePerKgCents, 1700);
  assert.equal(p.packGrams, 600);
  assert.equal(p.priceCents, 1020);
  assert.deepEqual(missing, ['ganzenbiefstuk']);
  assert.equal(catalog.products[0].priceCents, 750, 'oorspronkelijke catalogus blijft ongewijzigd');
});

test('toepassen: een expliciete prijs per verpakking gaat voor, en koppelen kan op id of naam', () => {
  const items = parseSheet([['id', 'prijs per verpakking'], ['ganzenshoarma', '€ 8,25'], ['Ganzenbiefstuk', 9]]);
  const out = applySheet(catalog, items).catalog;
  assert.equal(out.products[0].priceCents, 825);
  assert.equal(out.products[1].priceCents, 900);
});

test('toepassen: een kapotte cel laat de waarde uit products.json staan', () => {
  const items = parseSheet([['product', 'prijs per kg', 'gewicht'], ['Ganzenshoarma', 'n.v.t.', 0]]);
  const p = applySheet(catalog, items).catalog.products[0];
  assert.equal(p.pricePerKgCents, 1500);
  assert.equal(p.packGrams, 500);
  assert.equal(p.priceCents, 750);
});

test('echte sheet: koppeling op naam met "(2st)" en losse spaties, en komma of punt in bedragen', async () => {
  const real = (await import('node:fs')).readFileSync(new URL('../../public/data/products.json', import.meta.url), 'utf8');
  const base = JSON.parse(real);
  const items = parseSheet([
    [], ['', 'id', 'gram', 'verkoopprijs', 'prijs_per_kg'],
    ['', 'Ganzenshoarma', 500, 12, 24],
    ['', 'Gehakt', 500, 12, 24],
    ['', 'Gerookte ganzenborst', 250, 10, 40],
    ['', 'Ganzenpoten', 1000, 25, '€ 25,00'],
    ['', 'Ganzenborstfilet (2st)', 700, 17.47, 24.95],
    ['', 'Ganzen biefstuk (2st)', 350, 14, 40]
  ]);
  const { catalog: out, missing } = applySheet(base, items);
  assert.deepEqual(missing, []);
  const by = Object.fromEntries(out.products.map((p) => [p.id, p]));
  assert.equal(by.ganzenshoarma.priceCents, 1200);
  assert.equal(by.ganzenborstfilet.priceCents, 1747);
  assert.equal(by.ganzenborstfilet.pricePerKgCents, 2495);
  assert.equal(by.ganzenbiefstuk.priceCents, 1400);
  assert.equal(by.ganzenbiefstuk.packGrams, 350);
  assert.equal(by.ganzenpoten.pricePerKgCents, 2500);
});
