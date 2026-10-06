/* Deephold site — the waitlist form (landing page #waitlist and /waitlist/).

   The site is static, so the form posts to whatever `data-waitlist-url` on
   <html> points at: the worker in tools/site/waitlist-worker.mjs, or any form
   endpoint that accepts a POST with an `email` field (Buttondown, Formspree, a
   Google Apps Script…). The body is application/x-www-form-urlencoded, which
   makes it a "simple" CORS request: no preflight, so it works with every one
   of those without configuration.

   Fields sent: email, source (which form, plus the ?src= tag a shared link
   carried), website (the honeypot: a bot fills it, a person never sees it).

   States, on the <form>: data-state="idle" | "busy" | "done". The done state
   is remembered in localStorage, so a returning visitor sees "you're on the
   list" instead of a form that looks like it forgot them. Nothing here is
   essential to the page: if the script fails, the form still has an action.

   Once `data-play-url` is set, the game is open and a waitlist is noise:
   everything marked data-prelaunch folds away and anything marked data-open
   (the install block on /waitlist/) is shown instead. */
(() => {
  'use strict';

  const root = document.documentElement;
  // https only — except loopback, so the form can be tried against a local API.
  const httpsOnly = (v) => (/^(https:\/\/\S+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/\S*)$/.test(v || '') ? v : '');
  const endpoint = httpsOnly(root.dataset.waitlistUrl);
  const mailTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(root.dataset.waitlistMail || '') ? root.dataset.waitlistMail : '';
  const playUrl = httpsOnly(root.dataset.playUrl);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (playUrl) {
    document.querySelectorAll('[data-prelaunch]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('[data-open]').forEach((el) => { el.hidden = false; });
    return;
  }

  const forms = [...document.querySelectorAll('form[data-waitlist]')];
  if (!forms.length) return;

  /* ── memory ─────────────────────────────────────────────────────────── */
  const KEY = 'deephold.waitlist';
  const memory = {
    get() {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        return v && typeof v.email === 'string' ? v : null;
      } catch { return null; }
    },
    set(email) { try { localStorage.setItem(KEY, JSON.stringify({ email, at: Date.now() })); } catch { /* private mode */ } },
    clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };

  /* ── where the visitor came from ────────────────────────────────────── */
  const src = new URLSearchParams(location.search).get('src') || '';
  const tag = /^[a-z0-9_-]{1,32}$/i.test(src) ? src.toLowerCase() : '';

  /* ── helpers ─────────────────────────────────────────────────────────── */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function say(form, text, tone) {
    const m = form.querySelector('[data-msg]');
    if (!m) return;
    m.textContent = text || '';
    if (tone) m.dataset.tone = tone; else delete m.dataset.tone;
  }

  /* An error that offers a way out: the mail fallback, as a real link. */
  function sayFailed(form) {
    const m = form.querySelector('[data-msg]');
    if (!m) return;
    m.textContent = '';
    m.dataset.tone = 'error';
    m.append("That didn't go through. Try again in a moment");
    if (mailTo) {
      const a = document.createElement('a');
      a.href = `mailto:${mailTo}?subject=${encodeURIComponent('Deephold waitlist')}`;
      a.textContent = `write to ${mailTo}`;
      m.append(', or ', a);
    }
    m.append('.');
  }

  function setState(form, state) {
    form.dataset.state = state;
  }

  function finish(form, email) {
    form.querySelectorAll('[data-done-email]').forEach((b) => { b.textContent = email; });
    setState(form, 'done');
  }

  /* ── each form ────────────────────────────────────────────────────────── */
  forms.forEach((form) => {
    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');
    if (!input || !button) return;
    const label = button.querySelector('[data-label]') || button;
    const source = form.querySelector('input[name="source"]');
    if (source && tag) source.value = `${source.value}:${tag}`;
    if (endpoint) form.action = endpoint;
    setState(form, 'idle');

    const known = memory.get();
    if (known) finish(form, known.email);

    input.addEventListener('input', () => {
      form.classList.remove('is-invalid');
      say(form, '');
    });

    form.querySelector('[data-reset]')?.addEventListener('click', () => {
      memory.clear();
      setState(form, 'idle');
      input.value = '';
      say(form, '');
      input.focus();
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (form.dataset.state === 'busy') return;

      const email = input.value.trim().toLowerCase();
      if (!EMAIL.test(email)) {
        form.classList.add('is-invalid');
        say(form, "That doesn't look like an email address.", 'error');
        input.focus();
        return;
      }

      // A filled honeypot is a bot. It gets its success screen and nothing is sent.
      const trap = form.elements.namedItem('website');
      if (trap && trap.value) { finish(form, email); return; }

      if (!endpoint) {
        // No endpoint wired yet: hand over to the visitor's mail app with the message written.
        if (!mailTo) { say(form, "The waitlist isn't connected yet. Try again in a day or two.", 'error'); return; }
        const subject = encodeURIComponent('Deephold waitlist');
        const body = encodeURIComponent(`Please add ${email} to the Deephold waitlist.`);
        location.href = `mailto:${mailTo}?subject=${subject}&body=${body}`;
        say(form, "Your mail app should open with the message ready. Send it and you're in.");
        return;
      }

      setState(form, 'busy');
      const was = label.textContent;
      label.textContent = 'Sending…';
      say(form, '');
      try {
        const body = new URLSearchParams(new FormData(form));
        body.set('email', email);
        const res = await fetch(endpoint, {
          method: 'POST',
          body,
          headers: { Accept: 'application/json' },
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        memory.set(email);
        finish(form, email);
      } catch {
        setState(form, 'idle');
        sayFailed(form);
      } finally {
        label.textContent = was;
      }
    });
  });

  /* ── "Join the waitlist" links ────────────────────────────────────────
     After the scroll, put the cursor in the field, so the section arrives
     ready to type instead of asking the visitor to find the box. */
  const first = forms[0];
  const firstInput = first.querySelector('input[type="email"]');
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href="#waitlist"], a[href$="/#waitlist"]');
    if (!a) return;
    const target = document.getElementById('waitlist');
    if (!target) return; // a sub-page link to /#waitlist: let it navigate
    ev.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', '#waitlist');
    if (firstInput && first.dataset.state !== 'done') {
      setTimeout(() => firstInput.focus({ preventScroll: true }), reduced ? 0 : 650);
    }
  });

  /* Arrived on /#waitlist from another page: same courtesy, once the page has settled. */
  if (location.hash === '#waitlist' && firstInput && first.dataset.state !== 'done') {
    setTimeout(() => firstInput.focus({ preventScroll: true }), 400);
  }
})();
