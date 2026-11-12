/**
 * LTI Deep Linking (REQ-019): the teacher picks which Aula units the LMS
 * activity opens. The server signs the LtiDeepLinkingResponse; this page posts
 * it back to the LMS with an auto-submitted form (as the spec requires).
 */
(function () {
  'use strict';

  const LANG = 'lsec';
  const $ = (id) => document.getElementById(id);
  let token = null;

  function fail(msg) {
    const el = $('dl-error');
    el.hidden = false;
    el.textContent = '⚠️ ' + msg;
    $('dl-form').hidden = true;
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    }, opts || {}));
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail))) || res.statusText);
    return body;
  }

  function refresh() {
    const any = $('dl-course').checked || document.querySelector('#dl-units input:checked');
    $('dl-submit').disabled = !any;
  }

  async function boot() {
    const m = /(?:^|[#&])lti=([^&]+)/.exec(location.hash);
    token = m ? m[1] : null;
    history.replaceState(null, '', location.pathname);
    if (!token) return fail('Abre esta página desde tu plataforma educativa (Moodle → Agregar actividad → HandsOnEdu).');

    let me, catalog, templates;
    try {
      [me, catalog, templates] = await Promise.all([
        api('/api/lti/me'), api('/api/signs/' + LANG + '/catalog'), api('/api/signs/' + LANG + '/templates'),
      ]);
    } catch (err) {
      return fail(err.message);
    }
    if (me.launch.message_type !== 'LtiDeepLinkingRequest') return fail('Este enlace no es una selección de contenido.');
    $('dl-context').textContent = [me.launch.platform, me.launch.context_title].filter(Boolean).join(' · ');

    const rec = new HO.Signs.SignRecognizer({ catalog: catalog, templates: templates });
    const status = HO.Curriculum.unitStatus(catalog, rec, {}, new Set(), { unlockAll: true });
    const box = $('dl-units');
    status.forEach((st, i) => {
      const label = document.createElement('label');
      label.className = 'au-check au-check-card';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = st.unit.id;
      input.addEventListener('change', refresh);
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = 'Unidad ' + (i + 1) + ': ' + st.unit.title;
      const small = document.createElement('small');
      small.textContent = st.unit.signs.map((id) => (rec.signs[id] || {}).gloss || id).join(' · ')
        + (st.playable ? (st.pending.length ? ' — ' + st.pending.length + ' seña(s) aún sin grabación' : '')
          : ' — ⏳ Próximamente: necesita grabaciones en el Estudio de Señas');
      text.append(strong, small);
      label.append(input, text);
      box.appendChild(label);
    });
    $('dl-course').addEventListener('change', refresh);
    $('dl-form').hidden = false;
  }

  async function submit(e) {
    e.preventDefault();
    $('dl-submit').disabled = true;
    try {
      const out = await api('/api/lti/deeplink', {
        method: 'POST',
        body: JSON.stringify({
          language: LANG,
          course: $('dl-course').checked,
          graded: $('dl-graded').checked,
          units: [...document.querySelectorAll('#dl-units input:checked')].map((i) => i.value),
        }),
      });
      const form = $('dl-return');
      form.action = out.return_url;
      $('dl-jwt').value = out.jwt;
      form.submit();
    } catch (err) {
      const t = $('au-toast');
      t.hidden = false;
      t.className = 'au-toast error';
      t.textContent = err.message;
      refresh();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('dl-form').addEventListener('submit', submit);
    boot();
  });
})();
