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
  /* Lokaal: ?winkel=dicht toont de dichte winkel op alle pagina's van dit tabblad, ?winkel=open zet dat weer uit */
  const FORCE = 'buyt-local-closed';
  const forced = () => {
    if (!local) return false;
    try {
      if (/[?&]winkel=dicht/.test(location.search)) sessionStorage.setItem(FORCE, '1');
      if (/[?&]winkel=open/.test(location.search)) sessionStorage.removeItem(FORCE);
      return sessionStorage.getItem(FORCE) === '1';
    } catch (_) { return /[?&]winkel=dicht/.test(location.search); }
  };
  const forcedClosed = forced();

  const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch (_) {} };
  const recall = () => { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } };

  const lockedBodies = (locked) => {
    document.querySelectorAll('[data-shop-body]').forEach((el) => { el.inert = locked; });
  };

  /* Ontwikkelmodus: ingelogde beheerders zien de winkel ook als die dicht is. Met de knop rechtsonder wissel je tussen
     wat zij zien (ontwikkelmodus) en wat bezoekers nu zien (klantweergave). De keuze blijft bewaard in deze browser. */
  const VIEW = 'buyt-dev-view';
  const customerView = () => { try { return localStorage.getItem(VIEW) === 'klant'; } catch (_) { return false; } };
  const toggleView = () => {
    try { if (customerView()) localStorage.removeItem(VIEW); else localStorage.setItem(VIEW, 'klant'); } catch (_) {}
    location.reload();
  };

  /* real = wat de server meldt; de weergave voor een beheerder in klantweergave is 'closed'.
     sync leest altijd de laatste stand: apply wordt eerst met de bewaarde stand en daarna met het antwoord van de server aangeroepen. */
  let latest = { real: 'closed', state: 'closed' };
  const sync = () => {
    const { real, state } = latest;
    const open = state === 'open' || state === 'dev';
    lockedBodies(!open);
    let tag = document.querySelector('.shop-devtag');
    if (real === 'dev') {
      if (!tag) {
        tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'shop-devtag';
        tag.addEventListener('click', toggleView);
        document.body.appendChild(tag);
      }
      tag.textContent = state === 'dev' ? 'Ontwikkelmodus aan: klik voor klantweergave' : 'Klantweergave: klik voor ontwikkelmodus';
      tag.title = state === 'dev' ? 'Nu zie je de winkel zoals hij open is. Klik om te zien wat bezoekers zien.' : 'Nu zie je wat bezoekers zien. Klik om de ontwikkelmodus weer aan te zetten.';
    } else if (tag) tag.remove();
    /* De afrekenpagina is voor bezoekers niet bereikbaar zolang de winkel dicht is */
    if (!open && document.querySelector('main.checkout')) location.replace('index.html#producten');
  };
  if (!document.body) document.addEventListener('DOMContentLoaded', sync);

  const apply = (real) => {
    const state = real === 'dev' && customerView() ? 'closed' : real;
    latest = { real, state };
    root.classList.toggle('shop-open', state === 'open' || state === 'dev');
    root.classList.toggle('shop-dev', state === 'dev');
    if (document.body) sync();
  };

  /* Het bericht "Binnenkort bestellen mogelijk" is weg te klikken; de blur blijft zolang de winkel dicht is */
  const DISMISS = 'buyt-shop-msg';
  const setupDismiss = () => {
    const lock = document.querySelector('.shop-lock');
    if (!lock) return;
    try { if (sessionStorage.getItem(DISMISS)) lock.hidden = true; } catch (_) {}
    const btn = lock.querySelector('.shop-lock__close');
    if (btn) btn.addEventListener('click', () => {
      lock.hidden = true;
      try { sessionStorage.setItem(DISMISS, '1'); } catch (_) {}
    });
  };
  if (document.body) setupDismiss(); else document.addEventListener('DOMContentLoaded', setupDismiss);

  /* Laatst bekende stand alvast toepassen (alleen weergave, de server beslist) */
  const cached = forcedClosed ? 'closed' : recall();
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
      const state = local && !forcedClosed ? 'open' : 'closed';
      remember(state);
      apply(state);
    });
})();
