// Rekenwerk voor de Analytics-pagina (ronde 3, zie docs/ontwerp-beheerportaal.md): periodes, en het
// uitlezen van de antwoorden van de Google Analytics Data API en de Search Console API. Zonder netwerk,
// zodat het goed te testen is.
import { amsterdamToday } from './adminFormat.js';

export const ANALYTICS_PERIODS = { '7d': { days: 7, label: '7 dagen' }, '30d': { days: 30, label: '30 dagen' }, '90d': { days: 90, label: '90 dagen' } };
export const analyticsPeriodOr = (p) => (Object.prototype.hasOwnProperty.call(ANALYTICS_PERIODS, p) ? p : '7d');

const ymdOf = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(d);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// De periode loopt t/m gisteren (vandaag is nog niet af) en wordt vergeleken met de periode ervoor, even lang.
// Search Console loopt een paar dagen achter, daarom schuift de einddatum daar twee dagen op.
export function dateRanges(period, now = new Date()) {
  const days = ANALYTICS_PERIODS[analyticsPeriodOr(period)].days;
  const today = amsterdamToday(now);
  const end = addDays(today, -1);
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  const scEnd = addDays(today, -3);
  const scStart = addDays(scEnd, -(days - 1));
  const scPrevEnd = addDays(scStart, -1);
  const scPrevStart = addDays(scPrevEnd, -(days - 1));
  return {
    days,
    current: { start, end },
    previous: { start: prevStart, end: prevEnd },
    sc: { current: { start: scStart, end: scEnd }, previous: { start: scPrevStart, end: scPrevEnd } }
  };
}

// De Data API voegt bij twee periodes zelf een dimensie "dateRange" toe (date_range_0 of date_range_1).
// Op welke plek die staat, lezen we uit de kopregel, niet uit een vaste positie.
const num = (v) => Number(v) || 0;
const col = (resp, name) => (resp?.dimensionHeaders || []).findIndex((h) => h.name === name);
const rangeOf = (resp, row) => {
  const i = col(resp, 'dateRange');
  return i !== -1 && row.dimensionValues?.[i]?.value === 'date_range_1' ? 'previous' : 'current';
};

// Totalen per periode. Geeft { current: { metric: n }, previous: { metric: n } }.
export function parseTotals(resp, metricNames) {
  const out = { current: {}, previous: {} };
  for (const m of metricNames) { out.current[m] = 0; out.previous[m] = 0; }
  for (const row of resp?.rows || []) {
    const which = rangeOf(resp, row);
    metricNames.forEach((m, i) => { out[which][m] = num(row.metricValues?.[i]?.value); });
  }
  return out;
}

// Gebeurtenissen (add_to_cart, purchase, ...) per periode: { current: { add_to_cart: 3 }, previous: {...} }.
export function parseEvents(resp) {
  const out = { current: {}, previous: {} };
  const ni = col(resp, 'eventName');
  for (const row of resp?.rows || []) {
    const name = row.dimensionValues?.[ni === -1 ? 0 : ni]?.value;
    if (name) out[rangeOf(resp, row)][name] = num(row.metricValues?.[0]?.value);
  }
  return out;
}

// Lijst met één dimensie en één meting, grootste eerst.
export function parseList(resp, limit = 8) {
  return (resp?.rows || [])
    .map((r) => ({ label: r.dimensionValues?.[0]?.value || '(onbekend)', value: num(r.metricValues?.[0]?.value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// Reeks per dag; dag staat als YYYYMMDD. Ontbrekende dagen worden 0 zodat de grafiek geen gaten krijgt.
export function parseDaily(resp, range) {
  const byDay = new Map();
  for (const r of resp?.rows || []) {
    const d = r.dimensionValues?.[0]?.value || '';
    if (d.length === 8) byDay.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, num(r.metricValues?.[0]?.value));
  }
  const out = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push({ date: d, value: byDay.get(d) || 0 });
  return out;
}

// Search Console: één rij met totalen, of een lijst zoekopdrachten.
export const parseScTotals = (resp) => {
  const r = resp?.rows?.[0];
  return { clicks: num(r?.clicks), impressions: num(r?.impressions), ctr: num(r?.ctr), position: num(r?.position) };
};
export const parseScQueries = (resp) =>
  (resp?.rows || []).map((r) => ({ query: r.keys?.[0] || '', clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) }));

// Herkenbare namen voor herkomst en kanalen van Google.
const CHANNEL = {
  Direct: 'Direct', 'Organic Search': 'Google en andere zoekmachines', 'Organic Social': 'Social media', 'Paid Search': 'Betaalde zoekadvertenties',
  Referral: 'Andere websites', Email: 'E-mail', 'Organic Video': 'Video', Unassigned: 'Onbekend', 'Organic Shopping': 'Shopping', Display: 'Display'
};
export const channelLabel = (c) => CHANNEL[c] || c;

// Pad van een pagina leesbaar maken.
export const pageLabel = (p) => (p === '/' || p === '/index.html' ? 'Homepage' : String(p).replace(/\.html$/, '').replace(/^\//, '') || 'Homepage');

// Verandering in "posities": omhoog (lager getal) is beter. Geeft tekst en richting.
export function positionDelta(cur, prev) {
  if (!(cur > 0) || !(prev > 0)) return { dir: 'none', text: 'Nog te weinig gegevens om te vergelijken' };
  const diff = Math.round((prev - cur) * 10) / 10;
  if (diff === 0) return { dir: 'flat', text: 'Gelijk aan de vorige periode' };
  return diff > 0
    ? { dir: 'up', text: `${diff.toString().replace('.', ',')} plaatsen hoger dan de vorige periode` }
    : { dir: 'down', text: `${Math.abs(diff).toString().replace('.', ',')} plaatsen lager dan de vorige periode` };
}

// Opmaak van een datumbereik: "5 t/m 11 oktober".
export function rangeLabel({ start, end }) {
  const f = (ymd, opts) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'UTC', ...opts }).format(new Date(`${ymd}T12:00:00Z`));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${f(start, { day: 'numeric' })} t/m ${f(end, { day: 'numeric', month: 'long' })}` : `${f(start, { day: 'numeric', month: 'long' })} t/m ${f(end, { day: 'numeric', month: 'long' })}`;
}
