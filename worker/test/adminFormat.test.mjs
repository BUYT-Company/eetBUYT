import test from 'node:test';
import assert from 'node:assert/strict';
import { delta, cleanQuery, periodOr, tabOr, pageOr, orderTotal, greeting, esc } from '../lib/adminFormat.js';

test('delta toont geen percentage bij te weinig bestellingen in de vorige periode', () => {
  assert.equal(delta(50, 40, 2).dir, 'none');
  assert.equal(delta(50, 0, 10).dir, 'none');
  assert.equal(delta(50, 40, 2).pct, null);
});

test('delta rekent omhoog, omlaag en gelijk', () => {
  assert.deepEqual([delta(120, 100, 5).dir, delta(120, 100, 5).pct], ['up', 20]);
  assert.deepEqual([delta(80, 100, 5).dir, delta(80, 100, 5).pct], ['down', -20]);
  assert.equal(delta(100, 100, 5).dir, 'flat');
  assert.match(delta(120, 100, 5).text, /^\+20%/);
  assert.match(delta(80, 100, 5).text, /^−20%/);
});

test('zoektermen: gevaarlijke tekens van het filter verdwijnen', () => {
  assert.equal(cleanQuery('Jan, de (Vries)*'), 'Jan de Vries');
  assert.equal(cleanQuery('a@b.nl'), 'a@b.nl');
  assert.equal(cleanQuery('x'.repeat(200)).length, 60);
  assert.equal(cleanQuery(null), '');
});

test('parameters vallen terug op een veilige waarde', () => {
  assert.equal(periodOr('kwartaal'), '7d');
  assert.equal(periodOr('30d'), '30d');
  assert.equal(tabOr('onzin'), 'nieuw');
  assert.equal(tabOr('alle'), 'alle');
  assert.equal(pageOr('-3'), 1);
  assert.equal(pageOr('abc'), 1);
  assert.equal(pageOr('4'), 4);
});

test('totaal: definitief of een schatting met ca.', () => {
  assert.match(orderTotal({ total_estimate_cents: 3000, total_final_cents: null, is_indicative: true, has_unpriced: false }), /^ca\. /);
  assert.doesNotMatch(orderTotal({ total_estimate_cents: 3000, total_final_cents: 2950, is_indicative: true, has_unpriced: false }), /ca\./);
  assert.equal(orderTotal({ total_estimate_cents: 0, total_final_cents: null, is_indicative: false, has_unpriced: true }), 'Volgt');
});

test('begroeting volgt het uur in Amsterdam', () => {
  assert.equal(greeting(new Date('2026-10-06T07:00:00Z')), 'Goedemorgen');
  assert.equal(greeting(new Date('2026-10-06T13:00:00Z')), 'Goedemiddag');
  assert.equal(greeting(new Date('2026-10-06T20:00:00Z')), 'Goedenavond');
});

test('esc maakt HTML onschadelijk', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});
