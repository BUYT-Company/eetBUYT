// Invoercontrole voor de wachtlijst op de homepage (los van validate.js, dat de productcatalogus importeert).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const clean = (value, max) => (typeof value === 'string' ? value.replace(CONTROL, '').trim() : '').slice(0, max);

// E-mailadres, thuis of zakelijk, en of de nieuwsbrief ook mag.
// Het vakje komt als boolean (JSON) of als 'on'/'true' (gewoon formulier) binnen.
export function validateWaitlist(data) {
  if (!data || typeof data !== 'object') return { ok: false };
  const email = clean(data.email, 200);
  if (!EMAIL.test(email)) return { ok: false };
  const segment = clean(data.segment, 20) || 'particulier';
  if (segment !== 'particulier' && segment !== 'zakelijk') return { ok: false };
  const n = data.newsletter;
  const newsletter = n === true || n === 'on' || n === 'true' || n === '1';
  return { ok: true, value: { email, segment, newsletter } };
}
