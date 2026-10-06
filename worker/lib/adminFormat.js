// Opmaak en rekenwerk voor het beheer, zonder HTML en zonder database (daardoor goed te testen).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const eur = (cents) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);

const TZ = 'Europe/Amsterdam';

export const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));

export const fmtDay = (iso) =>
  new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso));

export const fmtDelivery = (date, window) => {
  if (!date || !window) return '–';
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
  return `${label}, ${window.replace('-', '–')} uur`;
};

export const fmtDeliveryShort = (date, window) => {
  if (!date || !window) return '–';
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
  return `${label}, ${window.replace('-', '–')}`;
};

// Totaal van een bestelling zoals in de lijst: definitief als dat er is, anders de schatting ("ca.").
export function orderTotal(o) {
  const cents = o.total_final_cents ?? o.total_estimate_cents ?? 0;
  const approx = (o.is_indicative || o.has_unpriced) && o.total_final_cents == null;
  if (o.has_unpriced && cents === 0 && o.total_final_cents == null) return 'Volgt';
  return `${approx ? 'ca. ' : ''}${eur(cents)}`;
}

// Verandering ten opzichte van de vorige periode. Zonder genoeg gegevens (minder dan 3 bestellingen in
// de vorige periode) geen percentage: dat zou schijnnauwkeurig zijn.
export function delta(current, previous, previousOrders) {
  if (previousOrders < 3 || !(previous > 0)) {
    return { dir: 'none', pct: null, text: 'Nog te weinig bestellingen om te vergelijken' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { dir: 'flat', pct: 0, text: 'Gelijk aan de vorige periode' };
  const sign = pct > 0 ? '+' : '−';
  return { dir: pct > 0 ? 'up' : 'down', pct, text: `${sign}${Math.abs(pct)}% t.o.v. vorige periode` };
}

export const PERIODS = { dag: 'Vandaag', '7d': '7 dagen', '30d': '30 dagen' };
export const periodOr = (p, fallback = '7d') => (Object.prototype.hasOwnProperty.call(PERIODS, p) ? p : fallback);

export const TABS = ['nieuw', 'klaargemaakt', 'onderweg', 'bezorgd', 'alle'];
export const tabOr = (t) => (TABS.includes(t) ? t : 'nieuw');

export const PAGE_SIZE = 25;
export const pageOr = (p) => {
  const n = Number.parseInt(p, 10);
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : 1;
};

// Zoekterm veilig maken voor een PostgREST-filter: alleen letters, cijfers, spaties en een paar tekens.
export const cleanQuery = (q) => String(q || '').normalize('NFKC').replace(/[^\p{L}\p{N}@.\- +]/gu, '').trim().slice(0, 60);

// Welke begroeting past bij het uur (Amsterdamse tijd)?
export function greeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('nl-NL', { hour: 'numeric', hour12: false, timeZone: TZ }).format(date));
  if (hour < 6) return 'Goedenacht';
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}
