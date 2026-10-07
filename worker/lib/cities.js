// Plaatsen van bestellingen: de zes steden van het (verwachte) bezorggebied, en het netjes samenvoegen van
// verschillende schrijfwijzen ("amsterdam", "Amsterdam ", "Amsterdam Zuidoost", "'s-Gravenhage" voor Den Haag).
// Pas DELIVERY_CITIES aan zodra het bezorggebied verandert.
export const DELIVERY_CITIES = ['Amsterdam', 'Amstelveen', 'Haarlem', 'Utrecht', 'Rotterdam', 'Den Haag'];

const ALIASES = new Map([
  ['s-gravenhage', 'Den Haag'], ['sgravenhage', 'Den Haag'], ['the hague', 'Den Haag'], ['denhaag', 'Den Haag'], ['den-haag', 'Den Haag']
]);

// Zonder hoofdletters, accenten, apostrofs en dubbele spaties.
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

export function canonicalCity(raw) {
  const p = plain(raw);
  if (!p) return 'Onbekend';
  if (ALIASES.has(p)) return ALIASES.get(p);
  for (const city of DELIVERY_CITIES) {
    const c = plain(city);
    // Exact, of een stadsdeel met de stad voorop ("Amsterdam Zuidoost", "Utrecht-Overvecht"). Amstelveen blijft apart van Amsterdam.
    if (p === c || p.startsWith(`${c} `) || p.startsWith(`${c}-`)) return city;
  }
  return titleCase(String(raw).replace(/\s+/g, ' ').trim());
}

// orders: rijen met city, status, totals. Geeft de zes bezorgsteden (altijd, ook met nul) en alle andere plaatsen, grootste eerst.
export function cityStats(orders) {
  const map = new Map();
  let total = 0;
  for (const o of orders || []) {
    if (o.status === 'geannuleerd') continue;
    const city = canonicalCity(o.city);
    const cur = map.get(city) || { city, count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += o.total_final_cents ?? o.total_estimate_cents ?? 0;
    map.set(city, cur);
    total += 1;
  }
  const byCount = (a, b) => b.count - a.count || a.city.localeCompare(b.city, 'nl');
  const inArea = DELIVERY_CITIES.map((city) => map.get(city) || { city, count: 0, cents: 0 }).sort(byCount);
  const other = [...map.values()].filter((c) => !DELIVERY_CITIES.includes(c.city)).sort(byCount);
  const inAreaTotal = inArea.reduce((n, c) => n + c.count, 0);
  return { inArea, other, total, inAreaTotal };
}
