// Van adres naar punt op de kaart, met PDOK Locatieserver (gratis dienst van de Nederlandse overheid, Kadaster; geen
// sleutel nodig). Adressen gaan dus niet naar Google voor het opzoeken. Het resultaat wordt bij de bestelling bewaard
// (kolommen lat, lng en geocoded_at, migratie 0009), zodat het per bestelling maar één keer gebeurt.
import { rpc } from './supabase.js';

const ENDPOINT = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

// "POINT(4.9051 52.3777)" (lengte, breedte) naar { lat, lng }. Alleen punten in en rond Nederland.
export function parsePoint(wkt) {
  const m = /^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(String(wkt || ''));
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return lat >= 49 && lat <= 54 && lng >= 2 && lng <= 8 ? { lat, lng } : null;
}

export const normPostcode = (p) => String(p || '').replace(/\s+/g, '').toUpperCase();

async function search(fetchImpl, q, type, timeoutMs) {
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&rows=1&fl=centroide_ll,weergavenaam,type&fq=type:${type}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { error: true };
    const data = await res.json();
    return { doc: data?.response?.docs?.[0] || null };
  } catch (_) {
    return { error: true };
  } finally {
    clearTimeout(timer);
  }
}

// Geeft { status: 'ok', lat, lng, precision } , { status: 'none' } (PDOK antwoordde maar vond niets) of { status: 'error' }
// (geen antwoord: later opnieuw proberen).
export async function geocodeOrder(order, fetchImpl = fetch, timeoutMs = 4000) {
  const pc = normPostcode(order.postcode);
  if (!/^\d{4}[A-Z]{2}$/.test(pc)) return { status: 'none' };
  // 1. Het adres zelf. Alleen goed als het resultaat in dezelfde postcode ligt (PDOK zoekt anders ook ruim).
  const a = await search(fetchImpl, `${pc} ${String(order.street || '').trim()}`, 'adres', timeoutMs);
  if (a.error) return { status: 'error' };
  const hit = a.doc && normPostcode(a.doc.weergavenaam).includes(pc) ? parsePoint(a.doc.centroide_ll) : null;
  if (hit) return { status: 'ok', ...hit, precision: 'adres' };
  // 2. Het midden van de postcode.
  const p = await search(fetchImpl, pc, 'postcode', timeoutMs);
  if (p.error) return { status: 'error' };
  const pt = p.doc ? parsePoint(p.doc.centroide_ll) : null;
  return pt ? { status: 'ok', ...pt, precision: 'postcode' } : { status: 'none' };
}

// Zoekt maximaal `max` bestellingen op die nog geen coördinaten hebben, een paar tegelijk, binnen een tijdsbudget,
// en bewaart ze. Past de rijen ter plekke aan. Faalt nooit hard: de pagina werkt ook als PDOK even niet reageert.
export async function geocodeMissing(env, rows, { max = 25, concurrency = 5, budgetMs = 7000, fetchImpl = fetch } = {}) {
  const todo = rows.filter((o) => o.geocoded_at == null && o.lat == null).slice(0, max);
  const deadline = Date.now() + budgetMs;
  let done = 0;
  for (let i = 0; i < todo.length && Date.now() < deadline; i += concurrency) {
    await Promise.all(todo.slice(i, i + concurrency).map(async (o) => {
      const r = await geocodeOrder(o, fetchImpl);
      if (r.status === 'error') return;
      try {
        await rpc(env, 'set_order_geo', { p_order_number: Number(o.order_number), p_lat: r.status === 'ok' ? r.lat : null, p_lng: r.status === 'ok' ? r.lng : null });
      } catch (_) { return; }
      o.geocoded_at = new Date().toISOString();
      if (r.status === 'ok') { o.lat = r.lat; o.lng = r.lng; }
      done += 1;
    }));
  }
  return { done, remaining: Math.max(0, rows.filter((o) => o.geocoded_at == null && o.lat == null).length) };
}
