/* Deephold landing v3.
   - clips load near the viewport and only play while visible
   - the depth ladder fills once when it scrolls in
   - nav gets a solid background after the first scroll
   - once data-play-url is set, the one button becomes "Play free" */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Nav background after scrolling.
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('stuck', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Launch switch: same button, new job. waitlist.js hides [data-prelaunch].
  let play = '';
  try {
    const u = new URL(root.dataset.playUrl || '', location.href);
    if (u.protocol === 'https:' && root.dataset.playUrl) play = u.href;
  } catch { /* not set */ }
  if (play) {
    document.querySelectorAll('[data-cta]').forEach((a) => {
      a.href = play;
      a.textContent = 'Play free';
    });
    const status = document.querySelector('[data-status]');
    if (status) status.textContent = 'Free to play. Browser and Windows.';
  }

  // Before launch the one button jumps to the form: put the cursor in the email field.
  const email = document.getElementById('wl-email');
  document.querySelectorAll('a[data-cta][href="#waitlist"]').forEach((a) => {
    a.addEventListener('click', () => {
      if (email && email.offsetParent) setTimeout(() => email.focus({ preventScroll: true }), reduce ? 0 : 450);
    });
  });

  // Clips: attach the source near the viewport, play only while visible.
  const clips = [...document.querySelectorAll('video.clip')];
  const start = (v) => {
    if (v.dataset.src && !v.src) {
      v.src = v.dataset.src;
      v.preload = 'auto';
    }
    if (reduce) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked: the poster stays */ });
  };
  const hasIO = 'IntersectionObserver' in window;
  const onScreen = new Set();
  if (hasIO) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { onScreen.add(e.target); start(e.target); }
        else { onScreen.delete(e.target); if (!e.target.paused) e.target.pause(); }
      }
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    clips.forEach((v) => io.observe(v));
  } else {
    clips.forEach(start);
  }
  if (reduce) clips.forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
  // Background tab: stop decoding; on return resume only what is on screen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clips.forEach((v) => { if (!v.paused) v.pause(); });
    else if (!reduce) (hasIO ? [...onScreen] : clips).forEach(start);
  });

  // Game windows below the hero open once as they scroll in (CSS: .v3-motion .frame).
  // Frames already on screen or above it at load simply show.
  const frames = [...document.querySelectorAll('.scr:not(.hero) .frame')];
  if (!reduce && hasIO && frames.length) {
    frames.forEach((f) => { if (f.getBoundingClientRect().top < innerHeight) f.classList.add('in'); });
    root.classList.add('v3-motion');
    const fo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        fo.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    frames.filter((f) => !f.classList.contains('in')).forEach((f) => fo.observe(f));
  }

  // Depth ladder: bars fill top to bottom, once.
  const ladder = document.querySelector('[data-ladder]');
  if (ladder) {
    ladder.querySelectorAll('.z').forEach((li, i) => li.style.setProperty('--i', i));
    if (reduce || !('IntersectionObserver' in window)) {
      ladder.classList.add('on');
    } else {
      const lo = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ladder.classList.add('on');
          lo.disconnect();
        }
      }, { threshold: 0.35 });
      lo.observe(ladder);
    }
  }
})();
