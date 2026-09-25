// Controleert een Cloudflare Turnstile-token. Faalt gesloten: geen geheim of geen token betekent afgewezen.
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET || typeof token !== 'string' || !token || token.length > 2048) return false;
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    if (!res.ok) return false;
    const result = await res.json();
    return result.success === true;
  } catch (_) {
    return false;
  }
}
