/* Cookietoestemming en Google Analytics 4.
   - Zonder keuze (of na weigeren) wordt GA4 niet geladen en worden er geen cookies geplaatst.
   - Accepteren en Weigeren staan gelijkwaardig naast elkaar; de keuze is te wijzigen via "Cookie-instellingen" in de footer.
   - Vul hieronder het Measurement ID in (Analytics > Beheer > Gegevensstreams). Zolang er een placeholder staat, wordt niets geladen. */
(() => {
  const GA_ID = 'G-XXXXXXXXXX';
  const KEY = 'buyt-cookies';
  const hasId = /^G-[A-Z0-9]{6,}$/.test(GA_ID) && GA_ID !== 'G-XXXXXXXXXX';

  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (_) {} };

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  /* Consent Mode v2: alles geweigerd tot de bezoeker kiest. */
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 });

  let loaded = false;
  const loadGA = () => {
    if (loaded || !hasId) return;
    loaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  };

  const apply = (choice) => {
    if (choice === 'ja') {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      loadGA();
    } else {
      gtag('consent', 'update', { analytics_storage: 'denied' });
      if (loaded) {
        /* Eerder geplaatste GA-cookies verwijderen */
        const host = location.hostname;
        document.cookie.split(';').forEach((c) => {
          const name = c.split('=')[0].trim();
          if (name === '_ga' || name.startsWith('_ga_')) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${host}`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${host.replace(/^www\./, '')}`;
          }
        });
      }
    }
  };

  /* Gebeurtenissen: alleen versturen als er toestemming is. Nooit namen, e-mailadressen of adressen meesturen. */
  window.buytTrack = (name, params) => {
    if (loaded && read() === 'ja') gtag('event', name, params || {});
  };

  let banner;
  const build = () => {
    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'consent-title');
    banner.setAttribute('aria-describedby', 'consent-text');
    banner.innerHTML = `
      <p class="consent__title" id="consent-title">Een koekje erbij?</p>
      <p class="consent__text" id="consent-text">We gebruiken Google Analytics om te zien welke pagina's bezocht worden, zodat we de site kunnen verbeteren. Dat gebeurt alleen als jij dat goedvindt, en je gegevens worden niet gebruikt voor advertenties. <a href="privacy.html">Lees onze privacyverklaring</a>.</p>
      <div class="consent__actions">
        <button type="button" class="consent__btn consent__btn--yes" data-consent="ja">Accepteren</button>
        <button type="button" class="consent__btn consent__btn--no" data-consent="nee">Weigeren</button>
      </div>`;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      choose(b.dataset.consent);
    });
    document.body.appendChild(banner);
  };

  const show = () => {
    if (!banner) build();
    banner.hidden = false;
    requestAnimationFrame(() => banner.classList.add('is-open'));
    const first = banner.querySelector('[data-consent="ja"]');
    if (first) first.focus({ preventScroll: true });
  };

  const choose = (choice) => {
    write(choice);
    apply(choice);
    if (banner) {
      banner.classList.remove('is-open');
      setTimeout(() => { banner.hidden = true; }, 300);
    }
  };

  const init = () => {
    /* Link in de footer om de keuze later te wijzigen */
    const bottom = document.querySelector('.footer__bottom');
    if (bottom) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'consent__link';
      btn.textContent = 'Cookie-instellingen';
      btn.addEventListener('click', show);
      const priv = document.createElement('a');
      priv.className = 'consent__link';
      priv.href = 'privacy.html';
      priv.textContent = 'Privacyverklaring';
      bottom.append(priv, btn);
    }
    const saved = read();
    if (saved === 'ja' || saved === 'nee') apply(saved);
    else show();
  };

  /* Toevoegen aan mandje: knoppen met data-add dragen het product-id (geen persoonsgegevens). */
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) window.buytTrack('add_to_cart', { items: [{ item_id: add.dataset.add }] });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
