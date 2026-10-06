// TOTP (RFC 6238, zoals Google Authenticator/Authy) met alleen de ingebouwde Web Crypto van de
// Worker — geen library nodig. 30-seconden stappen, 6 cijfers, HMAC-SHA1 (de standaard die alle
// authenticator-apps ondersteunen).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) {
    const v = ALPHABET.indexOf(c);
    if (v !== -1) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

// 160 bits, de gebruikelijke sleutellengte voor TOTP.
export function generateSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function codeAtStep(secretBytes, step) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = hmac[hmac.length - 1] & 0xf;
  const num = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(num % 1_000_000).padStart(6, '0');
}

// Staat één stap (±30s) klokverschil toe, zoals gebruikelijk bij TOTP-implementaties.
// Geeft het nummer van de stap terug waar de code bij hoort (nodig om een code maar één keer te
// laten werken), of null als de code niet klopt.
export async function verifyTotpStep(secretBase32, code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return null;
  const secretBytes = base32Decode(secretBase32);
  if (!secretBytes.length) return null;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [0, -1, 1]) {
    if ((await codeAtStep(secretBytes, step + delta)) === clean) return step + delta;
  }
  return null;
}

export async function verifyTotp(secretBase32, code) {
  return (await verifyTotpStep(secretBase32, code)) !== null;
}
