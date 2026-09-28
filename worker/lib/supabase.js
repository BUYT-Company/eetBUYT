// Dunne fetch-wrapper voor Supabase PostgREST. Gebruikt de service-rol, alleen server-side.
export class SupabaseError extends Error {
  constructor(status, detail) {
    super(detail?.message || `supabase_${status}`);
    this.status = status;
    this.detail = detail;
  }
}

// Twee sleutelformaten zijn in omloop (ontwerp §16): de oude, JWT-vormige service_role-sleutel
// (begint met "eyJ") hoort ook als Bearer-token mee; de nieuwe, ondoorzichtige "sb_secret_..."-
// sleutel hoort alléén in de apikey-header (als Bearer gaf die "Invalid API key").
function headers(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw new SupabaseError(500, { message: 'supabase_not_configured' });
  const h = { apikey: key };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function post(env, path, body) {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new SupabaseError(res.status, parsed);
  return parsed;
}

// Leest rijen (query is een PostgREST-querystring, bijv. "select=a,b&x=eq.1").
async function get(env, path, query) {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}?${query}`, {
    headers: headers(env)
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new SupabaseError(res.status, parsed);
  return parsed;
}

// Roept een Postgres-functie aan (bijvoorbeeld create_order) en geeft het resultaat terug.
export const rpc = (env, fn, args) => post(env, `rpc/${fn}`, args);

// Voegt één rij toe.
export const insert = (env, table, row) => post(env, table, row);

// Haalt rijen op.
export const select = (env, table, query) => get(env, table, query);
