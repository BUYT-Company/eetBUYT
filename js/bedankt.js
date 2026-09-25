/* Bedankpagina: toont het resultaat van de betaling of van de bestelaanvraag. */
(() => {
  const show = (state) => {
    document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });
  };
  const params = new URLSearchParams(window.location.search);
  if (params.get('s') === 'aanvraag') { show('aanvraag'); return; }

  /* Fase 2: ?o=<token> toont de betaalstatus via /api/order-status */
  const token = params.get('o');
  if (!token) { show('onbekend'); return; }

  fetch(`/api/order-status?t=${encodeURIComponent(token)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(({ status }) => {
      if (status === 'betaald') {
        window.BuytCart.clear();
        show('betaald');
      } else if (status === 'betaling_mislukt') {
        show('mislukt');
      } else if (status === 'wacht_op_betaling') {
        show('open');
      } else {
        show('onbekend');
      }
    })
    .catch(() => show('onbekend'));
})();
