// Dunne fetch-wrapper voor Supabase PostgREST. Gebruikt de service-rol, alleen server-side.
export class SupabaseError extends Error {
  constructor(status, detail) {
    super(detail?.message || `supabase_${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function post(env, path, body) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw new SupabaseError(500, { message: 'supabase_not_configured' });

  // Twee sleutelformaten zijn in omloop (ontwerp §16): de oude, JWT-vormige service_role-sleutel
  // (begint met "eyJ") hoort ook als Bearer-token mee; de nieuwe, ondoorzichtige "sb_secret_..."-
  // sleutel hoort alléén in de apikey-header (als Bearer gaf die "Invalid API key").
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
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
