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
