// Koppeling met Google, alleen lezen: Google Analytics (Data API) en Search Console. Het beheer logt in als
// een servicegebruik (e-mailadres + privésleutel uit het Worker-geheim GOOGLE_SA_JSON). Dat gebruik heeft
// alleen leesrechten, die jullie zelf in Analytics (Kijker) en Search Console (Beperkt) hebben gegeven.
// Antwoorden worden een half uur bewaard, zodat de pagina snel blijft en Google's limieten niet in de weg zitten.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly';
const CACHE_SECONDS = 30 * 60;

export class GoogleError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// De sleutel staat als JSON in GOOGLE_SA_JSON. Geeft null als die ontbreekt of niet bruikbaar is.
export function parseServiceAccount(env) {
  try {
    const sa = JSON.parse(env.GOOGLE_SA_JSON || '');
    return sa && typeof sa.client_email === 'string' && typeof sa.private_key === 'string' ? sa : null;
  } catch (_) {
    return null;
  }
}

const b64url = (input) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function signedJwt(sa) {
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(sig)}`;
}

let tokenCache = { token: null, exp: 0, who: '' };

async function accessToken(env) {
  const sa = parseServiceAccount(env);
  if (!sa) throw new GoogleError('niet_ingesteld');
  if (tokenCache.token && tokenCache.who === sa.client_email && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signedJwt(sa) })
    });
  } catch (_) {
    throw new GoogleError('sleutel_ongeldig');
  }
  if (!res.ok) throw new GoogleError('sleutel_ongeldig', res.status);
  const body = await res.json();
  tokenCache = { token: body.access_token, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000, who: sa.client_email };
  return tokenCache.token;
}

// Zet een fout van Google om in een korte code die het beheer in gewoon Nederlands kan uitleggen.
function codeFor(status, text) {
  const t = String(text || '').toLowerCase();
  if (status === 429) return 'limiet';
  if (status === 404) return 'niet_gevonden';
  if (status === 403 && (t.includes('has not been used') || t.includes('is disabled') || t.includes('accessnotconfigured'))) return 'api_uit';
  if (status === 403 || status === 401) return 'geen_toegang';
  if (status === 400 && t.includes('property')) return 'niet_gevonden';
  return 'fout';
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function postJson(env, url, body) {
  const key = typeof caches !== 'undefined' && caches.default ? new Request(`https://google-cache.buyt.invalid/${await sha(url + JSON.stringify(body))}`) : null;
  if (key) {
    const hit = await caches.default.match(key);
    if (hit) return hit.json();
  }
  const token = await accessToken(env);
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (_) {
    throw new GoogleError('fout');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) tokenCache = { token: null, exp: 0, who: '' };
    throw new GoogleError(codeFor(res.status, text), res.status);
  }
  const data = await res.json();
  if (key) {
    try {
      await caches.default.put(key, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` } }));
    } catch (_) { /* bewaren is aanvullend */ }
  }
  return data;
}

export function gaReport(env, propertyId, body) {
  if (!/^\d{3,15}$/.test(String(propertyId || ''))) return Promise.reject(new GoogleError('niet_gevonden'));
  return postJson(env, `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body);
}

export function scQuery(env, site, body) {
  if (!site) return Promise.reject(new GoogleError('niet_gevonden'));
  return postJson(env, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
}
