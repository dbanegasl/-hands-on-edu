/* Privacidad y tus datos (REQ-021): the notice's institution data, and the
 * learner's own rights on this device — download or delete each local profile
 * (ho.aula.profiles, X-Learner-Token) and the Moodle account of this tab
 * (ho.lti.token, Authorization: Bearer). DOM-free helpers are exported for node. */
(function (root) {
  'use strict';

  const LS_PROFILES = 'ho.aula.profiles';
  const LS_CURRENT = 'ho.aula.current';
  const SS_LTI = 'ho.lti.token';

  function readJSON(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  }

  /** Local profiles of this browser, as the Aula and the games keep them. */
  function profilesOnDevice(storage) {
    const list = readJSON(storage, LS_PROFILES, []);
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string') : [];
  }

  /** Remove a profile from this browser (after deleting it, or when it is no longer ours). */
  function forgetProfile(storage, id) {
    const left = profilesOnDevice(storage).filter((p) => p.id !== id);
    try {
      storage.setItem(LS_PROFILES, JSON.stringify(left));
      if (readJSON(storage, LS_CURRENT, null) === id) storage.removeItem(LS_CURRENT);
    } catch (_) { /* storage blocked */ }
    return left;
  }

  function retentionText(days) {
    if (!days) return null;
    if (days % 365 === 0) {
      const y = days / 365;
      return y === 1 ? 'un año' : y + ' años';
    }
    return days + ' días';
  }

  const api = { profilesOnDevice, forgetProfile, retentionText };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  // ── Page ────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const ls = root.localStorage;
  let ss = null;
  try { ss = root.sessionStorage; } catch (_) { /* blocked */ }

  function status(msg, ok) {
    const el = $('pv-status');
    el.textContent = msg;
    el.className = 'pv-status ' + (ok ? 'pv-ok' : 'pv-err');
  }

  function text(tag, content, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = content;
    return el;
  }

  async function loadInfo() {
    let info;
    try { info = await (await fetch('/api/privacy')).json(); } catch (_) { return; }
    if (info.controller) {
      const p = $('pv-controller');
      p.textContent = 'Responsable: ';
      p.appendChild(text('strong', info.controller));
      p.appendChild(document.createTextNode('.'));
    }
    if (info.contact) {
      const p = $('pv-contact');
      p.textContent = 'Contacto de privacidad: ';
      p.appendChild(text('strong', info.contact));
      p.appendChild(document.createTextNode('. Si perdiste el acceso a tu perfil (por ejemplo, porque borraste los datos del navegador), pueden descargarlo o borrarlo por ti.'));
    }
    const span = retentionText(info.retention_days);
    if (span) {
      $('pv-retention').textContent = 'Mientras uses la plataforma. Los datos de quien pasa ' + span
        + ' sin actividad se borran. También puedes pedir que se borren antes.';
    }
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** One row with Descargar / Borrar for an account (local profile or Moodle). */
  function row(account) {
    const li = document.createElement('li');
    li.className = 'pv-profile';
    const name = text('span', account.name || 'Perfil sin nombre', 'pv-profile-name');
    name.appendChild(text('small', account.label));
    li.appendChild(name);

    if (!account.headers) {
      li.appendChild(text('span', 'Ábrelo una vez en el Aula de Señas para poder gestionarlo desde aquí.', 'pv-muted pv-small'));
      return li;
    }
    const get = text('button', 'Descargar', 'pv-btn');
    const del = text('button', 'Borrar', 'pv-btn pv-btn-danger');
    get.type = del.type = 'button';
    get.setAttribute('aria-label', 'Descargar los datos de ' + account.name);
    del.setAttribute('aria-label', 'Borrar los datos de ' + account.name);
    li.append(get, del);

    get.addEventListener('click', async () => {
      get.disabled = true;
      try {
        const res = await fetch('/api/learners/' + encodeURIComponent(account.id) + '/export', { headers: account.headers });
        if (!res.ok) throw res;
        const cd = res.headers.get('Content-Disposition') || '';
        const m = /filename="([^"]+)"/.exec(cd);
        download(await res.blob(), m ? m[1] : 'handsonedu-mis-datos.json');
        status('✔ Datos de ' + account.name + ' descargados.', true);
      } catch (err) {
        failed(err, account, li);
      } finally { get.disabled = false; }
    });

    del.addEventListener('click', async () => {
      const extra = account.lti ? '\n\nLas notas que ya están en Moodle no se borran desde aquí.' : '';
      if (!root.confirm('¿Borrar para siempre el perfil «' + account.name + '» y todos sus resultados?' + extra)) return;
      del.disabled = get.disabled = true;
      try {
        const res = await fetch('/api/learners/' + encodeURIComponent(account.id), { method: 'DELETE', headers: account.headers });
        if (!res.ok && res.status !== 404) throw res;
        account.forget();
        li.remove();
        status('✔ Se borraron los datos de ' + account.name + '.', true);
        refreshEmpty();
      } catch (err) {
        del.disabled = get.disabled = false;
        failed(err, account, li);
      }
    });
    return li;
  }

  function failed(err, account, li) {
    const code = err && err.status;
    if (code === 403 || code === 404) {
      account.forget();
      li.remove();
      refreshEmpty();
      status('Ese perfil ya no pertenece a este equipo y se quitó de la lista. Si necesitas sus datos, escribe al contacto de privacidad.', false);
    } else if (code === 401 && account.lti) {
      status('Tu sesión de Moodle expiró: vuelve a abrir la actividad desde Moodle y entra de nuevo aquí.', false);
    } else {
      status('No se pudo completar. Revisa tu conexión e inténtalo de nuevo.', false);
    }
  }

  function refreshEmpty() {
    $('pv-mine-empty').hidden = $('pv-mine-list').children.length > 0;
  }

  async function moodleAccount() {
    const token = ss && ss.getItem(SS_LTI);
    if (!token) return null;
    const headers = { Authorization: 'Bearer ' + token };
    try {
      const res = await fetch('/api/lti/me', { headers });
      if (!res.ok) return null;
      const me = await res.json();
      const l = me.launch || {};
      return {
        id: me.learner.id, name: me.learner.display_name, headers, lti: true,
        label: 'Tu cuenta de ' + (l.platform || 'Moodle') + (l.context_title ? ' · ' + l.context_title : ''),
        forget: () => { try { ss.removeItem(SS_LTI); } catch (_) { /* */ } },
      };
    } catch (_) { return null; }
  }

  async function init() {
    loadInfo();
    const list = $('pv-mine-list');
    const lti = await moodleAccount();
    if (lti) list.appendChild(row(lti));
    for (const p of profilesOnDevice(ls)) {
      list.appendChild(row({
        id: p.id, name: p.name, label: 'Perfil guardado en este navegador',
        headers: p.token ? { 'X-Learner-Token': p.token } : null,
        forget: () => forgetProfile(ls, p.id),
      }));
    }
    refreshEmpty();
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
