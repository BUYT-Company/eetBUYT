// Dunne fetch-wrapper voor Supabase PostgREST. Gebruikt de service-rol, alleen server-side.
export class SupabaseError extends Error {
  constructor(status, detail) {
    super(detail?.message || `supabase_${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function post(env, path, body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new SupabaseError(500, { message: 'supabase_not_configured' });
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
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
