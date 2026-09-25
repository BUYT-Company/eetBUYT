// Melding naar de eigenaar. Provider-onafhankelijk: de e-mailprovider is nog niet gekozen (beslissing 2).
// Zolang NOTIFY_WEBHOOK_URL of OWNER_EMAIL ontbreekt gebeurt er niets; de bestelling staat dan alleen in Supabase.
// Faalt nooit hardop: een mislukte melding mag een bestelling niet laten mislukken. Geen persoonsgegevens in logboeken.
export async function notifyOwner(env, { subject, text }) {
  if (!env.NOTIFY_WEBHOOK_URL || !env.OWNER_EMAIL) return { sent: false };
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (env.NOTIFY_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${env.NOTIFY_WEBHOOK_TOKEN}`;
    const res = await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: env.OWNER_EMAIL, subject, text })
    });
    if (!res.ok) console.error('notify_failed', res.status);
    return { sent: res.ok };
  } catch (_) {
    console.error('notify_failed');
    return { sent: false };
  }
}
