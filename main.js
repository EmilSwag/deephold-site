/* Deephold landing - motion. No framework, no dependencies. */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── nav ─────────────────────────────────────────────────── */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('stuck', scrollY > 40);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

/* ── item marquee ────────────────────────────────────────────
   Real sprites out of the game's own asset folder, all 239 of them. The page
   claims "240+ items"; a number is a claim and the icons are the evidence, so
   the strip shows the actual set rather than a sample of thirty.

   The track is duplicated exactly once so `translateX(-50%)` lands on a seam
   that is pixel-identical - that is the whole trick to a loop with no visible
   jump. */

/** Enough to carry the strip if the manifest cannot be fetched (file://). */
const FALLBACK_ICONS = [
  'ore_copper','ore_tin','ore_iron','ore_coal','ore_mithril','ore_adamant',
  'bar_bronze','bar_iron','bar_steel','bar_mithril','bar_adamant',
  'log_oak','log_spruce','log_ironbark','log_shadewood','log_barrowpine',
  'gem_rough','gem_cut','rune_essence','rune_air','rune_mind','rune_fire',
  'rune_water','rune_earth','rune_body','rune_soul','fish_cave_eel_cooked',
  'meat_cooked','potion_minor_healing','herb_deepleaf','herb_glowcap',
  'silk_cord','leather','charcoal',
];

function tile(name) {
  const a = document.createElement('span');
  a.className = 'mq';
  const img = document.createElement('img');
  img.src = `media/icons/${name}.webp`;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 96;
  img.height = 96;
  a.append(img);
  return a;
}

function fillMarquee(el, list) {
  if (!el || !list.length) return;
  el.textContent = '';
  // Two identical passes, because the animation travels exactly one pass:
  // translateX(-50%) then lands on a pixel-identical seam.
  el.append(...list.map(tile), ...list.map(tile));
  const speed = Number(el.closest('.marquee')?.dataset.speed || 50);
  el.style.animationDuration = `${speed}s`;
}

/** Deterministic shuffle so the two rows never show the same item in step. */
function rotated(list, by) {
  return list.slice(by).concat(list.slice(0, by));
}

async function buildMarquees() {
  let icons = FALLBACK_ICONS;
  try {
    const res = await fetch('media/icons/manifest.json');
    if (res.ok) {
      const all = await res.json();
      if (Array.isArray(all) && all.length) icons = all;
    }
  } catch {
    /* offline or file:// - the fallback list still fills the strip */
  }
  fillMarquee(document.getElementById('mq1'), icons);
  fillMarquee(document.getElementById('mq2'), rotated(icons, Math.floor(icons.length / 2)));
}
buildMarquees();

/* ── embers ──────────────────────────────────────────────────
   Sparks off the forge below. Cheap: a handful of 3px dots on
   pure transform/opacity, so they never touch layout. */
function seedEmbers(host, count) {
  if (!host || REDUCED) return;
  for (let i = 0; i < count; i++) {
    const e = document.createElement('i');
    e.className = 'ember';
    e.style.left = `${Math.random() * 100}%`;
    e.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    e.style.animationDuration = `${9 + Math.random() * 11}s`;
    e.style.animationDelay = `${-Math.random() * 18}s`;
    e.style.opacity = '0';
    const s = 2 + Math.random() * 2.4;
    e.style.width = `${s}px`;
    e.style.height = `${s}px`;
    host.append(e);
  }
}
document.querySelectorAll('.embers').forEach((h) => seedEmbers(h, h.classList.contains('soft') ? 14 : 26));

/* ── hero backdrop ───────────────────────────────────────────
   It is a clip of the game now, not a painting, so it has to answer the motion
   preference like everything else: hold the poster frame and stop. The poster
   is a still of the same arena, so nothing is lost but the movement. */
const heroArt = document.querySelector('video.hero-art');
if (heroArt && REDUCED) {
  heroArt.autoplay = false;
  heroArt.pause();
  heroArt.removeAttribute('autoplay');
}

/* ── hero parallax ───────────────────────────────────────────
   Transform only, driven off rAF rather than the scroll event,
   so a fast wheel cannot queue a hundred layout reads. */
const art = document.querySelector('.hero-art');
if (art && !REDUCED) {
  let ticking = false;
  const apply = () => {
    const y = Math.min(scrollY, innerHeight);
    art.style.transform = `translate3d(0, ${y * 0.22}px, 0) scale(${1 + y / innerHeight * 0.04})`;
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }, { passive: true });
  apply();
}

/* ── reveal + counters + clip playback ──────────────────────── */
const items = document.querySelectorAll('.reveal');

if (REDUCED || !('IntersectionObserver' in window)) {
  items.forEach((el) => el.classList.add('in'));
  document.querySelectorAll('[data-count]').forEach((b) => {
    b.textContent = b.dataset.count + (b.dataset.suffix || '');
  });
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });

  items.forEach((el, i) => {
    // A small stagger inside a row reads as one gesture, not eight.
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });

  /* Counters run once, on arrival, eased so they decelerate into
     the real number rather than stopping dead on it. */
  const countIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      countIO.unobserve(el);
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (!target) { el.textContent = '0' + suffix; continue; }
      const dur = 1100;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach((b) => countIO.observe(b));
}

/* Two observers, because fetching and playing want different moments.

   FETCH, early: `preload="none"` and `data-poster` mean a clip costs nothing
   until it is approaching. Nine clips and nine posters on page load is a slow
   first paint and, on a single-threaded dev server, a queue that drops
   requests.

   Two things have to be true for that to actually hold, and each one silently
   undoes the saving on its own:

     The videos must NOT have `autoplay`. A browser cannot honour both
     `autoplay` and `preload="none"`, so it honours autoplay and fetches
     everything immediately - the markup looks correct and the page still pulls
     2.8 MB before the first scroll. Playback is started here instead.

     The poster must be an attribute this code sets, not one in the markup. A
     `poster` ATTRIBUTE is fetched as soon as the element renders whatever
     `preload` says, and nine of them is 635 KB, more than the hero art.

   The 400px margin is what makes a poster a poster rather than a decoration:
   it arrives before the cell does.

   PLAY, only when actually on screen. Five videos decoding at once is the
   fastest way to make a landing page feel like the thing it sells is heavy,
   which for an idle game is exactly the wrong first impression. */
const clips = document.querySelectorAll('video.shot');

function arm(v) {
  if (v.dataset.poster) {
    v.poster = v.dataset.poster;
    delete v.dataset.poster;
  }
  if (v.preload === 'none') v.preload = 'auto';
}

if (REDUCED) {
  /* Nine looping clips that start on their own are moving content the reader
     asked not to have. Show every poster, hand over the controls, and let them
     decide which one is worth watching. */
  clips.forEach((v) => {
    arm(v);
    v.controls = true;
    v.loop = false;
  });
} else if ('IntersectionObserver' in window) {
  const loadIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      arm(e.target);
      loadIO.unobserve(e.target);
    }
  }, { rootMargin: '400px 0px' });

  const playIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }
  }, { threshold: 0.2 });

  clips.forEach((v) => {
    loadIO.observe(v);
    playIO.observe(v);
  });
} else {
  clips.forEach(arm);
}

/* ── tap to read ─────────────────────────────────────────────
   Every clip is a crop of a 1280px-wide game UI. On a 390px phone the widest
   of them draws at 350px, a scale of 0.36, which renders the game's own 14px
   text at 5px. Measured, not guessed: all ten clips are below the legibility
   floor on a phone and no crop fixes that, because the content genuinely needs
   the width.

   So on a touch screen a clip is tappable and goes fullscreen, where it gets
   the whole display in landscape instead of a third of the page width. The
   handler is only attached where it helps; on a desktop the clips are already
   at 1.00 and a click that swallowed the page would be a surprise. */
if (matchMedia('(pointer: coarse)').matches) {
  for (const v of clips) {
    v.style.cursor = 'zoom-in';
    v.addEventListener('click', () => {
      const go = v.requestFullscreen ?? v.webkitRequestFullscreen ?? v.webkitEnterFullscreen;
      // iOS Safari exposes only the video-element variant and rejects nothing,
      // so a failure here just means the tap does what it did before: nothing.
      try {
        go?.call(v);
      } catch {
        /* fullscreen refused - leave the clip where it is */
      }
    });
  }
}

/* ── CTAs ────────────────────────────────────────────────────
   No destination yet: the client URL and the Steam page are not public. Set
   `data-play-url` / `data-steam-url` on <html> and these become ordinary links.

   Until then the primary button IS the waitlist. The honest version of
   "Install" while there is nothing to install is "tell me when there is", and
   that is a real action with a real result, not a label that flickers and a
   scroll to a paragraph. The Wishlist buttons go away rather than pointing at
   the same form twice; they come back on their own the moment the Steam URL
   is set. The label is short because it has to fit the 13px nav button as well
   as the 17px hero one, and a CTA that wraps is a broken CTA. The scroll and
   the focus on the field are waitlist.js's job. */
const root = document.documentElement;
const httpsOnly = (v) => (/^https:\/\/\S+$/.test(v || '') ? v : '');
const playUrl = httpsOnly(root.dataset.playUrl);
const steamUrl = httpsOnly(root.dataset.steamUrl);

document.querySelectorAll('[data-play]').forEach((a) => {
  if (playUrl) { a.href = playUrl; return; }
  a.setAttribute('href', '#waitlist');
  a.textContent = 'Join the waitlist';
});
document.querySelectorAll('[data-wishlist]').forEach((a) => {
  if (steamUrl) { a.href = steamUrl; a.target = '_blank'; a.rel = 'noopener'; return; }
  a.hidden = true;
});
/* Copy that is only true once the game is open ("Right now") swaps for its
   pre-launch line until then. */
if (!playUrl) {
  document.querySelectorAll('[data-prelaunch-copy]').forEach((el) => {
    el.textContent = el.dataset.prelaunchCopy;
  });
}
