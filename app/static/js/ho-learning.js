/**
 * HandsOnEdu — saving results from the gesture modules (REQ-005).
 *
 * `HO.Learning` shares learner profiles with the Aula de Señas (same
 * localStorage keys), creates/finishes activity sessions on /api/sessions,
 * and provides a small "¿Quién juega?" picker. The admin token (teacher
 * actions such as attendance) is read from either key used by other pages.
 * Load after ho-common.js:  <script src="/static/js/ho-learning.js"></script>
 */
(function (global) {
  'use strict';

  const LS_PROFILES = 'ho.aula.profiles';
  const LS_CURRENT = 'ho.aula.current';
  const SS_ADMIN = 'ho.admin.token';
  const LS_ADMIN = 'ho.adminToken';
  const MAX_PROFILES = 8;

  // ── Pure helpers (tested with node --test) ──────────────────────────────────
  function normalizeName(name) {
    return String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function sameName(a, b) {
    return normalizeName(a).toLocaleLowerCase('es') === normalizeName(b).toLocaleLowerCase('es');
  }

  function findProfile(profiles, name) {
    return (profiles || []).find((p) => sameName(p.name, name)) || null;
  }

  /** Most-recent-first list without duplicates (by id or by name). */
  function rememberIn(profiles, learner) {
    const entry = { id: learner.id, name: normalizeName(learner.name || learner.display_name) };
    const rest = (profiles || []).filter((p) => p.id !== entry.id && !sameName(p.name, entry.name));
    return [entry].concat(rest).slice(0, MAX_PROFILES);
  }

  /** A–D grade from a 0–1 ratio (same bands as GestiEdu/MotivaSign: 90/70/50 %). */
  function letterGrade(ratio) {
    if (ratio >= 0.9) return 'A';
    if (ratio >= 0.7) return 'B';
    if (ratio >= 0.5) return 'C';
    return 'D';
  }

  // ── Storage ─────────────────────────────────────────────────────────────────
  function lsGet(key, fallback) {
    try { const v = global.localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  }
  function lsSet(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked */ }
  }

  function profiles() { return lsGet(LS_PROFILES, []); }
  function current() {
    const id = lsGet(LS_CURRENT, null);
    return profiles().find((p) => p.id === id) || null;
  }
  function remember(learner) {
    const list = rememberIn(profiles(), learner);
    lsSet(LS_PROFILES, list);
    lsSet(LS_CURRENT, list[0].id);
    return list[0];
  }

  function adminToken() {
    try { return global.sessionStorage.getItem(SS_ADMIN) || global.localStorage.getItem(LS_ADMIN) || ''; } catch (_) { return ''; }
  }
  function setAdminToken(token) {
    try {
      global.sessionStorage.setItem(SS_ADMIN, token);
      global.localStorage.setItem(LS_ADMIN, token);
    } catch (_) { /* */ }
  }

  // ── API ─────────────────────────────────────────────────────────────────────
  /**
   * JSON request. With {admin: true} sends the admin token and, on 401, asks
   * for it once and retries. Errors carry `.status`.
   */
  async function request(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}, opts.headers);
    if (opts.admin && adminToken()) headers['X-Admin-Token'] = adminToken();
    const res = await fetch(path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive,
    });
    if (res.status === 401 && opts.admin && !opts._retried && opts.prompt !== false) {
      const t = global.prompt('Esta acción es del docente. Escribe el token de administrador (ADMIN_TOKEN):');
      if (t) {
        setAdminToken(t.trim());
        return request(path, Object.assign({}, opts, { _retried: true }));
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const err = new Error((body && typeof body.detail === 'string' && body.detail) || res.statusText || 'Error');
      err.status = res.status;
      throw err;
    }
    if (opts.raw) return res;
    return res.status === 204 ? null : res.json();
  }

  /** Reuse the stored profile with that name (if it still exists) or create one. */
  async function ensureLearner(name) {
    name = normalizeName(name);
    if (!name) return null;
    const known = findProfile(profiles(), name);
    if (known) {
      try {
        const l = await request('/api/learners/' + encodeURIComponent(known.id));
        return remember({ id: l.id, name: l.display_name });
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    const created = await request('/api/learners', { body: { display_name: name } });
    return remember({ id: created.id, name: created.display_name });
  }

  /**
   * Activity session tied to a learner name. Every call is best effort:
   * a failed save never interrupts the game, it only reports `error`.
   */
  function Recorder(module, activity, language) {
    this.module = module;
    this.activity = activity;
    this.language = language || null;
    this.learner = null;
    this.sessionId = null;
    this.error = null;
    this._start = null;
  }
  Recorder.prototype.start = function (name) {
    this._start = (async () => {
      try {
        this.learner = await ensureLearner(name);
        if (!this.learner) return null;
        const s = await request('/api/sessions', { body: {
          learner_id: this.learner.id, module: this.module, activity: this.activity, language: this.language } });
        this.sessionId = s.id;
        return s.id;
      } catch (err) {
        this.error = err;
        return null;
      }
    })();
    return this._start;
  };
  /** attempts: [{sign_id, correct, confidence?, response_ms?}] (needs a language). */
  Recorder.prototype.finish = async function (result, attempts, opts) {
    const keepalive = !!(opts && opts.keepalive);   // still delivered if the page is closing
    const id = await (this._start || Promise.resolve(null));
    if (!id) return { saved: false, learner: this.learner, error: this.error };
    try {
      if (attempts && attempts.length && this.language) {
        await request('/api/sessions/' + id + '/attempts', { body: { attempts: attempts }, keepalive: keepalive });
      }
      await request('/api/sessions/' + id + '/finish', { body: result, keepalive: keepalive });
      return { saved: true, learner: this.learner };
    } catch (err) {
      return { saved: false, learner: this.learner, error: err };
    }
  };

  async function history(learnerId, module, limit) {
    const q = '?module=' + encodeURIComponent(module) + '&finished=true&limit=' + (limit || 10);
    return request('/api/learners/' + encodeURIComponent(learnerId) + '/sessions' + q);
  }

  /** Fill a <table> with the learner's last results: date · score · grade (optionally one activity). */
  async function showHistory(table, learner, module, activity) {
    const rows = (await history(learner.id, module, 30))
      .filter((s) => !activity || s.activity === activity).slice(0, 8);
    const doc = global.document;
    const fmt = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
    const cell = (tag, text, cls) => { const c = doc.createElement(tag); c.textContent = text; if (cls) c.className = cls; return c; };
    const caption = cell('caption', 'Últimos resultados de ' + learner.name);
    const head = doc.createElement('tr');
    head.append(cell('th', 'Fecha'), cell('th', 'Aciertos'), cell('th', 'Nota'));
    const body = rows.filter((s) => s.max_score).map((s) => {
      const tr = doc.createElement('tr');
      tr.append(
        cell('td', fmt.format(new Date(s.ended_at || s.started_at))),
        cell('td', (s.score || 0) + ' / ' + s.max_score, 'num'),
        cell('td', (s.details && s.details.grade) || letterGrade((s.score || 0) / s.max_score), 'num'),
      );
      return tr;
    });
    if (!body.length) {
      const tr = doc.createElement('tr');
      const td = cell('td', 'Todavía no hay resultados guardados.');
      td.colSpan = 3;
      tr.append(td);
      body.push(tr);
    }
    table.replaceChildren(caption, head, ...body);
    table.hidden = false;
  }

  // ── "¿Quién juega?" picker ──────────────────────────────────────────────────
  /**
   * Renders into `container`: a name input (prefilled with the current
   * profile) plus chips with recent profiles. Returns {value(), focus()}.
   */
  function LearnerPicker(container, opts) {
    opts = opts || {};
    const doc = global.document;
    const id = 'ho-lp-' + Math.random().toString(36).slice(2, 8);
    container.classList.add('ho-lp');
    container.replaceChildren();

    const label = doc.createElement('label');
    label.className = 'ho-lp-label';
    label.htmlFor = id;
    label.textContent = opts.label || '¿Quién juega? ';
    const small = doc.createElement('small');
    small.textContent = opts.note || '(escribe tu nombre para guardar tus resultados)';
    label.append(small);

    const input = doc.createElement('input');
    input.id = id;
    input.className = 'ho-lp-input';
    input.maxLength = 120;
    input.autocomplete = 'off';
    input.placeholder = 'Tu nombre';
    const cur = current();
    if (cur) input.value = cur.name;

    const chips = doc.createElement('div');
    chips.className = 'ho-lp-chips';
    for (const p of profiles()) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'ho-lp-chip';
      b.textContent = p.name;
      b.addEventListener('click', () => { input.value = p.name; input.focus(); });
      chips.append(b);
    }
    chips.hidden = !chips.children.length;
    container.append(label, input, chips);
    return {
      value: () => normalizeName(input.value),
      focus: () => input.focus(),
      input: input,
    };
  }

  const api = {
    normalizeName, sameName, findProfile, rememberIn, letterGrade,
    profiles, current, remember, adminToken, setAdminToken,
    request, ensureLearner, Recorder, history, showHistory, LearnerPicker,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.HO) global.HO.Learning = api;
  else global.HO = { Learning: api };
})(typeof window !== 'undefined' ? window : globalThis);
