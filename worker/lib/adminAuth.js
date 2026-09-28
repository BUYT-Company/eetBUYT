// HTTP Basic Auth voor /admin/*. Tijdelijke oplossing: Cloudflare Access kan op een *.workers.dev-
// adres niet tot één pad worden beperkt (alleen de hele Worker), en eetbuyt.nl hangt nog niet aan
// Cloudflare (pas bij de livegang, ontwerp §12) — dan overstappen op Access met een pad-policy.
// Faalt gesloten: zonder ADMIN_PASSWORD ingesteld is /admin/* voor niemand toegankelijk.
const encoder = new TextEncoder();

function timingSafeEqual(a, b) {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function checkAdminAuth(request, env) {
  const password = env.ADMIN_PASSWORD;
  if (!password) return false;

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch (_) {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const pass = decoded.slice(sep + 1);
  return timingSafeEqual(pass, password);
}

export const authChallenge = () =>
  new Response('Aanmelden vereist.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BUYT beheer", charset="UTF-8"', 'Cache-Control': 'no-store' }
  });
