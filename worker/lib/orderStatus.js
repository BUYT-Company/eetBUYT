// Statusregels voor bestellingen (zie docs/ontwerp-beheerportaal.md §4). Alleen logica, geen database:
// de Worker beslist hier of een wijziging mag en of er een mail bij hoort; supabase/migrations/0006 voert
// de wijziging zelf uit in één databasestap.
export const STATUSES = ['nieuw', 'klaargemaakt', 'onderweg', 'bezorgd', 'geannuleerd'];

export const STATUS_LABEL = {
  nieuw: 'Nieuw',
  klaargemaakt: 'Klaargemaakt',
  onderweg: 'Onderweg',
  bezorgd: 'Bezorgd',
  geannuleerd: 'Geannuleerd'
};

// De hoofdstappen, in volgorde. Geannuleerd is een zijstap.
const FLOW = ['nieuw', 'klaargemaakt', 'onderweg', 'bezorgd'];

// Tekst op de knop voor de volgende stap.
export const NEXT_ACTION = {
  nieuw: { to: 'klaargemaakt', label: 'Markeer als klaargemaakt' },
  klaargemaakt: { to: 'onderweg', label: 'Zet onderweg' },
  onderweg: { to: 'bezorgd', label: 'Markeer als bezorgd' }
};

export const isStatus = (s) => STATUSES.includes(s);

// De volgende stap vanuit deze status, of null als er geen is (bezorgd, geannuleerd).
export const nextStep = (status) => NEXT_ACTION[status] || null;

// Terugzetten: de statussen eerder in de volgorde. Een geannuleerde bestelling blijft geannuleerd
// (heropenen zou het bezorgslot kunnen overboeken; maak dan een nieuwe bestelling).
export function previousSteps(status) {
  const i = FLOW.indexOf(status);
  return i > 0 ? FLOW.slice(0, i) : [];
}

export const canCancel = (status) => status !== 'bezorgd' && status !== 'geannuleerd';

// Mag deze wijziging? Vooruit mag ook een stap overslaan (een bezorger meldt soms direct "bezorgd").
// Dezelfde status is geen wijziging. Terugzetten alleen binnen de hoofdstappen.
export function canChange(from, to) {
  if (!isStatus(from) || !isStatus(to) || from === to) return false;
  if (from === 'geannuleerd') return false;
  if (to === 'geannuleerd') return canCancel(from);
  const a = FLOW.indexOf(from);
  const b = FLOW.indexOf(to);
  return a !== -1 && b !== -1;
}

export const isBackward = (from, to) => {
  const a = FLOW.indexOf(from);
  const b = FLOW.indexOf(to);
  return a !== -1 && b !== -1 && b < a;
};

// Welke mail hoort bij deze wijziging? Alleen bij vooruitgang; terugzetten stuurt nooit een mail.
// Een annuleringsmail gaat alleen mee als dat bij het annuleren is aangevinkt.
export function mailFor(from, to, { sendCancelMail = false } = {}) {
  if (to === 'onderweg' && (from === 'nieuw' || from === 'klaargemaakt')) return 'onderweg';
  if (to === 'bezorgd' && from !== 'bezorgd') return 'bezorgd';
  if (to === 'geannuleerd' && sendCancelMail) return 'geannuleerd';
  return null;
}

export const SOURCE_LABEL = {
  handmatig: 'handmatig',
  afvinklijst: 'afvinklijst',
  route: 'route gestart',
  bezorger: 'bezorgdienst',
  systeem: 'systeem'
};
