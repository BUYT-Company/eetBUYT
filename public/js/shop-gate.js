/* Verkoopschakelaar (kant van de bezoeker).
   De echte schakelaar staat in wrangler.jsonc (SALES_OPEN); de Worker meldt de stand via /api/shop-status
   en weigert bestellingen zolang de winkel dicht is. Dit bestand zorgt alleen voor de weergave:
   - dicht: productenblok geblurd met "Binnenkort bestellen mogelijk", slotje in plaats van pijltje, afrekenen onbereikbaar;
   - open of ingelogd als beheerder (/admin/login): alles werkt zoals normaal.
   Zonder JavaScript of bij een fout blijft de winkel dicht (CSS: html:not(.shop-open)). Laadt synchroon in de <head> tegen flikkeren. */
(() => {
  const root = document.documentElement;
  const KEY = 'buyt-shop';
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch (_) {} };
  const recall = () => { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } };

  const lockedBodies = (locked) => {
    document.querySelectorAll('[data-shop-body]').forEach((el) => { el.inert = locked; });
  };

  const apply = (state) => {
    const open = state === 'open' || state === 'dev';
    root.classList.toggle('shop-open', open);
    root.classList.toggle('shop-dev', state === 'dev');
    const sync = () => {
      lockedBodies(!open);
      const tag = document.querySelector('.shop-devtag');
      if (state === 'dev' && !tag) {
        const t = document.createElement('p');
        t.className = 'shop-devtag';
        t.textContent = 'Ontwikkelmodus: de winkel is dicht voor bezoekers';
        document.body.appendChild(t);
      } else if (state !== 'dev' && tag) tag.remove();
    };
    if (document.body) sync(); else document.addEventListener('DOMContentLoaded', sync);
    /* De afrekenpagina is voor bezoekers niet bereikbaar zolang de winkel dicht is */
    if (!open) {
      const guard = () => { if (document.querySelector('main.checkout')) location.replace('index.html#producten'); };
      if (document.body) guard(); else document.addEventListener('DOMContentLoaded', guard);
    }
  };

  /* Laatst bekende stand alvast toepassen (alleen weergave, de server beslist) */
  const cached = recall();
  if (cached) apply(cached); else apply('closed');

  fetch('/api/shop-status', { cache: 'no-store', credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status'))))
    .then((s) => {
      const state = s.open ? 'open' : s.dev ? 'dev' : 'closed';
      remember(state);
      apply(state);
    })
    .catch(() => {
      /* Lokaal (python-server zonder Worker) gewoon open om aan te kunnen werken; anders dicht */
      const state = local ? 'open' : 'closed';
      remember(state);
      apply(state);
    });
})();
