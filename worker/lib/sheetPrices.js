// Prijzen uit het (privé) Google Sheet over de producten uit data/products.json leggen.
// Het sheet bepaalt alleen prijs per kilo, gewicht en prijs per verpakking. Namen, foto's, ingrediënten en
// alles wat een bestelling nodig heeft blijft uit products.json. Elke waarde wordt gecontroleerd: een rij of
// cel die niet klopt, wordt genegeerd en dan geldt de waarde uit products.json. Zo kan een typfout in het
// sheet nooit een prijs van € 0 op de site zetten.
import { sheetValues } from './google.js';

const REFRESH_MS = 5 * 60 * 1000;
const MAX_CENTS = 50000; // € 500, daarboven is het een typfout
const MAX_GRAMS = 20000;

const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Koppelen van sheetrij aan product: hoofdletters, spaties en streepjes maken niet uit, en "(2st)" achter de naam telt niet mee.
const slug = (v) => norm(String(v ?? '').replace(/\([^)]*\)/g, '')).replace(/ /g, '');

// Kolomkoppen die we herkennen (genormaliseerd). De eerste die in het sheet staat, wordt gebruikt.
const COLUMNS = {
  key: ['id', 'product', 'productnaam', 'naam', 'name'],
  perKg: ['prijs per kg', 'prijs per kilo', 'prijs kg', 'prijs p kg', 'kiloprijs', 'per kg', 'prijs per kg eur', 'prijs per kg buyt'],
  grams: ['gram', 'gewicht', 'gewicht gram', 'gewicht g', 'gewicht in gram', 'gewicht per verpakking', 'verpakking gram', 'gewicht per product', 'gewicht product'],
  pack: ['prijs per verpakking', 'prijs verpakking', 'prijs per stuk', 'prijs stuk', 'prijs pakket', 'verkoopprijs', 'prijs', 'prijs per product', 'prijs buyt']
};

// "€ 7,50", "7.50", "1.050,00", 7.5 -> centen (geheel getal), of null als het geen bruikbaar bedrag is.
export function parseEuroCents(value) {
  let n;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') {
    let t = value.replace(/[€\s ]/g, '').replace(/eur$/i, '');
    if (!/^\d[\d.,]*$/.test(t)) return null;
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (lastComma > -1) t = t.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return cents >= 1 && cents <= MAX_CENTS ? cents : null;
}

// "500" of "ca. 500 g" -> 500. Geeft null als het niet klopt.
export function parseGrams(value) {
  const m = typeof value === 'string' ? /\d+(?:[.,]\d+)?/.exec(value) : null;
  const n = typeof value === 'number' ? value : m ? Number(m[0].replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const g = Math.round(n);
  return g <= MAX_GRAMS ? g : null;
}

function findColumns(header) {
  const names = header.map(norm);
  const out = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const i = aliases.map((a) => names.indexOf(a)).find((x) => x > -1);
    if (i !== undefined) out[field] = i;
  }
  return out;
}

// Zoekt de kopregel (de eerste rij met een herkenbare productkolom en minstens één prijs- of gewichtskolom).
export function parseSheet(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cols = findColumns(Array.isArray(rows[r]) ? rows[r] : []);
    if (cols.key === undefined || (cols.perKg === undefined && cols.pack === undefined && cols.grams === undefined)) continue;
    const items = [];
    for (const row of rows.slice(r + 1)) {
      if (!Array.isArray(row) || row[cols.key] === undefined || row[cols.key] === '') continue;
      items.push({
        key: String(row[cols.key]),
        perKgCents: cols.perKg === undefined ? null : parseEuroCents(row[cols.perKg]),
        grams: cols.grams === undefined ? null : parseGrams(row[cols.grams]),
        packCents: cols.pack === undefined ? null : parseEuroCents(row[cols.pack])
      });
    }
    return items;
  }
  return null;
}

// Geeft een nieuwe catalogus terug (de oorspronkelijke blijft ongewijzigd) plus een lijst van wat niet gevonden is.
export function applySheet(catalog, items) {
  const bySlug = new Map(items.map((i) => [slug(i.key), i]));
  const missing = [];
  const products = catalog.products.map((p) => {
    const item = bySlug.get(slug(p.id)) || bySlug.get(slug(p.name));
    if (!item) { missing.push(p.id); return p; }
    const next = { ...p };
    if (item.perKgCents !== null) next.pricePerKgCents = item.perKgCents;
    if (item.grams !== null) next.packGrams = item.grams;
    if (item.packCents !== null) next.priceCents = item.packCents;
    else if (item.perKgCents !== null && Number.isInteger(next.packGrams)) next.priceCents = Math.round((item.perKgCents * next.packGrams) / 1000);
    return next;
  });
  return { catalog: { ...catalog, products }, missing };
}

// Laatste goede prijslijst per Worker-instantie. Valt Google even weg, dan blijven de prijzen van het sheet staan.
let last = { at: 0, items: null };

export async function currentCatalog(env, baseCatalog) {
  if (!env.PRICES_SHEET_ID || !env.GOOGLE_SA_JSON) return baseCatalog;
  if (!last.items || Date.now() - last.at > REFRESH_MS) {
    try {
      const items = parseSheet(await sheetValues(env, env.PRICES_SHEET_ID, env.PRICES_SHEET_TAB));
      if (items && items.length) last = { at: Date.now(), items };
      else console.error('prijzen_sheet_leeg_of_onleesbaar');
    } catch (e) {
      console.error('prijzen_sheet_fout', e && e.code);
    }
    last.at = Date.now(); // ook na een fout een paar minuten niet opnieuw proberen
  }
  return last.items ? applySheet(baseCatalog, last.items).catalog : baseCatalog;
}
