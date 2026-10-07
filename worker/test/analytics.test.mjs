import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRanges, analyticsPeriodOr, parseTotals, parseEvents, parseList, parseDaily, parseScTotals, parseScQueries, channelLabel, pageLabel, positionDelta, rangeLabel } from '../lib/analyticsData.js';

test('periodes lopen t/m gisteren en worden vergeleken met een even lange periode ervoor', () => {
  const r = dateRanges('7d', new Date('2026-10-12T10:00:00Z'));
  assert.deepEqual(r.current, { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(r.previous, { start: '2026-09-28', end: '2026-10-04' });
  assert.equal(r.days, 7);
  assert.deepEqual(r.sc.current, { start: '2026-10-03', end: '2026-10-09' });
  assert.equal(dateRanges('30d', new Date('2026-10-12T10:00:00Z')).current.start, '2026-09-12');
  assert.equal(analyticsPeriodOr('1000d'), '7d');
});

test('totalen: dateRange staat op de plek die de kopregel aanwijst', () => {
  const resp = { dimensionHeaders: [{ name: 'dateRange' }], rows: [
    { dimensionValues: [{ value: 'date_range_0' }], metricValues: [{ value: '120' }, { value: '150' }] },
    { dimensionValues: [{ value: 'date_range_1' }], metricValues: [{ value: '100' }, { value: '90' }] }] };
  const t = parseTotals(resp, ['activeUsers', 'sessions']);
  assert.deepEqual(t.current, { activeUsers: 120, sessions: 150 });
  assert.deepEqual(t.previous, { activeUsers: 100, sessions: 90 });
  assert.deepEqual(parseTotals({}, ['a']).current, { a: 0 });
});

test('gebeurtenissen: dateRange mag na de eigen dimensie staan', () => {
  const resp = { dimensionHeaders: [{ name: 'eventName' }, { name: 'dateRange' }], rows: [
    { dimensionValues: [{ value: 'add_to_cart' }, { value: 'date_range_0' }], metricValues: [{ value: '7' }] },
    { dimensionValues: [{ value: 'add_to_cart' }, { value: 'date_range_1' }], metricValues: [{ value: '4' }] },
    { dimensionValues: [{ value: 'purchase' }, { value: 'date_range_0' }], metricValues: [{ value: '2' }] }] };
  const e = parseEvents(resp);
  assert.equal(e.current.add_to_cart, 7); assert.equal(e.previous.add_to_cart, 4); assert.equal(e.current.purchase, 2); assert.equal(e.previous.purchase, undefined);
});

test('lijsten staan van groot naar klein en ontbrekende dagen worden nul', () => {
  const list = parseList({ rows: [{ dimensionValues: [{ value: 'a' }], metricValues: [{ value: '2' }] }, { dimensionValues: [{ value: 'b' }], metricValues: [{ value: '9' }] }] });
  assert.deepEqual(list.map((x) => x.label), ['b', 'a']);
  const daily = parseDaily({ rows: [{ dimensionValues: [{ value: '20261006' }], metricValues: [{ value: '5' }] }] }, { start: '2026-10-05', end: '2026-10-07' });
  assert.deepEqual(daily, [{ date: '2026-10-05', value: 0 }, { date: '2026-10-06', value: 5 }, { date: '2026-10-07', value: 0 }]);
});

test('Search Console: totalen en zoektermen', () => {
  assert.deepEqual(parseScTotals({ rows: [{ clicks: 3, impressions: 120, ctr: 0.025, position: 14.2 }] }), { clicks: 3, impressions: 120, ctr: 0.025, position: 14.2 });
  assert.deepEqual(parseScTotals({}), { clicks: 0, impressions: 0, ctr: 0, position: 0 });
  assert.equal(parseScQueries({ rows: [{ keys: ['ganzenshoarma'], clicks: 2, impressions: 40, ctr: 0.05, position: 8 }] })[0].query, 'ganzenshoarma');
});

test('positie: lager getal is beter, en te weinig gegevens geeft geen oordeel', () => {
  assert.equal(positionDelta(8, 12).dir, 'up'); assert.match(positionDelta(8, 12).text, /^4 plaatsen hoger/);
  assert.equal(positionDelta(12, 8).dir, 'down');
  assert.equal(positionDelta(8, 8).dir, 'flat');
  assert.equal(positionDelta(0, 8).dir, 'none');
});

test('herkenbare namen en datumtekst', () => {
  assert.equal(channelLabel('Organic Social'), 'Social media'); assert.equal(channelLabel('Iets Nieuws'), 'Iets Nieuws');
  assert.equal(pageLabel('/'), 'Homepage'); assert.equal(pageLabel('/verhaal'), 'verhaal'); assert.equal(pageLabel('/privacy.html'), 'privacy');
  assert.equal(rangeLabel({ start: '2026-10-05', end: '2026-10-11' }), '5 t/m 11 oktober');
  assert.equal(rangeLabel({ start: '2026-09-28', end: '2026-10-04' }), '28 september t/m 4 oktober');
});

import { parseDailyRanges, parseScDaily, groupOrdersDaily, niceMax } from '../lib/analyticsData.js';

test('bezoekers per dag voor twee periodes naast elkaar, ook als dateRange vooraan of achteraan staat', () => {
  const cur = { start: '2026-10-05', end: '2026-10-07' };
  const prev = { start: '2026-10-02', end: '2026-10-04' };
  const resp = { dimensionHeaders: [{ name: 'date' }, { name: 'dateRange' }], rows: [
    { dimensionValues: [{ value: '20261006' }, { value: 'date_range_0' }], metricValues: [{ value: '5' }] },
    { dimensionValues: [{ value: '20261003' }, { value: 'date_range_1' }], metricValues: [{ value: '3' }] }] };
  const d = parseDailyRanges(resp, cur, prev);
  assert.deepEqual(d.current.map((x) => x.value), [0, 5, 0]);
  assert.deepEqual(d.previous.map((x) => x.value), [0, 3, 0]);
  assert.equal(d.current.length, d.previous.length);
  assert.equal(parseDailyRanges({ dimensionHeaders: [{ name: 'dateRange' }, { name: 'date' }], rows: [{ dimensionValues: [{ value: 'date_range_1' }, { value: '20261003' }], metricValues: [{ value: '9' }] }] }, cur, prev).previous[1].value, 9);
});

test('Search Console klikken per dag, ontbrekende dagen zijn nul', () => {
  const s = parseScDaily({ rows: [{ keys: ['2026-10-02'], clicks: 4 }] }, { start: '2026-10-01', end: '2026-10-03' });
  assert.deepEqual(s, [{ date: '2026-10-01', value: 0 }, { date: '2026-10-02', value: 4 }, { date: '2026-10-03', value: 0 }]);
});

test('bestellingen en omzet per dag: dag in Amsterdam, geannuleerd telt niet, definitief gaat voor schatting', () => {
  const cur = { start: '2026-10-05', end: '2026-10-07' };
  const prev = { start: '2026-10-02', end: '2026-10-04' };
  const orders = [
    { created_at: '2026-10-05T22:30:00Z', status: 'nieuw', total_estimate_cents: 3000, total_final_cents: null },
    { created_at: '2026-10-06T10:00:00Z', status: 'bezorgd', total_estimate_cents: 3000, total_final_cents: 2800 },
    { created_at: '2026-10-06T11:00:00Z', status: 'geannuleerd', total_estimate_cents: 9999, total_final_cents: null },
    { created_at: '2026-10-03T09:00:00Z', status: 'nieuw', total_estimate_cents: 1500, total_final_cents: null }
  ];
  const g = groupOrdersDaily(orders, cur, prev);
  assert.deepEqual(g.orders.current.map((x) => x.value), [0, 2, 0]);
  assert.deepEqual(g.revenue.current.map((x) => x.value), [0, 5800, 0]);
  assert.deepEqual(g.orders.previous.map((x) => x.value), [0, 1, 0]);
  assert.equal(g.orders.current[1].date, '2026-10-06');
});

test('mooie asgrens', () => {
  assert.equal(niceMax(0), 1); assert.equal(niceMax(3), 3); assert.equal(niceMax(7), 8); assert.equal(niceMax(28), 30);
  assert.equal(niceMax(120), 150); assert.equal(niceMax(1700), 2000); assert.ok(niceMax(12345) >= 12345);
});
