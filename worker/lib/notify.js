// Pushmelding naar de eigenaar via Pushover (pushover.net). Kort bericht, geen volledige
// bestelgegevens erin (dat blijft in Supabase); een link opent direct het Supabase-dashboard.
// Zolang PUSHOVER_TOKEN of PUSHOVER_USER_KEY ontbreekt gebeurt er niets; de bestelling staat
// dan alleen in Supabase. Faalt nooit hardop: een mislukte melding mag een bestelling niet laten
// mislukken. Geen persoonsgegevens in logboeken.
export async function notifyOwner(env, { title, message, url, urlTitle }) {
  if (!env.PUSHOVER_TOKEN || !env.PUSHOVER_USER_KEY) return { sent: false };
  try {
    const body = new URLSearchParams({
      token: env.PUSHOVER_TOKEN,
      user: env.PUSHOVER_USER_KEY,
      title,
      message
    });
    if (url) body.set('url', url);
    if (urlTitle) body.set('url_title', urlTitle);

    const res = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body });
    if (!res.ok) console.error('notify_failed', res.status);
    return { sent: res.ok };
  } catch (_) {
    console.error('notify_failed');
    return { sent: false };
  }
}
