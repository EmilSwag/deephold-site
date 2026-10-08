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
    box._tabs = tabs;
    box._select = select; // used by the auto-advance in the motion module
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
    // four cells built once; afterwards only the number that changed is touched, and it ticks
    el.innerHTML = ['days', 'hrs', 'min', 'sec'].map((l) => `<span><b>--</b><small>${l}</small></span>`).join('');
    const cells = $$('span > b', el);
    const tick = () => {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (!s) { el.innerHTML = '<span>Season ended</span>'; clearInterval(timer); return; }
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      [d, h, m, s].forEach((v, i) => {
        const txt = String(v).padStart(2, '0');
        const b = cells[i];
        if (b.textContent === txt) return;
        b.textContent = txt;
        const cell = b.parentElement;
        cell.classList.remove('tick');
        void cell.offsetWidth; // restart the tick animation
        cell.classList.add('tick');
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
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
    // success = OSRS level-up message (parchment chatbox; fireworks only on a fresh signup)
    const done = (fresh = true) => {
      say(fresh ? "You're on the Steam waitlist. One email the day it opens." : '', 'done');
      const old = $('.lvlup', form);
      if (old) old.remove();
      const box = document.createElement('div');
      box.className = `lvlup${fresh ? ' is-fresh' : ''}`;
      box.innerHTML = `<span class="lvlup__ic" aria-hidden="true"></span>
<p class="lvlup__t">${fresh ? 'Congratulations, you just advanced a Patience level.' : "You're already on the Steam waitlist."}</p>
<p class="lvlup__s">${fresh ? 'Your Patience level is now 2.' : 'Your Patience level is still 2.'} One email the day Steam opens. Nothing else.</p>
<a class="lvlup__go" href="${esc(cfg.play || `${R}play/`)}" data-play>Click here to continue: play in your browser</a>`;
      form.insertBefore(box, msg);
    };
    if (remembered && remembered.email) done(false);
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
      el.innerHTML = `<span class="ticker__tag">Preview<span class="ticker__tag-x"> prices</span></span><div class="ticker__track">${row}${row}</div>`;
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
  // No skins anywhere (08.10): an adventurer looks like what they really wear. The portrait is
  // the worn helmet; the equipment grid below it is the rest of the kit.
  const GEAR_SLOTS = ['tool_pickaxe', 'head', 'tool_axe', 'weapon', 'body', 'offhand', 'ring', 'legs', 'tool_rod', '', 'boots', ''];
  const gearOf = (G, name, total) => {
    const r = rng(hash(`gear:${name}`));
    const bySlot = {};
    G.items.filter((i) => i.s && i.i).forEach((i) => { (bySlot[i.s] = bySlot[i.s] || []).push(i); });
    const cap = Math.max(1, Math.round((total / (G.skills.length * 92)) * 10));
    const gear = {};
    GEAR_SLOTS.filter(Boolean).forEach((slot) => {
      const list = (bySlot[slot] || []).filter((i) => (i.t || 1) <= cap).sort((a, b) => (b.t || 0) - (a.t || 0));
      gear[slot] = list.length ? list[Math.floor(r() * Math.min(3, list.length))] : null;
    });
    return gear;
  };
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
    const total = skills.reduce((t, s) => t + s.lvl, 0);
    return {
      name,
      gear: gearOf(G, name, total),
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
  // portrait = the helmet really worn (or a bare head: an empty slot), never a skin
  const portrait = (p, cls = 'portrait--sm', presence = '') => {
    const head = p.gear && p.gear.head;
    return `<span class="portrait ${cls}${head ? '' : ' portrait--bare'}" title="${head ? esc(head.n) : 'No helmet'}">${head ? itemIcon(head) : ''}${presence ? `<i class="presence presence--${presence}"></i>` : ''}</span>`;
  };
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

    // gear: the kit the adventurer really wears (same data the portrait uses)
    const r = rng(hash(`feed:${p.name}`));
    const cap = Math.max(1, Math.round((p.total / (G.skills.length * 92)) * 10));
    $('[data-pf-gear]').innerHTML = GEAR_SLOTS.map((slot) => {
      if (!slot) return '<span></span>';
      const it = p.gear[slot];
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

/* OSRS dialogue CTA: press 1/2/3 to pick an option while the box is on screen */
(() => {
  const box = document.querySelector('[data-dialogue]');
  if (!box || !('IntersectionObserver' in window)) return;
  let seen = false;
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.4 }).observe(box);
  document.addEventListener('keydown', (e) => {
    if (!seen || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const a = box.querySelector(`[data-key="${e.key}"]`);
    if (a) { e.preventDefault(); a.click(); }
  });
})();

/* Motion (v5): scroll reveals + staggers, lazy-image fade, banner parallax, tab auto-advance,
   count-ups, the Foreman's typewriter. Reveal gating lives on html.js (inline in <head>); if the
   observer API is missing the class is dropped and everything simply shows. */
(() => {
  const doc = document.documentElement;
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) { doc.classList.remove('js'); return; }

  // ── reveals: blocks (.rv) + staggered lists (.rv-kids) ───────────────────
  const KIDS = '.stones, .news, .facts, .sidebox ul, .footer__links, .ledger tbody, .mk-top, .chips, .hs__skills, [data-fr-list], [data-fr-req], [data-pf-skills], [data-pf-feed], .profile-stats, .gex__slots, .worlds__tbl tbody, .plats, .cgrid, .faq';
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    seen.unobserve(e.target);
  }), { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  // The parchment (.scroll) is clip-path'd shut until it reveals, and Chrome counts clip-path in
  // the intersection (so an observer never sees it, nor the lists inside). Those few blocks are
  // checked by hand on scroll instead, and their lists are released together with them.
  const clipped = new Set();
  let clipRaf = 0;
  const checkClipped = () => {
    clipRaf = 0;
    for (const el of clipped) {
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight * 0.94 || r.bottom < 0) continue;
      clipped.delete(el);
      el.classList.add('in');
      $$('.rv-kids', el).forEach((k) => { k.classList.add('in'); seen.unobserve(k); });
    }
    if (!clipped.size) removeEventListener('scroll', onScroll);
  };
  const onScroll = () => { if (!clipRaf) clipRaf = requestAnimationFrame(checkClipped); };
  const stagger = (el) => [...el.children].forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 10))));
  const tag = (root) => {
    $$('.rv', root).forEach((el) => {
      if (el.dataset.rv) return;
      el.dataset.rv = '1';
      if (!el.classList.contains('scroll')) { seen.observe(el); return; }
      if (!clipped.size) addEventListener('scroll', onScroll, { passive: true });
      clipped.add(el);
      onScroll();
    });
    $$(KIDS, root).forEach((el) => {
      if (!el.children.length) return;
      if (el.dataset.rvk) { if (el.dataset.rvk !== String(el.children.length)) { stagger(el); el.dataset.rvk = String(el.children.length); } return; }
      el.dataset.rvk = String(el.children.length);
      stagger(el);
      el.classList.add('rv-kids');
      seen.observe(el);
    });
    // lazy images still loading fade in once they arrive (never hidden otherwise)
    $$('img[loading="lazy"]', root).forEach((img) => {
      if (img.dataset.ld || img.complete) return;
      img.dataset.ld = '1';
      img.classList.add('img-wait');
      const show = () => img.classList.remove('img-wait');
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', show, { once: true });
    });
  };
  tag(document);
  // lists rendered later (market rows, hiscores, profile, friends) get the same treatment
  let pending = 0;
  new MutationObserver(() => { if (pending) return; pending = requestAnimationFrame(() => { pending = 0; tag(document); }); })
    .observe(document.body, { childList: true, subtree: true });

  // ── count-ups: numbers in facts/stats roll up the first time they are seen ──
  const roll = (b) => {
    const m = /^([^\d]*)(\d[\d,]*)(\.\d+)?(.*)$/.exec(b.textContent.trim());
    if (!m) return;
    const [, pre, int, dec, post] = m;
    const target = Number(int.replace(/,/g, ''));
    if (!Number.isFinite(target) || target === 0) return;
    const grouped = int.includes(',');
    const t0 = performance.now();
    const dur = 700 + Math.min(500, target / 4);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(target * e);
      b.textContent = `${pre}${grouped ? v.toLocaleString('en-US') : v}${dec || ''}${post}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const counted = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    counted.unobserve(e.target);
    if (!reduced) roll(e.target);
  }), { threshold: 0.6 });
  const watchNums = (root) => $$('.facts b, .profile-stats b, .worlds__n', root).forEach((b) => { if (b.dataset.cu) return; b.dataset.cu = '1'; counted.observe(b); });
  watchNums(document);
  new MutationObserver(() => watchNums(document)).observe(document.body, { childList: true, subtree: true });

  // ── banner: pointer parallax (desktop only), composed through the `translate` property ──
  const banner = document.querySelector('.banner');
  if (banner && !reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const layers = [
      ...$$('.banner__hero--l', banner).map((el) => ({ el, kx: 10, ky: 5 })),
      ...$$('.banner__hero--r', banner).map((el) => ({ el, kx: 10, ky: 5 })),
      ...$$('.banner__logo', banner).map((el) => ({ el, kx: 4, ky: 3 })),
      ...$$('.banner__bg', banner).map((el) => ({ el, kx: -6, ky: -3 })),
    ];
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const frame = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      layers.forEach(({ el, kx, ky }) => { el.style.translate = `${(cx * kx).toFixed(2)}px ${(cy * ky).toFixed(2)}px`; });
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.002 ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    banner.addEventListener('pointermove', (e) => {
      const r = banner.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    });
    banner.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  }

  // ── what-you-do tabs: auto-advance while in view until the visitor takes over ──
  $$('.dotabs[data-tabs]').forEach((box) => {
    if (reduced || !box._select || !box._tabs) return;
    const MS = 7000;
    box.style.setProperty('--tab-ms', `${MS}ms`);
    let timer = 0, user = false, visible = false, hover = false;
    const next = () => {
      const i = box._tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      box._select(box._tabs[(i + 1) % box._tabs.length], false);
    };
    const update = () => {
      clearTimeout(timer);
      if (user) { box.classList.remove('is-auto', 'is-paused'); return; }
      box.classList.add('is-auto');
      const run = visible && !hover && !document.hidden;
      box.classList.toggle('is-paused', !run);
      if (run) timer = setTimeout(() => { next(); update(); }, MS);
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }, { threshold: 0.35 }).observe(box);
    box.addEventListener('pointerenter', () => { hover = true; update(); });
    box.addEventListener('pointerleave', () => { hover = false; update(); });
    document.addEventListener('visibilitychange', update);
    // any click or key on the tab list = the visitor is driving now
    const list = box.querySelector('[role=tablist]');
    ['click', 'keydown', 'touchstart'].forEach((ev) => list && list.addEventListener(ev, () => { if (!user) { user = true; update(); } }, { passive: true }));
  });

  // ── the Foreman types his line, then the options arrive ──
  const chat = document.querySelector('[data-dialogue]');
  const line = chat && chat.querySelector('.chat__line');
  if (chat && line) {
    const full = line.textContent;
    $$('.chat__opts li', chat).forEach((li, i) => li.style.setProperty('--i', String(i)));
    const said = () => { line.textContent = full; line.classList.remove('typing'); chat.classList.remove('is-typing'); chat.classList.add('is-said'); };
    if (reduced) said();
    else {
      let i = 0, timer = 0;
      const type = () => {
        i += 1;
        line.textContent = full.slice(0, i);
        if (i >= full.length) { said(); return; }
        const ch = full[i - 1];
        timer = setTimeout(type, ch === '.' || ch === '?' ? 260 : ch === ',' ? 120 : 22);
      };
      const start = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        start.disconnect();
        line.textContent = '';
        line.classList.add('typing');
        chat.classList.add('is-typing');
        timer = setTimeout(type, 350);
      }, { threshold: 0.45 });
      start.observe(chat);
      line.addEventListener('click', () => { clearTimeout(timer); if (!chat.classList.contains('is-said')) said(); });
    }
  }
})();
