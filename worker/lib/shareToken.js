// Codes voor de gedeelde bezorglijst. De code (256 bit, niet te raden) staat alleen in de link; in de
// database staat een hash. Daardoor kan niemand met toegang tot de database een werkende link maken.
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

// Een geldige code is precies 43 tekens (32 bytes in base64url). Alles anders hoeft de database niet te zien.
export const isTokenShape = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
