(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* Tekst splitsen in woorden en letters, met behoud van <em> e.d. Het label blijft leesbaar voor screenreaders. */
  const splitChars = (el, cls) => {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
            const word = document.createElement('span');
            word.className = 'w';
            word.setAttribute('aria-hidden', 'true');
            Array.from(tok).forEach((ch) => {
              const c = document.createElement('span');
              c.className = cls;
              c.style.setProperty('--i', i++);
              c.textContent = ch;
              word.appendChild(c);
            });
            frag.appendChild(word);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    el.style.setProperty('--step', `${clamp(Math.round(650 / Math.max(i, 1)), 14, 30)}ms`);
    return i;
  };

  const wrapWords = (el, cls) => {
    const words = [];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = cls;
            w.textContent = tok;
            words.push(w);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    return words;
  };

  $$('[data-split]').forEach((el) => splitChars(el, 'c'));
  $$('.btn__label').forEach((label) => {
    const btn = label.closest('.btn');
    if (btn) btn.setAttribute('aria-label', label.textContent.replace(/\s+/g, ' ').trim());
    splitChars(label, 'ch');
    label.removeAttribute('aria-label');
  });
  const mark = $('[data-mark]');
  if (mark) splitChars(mark, 'ch');

  /* Scroll-handlers gebundeld in één rAF */
  const scrollTasks = [];
  let scrollQueued = false;
  const runScroll = () => { scrollQueued = false; scrollTasks.forEach((fn) => fn()); };
  window.addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(runScroll); }
  }, { passive: true });
  window.addEventListener('resize', () => scrollTasks.forEach((fn) => fn()));

  const header = $('.site-header');
  scrollTasks.push(() => header.classList.toggle('is-scrolled', window.scrollY > 8));

  const burger = $('.burger');
  const nav = document.getElementById('nav');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* Intro: logo, dan een groene golf. Eén keer per sessie, overslaan met een klik of toets. */
  const ready = () => {
    root.classList.add('is-ready');
    $$('.hero [data-split]').forEach((el) => el.classList.add('in'));
  };
  const runIntro = () => {
    const intro = $('.intro');
    if (!intro || !root.classList.contains('intro-on')) { ready(); return; }
    const bg = $('.intro__bg', intro);
    const logo = $('.intro__logo', intro);
    const wave = $('.intro__wave', intro);
    const timers = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      root.classList.remove('intro-on');
      try { sessionStorage.setItem('buyt-intro', '1'); } catch (_) {}
      ready();
    };
    intro.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', finish, { once: true });

    /* Het logo animeert zichzelf (SVG, 1,25 s). De golf start pas als die klaar is. */
    const LOGO_MS = 1250;
    const HOLD_MS = 350;
    let started = false;
    const begin = () => {
      if (started || finished) return;
      started = true;
      const rise = wave.animate(
        [{ transform: 'translateY(100vh)' }, { transform: 'translateY(0)' }],
        { duration: 560, delay: LOGO_MS + HOLD_MS, easing: 'cubic-bezier(.55, 0, .35, 1)', fill: 'both' }
      );
      rise.onfinish = () => {
        if (finished) return;
        bg.style.opacity = '0';
        logo.style.visibility = 'hidden';
        const out = wave.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(-215vh)' }],
          { duration: 800, delay: 140, easing: 'cubic-bezier(.6, .05, .3, 1)', fill: 'forwards' }
        );
        timers.push(setTimeout(ready, 470));
        out.onfinish = finish;
      };
    };
    const img = $('img', logo);
    img.addEventListener('load', begin, { once: true });
    img.addEventListener('error', begin, { once: true });
    timers.push(setTimeout(begin, 2500));
    img.src = img.dataset.src;
  };
  runIntro();

  /* Onthullen bij scrollen */
  const io = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' })
    : null;
  $$('.reveal, [data-split]').filter((el) => !el.closest('.hero')).forEach((el) => {
    if (io) io.observe(el);
    else el.classList.add('in');
  });
  if (!io) $$('.hero [data-split]').forEach((el) => el.classList.add('in'));

  /* Tellers */
  const nf = new Intl.NumberFormat('nl-NL');
  const counters = $$('[data-count]');
  const runCounter = (el) => {
    const target = Number(el.dataset.count);
    const start = performance.now();
    const duration = 1600;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = nf.format(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window && !reduceMotion) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          co.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => { el.textContent = '0'; co.observe(el); });
  }

  /* Missie: woorden kleuren in terwijl je scrolt */
  $$('[data-fill]').forEach((el) => {
    const words = wrapWords(el, 'fw');
    if (reduceMotion) { words.forEach((w) => w.classList.add('on')); return; }
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh * 0.85 - r.top) / (vh * 0.3 + r.height), 0, 1);
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < n));
    };
    scrollTasks.push(update);
    update();
  });

  /* Producten: pijlen en slepen met de muis */
  const scroller = $('.carousel');
  if (scroller) {
    const prev = $('[data-dir="-1"]');
    const next = $('[data-dir="1"]');
    const track = $('.track', scroller);
    const first = $('.card', scroller);
    const stepSize = () => first.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 24);
    const updateArrows = () => {
      prev.disabled = scroller.scrollLeft < 4;
      next.disabled = scroller.scrollLeft > scroller.scrollWidth - scroller.clientWidth - 4;
    };
    [prev, next].forEach((btn) => btn.addEventListener('click', () => {
      scroller.scrollBy({ left: Number(btn.dataset.dir) * stepSize(), behavior: reduceMotion ? 'auto' : 'smooth' });
    }));
    scroller.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    updateArrows();

    if (finePointer) {
      let down = false, startX = 0, startLeft = 0, moved = 0;
      scroller.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        down = true; startX = e.clientX; startLeft = scroller.scrollLeft; moved = 0;
      });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        if (moved > 5) scroller.classList.add('is-drag');
        scroller.scrollLeft = startLeft - dx;
      });
      window.addEventListener('pointerup', () => { down = false; scroller.classList.remove('is-drag'); });
      scroller.addEventListener('click', (e) => {
        if (moved > 5) { e.preventDefault(); e.stopPropagation(); moved = 0; }
      }, true);
    }
  }

  /* Vergelijken: prullenbak of bord */
  const ba = $('[data-ba]');
  if (ba) {
    const range = $('.ba__range', ba);
    let touched = false;
    const setPos = (v) => {
      v = clamp(v, 0, 100);
      ba.style.setProperty('--pos', `${v}%`);
      range.value = String(Math.round(v));
      range.setAttribute('aria-valuetext', v < 35 ? 'vooral de prullenbak' : v > 65 ? 'vooral het bord' : 'half prullenbak, half bord');
    };
    let dragging = false;
    const fromEvent = (e) => {
      const r = ba.getBoundingClientRect();
      setPos(((e.clientX - r.left) / r.width) * 100);
    };
    ba.addEventListener('pointerdown', (e) => {
      touched = true; dragging = true;
      ba.setPointerCapture(e.pointerId);
      ba.classList.add('is-drag');
      fromEvent(e);
    });
    ba.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    const stop = () => { dragging = false; ba.classList.remove('is-drag'); };
    ba.addEventListener('pointerup', stop);
    ba.addEventListener('pointercancel', stop);
    range.addEventListener('input', () => { touched = true; setPos(Number(range.value)); });

    if ('IntersectionObserver' in window && !reduceMotion) {
      const nudge = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        nudge.disconnect();
        const stops = [[50, 30, 600], [30, 68, 800], [68, 50, 600]];
        let idx = 0;
        const run = () => {
          if (touched || idx >= stops.length) return;
          const [a, b, dur] = stops[idx++];
          const t0 = performance.now();
          const tick = (now) => {
            if (touched) return;
            const p = Math.min((now - t0) / dur, 1);
            const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            setPos(a + (b - a) * e);
            if (p < 1) requestAnimationFrame(tick); else run();
          };
          requestAnimationFrame(tick);
        };
        setTimeout(run, 500);
      }, { threshold: 0.6 });
      nudge.observe(ba);
    }
  }

  /* Cursor-gans in het videoblok */
  const stage = $('[data-goose-stage]');
  const goose = stage && $('.cursor-goose', stage);
  if (goose && finePointer && !reduceMotion) {
    let tx = 0, ty = 0, x = 0, y = 0, dir = 1, active = false;
    const loop = () => {
      if (!active) return;
      const dx = tx - x;
      x += dx * 0.12;
      y += (ty - y) * 0.12;
      if (Math.abs(dx) > 2) dir = dx > 0 ? 1 : -1;
      const bob = Math.sin(performance.now() / 200) * 5;
      goose.style.transform = `translate(${x - 44}px, ${y - 46 + bob}px) scaleX(${dir})`;
      requestAnimationFrame(loop);
    };
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!active) {
        x = tx; y = ty; active = true;
        goose.classList.add('on');
        requestAnimationFrame(loop);
      }
    });
    stage.addEventListener('pointerleave', () => {
      active = false;
      goose.classList.remove('on');
    });
  }

  const video = $('.video');
  const playBtn = video && $('.video__play', video);
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const src = video.dataset.videoSrc;
      if (!src) {
        const note = $('.video__note', video);
        note.hidden = false;
        setTimeout(() => { note.hidden = true; }, 3000);
        return;
      }
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Video over BUYT';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      video.appendChild(frame);
      playBtn.hidden = true;
    });
  }

  /* Kies je route: vul het formulier alvast voor */
  $$('.route').forEach((card) => {
    card.addEventListener('click', () => {
      const radio = $(`input[name="type"][value="${card.dataset.type}"]`);
      if (radio) radio.checked = true;
    });
  });

  const form = $('form[name="bestellen"]');
  if (form) {
    const ok = $('.form__msg--ok', form);
    const err = $('.form__msg--err', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.hidden = true;
      err.hidden = true;
      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString()
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        ok.hidden = false;
      } catch (_) {
        err.hidden = false;
      }
    });
  }

  scrollTasks.forEach((fn) => fn());
})();
