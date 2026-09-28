// Inloggen voor /admin/*: eigen paginaatje (in plaats van de kale browser-popup van Basic Auth),
// met een los account per persoon (wachtwoord + TOTP-2FA elk). De sessiecookie is stateless te
// controleren, ondertekend met een aparte ADMIN_SESSION_SECRET (niet iemands wachtwoord) — geen
// sessietabel nodig. Tijdelijke oplossing tot eetbuyt.nl aan Cloudflare hangt en Cloudflare Access
// met een pad-policy op /admin/* kan (zie ontwerp §16); faalt gesloten zonder configuratie.
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

// ADMIN_ACCOUNTS is één secret: een JSON-lijst [{ "name": "...", "password": "...", "totp": "..." }, ...].
// "totp" mag leeg zijn zolang iemand nog geen 2FA heeft ingesteld (dan volstaat het wachtwoord,
// zie handleLoginPost) — anders zou niemand ooit voor het eerst bij /admin/setup-2fa kunnen komen.
// Ongeldige of onvolledige items (geen naam/wachtwoord) worden genegeerd, niet de hele lijst.
function parseAccounts(env) {
  try {
    const list = JSON.parse(env.ADMIN_ACCOUNTS || '[]');
    return Array.isArray(list) ? list.filter((a) => a && typeof a.name === 'string' && a.password) : [];
  } catch (_) {
    return [];
  }
}

async function makeSession(sessionSecret, name) {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${expires}|${name}`;
  const b64 = btoa(unescape(encodeURIComponent(payload)));
  return `${b64}.${await sign(sessionSecret, payload)}`;
}

function readCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return match ? match.slice(COOKIE.length + 1) : null;
}

async function readSession(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const token = readCookie(request);
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const [b64, sig] = [token.slice(0, dot), token.slice(dot + 1)];
  let payload;
  try {
    payload = decodeURIComponent(escape(atob(b64)));
  } catch (_) {
    return null;
  }
  const sep = payload.indexOf('|');
  if (sep === -1) return null;
  const expires = Number(payload.slice(0, sep));
  const name = payload.slice(sep + 1);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  if (!timingSafeEqual(sig, await sign(env.ADMIN_SESSION_SECRET, payload))) return null;
  return { name };
}

export async function isLoggedIn(request, env) {
  return Boolean(await readSession(request, env));
}

// Voor de topbalk ("Uitloggen (Naam)"); geeft null terug als er geen (geldige) sessie is.
export async function currentUserName(request, env) {
  const session = await readSession(request, env);
  return session ? session.name : null;
}

function loginPage(next, errorMsg) {
  return page('Inloggen', `
    <div style="max-width:340px;margin:14vh auto 0">
      <p style="text-align:center;font-weight:800;letter-spacing:-.02em;margin:0 0 28px">BUYT beheer</p>
      <form method="POST" action="/admin/login" style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 0 0 1.5px rgba(18,51,38,.16);display:grid;gap:14px">
        <input type="hidden" name="next" value="${esc(next)}">
        <div style="display:grid;gap:6px">
          <label for="pw" style="font-size:.88rem;font-weight:700">Wachtwoord</label>
          <input id="pw" name="password" type="password" autofocus required style="font:inherit;padding:.7rem .85rem;border:1.5px solid rgba(18,51,38,.3);border-radius:10px">
        </div>
        <div style="display:grid;gap:6px">
          <label for="code" style="font-size:.88rem;font-weight:700">Authenticatiecode <small>(leeg laten als je nog geen 2FA hebt ingesteld)</small></label>
          <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" style="font:inherit;padding:.7rem .85rem;border:1.5px solid rgba(18,51,38,.3);border-radius:10px;letter-spacing:.2em">
        </div>
        ${errorMsg ? `<p style="margin:0;color:#b3261e;font-size:.88rem">${esc(errorMsg)}</p>` : ''}
        <button type="submit" style="font:inherit;font-weight:700;background:#123326;color:#FFF8E8;border:0;border-radius:10px;padding:.75rem;cursor:pointer">Inloggen</button>
      </form>
    </div>
  `, { bare: true });
}

export async function handleLogin(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') return loginPage(url.searchParams.get('next') || '/admin/orders');

  const accounts = parseAccounts(env);
  const form = new URLSearchParams(await request.text());
  return handleLoginPost(form, accounts, env);
}

async function handleLoginPost(form, accounts, env) {
  const password = form.get('password') || '';
  const code = form.get('code') || '';
  const next = form.get('next') || '/admin/orders';

  if (!accounts.length || !env.ADMIN_SESSION_SECRET) return loginPage(next, 'Beheer is nog niet (volledig) ingesteld.');

  let matched = null;
  for (const acc of accounts) {
    // Beide checks altijd uitvoeren (niet vroegtijdig stoppen op het wachtwoord), zodat de
    // resterende accounts qua timing niet verraden welk wachtwoord wél goed was.
    const passOk = timingSafeEqual(password, acc.password);
    // Nog geen 2FA voor déze persoon ingesteld (acc.totp leeg): wachtwoord alleen is dan genoeg,
    // zodat iemand voor het eerst bij /admin/setup-2fa kan komen.
    const codeOk = acc.totp ? await verifyTotp(acc.totp, code) : true;
    if (passOk && codeOk) matched = acc;
  }
  if (!matched) return loginPage(next, 'Onjuist wachtwoord of onjuiste code.');

  const token = await makeSession(env.ADMIN_SESSION_SECRET, matched.name);
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

// Sleutel + QR-code genereren voor 2FA. Staat achter de gewone login (dus alleen te bereiken als
// je al bent ingelogd) — bruikbaar om voor jezelf óf voor iemand anders (mede-oprichter) een
// nieuwe sleutel te maken. Genereert bij elk bezoek een NIEUWE sleutel; ververs niet nadat je 'm
// hebt overgenomen. De QR-tekening zelf gebeurt in de browser met een bekende, gratis bibliotheek
// (qrcodejs via cdnjs) — dezelfde soort externe script-load als Turnstile al gebruikt.
export function setup2fa(url, userName) {
  const naam = (url.searchParams.get('naam') || '').slice(0, 60) || 'eigenaar';
  const secret = generateSecret();
  const label = `BUYT beheer:${naam}`;
  const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=BUYT&digits=6&period=30`;
  return page('2FA instellen', `
    <a class="back" href="/admin/orders">&larr; Terug</a>
    <h1>2FA instellen</h1>
    <div class="panel">
      <form method="GET" style="display:flex;gap:10px;align-items:end;margin-bottom:18px">
        <div style="display:grid;gap:6px;flex:1">
          <label for="naam" style="font-size:.85rem;font-weight:700">Voor wie is deze sleutel?</label>
          <input id="naam" name="naam" type="text" value="${esc(naam === 'eigenaar' ? '' : naam)}" placeholder="bijv. Marieke" style="font:inherit;padding:.6rem .8rem;border:1.5px solid rgba(18,51,38,.3);border-radius:10px">
        </div>
        <button type="submit" style="font:inherit;font-weight:700;background:#fff;color:#123326;border:1.5px solid rgba(18,51,38,.3);border-radius:10px;padding:.65rem 1rem;cursor:pointer">Nieuwe sleutel</button>
      </form>

      <p>Scan deze QR-code met de authenticator-app (Google Authenticator, Authy, 1Password, ...), of voer de sleutel handmatig in:</p>
      <div id="qr" style="margin:14px 0;width:200px;height:200px"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      <script>new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(otpauth)}, width: 200, height: 200 });</script>

      <dl>
        <dt>Account</dt><dd>${esc(label)}</dd>
        <dt>Sleutel</dt><dd style="font-family:monospace;font-size:1.1rem;letter-spacing:.05em">${esc(secret)}</dd>
        <dt>Type</dt><dd>Tijdgebaseerd (TOTP), 6 cijfers, 30 seconden</dd>
      </dl>

      <p style="margin-top:14px">Voeg deze persoon toe aan de lijst in <strong>ADMIN_ACCOUNTS</strong> (Secret, JSON) in de Worker-instellingen:</p>
      <pre style="background:rgba(18,51,38,.05);border-radius:10px;padding:12px;font-size:.85rem;overflow-x:auto">{"name": ${JSON.stringify(naam)}, "password": "&lt;wachtwoord voor ${esc(naam)}&gt;", "totp": "${esc(secret)}"}</pre>
      <p class="empty">Ververs deze pagina niet opnieuw voor je de sleutel hebt overgenomen — elk bezoek (en elke nieuwe naam) genereert een nieuwe.</p>
    </div>
  `, { userName });
}
