/* Deephold portal: shell behaviour + page renderers.
   Real data: data/game.json (items, values, skills, monsters, patch notes, season) built from the game's content pack.
   Live data: API /v1/status + /v1/metrics (works once the site origin is allowed by the API).
   Preview data: market moves, hiscores, profiles, friends are generated (seeded per day) and labelled "Preview"
   until the API exposes public endpoints for them. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const cfg = {
    play: doc.dataset.playUrl || '',
    steam: doc.dataset.steamUrl || '',
    api: (doc.dataset.apiUrl || '').replace(/\/$/, ''),
    waitlist: doc.dataset.waitlistUrl || '',
    mail: doc.dataset.waitlistMail || '',
    root: doc.dataset.root || '',
  };
  const page = document.body.dataset.page || '';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = new Intl.NumberFormat('en-US');
  const fmt = (n) => nf.format(Math.round(n));
  const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : fmt(n));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = cfg.root;
  const itemIcon = (it) => (it && it.i ? `<img src="${R}media/icons/${esc(it.k)}.webp" alt="" width="64" height="64" loading="lazy">` : '');
  const skillIcon = (s) => (s && s.icon ? `<img src="${R}guides/img/skills/${esc(s.key)}.png" alt="" width="32" height="32" loading="lazy">` : '');
  const tierClass = (t) => `t-${Math.max(1, Math.min(10, t || 1))}`;

  // ── seeded randomness (stable per day, so previews don't flicker on reload) ──
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const DAY = new Date().toISOString().slice(0, 10);
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // ── shell: sticky nav brand ─────────────────────────────────────────────
  const nav = $('.nav');
  const sentinel = $('[data-stick-sentinel]');
  if (nav && sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => nav.classList.toggle('is-stuck', !e.isIntersecting)).observe(sentinel);
  }

  // ── links: play + steam ─────────────────────────────────────────────────
  if (cfg.play) $$('a[data-play]').forEach((a) => { a.href = cfg.play; });
  if (cfg.steam) $$('a[data-steam]').forEach((a) => { a.href = cfg.steam; a.target = '_blank'; a.rel = 'noopener'; });

  // ── modals ──────────────────────────────────────────────────────────────
  let lastFocus = null;
  const openModal = (m) => {
    if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    (m.querySelector('input:not([type=hidden]):not(.hp), button') || m).focus();
  };
  const closeModal = (m) => {
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const closer = t.closest('[data-close]');
    if (closer) { closeModal(closer.closest('.modal')); return; }
    if (t.classList.contains('modal')) { closeModal(t); return; }
    const st = t.closest('a[data-steam]');
    if (st && !cfg.steam) {
      e.preventDefault();
      const here = document.getElementById('steam');
      if (here && !here.closest('.modal')) {
        here.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        const inp = here.querySelector('input[type=email]');
        if (inp) setTimeout(() => inp.focus({ preventScroll: true }), reduced ? 0 : 450);
      } else openModal($('#steam-modal'));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal').forEach(closeModal); });

  // ── tabs (WAI-ARIA, arrow keys) ─────────────────────────────────────────
  $$('[data-tabs]').forEach((box) => {
    const tabs = $$('[role=tab]', box).filter((t) => t.closest('[data-tabs]') === box);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      box.dispatchEvent(new CustomEvent('tabchange', { detail: tab.id }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        let j = -1;
        if (k === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (k === 'Home') j = 0;
        else if (k === 'End') j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  // ── videos: play only while visible ─────────────────────────────────────
  const vids = $$('video[data-autoplay]');
  if (vids.length && !reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) { v.preload = 'auto'; const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }), { threshold: 0.35 });
    vids.forEach((v) => io.observe(v));
  }

  // ── countdown ───────────────────────────────────────────────────────────
  $$('[data-countdown]').forEach((el) => {
    const end = Number(el.dataset.countdown);
    if (!end) return;
    const tick = () => {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (!s) { el.innerHTML = '<span>Season ended</span>'; return; }
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      const cell = (v, l) => `<span>${String(v).padStart(2, '0')}<small>${l}</small></span>`;
      el.innerHTML = cell(d, 'days') + cell(h, 'hrs') + cell(m, 'min') + cell(s, 'sec');
    };
    tick();
    setInterval(tick, 1000);
  });

  // ── copy buttons ────────────────────────────────────────────────────────
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const src = b.parentElement && b.parentElement.querySelector('[data-copy-src]');
    if (!src) return;
    try { await navigator.clipboard.writeText(src.value); } catch { src.select(); document.execCommand && document.execCommand('copy'); }
    const was = b.textContent;
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = was; }, 1600);
  }));

  // ── waitlist forms ──────────────────────────────────────────────────────
  const WL_KEY = 'deephold.waitlist';
  const remembered = (() => { try { return JSON.parse(localStorage.getItem(WL_KEY) || 'null'); } catch { return null; } })();
  const wlEndpoint = cfg.waitlist || (cfg.api ? `${cfg.api}/v1/waitlist` : '');
  $$('form[data-wl]').forEach((form) => {
    const msg = $('.wl__msg', form);
    const say = (t, state) => { if (msg) msg.textContent = t; form.dataset.state = state || ''; };
    const done = () => say("You're on the list. One email when it opens. That's it.", 'done');
    if (remembered && remembered.email) done();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('input[type=email]', form);
      const email = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('That email looks off. Check it and try again.', 'error'); input.focus(); return; }
      const trap = form.elements.namedItem('website');
      if (trap && trap.value) { done(); return; }
      const btn = $('button[type=submit]', form);
      const was = btn.textContent;
      btn.textContent = 'Sending…';
      btn.disabled = true;
      try {
        if (!wlEndpoint) throw new Error('no endpoint');
        const body = new URLSearchParams(new FormData(form));
        body.set('email', email);
        const res = await fetch(wlEndpoint, { method: 'POST', body, headers: { Accept: 'application/json' }, mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        try { localStorage.setItem(WL_KEY, JSON.stringify({ email, at: Date.now() })); } catch { /* private mode */ }
        done();
      } catch {
        if (cfg.mail && !/YOUR-DOMAIN/.test(cfg.mail)) {
          say('', '');
          msg.innerHTML = `Couldn't reach the server. <a href="mailto:${esc(cfg.mail)}?subject=${encodeURIComponent('Deephold waitlist')}&body=${encodeURIComponent(`Please add ${email} to the Deephold waitlist.`)}">Send it by email instead</a>.`;
          form.dataset.state = 'error';
        } else say("Couldn't reach the server. Try again in a minute.", 'error');
      } finally {
        btn.textContent = was;
        btn.disabled = false;
      }
    });
  });

  // ── live world status ───────────────────────────────────────────────────
  const ONLINE_MIN = 25;
  const statusEl = $('[data-status]');
  const statusText = $('[data-status-text]');
  const setStatus = (state, html) => { if (statusEl) statusEl.dataset.state = state; if (statusText) statusText.innerHTML = html; };
  setStatus('unknown', 'Browser version live');
  const getJSON = async (path) => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 4500);
    try {
      const r = await fetch(`${cfg.api}${path}`, { signal: ctl.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } finally { clearTimeout(to); }
  };
  if (cfg.api) {
    Promise.allSettled([getJSON('/v1/status'), getJSON('/v1/metrics')]).then(([st, mt]) => {
      if (st.status !== 'fulfilled' && mt.status !== 'fulfilled') return;
      const online = mt.status === 'fulfilled' ? Number(mt.value && (mt.value.onlinePlayers ?? mt.value.online)) : NaN;
      if (Number.isFinite(online) && online >= ONLINE_MIN) {
        setStatus('up', `World online · <b>${fmt(online)}</b> delvers`);
        $$('[data-online-line]').forEach((el) => { el.innerHTML = `<b>${fmt(online)}</b> delvers online right now.`; });
      } else setStatus('up', 'World online');
    });
  }

  // ── game data ───────────────────────────────────────────────────────────
  const needsData = ['home', 'market', 'hiscores', 'profile', 'friends'].includes(page);
  if (!needsData) return;
  fetch(`${R}data/game.json`).then((r) => r.json()).then(init).catch(() => {
    $$('[data-mk-top],[data-hs-table] tbody,[data-pf-hero],[data-fr-list]').forEach((el) => { el.innerHTML = '<div class="empty">Could not load game data. Refresh the page.</div>'; });
  });

  function init(G) {
    const items = G.items.filter((i) => i.v > 0);
    const byKey = new Map(G.items.map((i) => [i.k, i]));
    const cat = new Map(G.categories.map((c) => [c.key, c.name]));

    // market preview moves: stable per day
    const mr = rng(hash(`mk:${DAY}`));
    items.forEach((it) => {
      const swing = (mr() + mr() + mr() - 1.5) * 9;
      it.d = Math.round(swing * 10) / 10;
      it.vol = Math.round((40 + mr() * 900) * (1 + (10 - Math.min(10, it.t || 1)) * 0.35));
    });
    const delta = (d) => `<span class="num ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span>`;
    const value = (v) => `<span class="num"><i class="coin" aria-hidden="true"></i>${fmt(v)}</span>`;
    const itemCell = (it) => `<div class="item"><span class="slot">${itemIcon(it)}</span><span><span class="item__name ${tierClass(it.t)}">${esc(it.n)}</span><span class="item__sub">${esc(cat.get(it.c) || it.c)}</span></span></div>`;

    // ticker (home + market)
    $$('[data-ticker]').forEach((el) => {
      const pickT = items.filter((i) => i.i).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 22);
      const row = pickT.map((it) => `<span class="ticker__it">${itemIcon(it)}<span>${esc(it.n)}</span>${value(it.v)}${delta(it.d)}</span>`).join('');
      el.innerHTML = `<div class="ticker__track">${row}${row}</div>`;
    });

    // home mini table
    const mini = $('[data-mk-mini] tbody');
    if (mini) {
      const top = items.filter((i) => i.i).sort((a, b) => b.d - a.d);
      const rows = [...top.slice(0, 3), ...top.slice(-3).reverse()];
      mini.innerHTML = rows.map((it) => `<tr><td>${itemCell(it)}</td><td class="r">${value(it.v)}</td><td class="r">${delta(it.d)}</td></tr>`).join('');
    }

    if (page === 'market') market(G, items, cat, itemCell, value, delta);
    if (page === 'hiscores') hiscores(G);
    if (page === 'profile') profile(G, byKey);
    if (page === 'friends') friends(G);
  }

  // ── market ──────────────────────────────────────────────────────────────
  function market(G, items, cat, itemCell, value, delta) {
    const topEl = $('[data-mk-top]');
    const block = (title, list, ic) => `<section class="panel"><div class="panel__head">${ic}<h3>${title}</h3></div><div class="ledger-wrap"><table class="ledger"><tbody>${list.map((it) => `<tr data-item="${esc(it.k)}" tabindex="0"><td>${itemCell(it)}</td><td class="r">${value(it.v)}<br>${delta(it.d)}</td></tr>`).join('')}</tbody></table></div></section>`;
    const withIcon = items.filter((i) => i.i);
    const rising = [...withIcon].sort((a, b) => b.d - a.d).slice(0, 6);
    const falling = [...withIcon].sort((a, b) => a.d - b.d).slice(0, 6);
    const valuable = [...withIcon].sort((a, b) => b.v - a.v).slice(0, 6);
    if (topEl) topEl.innerHTML = block('Rising', rising, '<span class="up num" style="font-size:24px">▲</span>') + block('Falling', falling, '<span class="down num" style="font-size:24px">▼</span>') + block('Most valuable', valuable, '<i class="coin" style="width:22px;height:22px" aria-hidden="true"></i>');

    const table = $('[data-mk-table]');
    const tbody = table && $('tbody', table);
    const q = $('[data-mk-q]');
    const chips = $('[data-mk-cats]');
    const count = $('[data-mk-count]');
    const state = { q: '', c: '', sort: 'v', dir: -1 };
    if (chips) {
      const total = items.length;
      chips.innerHTML = `<button class="chip" type="button" data-c="" aria-pressed="true">All<b>${total}</b></button>` +
        G.categories.filter((c) => items.some((i) => i.c === c.key)).map((c) => `<button class="chip" type="button" data-c="${esc(c.key)}" aria-pressed="false">${esc(c.name)}<b>${items.filter((i) => i.c === c.key).length}</b></button>`).join('');
      chips.addEventListener('click', (e) => {
        const b = e.target instanceof Element && e.target.closest('.chip');
        if (!b) return;
        state.c = b.dataset.c || '';
        $$('.chip', chips).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      });
    }
    if (q) q.addEventListener('input', () => { state.q = q.value.trim().toLowerCase(); render(); });
    if (table) $$('th button[data-sort]', table).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      state.dir = state.sort === k ? -state.dir : (k === 'n' || k === 'c' ? 1 : -1);
      state.sort = k;
      $$('th', table).forEach((th) => th.removeAttribute('aria-sort'));
      b.closest('th').setAttribute('aria-sort', state.dir > 0 ? 'ascending' : 'descending');
      render();
    }));
    function render() {
      if (!tbody) return;
      let list = items.filter((i) => (!state.c || i.c === state.c) && (!state.q || i.n.toLowerCase().includes(state.q) || i.k.includes(state.q)));
      const k = state.sort;
      list.sort((a, b) => {
        const x = k === 'c' ? (cat.get(a.c) || a.c) : a[k];
        const y = k === 'c' ? (cat.get(b.c) || b.c) : b[k];
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * state.dir;
      });
      tbody.innerHTML = list.length
        ? list.map((it) => `<tr data-item="${esc(it.k)}" tabindex="0"><td>${itemCell(it)}</td><td>${esc(cat.get(it.c) || it.c)}</td><td class="r num">${it.t || '–'}</td><td class="r">${value(it.v)}</td><td class="r">${delta(it.d)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">Nothing by that name. Try a shorter word.</td></tr>';
      if (count) count.textContent = `${list.length} of ${items.length} items`;
    }
    render();

    // item detail
    const modal = $('#item-modal');
    const body = modal && $('[data-item-body]', modal);
    const show = (key) => {
      const it = items.find((i) => i.k === key);
      if (!it || !body) return;
      const r = rng(hash(`${it.k}:${DAY}`));
      // walk backwards from today's value so the line ends where the 24h move says it should
      const pts = new Array(30);
      pts[29] = it.v;
      pts[28] = it.v / (1 + it.d / 100);
      for (let i = 27; i >= 0; i--) pts[i] = pts[i + 1] * (1 + (r() - 0.5) * 0.06);
      const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
      const xy = pts.map((v, i) => `${(i / 29) * 300},${100 - ((v - min) / span) * 86 - 7}`);
      body.innerHTML = `<div class="panel__head"><h2 id="im-t">${esc(it.n)}</h2></div><div class="panel__body">
        <div class="mk-detail"><span class="slot slot--xl">${itemIcon(it)}</span><div><p style="margin:0" class="${tierClass(it.t)}">Tier ${it.t || '–'} · ${esc(cat.get(it.c) || it.c)}</p><p class="num" style="font-size:32px;margin:4px 0;color:var(--text-hi)"><i class="coin" aria-hidden="true"></i>${fmt(it.v)}</p>${delta(it.d)} <span class="dim">24h</span></div></div>
        <svg class="chart" viewBox="0 0 300 100" preserveAspectRatio="none" aria-label="30 day price preview" role="img" style="margin-top:14px"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#E8B54A" stop-opacity=".35"/><stop offset="1" stop-color="#E8B54A" stop-opacity="0"/></linearGradient></defs><path class="a" d="M0,100 L${xy.join(' L')} L300,100 Z"/><path class="l" d="M${xy.join(' L')}"/></svg>
        <div class="mk-stats"><div><b>${fmt(it.v)}</b><span>${it.m ? 'material cost' : 'reference value'}</span></div><div><b>${short(it.vol)}</b><span>traded 24h · preview</span></div><div><b>${fmt(Math.max(...pts))}</b><span>30d high · preview</span></div></div>
        <p style="margin:16px 0 0"><a class="btn btn--gold btn--block" href="${esc(cfg.play)}">Trade it in game</a></p></div>`;
      openModal(modal);
    };
    document.addEventListener('click', (e) => { const tr = e.target instanceof Element && e.target.closest('tr[data-item]'); if (tr) show(tr.dataset.item); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = document.activeElement && document.activeElement.closest && document.activeElement.closest('tr[data-item]'); if (tr) show(tr.dataset.item); } });
  }

  // ── adventurers (preview generator) ─────────────────────────────────────
  const SKINS = ['forgeborn', 'runeward_sentinel', 'starmetal_delver', 'cinderplate', 'ledgerbound', 'deep_chorus', 'mawwarden', 'riftveil', 'ember_council', 'delvers_compact', 'ancestral'];
  const A = ['Bran', 'Thor', 'Dur', 'Gim', 'Kaz', 'Bal', 'Nor', 'Ori', 'Mor', 'Grun', 'Hald', 'Brok', 'Ulf', 'Skar', 'Vond', 'Ash', 'Ember', 'Iron', 'Coal', 'Flint', 'Rune', 'Deep', 'Stone', 'Copper', 'Mith', 'Grim', 'Dval', 'Kel'];
  const B = ['nok', 'rin', 'dain', 'grim', 'mund', 'vik', 'gar', 'rik', 'helm', 'bard', 'dor', 'ak', 'dred', 'fist', 'beard', 'delve', 'vein', 'forge', 'hammer', 'tooth', 'mole', 'pick'];
  const GUILDS = ['Ironvein', 'The Deep Ledger', 'Ashforge', 'Stonecount', 'Cinder Rats', 'Hollow Crown', 'Mole Union'];
  const makeName = (r, used) => {
    for (let n = 0; n < 50; n++) {
      let s = pick(r, A) + pick(r, B);
      if (r() < 0.22) s += `_${Math.floor(r() * 99) + 1}`;
      if (!used.has(s)) { used.add(s); return s; }
    }
    return `Delver${Math.floor(r() * 9999)}`;
  };
  const xpFor = (lvl) => { let p = 0; for (let l = 1; l < lvl; l++) p += Math.floor(l + 300 * 2 ** (l / 7)); return Math.floor(p / 4); };
  const person = (G, name, strength) => {
    const r = rng(hash(`p:${name}`));
    const skills = G.skills.map((s) => {
      const lvl = Math.max(1, Math.min(92, Math.round(strength * (0.55 + r() * 0.45) * 92 + (r() - 0.5) * 6)));
      return { ...s, lvl, xp: xpFor(lvl) + Math.floor(r() * (xpFor(lvl + 1) - xpFor(lvl))) };
    });
    return {
      name,
      skin: SKINS[hash(name) % SKINS.length],
      guild: r() < 0.75 ? pick(r, GUILDS) : '',
      patron: r() < 0.35,
      skills,
      total: skills.reduce((t, s) => t + s.lvl, 0),
      xp: skills.reduce((t, s) => t + s.xp, 0),
      kills: Math.floor(strength * strength * 40000 * (0.5 + r())),
      crafted: Math.floor(strength * 26000 * (0.5 + r())),
      since: new Date(Date.UTC(2026, Math.floor(r() * 8), 1 + Math.floor(r() * 27))),
    };
  };
  const ladder = (G) => {
    const r = rng(hash('ladder:v1'));
    const used = new Set();
    return Array.from({ length: 60 }, (_, i) => person(G, makeName(r, used), 0.98 - i * 0.011 - r() * 0.02));
  };
  const portrait = (p, cls = 'portrait--sm', presence = '') => `<span class="portrait ${cls}"><img src="${R}media/v2/portraits/${p.skin}.webp" alt="" width="64" height="64" loading="lazy">${presence ? `<i class="presence presence--${presence}"></i>` : ''}</span>`;
  const profileHref = (p) => `${R}profile/?name=${encodeURIComponent(p.name)}`;

  // ── hiscores ────────────────────────────────────────────────────────────
  function hiscores(G) {
    const people = ladder(G);
    const list = $('[data-hs-skills]');
    const title = $('[data-hs-title]');
    const tbody = $('[data-hs-table] tbody');
    const q = $('[data-hs-q]');
    const count = $('[data-hs-count]');
    const st = { skill: '', q: '' };
    const opts = [{ key: '', name: 'Overall', icon: false }, ...G.skills];
    list.innerHTML = opts.map((s) => `<button class="hs__skill" type="button" data-skill="${esc(s.key)}" aria-pressed="${s.key === ''}">${s.key ? skillIcon(s) : `<img src="${R}media/icons/ring_starmetal.webp" alt="" width="26" height="26">`}${esc(s.name)}</button>`).join('');
    list.addEventListener('click', (e) => {
      const b = e.target instanceof Element && e.target.closest('[data-skill]');
      if (!b) return;
      st.skill = b.dataset.skill;
      $$('[data-skill]', list).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      title.textContent = b.textContent.trim();
      render();
    });
    q.addEventListener('input', () => { st.q = q.value.trim().toLowerCase(); render(); });
    function render() {
      const rows = people.map((p) => {
        if (!st.skill) return { p, lvl: p.total, xp: p.xp };
        const s = p.skills.find((x) => x.key === st.skill);
        return { p, lvl: s.lvl, xp: s.xp };
      }).sort((a, b) => (st.skill ? b.xp - a.xp : b.lvl - a.lvl || b.xp - a.xp)).map((r, i) => ({ ...r, rank: i + 1 }));
      const shown = rows.filter((r) => !st.q || r.p.name.toLowerCase().includes(st.q)).slice(0, 25);
      tbody.innerHTML = shown.length ? shown.map((r) => `<tr data-href="${profileHref(r.p)}"><td class="rank num ${r.rank <= 3 ? `rank--${r.rank}` : ''}">${r.rank}</td><td><div class="who">${portrait(r.p)}<span><a href="${profileHref(r.p)}">${esc(r.p.name)}</a><small>${esc(r.p.guild || 'No guild')}</small></span></div></td><td class="r num">${fmt(r.lvl)}</td><td class="r num">${fmt(r.xp)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="empty">No adventurer by that name on this page.</td></tr>';
      count.textContent = `Showing ${shown.length} of ${rows.length} · preview`;
    }
    tbody.addEventListener('click', (e) => { const tr = e.target instanceof Element && e.target.closest('tr[data-href]'); if (tr && !(e.target.closest('a'))) location.href = tr.dataset.href; });
    render();
  }

  // ── profile ─────────────────────────────────────────────────────────────
  function profile(G, byKey) {
    const people = ladder(G);
    const want = new URLSearchParams(location.search).get('name');
    const p = people.find((x) => x.name === want) || (want ? person(G, want.slice(0, 24), 0.5) : people[3]);
    const rank = people.indexOf(p) + 1;
    document.title = `${p.name} · Deephold`;
    $('[data-pf-hero]').innerHTML = `${portrait(p, 'portrait--xl')}
      <div><span class="kicker">Adventurer</span><h1>${esc(p.name)}</h1>
      <div class="tags">${p.guild ? `<span class="badge badge--soon">${esc(p.guild)}</span>` : ''}${p.patron ? '<span class="badge badge--ember">Patron</span>' : ''}<span class="badge">Since ${p.since.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span><span class="badge badge--preview">Preview</span></div></div>
      <div class="profile-stats"><div><b>${fmt(p.total)}</b><span>total level</span></div><div><b>${rank ? `#${rank}` : '–'}</b><span>overall rank</span></div><div><b>${short(p.kills)}</b><span>monsters slain</span></div><div><b>${short(p.crafted)}</b><span>items made</span></div></div>`;
    $('[data-pf-skills]').innerHTML = p.skills.map((s) => {
      const into = (s.xp - xpFor(s.lvl)) / Math.max(1, xpFor(s.lvl + 1) - xpFor(s.lvl));
      return `<div class="skill" title="${esc(s.name)}: ${fmt(s.xp)} XP">${skillIcon(s)}<span style="flex:1;min-width:0"><span class="skill__n">${esc(s.name)}</span><span class="xpbar"><i style="width:${Math.round(into * 100)}%"></i></span></span><span class="skill__lv">${s.lvl}</span></div>`;
    }).join('') + `<div class="skill skill--total">Total level <span class="skill__lv" style="margin-left:8px">${fmt(p.total)}</span></div>`;

    // gear: best item per slot the adventurer could plausibly wear
    const r = rng(hash(`gear:${p.name}`));
    const bySlot = {};
    G.items.filter((i) => i.s && i.i).forEach((i) => { (bySlot[i.s] = bySlot[i.s] || []).push(i); });
    const cap = Math.max(1, Math.round((p.total / (G.skills.length * 92)) * 10));
    const gearFor = (slot) => {
      const list = (bySlot[slot] || []).filter((i) => (i.t || 1) <= cap).sort((a, b) => (b.t || 0) - (a.t || 0));
      return list.length ? list[Math.floor(r() * Math.min(3, list.length))] : null;
    };
    const LAYOUT = ['tool_pickaxe', 'head', 'tool_axe', 'weapon', 'body', 'offhand', 'ring', 'legs', 'tool_rod', '', 'boots', ''];
    $('[data-pf-gear]').innerHTML = LAYOUT.map((slot) => {
      if (!slot) return '<span></span>';
      const it = gearFor(slot);
      return it ? `<span class="slot" title="${esc(it.n)}">${itemIcon(it)}</span>` : `<span class="slot slot--empty" title="${esc(slot)}"></span>`;
    }).join('');

    // activity
    const mobs = G.monsters.filter((m) => m.i);
    const crafts = G.items.filter((i) => i.i && i.t && i.t <= cap);
    const season = G.seasons.find((s) => Date.now() >= s.from && Date.now() < s.to);
    const best = [...p.skills].sort((a, b) => b.lvl - a.lvl);
    const feed = [
      { ic: skillIcon(best[0]), t: `Reached level ${best[0].lvl} ${esc(best[0].name)}`, ago: '2h' },
      season ? { ic: `<img src="${R}media/icons/weapon_sword_rune.webp" alt="" width="32" height="32">`, t: `Hit ${esc(season.boss)} for ${fmt(2000 + r() * 30000)} damage`, ago: '5h' } : null,
      (() => { const m = pick(r, mobs); return m ? { ic: `<img src="${R}guides/img/mobs/${esc(m.k)}.png" alt="" width="32" height="32">`, t: `Defeated ${fmt(20 + r() * 400)} × ${esc(m.n)}`, ago: '9h' } : null; })(),
      (() => { const it = pick(r, crafts); return it ? { ic: itemIcon(it), t: `Made ${fmt(5 + r() * 200)} × ${esc(it.n)}`, ago: '1d' } : null; })(),
      (() => { const it = pick(r, crafts); return it ? { ic: itemIcon(it), t: `Sold ${fmt(10 + r() * 900)} × ${esc(it.n)} on the market`, ago: '2d' } : null; })(),
      { ic: skillIcon(best[1]), t: `Reached level ${best[1].lvl} ${esc(best[1].name)}`, ago: '3d' },
    ].filter(Boolean);
    $('[data-pf-feed]').innerHTML = feed.map((f) => `<li><span class="slot">${f.ic}</span><span>${f.t}</span><time>${f.ago} ago</time></li>`).join('');

    // skins
    const owned = new Set(SKINS.filter((s, i) => s === p.skin || rng(hash(`${p.name}:${s}`))() < 0.3 + (i % 3) * 0.1));
    $('[data-pf-skins]').innerHTML = SKINS.map((s) => `<span class="slot slot--lg" title="${esc(s.replace(/_/g, ' '))}${owned.has(s) ? '' : ' (locked)'}" style="${owned.has(s) ? '' : 'opacity:.3;filter:grayscale(1)'}"><img src="${R}media/v2/portraits/${s}.webp" alt="" width="64" height="64" loading="lazy"></span>`).join('');
  }

  // ── friends ─────────────────────────────────────────────────────────────
  function friends(G) {
    const people = ladder(G);
    const r = rng(hash(`friends:${DAY}`));
    const zones = G.zones.map((z) => z.n);
    const acts = G.skills.map((s) => s.name);
    const fr = [5, 9, 14, 21, 26, 33, 38, 44, 51].map((i) => people[i]).map((p) => {
      const on = r() < 0.4;
      return { p, on, busy: on && r() < 0.3, what: on ? (r() < 0.5 ? `${pick(r, acts)} in ${pick(r, zones)}` : `Fighting in ${pick(r, zones)}`) : `Last seen ${1 + Math.floor(r() * 20)}h ago` };
    }).sort((a, b) => Number(b.on) - Number(a.on));
    $('[data-fr-list]').innerHTML = fr.map((f) => `<div class="friend"><a href="${profileHref(f.p)}" aria-hidden="true" tabindex="-1">${portrait(f.p, '', f.on ? (f.busy ? 'busy' : 'on') : '')}</a><div class="who"><span><a href="${profileHref(f.p)}">${esc(f.p.name)}</a><small>${esc(f.what)}</small></span></div><div class="friend__act"><a class="btn btn--sm btn--ghost" href="${profileHref(f.p)}">Profile</a></div></div>`).join('');
    $('[data-fr-count]').textContent = `${fr.filter((f) => f.on).length} online · ${fr.length} friends`;
    const req = [people[17], people[47]];
    $('[data-fr-req]').innerHTML = req.map((p) => `<div class="friend">${portrait(p)}<div class="who"><span><a href="${profileHref(p)}">${esc(p.name)}</a><small>Total level ${fmt(p.total)}</small></span></div><div class="friend__act"><a class="btn btn--sm btn--gold" href="${esc(cfg.play)}">Accept</a></div></div>`).join('');
    const add = $('[data-fr-add]');
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = add.elements.namedItem('name').value.trim();
      const msg = $('.wl__msg', add);
      if (!name) { msg.textContent = 'Type a name first.'; add.dataset.state = 'error'; return; }
      add.dataset.state = '';
      msg.innerHTML = `Requests are sent from inside the game. <a href="${esc(cfg.play)}">Log in</a> and add <b>${esc(name)}</b> from the Friends tab.`;
    });
  }
})();
