// Bezorgmomenten: donderdag en zaterdag, vaste tijdsloten van 2 uur, max. 5 bestellingen per
// slot (bewaakt in supabase/migrations/0004, niet hier — dit is alleen voor het tonen en het
// vooraf afkeuren van een ongeldige keuze). Cutoff: bestellen kan tot 23:59 de dag ervoor.
const WINDOWS = {
  4: ['17:00-19:00', '19:00-21:00'], // donderdag
  6: ['10:00-12:00', '12:00-14:00', '14:00-16:00'] // zaterdag
};
const WEEKDAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const LOOKAHEAD_DAYS = 21;
const MAX_DATES = 3;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "Nu" in Amsterdamse tijd, zodat de cutoff (23:59) niet per ongeluk in UTC wordt vergeleken.
export const amsterdamNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));

function cutoffFor(date) {
  const c = new Date(date);
  c.setDate(c.getDate() - 1);
  c.setHours(23, 59, 59, 999);
  return c;
}

// Voor de picker: de eerstvolgende geldige bezorgdata (nog vóór hun cutoff) met hun tijdsloten.
export function upcomingDates(now = amsterdamNow()) {
  const dates = [];
  for (let i = 0; i < LOOKAHEAD_DAYS && dates.length < MAX_DATES; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const windows = WINDOWS[d.getDay()];
    if (!windows) continue;
    if (now > cutoffFor(d)) continue;
    dates.push({ date: ymd(d), weekday: WEEKDAY_NAMES[d.getDay()], windows });
  }
  return dates;
}

// Voor de server-controle bij het plaatsen van de bestelling: onafhankelijk van de getoonde lijst,
// zodat een geldige datum altijd geldig blijft, ook als de picker een andere lookahead gebruikt.
// Voor weergave (pushmelding, e-mail): "do 1 okt, 17:00–19:00 uur".
export function formatDelivery(dateStr, window) {
  const d = new Date(`${dateStr}T00:00:00`);
  const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${label}, ${window.replace('-', '–')} uur`;
}

export function isValidSlot(dateStr, window, now = amsterdamNow()) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setHours(0, 0, 0, 0);
  if (Number.isNaN(d.getTime()) || ymd(d) !== dateStr) return false;
  const allowed = WINDOWS[d.getDay()];
  if (!allowed || !allowed.includes(window)) return false;
  return now <= cutoffFor(d);
}
