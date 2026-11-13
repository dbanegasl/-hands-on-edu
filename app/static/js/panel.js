/**
 * Panel docente (REQ-007): course progress for teachers.
 * Access: LTI instructor launch token (#lti= → sessionStorage, same as the Aula)
 * or the installation's admin token. Data: /api/panel/*.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SS_LTI = 'ho.lti.token';
  const SS_ADMIN = 'ho.admin.token';
  const P = { lti: null, data: null, sort: 'name', query: '' };
  const fmtInt = new Intl.NumberFormat('es-EC');
  const fmtDay = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' });
  const fmtDateTime = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    return n;
  };

  function toast(msg, isError) {
    const t = $('au-toast');
    t.textContent = msg;
    t.className = 'au-toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  function readLtiToken() {
    const m = /(?:^|[#&])lti=([^&]+)/.exec(location.hash);
    if (m) {
      try { sessionStorage.setItem(SS_LTI, m[1]); } catch (_) { /* storage blocked */ }
      history.replaceState(null, '', location.pathname + location.search);
      return m[1];
    }
    try { return sessionStorage.getItem(SS_LTI); } catch (_) { return null; }
  }

  function authHeaders() {
    if (P.lti) return { Authorization: 'Bearer ' + P.lti };
    let admin = null;
    try { admin = sessionStorage.getItem(SS_ADMIN); } catch (_) { /* */ }
    return admin ? { 'X-Admin-Token': admin } : {};
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: authHeaders() }, opts || {}));
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const err = new Error((body && typeof body.detail === 'string' && body.detail) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  /** Sequential ramp bin (1–6) for a 0–100 value. Light = more. */
  function bin(pct) {
    if (pct >= 85) return 6;
    if (pct >= 70) return 5;
    if (pct >= 55) return 4;
    if (pct >= 40) return 3;
    if (pct >= 20) return 2;
    return 1;
  }

  function ago(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return 'hace ' + days + ' d';
    return fmtDay.format(d);
  }

  const pct = (v) => (v == null ? '—' : Math.round(v) + '%');

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const tip = $('pn-tip');
  function showTip(evt, lines) {
    tip.replaceChildren(...lines.map((l, i) => (i ? el('div', null, l) : el('div', null, el('b', { text: l })))));
    tip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function withTip(node, lines) {
    node.addEventListener('mouseenter', (e) => showTip(e, lines()));
    node.addEventListener('mousemove', moveTip);
    node.addEventListener('mouseleave', hideTip);
    return node;
  }

  // ── Render: header + tiles ─────────────────────────────────────────────────
  function renderHeader(d) {
    const s = d.scope;
    document.title = s.title + ' · Panel docente | HandsOnEdu';
    $('pn-title').textContent = s.title;
    $('pn-scope').textContent = s.kind === 'course' ? [s.label, s.platform].filter(Boolean).join(' · ') : 'Toda la instalación';
    $('pn-sub').textContent = (s.kind === 'course'
      ? 'Aula de Señas · estudiantes de este curso'
      : 'Aula de Señas · todos los estudiantes de esta instalación')
      + ' · actualizado ' + fmtDateTime.format(new Date(d.generated_at));
    $('pn-pass').textContent = d.pass_pct;

    const note = $('pn-roster-note');
    note.hidden = !(d.roster.status === 'unavailable' || d.roster.status === 'error');
    if (!note.hidden) {
      note.textContent = '⚠️ ' + d.roster.detail + '. Se muestran solo los estudiantes que ya abrieron la actividad.';
    }
  }

  function tile(label, value, note, warn) {
    return el('div', { class: 'pn-tile' + (warn ? ' warn' : '') }, [
      el('span', { class: 'pn-tile-label', text: label }),
      el('span', { class: 'pn-tile-value', text: value }),
      note ? el('span', { class: 'pn-tile-note', text: note }) : null,
    ]);
  }

  function renderTiles(d) {
    const s = d.summary;
    const hours = s.practice_minutes / 60;
    $('pn-tiles').replaceChildren(
      tile('Estudiantes', fmtInt.format(s.learners),
        d.roster.status === 'ok' ? fmtInt.format(s.with_activity) + ' han practicado' : null),
      tile('Activos (7 días)', fmtInt.format(s.active_7d),
        s.learners ? Math.round(100 * s.active_7d / s.learners) + '% del curso' : null),
      tile('Mejor nota media', pct(s.best_avg), 'en evaluaciones por unidad'),
      tile('Evaluaciones hechas', fmtInt.format(s.quizzes), null),
      tile('Tiempo de práctica', s.practice_minutes < 60 ? fmtInt.format(s.practice_minutes) + ' min'
        : (hours >= 10 ? fmtInt.format(Math.round(hours)) : (Math.round(hours * 10) / 10).toLocaleString('es-EC')) + ' h', 'total del grupo'),
      tile('Notas no enviadas', (s.grades_failed ? '⚠️ ' : '') + fmtInt.format(s.grades_failed),
        s.grades_failed ? 'reintenta desde el detalle del estudiante' : 'todas llegaron a la plataforma', s.grades_failed > 0),
    );
  }

  // ── Render: weekly bars ────────────────────────────────────────────────────
  function niceMax(v) {
    if (v <= 4) return 4;
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
    return 10 * step;
  }

  function weekLabel(w) {
    const start = new Date(w.week_start + 'T00:00:00');
    const end = new Date(start.getTime() + 6 * 86400000);
    return fmtDay.format(start) + ' – ' + fmtDay.format(end);
  }

  function renderWeekly(weeks) {
    const W = Math.max(300, Math.round($('pn-weekly').clientWidth || 720));
    const H = W < 500 ? 180 : 220, m = { l: 34, r: 8, t: 18, b: 30 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = niceMax(Math.max(1, ...weeks.map((w) => w.active_learners)));
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / weeks.length;
    const bw = Math.min(46, band * 0.56);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Estudiantes activos por semana, últimas ' + weeks.length + ' semanas' });

    for (const v of [0, max / 2, max]) {
      svg.append(svgEl('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = svgEl('text', { class: 'axis-label', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
      t.textContent = fmtInt.format(v);
      svg.append(t);
    }
    const peak = Math.max(...weeks.map((w) => w.active_learners));
    weeks.forEach((w, i) => {
      const cx = m.l + band * i + band / 2;
      const g = svgEl('g', {});
      const hit = svgEl('rect', { class: 'hit', x: cx - band / 2, y: m.t, width: band, height: ih });
      g.append(hit);
      if (w.active_learners > 0) {
        const top = y(w.active_learners), x0 = cx - bw / 2, r = Math.min(4, (m.t + ih - top) / 2);
        g.append(svgEl('path', { class: 'bar', d:
          `M${x0},${m.t + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${m.t + ih} Z` }));
        if (i === weeks.length - 1 || w.active_learners === peak) {
          const t = svgEl('text', { class: 'value', x: cx, y: top - 6, 'text-anchor': 'middle' });
          t.textContent = fmtInt.format(w.active_learners);
          g.append(t);
        }
      }
      if (band >= 44 || (weeks.length - 1 - i) % 2 === 0) {  // narrow screens: label every other week (always the last)
        const lab = svgEl('text', { class: 'axis-label', x: cx, y: H - 10, 'text-anchor': 'middle' });
        lab.textContent = fmtDay.format(new Date(w.week_start + 'T00:00:00'));
        g.append(lab);
      }
      withTip(hit, () => [
        'Semana del ' + weekLabel(w),
        fmtInt.format(w.active_learners) + ' estudiantes activos',
        fmtInt.format(w.sessions) + ' actividades',
        'Nota media en evaluaciones: ' + pct(w.quiz_avg),
      ]);
      hit.addEventListener('mouseenter', () => g.classList.add('active'));
      hit.addEventListener('mouseleave', () => g.classList.remove('active'));
      svg.append(g);
    });
    $('pn-weekly').replaceChildren(svg);

    $('pn-weekly-table').replaceChildren(el('table', { class: 'pn-simple' }, [
      el('thead', null, el('tr', null, ['Semana', 'Activos', 'Actividades', 'Nota media eval.'].map((h) => el('th', { text: h })))),
      el('tbody', null, weeks.map((w) => el('tr', null, [
        el('td', { text: weekLabel(w) }), el('td', { text: fmtInt.format(w.active_learners) }),
        el('td', { text: fmtInt.format(w.sessions) }), el('td', { text: pct(w.quiz_avg) }),
      ]))),
    ]));
  }

  // ── Render: learners × units heatmap ───────────────────────────────────────
  function renderLegend() {
    const bins = [['0–19', 1], ['20–39', 2], ['40–54', 3], ['55–69', 4], ['70–84', 5], ['85–100', 6]];
    $('pn-legend').replaceChildren(
      el('span', { text: 'Mejor nota:' }),
      el('span', { class: 'pn-legend-ramp' }, bins.map(([label, b]) => el('span', { class: 's' + b, title: label + '%' }))),
      el('span', { text: '0% → 100%' }),
      el('span', { text: '✔ aprobada' }),
      el('span', { text: '— sin evaluación' }),
    );
  }

  const SORTS = {
    name: (a, b) => a.name.localeCompare(b.name, 'es'),
    last: (a, b) => (b.last_activity || '').localeCompare(a.last_activity || ''),
    units: (a, b) => b.units_passed - a.units_passed || SORTS.name(a, b),
    mastery: (a, b) => (b.mastery_avg ?? -1) - (a.mastery_avg ?? -1) || SORTS.name(a, b),
    inactive: (a, b) => (a.last_activity || '').localeCompare(b.last_activity || '') || SORTS.name(a, b),
  };

  function renderGrid() {
    const d = P.data;
    const q = P.query.trim().toLowerCase();
    const rows = d.learners.filter((r) => !q || r.name.toLowerCase().includes(q)).sort(SORTS[P.sort]);
    $('pn-empty').hidden = d.learners.length > 0;
    $('pn-grid').hidden = d.learners.length === 0;

    const head = el('tr', null, [
      el('th', { text: 'Estudiante' }), el('th', { text: 'Última actividad' }),
      el('th', { text: 'Unidades', title: 'Unidades aprobadas' }), el('th', { text: 'Dominio', title: 'Dominio medio de las señas practicadas' }),
      ...d.units.map((u, i) => el('th', { class: 'u' }, el('abbr', { title: u.title, text: 'U' + (i + 1) }))),
      el('th', { text: 'Notas' }),
    ]);
    const body = rows.map((r) => {
      const cells = d.units.map((u) => {
        const v = r.units[u.id];
        if (!v) return el('td', { class: 'cell none', text: '—' });
        const td = el('td', { class: 'cell s' + bin(v.best), text: Math.round(v.best) + (v.passed ? ' ✔' : '') });
        return withTip(td, () => [r.name, u.title, 'Mejor nota: ' + Math.round(v.best) + '%' + (v.passed ? ' · aprobada' : ' · no aprobada')]);
      });
      const failed = r.grades.failed;
      const active = r.has_activity || r.other_sessions > 0;
      const tr = el('tr', { class: active ? null : 'inactive', tabindex: '0',
        'aria-label': 'Ver detalle de ' + r.name }, [
        el('td', { class: 'who', text: r.name, title: r.user_id ? 'Usuario: ' + r.user_id : null }),
        el('td', { class: 'num', text: active ? ago(r.last_activity) : 'sin actividad',
          title: r.last_activity ? fmtDateTime.format(new Date(r.last_activity)) : null }),
        el('td', { class: 'num', text: r.units_passed + ' / ' + d.units.length }),
        el('td', { class: 'num', text: r.mastery_avg == null ? '—' : Math.round(100 * r.mastery_avg) + '%' }),
        ...cells,
        el('td', null, failed ? el('span', { class: 'pn-flag', text: '⚠️ ' + failed + ' sin enviar' }) : (r.grades.sent ? '✔' : '')),
      ]);
      const open = () => openLearner(r);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      return tr;
    });
    const foot = el('tr', null, [
      el('td', { colspan: '4', text: 'Aprobados / con evaluación' }),
      ...d.units.map((u) => el('td', { text: u.attempted ? u.passed + '/' + u.attempted : '—',
        title: u.best_avg == null ? null : 'Mejor nota media: ' + Math.round(u.best_avg) + '%' })),
      el('td'),
    ]);
    $('pn-grid').replaceChildren(el('thead', null, head), el('tbody', null, body), el('tfoot', null, foot));
  }

  // ── Render: hardest signs ──────────────────────────────────────────────────
  function renderSigns(signs) {
    const top = signs.filter((s) => s.attempts >= 3).slice(0, 10);
    if (!top.length) {
      $('pn-signs').replaceChildren(el('p', { class: 'pn-empty', text: 'Todavía no hay suficientes intentos para comparar señas.' }));
      return;
    }
    $('pn-signs').replaceChildren(...top.map((s) => withTip(el('div', { class: 'pn-bar-row' }, [
      el('span', { class: 'gloss', text: s.gloss }),
      el('div', { class: 'pn-bar-track' }, el('div', { class: 'pn-bar-fill', style: 'width:' + Math.max(1, 100 * s.accuracy) + '%' })),
      el('span', { class: 'val' }, [Math.round(100 * s.accuracy) + '% ', el('small', { text: '(' + s.attempts + ' int.)' })]),
    ]), () => [
      s.gloss,
      Math.round(100 * s.accuracy) + '% de aciertos en ' + fmtInt.format(s.attempts) + ' intentos',
      fmtInt.format(s.learners) + (s.learners === 1 ? ' estudiante' : ' estudiantes'),
      s.avg_response_ms ? 'Tiempo medio al acertar: ' + (s.avg_response_ms / 1000).toFixed(1).replace('.', ',') + ' s' : '',
    ].filter(Boolean))));
  }

  // ── Learner drawer ─────────────────────────────────────────────────────────
  let lastFocus = null;

  function closeDrawer() {
    $('pn-drawer').hidden = true;
    $('pn-drawer-bg').hidden = true;
    hideTip();
    if (lastFocus) lastFocus.focus();
  }

  function gradeCell(s, learner) {
    const g = s.grade;
    if (!g) return '';
    if (g.status === 'sent') return el('span', { class: 'pn-grade-ok', text: '✔ ' + g.score_given + '/100' });
    if (g.status === 'skipped') return el('span', { class: 'au-muted', text: 'ℹ️ se conserva la mejor', title: g.detail });
    return el('span', null, [
      el('span', { class: 'pn-grade-bad', text: '⚠️ no enviada', title: g.detail || '' }),
      el('button', { class: 'au-btn au-btn-ghost pn-retry', type: 'button', onclick: async (e) => {
        e.target.disabled = true;
        try {
          const res = await (await api('/api/panel/sessions/' + s.id + '/grade/retry', { method: 'POST' })).json();
          toast(res.status === 'sent' ? '✔ Nota enviada: ' + res.score_given + '/100' : 'No se pudo enviar: ' + (res.detail || res.status), res.status !== 'sent');
          await load(true);
          openLearner(learner);
        } catch (err) {
          toast(err.message, true);
          e.target.disabled = false;
        }
      } }, '↻ Reintentar'),
    ]);
  }

  async function openLearner(r) {
    if (!r.id) {
      toast(r.name + ' aún no ha abierto el Aula de Señas.');
      return;
    }
    lastFocus = document.activeElement;
    $('pn-d-name').textContent = r.name;
    $('pn-d-sub').textContent = 'Cargando…';
    $('pn-d-body').replaceChildren();
    $('pn-drawer').hidden = false;
    $('pn-drawer-bg').hidden = false;
    $('pn-d-close').focus();
    let d;
    try {
      d = await (await api('/api/panel/learners/' + encodeURIComponent(r.id) + '?language=' + P.data.language)).json();
    } catch (err) {
      $('pn-d-sub').textContent = err.message;
      return;
    }
    const s = d.summary;
    $('pn-d-sub').textContent = (d.learner.user_id ? 'ID en la plataforma: ' + d.learner.user_id + ' · ' : '')
      + 'última actividad: ' + (s.last_activity ? fmtDateTime.format(new Date(s.last_activity)) : '—');

    const chips = el('div', { class: 'pn-chips' }, [
      el('span', { class: 'pn-chip', text: s.units_passed + ' unidades aprobadas' }),
      el('span', { class: 'pn-chip', text: s.signs_mastered + ' de ' + s.signs_practiced + ' señas dominadas' }),
      el('span', { class: 'pn-chip', text: fmtInt.format(s.sessions) + ' actividades' }),
      el('span', { class: 'pn-chip', text: fmtInt.format(s.practice_minutes) + ' min de práctica' }),
    ]);

    const units = d.units.map((u) => el('div', { class: 'pn-unit' }, [
      el('div', { class: 'pn-unit-title', text: u.title + (s.units[u.id] ? ' · mejor evaluación ' + Math.round(s.units[u.id].best) + '%' + (s.units[u.id].passed ? ' ✔' : '') : '') }),
      el('div', { class: 'pn-signs' }, u.signs.map((sg) => {
        if (!sg.attempts) return el('div', { class: 'pn-sign none', title: 'Sin practicar' }, [el('b', { text: sg.gloss }), '—']);
        const m = Math.round(100 * sg.mastery);
        return withTip(el('div', { class: 'pn-sign s' + bin(m) }, [el('b', { text: sg.gloss }), m + '%']), () => [
          sg.gloss, 'Dominio: ' + m + '%', Math.round(100 * sg.accuracy) + '% de aciertos en ' + sg.attempts + ' intentos',
          'Último intento: ' + fmtDateTime.format(new Date(sg.last_attempt_at)),
        ]);
      })),
    ]));

    const sessions = d.sessions.length ? el('table', { class: 'pn-sessions' }, [
      el('thead', null, el('tr', null, ['Fecha', 'Actividad', 'Resultado', 'Min', 'Nota en la plataforma'].map((h) => el('th', { text: h })))),
      el('tbody', null, d.sessions.map((x) => el('tr', null, [
        el('td', { text: fmtDateTime.format(new Date(x.started_at)) }),
        el('td', null, x.no_time_limit ? [x.label + ' ', el('span', { class: 'au-muted', text: '⏱ sin límite de tiempo',
          title: 'El estudiante desactivó el límite de tiempo por seña (opción de accesibilidad del Aula)' })] : x.label),
        el('td', { class: 'num', text: x.ended_at == null ? 'sin terminar' : (x.pct == null ? '—' : x.score + '/' + x.max_score + ' (' + Math.round(x.pct) + '%)') }),
        el('td', { class: 'num', text: x.ended_at == null ? '—' : String(x.minutes).replace('.', ',') }),
        el('td', null, gradeCell(x, r)),
      ]))),
    ]) : el('p', { class: 'au-muted', text: 'Sin actividades en este curso.' });

    const others = (d.other_sessions || []).length ? el('section', null, [
      el('h3', { text: 'Otros módulos' }),
      el('table', { class: 'pn-sessions' }, [
        el('thead', null, el('tr', null, ['Fecha', 'Módulo', 'Actividad', 'Resultado'].map((h) => el('th', { text: h })))),
        el('tbody', null, d.other_sessions.map((x) => el('tr', null, [
          el('td', { text: fmtDateTime.format(new Date(x.started_at)) }),
          el('td', { text: x.module }),
          el('td', { text: x.label }),
          el('td', { class: 'num', text: x.ended_at == null ? 'sin terminar'
            : (x.max_score ? (x.score ?? 0) + '/' + x.max_score + (x.pct == null ? '' : ' (' + Math.round(x.pct) + '%)') : '—') }),
        ]))),
      ]),
    ]) : null;

    $('pn-d-body').replaceChildren(
      chips,
      el('section', null, [el('h3', { text: 'Dominio por seña' }),
        el('p', { class: 'au-muted pn-small', text: 'El dominio pondera más los intentos recientes; desde 80% la seña se considera dominada.' }), ...units]),
      el('section', null, [el('h3', { text: 'Actividades' }), sessions]),
      others || '',
    );
  }

  // ── Render: other modules (installation view only) ─────────────────────────
  function moduleCard(name, href, value, label, notes) {
    return el('div', { class: 'pn-module' }, [
      el('h3', null, [name, el('a', { href, text: 'Abrir' })]),
      el('span', { class: 'pn-tile-value', text: value }),
      el('span', { class: 'pn-tile-label', text: label }),
      ...notes.filter(Boolean).map((n) => el('span', { class: 'pn-tile-note', text: n })),
    ]);
  }

  const plural = (n, one, many) => fmtInt.format(n) + ' ' + (n === 1 ? one : many);

  function renderModules(m) {
    $('pn-modules-card').hidden = !m;
    if (!m) return;
    const game = (x, href, what) => moduleCard(x.name, href,
      x.avg_pct == null ? '—' : Math.round(x.avg_pct) + '%', 'acierto medio en ' + what,
      [plural(x.sessions, 'partida', 'partidas') + ' · ' + plural(x.learners, 'estudiante', 'estudiantes'),
        plural(x.active_7d, 'activo', 'activos') + ' en 7 días',
        x.last_at ? 'última: ' + ago(x.last_at) : 'sin partidas guardadas']);
    const a = m.attendeye;
    $('pn-modules').replaceChildren(
      game(m.gestiedu, '/gestiedu', 'cuestionarios'),
      game(m.motivasign, '/motivasign', 'desafíos'),
      moduleCard(a.name, '/attendeye', a.avg_rate == null ? '—' : Math.round(100 * a.avg_rate) + '%', 'asistencia media',
        [plural(a.rollcalls, 'lista', 'listas') + ' · ' + plural(a.classes, 'clase', 'clases'),
          plural(a.participations, 'intervención', 'intervenciones') + ' en ' + plural(a.participation_sessions, 'sesión', 'sesiones'),
          a.last ? 'última: ' + a.last.class_name + ', ' + a.last.present + '/' + a.last.total + ' (' + ago(a.last.started_at) + ')' : null]),
    );
  }

  // ── Render: lab computers (/diagnostico) ──────────────────────────────────
  const VERDICT = { ok: '✔ Listo', warn: '⚠ Con avisos', fail: '✗ No apto' };
  const CAMERA = { ok: 'Bien', denied: 'Permiso bloqueado', missing: 'No hay cámara', busy: 'En uso por otro programa',
    insecure: 'Sin https', error: 'Error' };

  function issueTitle(code) {
    const known = window.HO && window.HO.Diag && window.HO.Diag.ISSUES[code];
    return known ? known[1] : code;
  }

  function diagLink() {
    const room = $('pn-dev-room').value;
    return location.origin + '/diagnostico' + (room ? '?sala=' + encodeURIComponent(room) : '');
  }

  function renderDevices(d) {
    $('pn-devices-card').hidden = false;
    const sel = $('pn-dev-room');
    const current = sel.value;
    sel.replaceChildren(el('option', { value: '', text: 'Todas' }),
      ...d.rooms.map((r) => el('option', { value: r, text: r, selected: r === current })));
    $('pn-dev-open').href = diagLink();
    $('pn-dev-empty').hidden = d.total > 0;
    $('pn-dev-tiles').hidden = $('pn-dev-table').hidden = !d.total;
    if (!d.total) return;
    $('pn-dev-tiles').replaceChildren(
      tile('Equipos probados', fmtInt.format(d.total), plural(d.checks, 'prueba', 'pruebas')),
      tile('Listos', '✔ ' + fmtInt.format(d.ok), null),
      tile('Con avisos', '⚠ ' + fmtInt.format(d.warn), d.warn ? 'funcionan; ver detalle' : null),
      tile('No aptos', '✗ ' + fmtInt.format(d.fail), d.fail ? 'resolver antes de la clase' : null, d.fail > 0),
      tile('Cámara a la primera', Math.round(100 * d.camera_first_try / d.total) + '%',
        fmtInt.format(d.camera_first_try) + ' de ' + fmtInt.format(d.total) + ' equipos'),
      tile('Velocidad mediana', d.median_fps == null ? '—' : Math.round(d.median_fps) + ' cuadros/s', 'fluido desde 15'),
    );
    const head = el('tr', null, ['Sala', 'Puesto', 'Resultado', 'Navegador', 'Cámara', 'Motor', 'Velocidad', 'Avisos', 'Probado']
      .map((h) => el('th', { scope: 'col', text: h })));
    const rows = d.stations.map((s) => el('tr', { class: 'pn-dev-' + s.verdict }, [
      el('td', { text: s.room || '—' }),
      el('td', { text: s.station || '—' }),
      el('td', { class: 'pn-dev-verdict', text: VERDICT[s.verdict] }),
      el('td', { text: [s.browser, s.os].filter(Boolean).join(' · ') || '—' }),
      el('td', { text: (CAMERA[s.camera] || s.camera) + (s.attempts > 1 && !s.camera_first_try ? ' (no a la primera)' : '') }),
      el('td', { text: s.engine === 'browser' ? (s.device === 'GPU' ? 'Tarjeta gráfica' : 'Procesador') : s.engine === 'server' ? 'Servidor' : s.engine === 'none' ? 'No cargó' : '—' }),
      el('td', { text: s.fps == null ? '—' : Math.round(s.fps) + ' c/s' }),
      el('td', { class: 'pn-small', text: s.issues.map(issueTitle).join('; ') || '—' }),
      el('td', { text: ago(s.created_at), title: fmtDateTime.format(new Date(s.created_at)) }),
    ]));
    $('pn-dev-table').replaceChildren(el('thead', null, head), el('tbody', null, rows));
  }

  async function loadDevices() {
    const room = $('pn-dev-room').value;
    try {
      renderDevices(await (await api('/api/panel/devices?days=7' + (room ? '&room=' + encodeURIComponent(room) : ''))).json());
    } catch (_) {
      $('pn-devices-card').hidden = true;     // an optional card never breaks the panel
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  function render() {
    const d = P.data;
    renderHeader(d);
    renderTiles(d);
    renderWeekly(d.weekly);
    renderLegend();
    renderGrid();
    renderSigns(d.signs);
    renderModules(d.modules);
  }

  async function load(quiet) {
    if (!quiet) $('pn-loading').hidden = false;
    try {
      P.data = await (await api('/api/panel/overview?language=lsec')).json();
      $('pn-access').hidden = true;
      $('pn-content').hidden = false;
      render();
      loadDevices();
    } catch (err) {
      $('pn-content').hidden = true;
      if (err.status === 401 && !P.lti) {
        $('pn-access').hidden = false;
        try { if (sessionStorage.getItem(SS_ADMIN)) toast('Token de administrador inválido', true); } catch (_) { /* */ }
      } else {
        $('pn-access').hidden = true;
        $('pn-loading').hidden = false;
        $('pn-loading').textContent = '⚠️ ' + err.message;
        return;
      }
    }
    $('pn-loading').hidden = true;
  }

  async function exportCsv() {
    try {
      const res = await api('/api/panel/export.csv?language=lsec&tz=' + (-new Date().getTimezoneOffset()));
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'progreso.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = el('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function init() {
    P.lti = readLtiToken();
    if (P.lti) {
      $('pn-back').href = '/aula';
      $('pn-back').textContent = '← Aula de Señas';
    }
    $('pn-access-form').addEventListener('submit', (e) => {
      e.preventDefault();
      try { sessionStorage.setItem(SS_ADMIN, $('pn-admin').value.trim()); } catch (_) { /* */ }
      load();
    });
    $('pn-refresh').addEventListener('click', () => load(true).then(() => toast('Datos actualizados')));
    $('pn-export').addEventListener('click', exportCsv);
    $('pn-dev-room').addEventListener('change', loadDevices);
    $('pn-dev-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(diagLink()); toast('Enlace copiado: ábrelo en cada equipo'); } catch (_) { toast(diagLink()); }
    });
    $('pn-search').addEventListener('input', (e) => { P.query = e.target.value; renderGrid(); });
    $('pn-sort').addEventListener('change', (e) => { P.sort = e.target.value; renderGrid(); });
    $('pn-d-close').addEventListener('click', closeDrawer);
    $('pn-drawer-bg').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      const drawer = $('pn-drawer');
      if (drawer.hidden) return;
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key !== 'Tab') return;
      // Modal dialog: keep Tab inside it (aria-modal; WCAG 2.4.3).
      const items = Array.from(drawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((x) => !x.disabled && x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    let resizeTimer = null;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (P.data && !$('pn-content').hidden) renderWeekly(P.data.weekly); }, 150);
    });
    load();
  }

  if (typeof document !== 'undefined') init();
})();
