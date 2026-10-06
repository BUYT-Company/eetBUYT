// Inloggen voor /admin/*: eigen loginpagina met een los account per persoon (wachtwoord + 2FA-code
// uit een authenticator-app). De sessiecookie is stateless te controleren, ondertekend met een aparte
// ADMIN_SESSION_SECRET (niet iemands wachtwoord): geen sessietabel nodig.
//
// Aanscherping (zie docs/ontwerp-beheerportaal.md §6):
//  - 2FA is verplicht: een account zonder 2FA-sleutel kan niet inloggen;
//  - een 2FA-code werkt maar één keer;
//  - na 5 mislukte pogingen in 15 minuten vanaf hetzelfde adres moet je wachten;
//  - formulieren die iets wijzigen dragen een CSRF-token en worden op Origin gecontroleerd.
// Faalt gesloten zonder configuratie.
import { esc, bare, layout } from './adminUi.js';
import { generateSecret, verifyTotpStep } from './totp.js';
import { rpc, SupabaseError } from './supabase.js';

const COOKIE = 'buyt_admin';
const SESSION_DAYS = 7;

async function hmacHex(secret, value) {
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
// Ongeldige of onvolledige items (geen naam/wachtwoord) worden genegeerd, niet de hele lijst.
export function parseAccounts(env) {
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
  return `${b64}.${await hmacHex(sessionSecret, payload)}`;
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
  if (!timingSafeEqual(sig, await hmacHex(env.ADMIN_SESSION_SECRET, payload))) return null;
  return { name };
}

export async function isLoggedIn(request, env) {
  return Boolean(await readSession(request, env));
}

// Naam van de ingelogde beheerder; null als er geen (geldige) sessie is.
export async function currentUserName(request, env) {
  const session = await readSession(request, env);
  return session ? session.name : null;
}

// CSRF: een token dat vastzit aan de sessiecookie en alleen met de geheime sleutel te maken is.
export async function csrfToken(request, env) {
  const cookie = readCookie(request);
  if (!cookie || !env.ADMIN_SESSION_SECRET) return '';
  return (await hmacHex(env.ADMIN_SESSION_SECRET, `csrf|${cookie}`)).slice(0, 40);
}

// Formulierverzoeken die iets wijzigen: Origin moet de eigen site zijn en het token moet kloppen.
export async function checkPost(request, env, form) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const expected = await csrfToken(request, env);
  const given = form.get('_csrf') || '';
  return Boolean(expected) && timingSafeEqual(expected, given);
}

// De extra beveiligingen (rem op raden, eenmalige code) draaien op databasefuncties uit migratie 0006.
// Ontbreken die functies (404), dan valt de login niet dicht: wachtwoord en 2FA-code blijven verplicht,
// alleen de extra's vervallen en dat komt in het logboek. Elke andere fout blijft gewoon een fout.
async function guardRpc(env, fn, args, whenMissing) {
  try {
    return await rpc(env, fn, args);
  } catch (e) {
    if (e instanceof SupabaseError && e.status === 404) {
      console.error('admin_rpc_missing', fn);
      return whenMissing;
    }
    throw e;
  }
}

const ipHash = (request, env) => hmacHex(env.ADMIN_SESSION_SECRET || 'x', `ip|${request.headers.get('CF-Connecting-IP') || 'onbekend'}`);

function loginPage(next, errorMsg, status = 200) {
  const res = bare('Inloggen', `
<div class="auth"><div class="auth__box">
  <a class="auth__logo" href="/"><img src="/assets/logo-still.svg" alt="" width="44" height="41"><span>BUYT</span></a>
  <h1>Inloggen</h1>
  <p class="auth__lead">Beheer voor het BUYT-team.</p>
  <form method="post" action="/admin/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <div class="field">
      <label for="pw">Wachtwoord</label>
      <input class="input" id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    </div>
    <div class="field">
      <label for="code">Code uit je authenticator-app</label>
      <input class="input otp" id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="000000" required data-otp aria-describedby="code-hint">
      <p class="hint" id="code-hint">6 cijfers. De code verandert elke 30 seconden.</p>
    </div>
    ${errorMsg ? `<p class="error" role="alert">${esc(errorMsg)}</p>` : ''}
    <button class="btn btn--primary btn--block" type="submit">Inloggen</button>
  </form>
  <p class="auth__foot">Lukt het niet? Vraag een andere beheerder om hulp.</p>
</div></div>`);
  return status === 200 ? res : new Response(res.body, { status, headers: res.headers });
}

export async function handleLogin(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') return loginPage(url.searchParams.get('next') || '/admin');

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return loginPage('/admin', 'Dit verzoek is niet toegestaan.', 403);

  const form = new URLSearchParams(await request.text());
  const password = form.get('password') || '';
  const code = (form.get('code') || '').replace(/\D/g, '');
  const next = form.get('next') || '/admin';
  const accounts = parseAccounts(env);

  if (!accounts.length || !env.ADMIN_SESSION_SECRET) return loginPage(next, 'Beheer is nog niet (volledig) ingesteld.', 503);

  const ip = await ipHash(request, env);
  try {
    if (await guardRpc(env, 'admin_login_blocked', { p_ip_hash: ip }, false)) {
      return loginPage(next, 'Te veel pogingen. Probeer het over 15 minuten opnieuw.', 429);
    }
  } catch (_) {
    return loginPage(next, 'Inloggen is tijdelijk niet mogelijk. Probeer het later opnieuw.', 503);
  }

  // Alle accounts altijd volledig controleren (niet vroegtijdig stoppen), zodat de timing niet
  // verraadt welk wachtwoord wél goed was.
  let matched = null;
  let step = null;
  let missing2fa = false;
  for (const acc of accounts) {
    const passOk = timingSafeEqual(password, acc.password);
    const s = acc.totp ? await verifyTotpStep(acc.totp, code) : null;
    if (passOk && !acc.totp) missing2fa = true;
    if (passOk && s !== null) { matched = acc; step = s; }
  }

  if (!matched && missing2fa) {
    return loginPage(next, 'Voor dit account is nog geen 2FA ingesteld. Vraag een andere beheerder om een sleutel.', 403);
  }

  let ok = Boolean(matched);
  if (ok) {
    try {
      // Dezelfde code mag niet nog een keer gebruikt worden.
      ok = await guardRpc(env, 'admin_use_totp', { p_account: matched.name, p_step: step }, true);
    } catch (_) {
      return loginPage(next, 'Inloggen is tijdelijk niet mogelijk. Probeer het later opnieuw.', 503);
    }
  }
  if (!ok) {
    try { await guardRpc(env, 'admin_record_failure', { p_ip_hash: ip }, null); } catch (_) { /* melden hoeft niet te blokkeren */ }
    return loginPage(next, 'Onjuist wachtwoord of onjuiste code.', 401);
  }

  const token = await makeSession(env.ADMIN_SESSION_SECRET, matched.name);
  const safeNext = next.startsWith('/admin') && !next.startsWith('//') && !next.includes('\\') && !next.startsWith('/admin/login') ? next : '/admin';
  return new Response(null, {
    status: 303,
    headers: {
      Location: safeNext,
      'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
    }
  });
}

export function logoutResponse() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin/login', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  });
}

export function redirectToLogin(pathname) {
  return new Response(null, { status: 303, headers: { Location: `/admin/login?next=${encodeURIComponent(pathname)}` } });
}

// Sleutel + QR-code genereren voor 2FA. Staat achter de gewone login: bruikbaar om voor jezelf óf voor
// een andere vennoot een nieuwe sleutel te maken. Elk bezoek maakt een NIEUWE sleutel; ververs niet
// nadat je hem hebt overgenomen. De QR-tekening gebeurt in de browser met de bekende bibliotheek
// qrcodejs (cdnjs), de enige externe bron die de beheerpagina's toestaan.
export function setup2fa(url, user, csrf) {
  const naam = (url.searchParams.get('naam') || '').replace(/[\r\n"\\]/g, ' ').slice(0, 60).trim() || 'vennoot';
  const secret = generateSecret();
  const label = `BUYT Beheer:${naam}`;
  const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=BUYT&digits=6&period=30`;
  return layout('2FA-sleutel maken', `
    <div class="page-head"><div><h1>2FA-sleutel maken</h1><p>Voor een nieuwe vennoot, of als iemand zijn telefoon kwijt is.</p></div></div>
    <div class="card card__pad card--narrow">
      <form method="get" class="field field--section">
        <label for="naam">Voor wie is deze sleutel?</label>
        <div class="toolbar toolbar--flat">
          <input class="input" id="naam" name="naam" type="text" value="${esc(naam === 'vennoot' ? '' : naam)}" placeholder="bijvoorbeeld Timme">
          <button class="btn" type="submit">Nieuwe sleutel</button>
        </div>
      </form>
      <p><strong>1.</strong> Scan de QR-code met een authenticator-app (Google Authenticator, Authy, 1Password).</p>
      <div id="qr" class="qr" data-text="${esc(otpauth)}"></div>
      <p><strong>2.</strong> Lukt scannen niet? Voer deze sleutel handmatig in (type: tijdgebaseerd, 6 cijfers, 30 seconden):</p>
      <code class="key key--gap">${esc(secret)}</code>
      <p><strong>3.</strong> Zet de sleutel bij het juiste account in het geheim <code>ADMIN_ACCOUNTS</code> van de Worker:</p>
      <pre class="code">{"name": ${esc(JSON.stringify(naam))}, "password": "&lt;wachtwoord&gt;", "totp": "${esc(secret)}"}</pre>
      <p class="note">Ververs deze pagina niet voordat de sleutel is overgenomen: elk bezoek maakt een nieuwe.</p>
    </div>`, { user, csrf, qr: true });
}
