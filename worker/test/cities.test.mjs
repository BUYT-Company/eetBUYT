import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCity, cityStats, DELIVERY_CITIES } from '../lib/cities.js';

test('schrijfwijzen van dezelfde stad worden samengevoegd', () => {
  for (const x of ['amsterdam', ' Amsterdam ', 'AMSTERDAM', 'Amsterdam Zuidoost', 'Amsterdam-Noord']) assert.equal(canonicalCity(x), 'Amsterdam');
  for (const x of ["'s-Gravenhage", '’s-Gravenhage', 's-gravenhage', 'den haag', 'Den  Haag', 'The Hague']) assert.equal(canonicalCity(x), 'Den Haag');
  assert.equal(canonicalCity('Utrecht-Overvecht'), 'Utrecht');
  assert.equal(canonicalCity('rotterdam'), 'Rotterdam');
});

test('Amstelveen is niet Amsterdam, en andere plaatsen krijgen hoofdletters', () => {
  assert.equal(canonicalCity('amstelveen'), 'Amstelveen');
  assert.equal(canonicalCity('Amsterdamse Poort'), 'Amsterdamse Poort');
  assert.equal(canonicalCity('bergen op zoom'), 'Bergen Op Zoom');
  assert.equal(canonicalCity(''), 'Onbekend');
  assert.equal(canonicalCity(null), 'Onbekend');
});

const o = (city, cents = 1000, status = 'nieuw') => ({ city, status, total_estimate_cents: cents, total_final_cents: null });

test('statistiek: de zes bezorgsteden staan er altijd, ook met nul, en andere plaatsen apart', () => {
  const s = cityStats([o('amsterdam'), o('Amsterdam Zuidoost'), o('Utrecht', 2500), o('Zaandam'), o('zaandam'), o('Diemen'), o('Rotterdam', 999, 'geannuleerd')]);
  assert.equal(s.inArea.length, DELIVERY_CITIES.length);
  assert.deepEqual(s.inArea.slice(0, 2).map((c) => [c.city, c.count]), [['Amsterdam', 2], ['Utrecht', 1]]);
  assert.equal(s.inArea.find((c) => c.city === 'Rotterdam').count, 0);
  assert.equal(s.inArea.find((c) => c.city === 'Utrecht').cents, 2500);
  assert.deepEqual(s.other.map((c) => [c.city, c.count]), [['Zaandam', 2], ['Diemen', 1]]);
  assert.equal(s.total, 6);
  assert.equal(s.inAreaTotal, 3);
});

test('geen bestellingen geeft nullen en geen fout', () => {
  const s = cityStats([]);
  assert.equal(s.total, 0); assert.equal(s.other.length, 0); assert.ok(s.inArea.every((c) => c.count === 0));
});
