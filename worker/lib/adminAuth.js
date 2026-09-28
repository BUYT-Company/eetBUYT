// Inloggen voor /admin/*: eigen paginaatje (in plaats van de kale browser-popup van Basic Auth),
// met een cookie die stateless geldig is zolang ADMIN_PASSWORD niet wijzigt — geen sessietabel
// nodig. Tijdelijke oplossing tot eetbuyt.nl aan Cloudflare hangt en Cloudflare Access met een
// pad-policy op /admin/* kan (zie ontwerp §16); faalt gesloten zonder ADMIN_PASSWORD.
import { page, esc } from './admin.js';

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
        ${errorMsg ? `<p style="margin:0;color:#b3261e;font-size:.88rem">${esc(errorMsg)}</p>` : ''}
        <button type="submit" style="font:inherit;font-weight:700;background:#123326;color:#FFF8E8;border:0;border-radius:10px;padding:.75rem;cursor:pointer">Inloggen</button>
      </form>
    </div>
  `, { bare: true });
}

export async function handleLogin(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') return loginPage(url.searchParams.get('next') || '/admin/orders');

  if (!env.ADMIN_PASSWORD) return loginPage('/admin/orders', 'Beheer is nog niet ingesteld.');
  const form = new URLSearchParams(await request.text());
  const password = form.get('password') || '';
  const next = form.get('next') || '/admin/orders';

  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) return loginPage(next, 'Onjuist wachtwoord.');

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
