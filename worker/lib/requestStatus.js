// Verloop van berichten en zakelijke aanvragen (tabel business_requests, zie docs/ontwerp-beheerportaal.md).
// Berichten van particulieren: nieuw, beantwoord. Zakelijke aanvragen: nieuw, in gesprek, offerte verstuurd,
// gewonnen, verloren. De database controleert dezelfde sets (set_request_status in migratie 0007).
export const REQUEST_LABEL = {
  nieuw: 'Nieuw',
  beantwoord: 'Beantwoord',
  in_gesprek: 'In gesprek',
  offerte_verstuurd: 'Offerte verstuurd',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren'
};

export const BUSINESS_STATUSES = ['nieuw', 'in_gesprek', 'offerte_verstuurd', 'gewonnen', 'verloren'];
export const MESSAGE_STATUSES = ['nieuw', 'beantwoord'];

export const allowedStatuses = (type) => (type === 'zakelijk' ? BUSINESS_STATUSES : MESSAGE_STATUSES);

export const canSet = (type, to) => allowedStatuses(type).includes(to);

// De volgende stap op de knop: label en doelstatus, of null als de aanvraag klaar is.
const NEXT = {
  zakelijk: {
    nieuw: { to: 'in_gesprek', label: 'Markeer als in gesprek' },
    in_gesprek: { to: 'offerte_verstuurd', label: 'Offerte verstuurd' },
    offerte_verstuurd: { to: 'gewonnen', label: 'Markeer als gewonnen' }
  },
  particulier: { nieuw: { to: 'beantwoord', label: 'Markeer als beantwoord' } }
};
export const nextRequestStep = (type, status) => (NEXT[type] || {})[status] || null;

// De database heeft geen bedrijfs- en telefoonkolom: de website zet "Bedrijf: ..." en "Telefoon: ..." bovenaan
// het bericht. Dit haalt ze er weer uit, zodat het beheer ze netjes kan tonen.
export function parseRequestMessage(message) {
  let text = String(message || '');
  const out = { company: '', phone: '' };
  for (let i = 0; i < 2; i++) {
    const m = /^(Bedrijf|Telefoon): ?(.*?)(?:\r?\n\r?\n|\r?\n|$)/.exec(text);
    if (!m) break;
    if (m[1] === 'Bedrijf') out.company = m[2].trim(); else out.phone = m[2].trim();
    text = text.slice(m[0].length);
  }
  return { ...out, body: text.trim() };
}
