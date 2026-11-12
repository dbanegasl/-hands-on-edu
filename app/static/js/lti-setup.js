/**
 * LTI 1.3 setup page (REQ-019): shows the tool URLs to paste into Moodle and
 * registers the Moodle site (issuer, client ID, deployment ID, endpoints).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SS_ADMIN = 'ho.admin.token';

  function toast(msg, isError) {
    const el = $('au-toast');
    el.textContent = msg;
    el.className = 'au-toast' + (isError ? ' error' : '');
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function adminToken() {
    const v = $('ls-admin').value.trim();
    try { if (v) sessionStorage.setItem(SS_ADMIN, v); } catch (_) { /* */ }
    return v;
  }

  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json' };
    const t = adminToken();
    if (t) headers['X-Admin-Token'] = t;
    const res = await fetch(path, Object.assign({ headers: headers }, opts || {}));
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((body && (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail))) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function kv(dl, label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    const code = document.createElement('code');
    code.textContent = value;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'au-btn au-btn-ghost';
    copy.textContent = 'Copiar';
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => toast('Copiado'), () => toast('No se pudo copiar', true));
    });
    dd.append(code, copy);
    dl.append(dt, dd);
  }

  async function loadConfig() {
    const cfg = await api('/api/lti/tool-config');
    const dl = $('ls-config');
    dl.innerHTML = '';
    kv(dl, 'Nombre de la herramienta', cfg.title);
    kv(dl, 'URL de la herramienta', cfg.tool_url);
    kv(dl, 'Conjunto de claves públicas (keyset URL)', cfg.jwks_url);
    kv(dl, 'URL de inicio de sesión (Initiate login URL)', cfg.initiate_login_url);
    kv(dl, 'URI(s) de redirección', cfg.redirection_uris.join('\n'));
    kv(dl, 'URL de selección de contenido (Deep Linking)', cfg.deep_linking_url);
  }

  async function loadPlatforms() {
    const ul = $('ls-platforms');
    ul.innerHTML = '';
    let rows;
    try {
      rows = await api('/api/lti/platforms');
    } catch (err) {
      const li = document.createElement('li');
      li.className = 'au-muted';
      li.textContent = err.status === 401 ? 'Escribe el token de administrador para ver las plataformas.' : err.message;
      ul.appendChild(li);
      return;
    }
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'au-muted';
      li.textContent = 'Aún no hay plataformas registradas.';
      ul.appendChild(li);
    }
    for (const p of rows) {
      const li = document.createElement('li');
      const info = document.createElement('span');
      info.textContent = '🎓 ' + p.name + ' — ' + p.issuer + ' · client ' + p.client_id + ' · despliegues: ' + (p.deployment_ids.join(', ') || '—');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'au-btn au-btn-ghost';
      del.textContent = '🗑 Quitar';
      del.addEventListener('click', async () => {
        if (!confirm('¿Quitar ' + p.name + '? Los estudiantes no podrán entrar desde esa plataforma.')) return;
        try { await api('/api/lti/platforms/' + p.id, { method: 'DELETE' }); loadPlatforms(); } catch (err) { toast(err.message, true); }
      });
      li.append(info, del);
      ul.appendChild(li);
    }
  }

  function prefill() {
    const raw = $('ls-moodle').value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(raw)) return;
    $('ls-issuer').value = raw;
    $('ls-auth').value = raw + '/mod/lti/auth.php';
    $('ls-token').value = raw + '/mod/lti/token.php';
    $('ls-jwks').value = raw + '/mod/lti/certs.php';
    if (!$('ls-name').value) $('ls-name').value = 'Moodle ' + raw.replace(/^https?:\/\//, '');
  }

  async function register(e) {
    e.preventDefault();
    try {
      await api('/api/lti/platforms', {
        method: 'POST',
        body: JSON.stringify({
          name: $('ls-name').value.trim(),
          issuer: $('ls-issuer').value.trim(),
          client_id: $('ls-client').value.trim(),
          auth_login_url: $('ls-auth').value.trim(),
          auth_token_url: $('ls-token').value.trim(),
          jwks_url: $('ls-jwks').value.trim(),
          deployment_ids: [$('ls-deployment').value.trim()],
        }),
      });
      toast('✔ Plataforma registrada. Ya puedes agregar la actividad en un curso.');
      loadPlatforms();
    } catch (err) {
      toast(err.status === 401 ? 'Token de administrador inválido' : err.message, true);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { $('ls-admin').value = sessionStorage.getItem(SS_ADMIN) || ''; } catch (_) { /* */ }
    $('ls-moodle').addEventListener('input', prefill);
    $('ls-admin').addEventListener('change', loadPlatforms);
    $('ls-form').addEventListener('submit', register);
    loadConfig().catch((err) => toast(err.message, true));
    loadPlatforms();
  });
})();
