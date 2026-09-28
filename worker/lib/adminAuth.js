// Inloggen voor /admin/*: eigen paginaatje (in plaats van de kale browser-popup van Basic Auth),
// met wachtwoord + TOTP (2FA, zoals Google Authenticator/Authy). De sessiecookie is stateless
// geldig te maken/controleren — geen sessietabel nodig. Tijdelijke oplossing tot eetbuyt.nl aan
// Cloudflare hangt en Cloudflare Access met een pad-policy op /admin/* kan (zie ontwerp §16);
// faalt gesloten zonder ADMIN_PASSWORD.
import { page, esc } from './admin.js';
import { generateSecret, verifyTotp } from './totp.js';

const COOKIE = 'buyt_admin';
const SESSION_DAYS = 7;

async function sign(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeSession(password) {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await sign(password, String(expires))}`;
}

function readCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return match ? match.slice(COOKIE.length + 1) : null;
}

export async function isLoggedIn(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = readCookie(request);
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expires = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return timingSafeEqual(sig, await sign(env.ADMIN_PASSWORD, String(expires)));
}

function loginPage(next, errorMsg, needsCode) {
  return page('Inloggen', `
    <div style="max-width:340px;margin:14vh auto 0">
      <p style="text-align:center;font-weight:800;letter-spacing:-.02em;margin:0 0 28px">BUYT beheer</p>
      <form method="POST" action="/admin/login" style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 0 0 1.5px rgba(18,51,38,.16);display:grid;gap:14px">
        <input type="hidden" name="next" value="${esc(next)}">
        <div style="display:grid;gap:6px">
          <label for="pw" style="font-size:.88rem;font-weight:700">Wachtwoord</label>
          <input id="pw" name="password" type="password" autofocus required style="font:inherit;padding:.7rem .85rem;border:1.5px solid rgba(18,51,38,.3);border-radius:10px">
        </div>
        ${needsCode ? `
        <div style="display:grid;gap:6px">
          <label for="code" style="font-size:.88rem;font-weight:700">Authenticatiecode</label>
          <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" style="font:inherit;padding:.7rem .85rem;border:1.5px solid rgba(18,51,38,.3);border-radius:10px;letter-spacing:.2em">
        </div>` : ''}
        ${errorMsg ? `<p style="margin:0;color:#b3261e;font-size:.88rem">${esc(errorMsg)}</p>` : ''}
        <button type="submit" style="font:inherit;font-weight:700;background:#123326;color:#FFF8E8;border:0;border-radius:10px;padding:.75rem;cursor:pointer">Inloggen</button>
      </form>
    </div>
  `, { bare: true });
}

export async function handleLogin(request, env) {
  const url = new URL(request.url);
  const needsCode = Boolean(env.ADMIN_TOTP_SECRET);
  if (request.method === 'GET') return loginPage(url.searchParams.get('next') || '/admin/orders', null, needsCode);

  if (!env.ADMIN_PASSWORD) return loginPage('/admin/orders', 'Beheer is nog niet ingesteld.', needsCode);
  const form = new URLSearchParams(await request.text());
  const password = form.get('password') || '';
  const code = form.get('code') || '';
  const next = form.get('next') || '/admin/orders';

  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) return loginPage(next, 'Onjuist wachtwoord.', needsCode);
  if (needsCode && !(await verifyTotp(env.ADMIN_TOTP_SECRET, code))) return loginPage(next, 'Onjuiste of verlopen authenticatiecode.', needsCode);

  const token = await makeSession(env.ADMIN_PASSWORD);
  const safeNext = next.startsWith('/admin/') ? next : '/admin/orders';
  return new Response(null, {
    status: 303,
    headers: {
      Location: safeNext,
      'Set-Cookie': `${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
    }
  });
}

export function handleLogout() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin/login', 'Set-Cookie': `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  });
}

export function redirectToLogin(pathname) {
  return new Response(null, { status: 303, headers: { Location: `/admin/login?next=${encodeURIComponent(pathname)}` } });
}

// Eenmalige pagina om 2FA in te stellen: staat achter de gewone login (dus alleen te bereiken als
// je het wachtwoord al kent). Genereert bij elk bezoek een NIEUWE sleutel — bewaar 'm direct in je
// authenticator-app én als ADMIN_TOTP_SECRET in Cloudflare; ververs deze pagina daarna niet meer.
export function setup2fa() {
  const secret = generateSecret();
  const otpauth = `otpauth://totp/BUYT%20beheer:eigenaar?secret=${secret}&issuer=BUYT&digits=6&period=30`;
  return page('2FA instellen', `
    <a class="back" href="/admin/orders">&larr; Terug</a>
    <h1>2FA instellen</h1>
    <div class="panel">
      <p>Voeg dit toe aan je authenticator-app (Google Authenticator, Authy, 1Password, ...) via <strong>"Setup-sleutel handmatig invoeren"</strong>:</p>
      <dl>
        <dt>Account</dt><dd>BUYT beheer</dd>
        <dt>Sleutel</dt><dd style="font-family:monospace;font-size:1.1rem;letter-spacing:.05em">${esc(secret)}</dd>
        <dt>Type</dt><dd>Tijdgebaseerd (TOTP), 6 cijfers, 30 seconden</dd>
      </dl>
      <p style="margin-top:14px">Zet daarna dezelfde sleutel als <strong>ADMIN_TOTP_SECRET</strong> (Secret) in de Worker-instellingen. Ververs deze pagina niet opnieuw voor je dat gedaan hebt — elk bezoek genereert een nieuwe sleutel.</p>
      <p class="empty" style="margin-top:10px">Ook als tekstlink (sommige apps kunnen dit direct openen als je deze link op je telefoon bezoekt): <code style="word-break:break-all">${esc(otpauth)}</code></p>
    </div>
  `);
}
