/* Bedankpagina: toont het resultaat van de betaling of van de bestelaanvraag. */
(() => {
  const show = (state) => {
    document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get('s') === 'aanvraag') { show('aanvraag'); return; }

  let paymentId = null;
  try { paymentId = localStorage.getItem('buyt-pending'); } catch (_) {}
  if (!paymentId) { show('onbekend'); return; }

  fetch(`/.netlify/functions/payment-status?id=${encodeURIComponent(paymentId)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(({ status }) => {
      if (status === 'paid') {
        try { localStorage.removeItem('buyt-pending'); } catch (_) {}
        window.BuytCart.clear();
        show('betaald');
      } else if (status === 'failed' || status === 'canceled' || status === 'expired') {
        try { localStorage.removeItem('buyt-pending'); } catch (_) {}
        show('mislukt');
      } else {
        show('open');
      }
    })
    .catch(() => show('onbekend'));
})();
