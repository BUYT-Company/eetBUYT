// Bevestigingsmail naar de klant via Resend (resend.com). Verzonden vanaf het aparte subdomein
// mail.eetbuyt.nl (zie ontwerp §14.2), zodat de bestaande zakelijke e-mail op eetbuyt.nl zelf
// ongemoeid blijft. Zolang RESEND_API_KEY ontbreekt gebeurt er niets; de bestelling staat dan
// alleen in Supabase. Faalt nooit hardop: een mislukte bevestigingsmail mag een bestelling niet
// laten mislukken. Geen persoonsgegevens in logboeken.
const FROM = 'BUYT <orders@mail.eetbuyt.nl>';
const REPLY_TO = 'orders@eetbuyt.nl';

export async function sendOrderConfirmation(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) return { sent: false };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to, reply_to: REPLY_TO, subject, html, text })
    });
    if (!res.ok) console.error('resend_failed', res.status);
    return { sent: res.ok };
  } catch (_) {
    console.error('resend_failed');
    return { sent: false };
  }
}

// Zakelijke aanvraag door naar de zakelijke mailbox. Verzonden vanaf mail.eetbuyt.nl; reply_to is het
// adres van de aanvrager, zodat "beantwoorden" direct naar de klant gaat. Faalt nooit hardop.
const BUSINESS_INBOX = 'zakelijk@eetbuyt.nl';
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function sendBusinessRequestMail(env, { name, email, message }) {
  if (!env.RESEND_API_KEY) return { sent: false };
  try {
    const text = `Nieuwe zakelijke aanvraag\n\nNaam: ${name}\nE-mail: ${email}\n\n${message || '(geen bericht)'}`;
    const html = `<p><strong>Nieuwe zakelijke aanvraag</strong></p><p>Naam: ${escapeHtml(name)}<br>E-mail: <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p><p>${escapeHtml(message || '(geen bericht)').replace(/\n/g, '<br>')}</p>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: BUSINESS_INBOX, reply_to: email, subject: `Zakelijke aanvraag van ${name}`, html, text })
    });
    if (!res.ok) console.error('resend_business_failed', res.status);
    return { sent: res.ok };
  } catch (_) {
    console.error('resend_business_failed');
    return { sent: false };
  }
}
