(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = document.querySelector('.burger');
  const nav = document.getElementById('nav');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  const nf = new Intl.NumberFormat('nl-NL');
  const counters = document.querySelectorAll('[data-count]');
  const runCounter = (el) => {
    const target = Number(el.dataset.count);
    const start = performance.now();
    const duration = 1600;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = nf.format(Math.round(target * eased));
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
    counters.forEach((el) => {
      el.textContent = '0';
      co.observe(el);
    });
  }

  const stage = document.querySelector('[data-goose-stage]');
  const goose = stage && stage.querySelector('.cursor-goose');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
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
        x = tx;
        y = ty;
        active = true;
        goose.classList.add('on');
        requestAnimationFrame(loop);
      }
    });
    stage.addEventListener('pointerleave', () => {
      active = false;
      goose.classList.remove('on');
    });
  }

  const video = document.querySelector('.video');
  const playBtn = video && video.querySelector('.video__play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const src = video.dataset.videoSrc;
      if (!src) {
        const note = video.querySelector('.video__note');
        note.hidden = false;
        setTimeout(() => { note.hidden = true; }, 3000);
        return;
      }
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Video over eetBUYT';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      video.appendChild(frame);
      playBtn.hidden = true;
    });
  }

  const form = document.querySelector('form[name="bestellen"]');
  if (form) {
    const ok = form.querySelector('.form__msg--ok');
    const err = form.querySelector('.form__msg--err');
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
})();
