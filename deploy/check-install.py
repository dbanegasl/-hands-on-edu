#!/usr/bin/env python3
"""
Comprobación de una instalación de HandsOnEdu antes del piloto.

Revisa lo que suele fallar en un piloto: HTTPS y certificado, PUBLIC_BASE_URL,
ADMIN_TOKEN, claves LTI, tipos MIME del motor de manos, límite de subida del
proxy, WebSocket, hora del servidor y, con --moodle, que Moodle sea alcanzable
y esté registrado. Solo usa la biblioteca estándar de Python (3.8 o superior).

  # Desde cualquier equipo (p. ej. el de TI):
  python3 check-install.py https://senas.miescuela.edu.ec --moodle https://moodle.miescuela.edu.ec
  ADMIN_TOKEN=… python3 check-install.py https://senas.miescuela.edu.ec    # comprueba también el token

  # Desde el servidor de HandsOnEdu, para probar que ÉL llega a Moodle (carpeta deploy/):
  docker compose exec -T hands-on-edu python - https://senas.miescuela.edu.ec --moodle https://moodle.miescuela.edu.ec < check-install.py

Termina con código 1 si alguna comprobación falla (✗); los avisos (⚠) no.
"""
import argparse
import base64
import email.utils
import http.client
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MIN_SECURE_VERSION = (0, 17, 0)      # learner data needs a credential (TD-013)
CLOCK_FAIL_S, CLOCK_WARN_S = 60, 20  # LTI id_token leeway is 60 s
BODY_PROBE_BYTES = 3 * 1024 * 1024   # template imports are several MB


# ── Pure helpers (unit-tested) ───────────────────────────────────────────────

def normalize_base(url):
    """'https://Host:443/x/' → 'https://host/x' (no default port, no trailing slash)."""
    parts = urllib.parse.urlsplit(url.strip())
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    port = parts.port
    if port and not ((scheme == "https" and port == 443) or (scheme == "http" and port == 80)):
        host = "{}:{}".format(host, port)
    return "{}://{}{}".format(scheme, host, parts.path.rstrip("/"))


def parse_version(text):
    try:
        return tuple(int(x) for x in str(text).split(".")[:3])
    except ValueError:
        return None


def camera_allowed(permissions_policy):
    """False only if a Permissions-Policy header explicitly denies the camera to the page itself."""
    if not permissions_policy:
        return True
    for directive in permissions_policy.split(","):
        name, _, allow = directive.strip().partition("=")
        if name.strip().lower() == "camera":
            allow = allow.strip()
            return "self" in allow or allow == "*" or "*" in allow.split()
    return True


def clock_skew(date_header, now=None):
    """Seconds between an HTTP Date header and `now` (positive: the server is ahead)."""
    if not date_header:
        return None
    try:
        then = email.utils.parsedate_to_datetime(date_header).timestamp()
    except (TypeError, ValueError):
        return None
    return then - (time.time() if now is None else now)


# ── HTTP ─────────────────────────────────────────────────────────────────────

class Unreachable(Exception):
    pass


def fetch(url, method="GET", data=None, headers=None, timeout=20):
    """(status, headers, body bytes); HTTP errors are returned, network errors raise Unreachable."""
    req = urllib.request.Request(url, data=data, method=method, headers=dict(headers or {}))
    req.add_header("User-Agent", "handsonedu-check-install")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, ssl.SSLCertVerificationError):
            raise Unreachable("certificado HTTPS no válido: {}".format(reason.verify_message or reason))
        raise Unreachable(str(reason))
    except (socket.timeout, TimeoutError):
        raise Unreachable("no responde en {} s".format(timeout))
    except (ConnectionError, http.client.HTTPException, OSError) as e:
        raise Unreachable(str(e))


def websocket_upgrade(base, path="/ws/analyze", timeout=15):
    """HTTP status of a WebSocket handshake (101 = the proxy lets WebSockets through)."""
    parts = urllib.parse.urlsplit(base)
    conn_cls = http.client.HTTPSConnection if parts.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(parts.hostname, parts.port, timeout=timeout)
    try:
        conn.request("GET", parts.path.rstrip("/") + path, headers={
            "Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": base64.b64encode(os.urandom(16)).decode(),
        })
        return conn.getresponse().status
    finally:
        conn.close()


# ── Report ───────────────────────────────────────────────────────────────────

class Report:
    def __init__(self, out=None):
        self._out, self.fails, self.warns = out, 0, 0

    @property
    def out(self):
        return self._out or sys.stdout

    def section(self, title):
        print("\n" + title, file=self.out)

    def ok(self, msg):
        print("  ✔ " + msg, file=self.out)

    def warn(self, msg, fix=None):
        self.warns += 1
        print("  ⚠ " + msg + ("\n      → " + fix if fix else ""), file=self.out)

    def fail(self, msg, fix=None):
        self.fails += 1
        print("  ✗ " + msg + ("\n      → " + fix if fix else ""), file=self.out)


# ── Checks ───────────────────────────────────────────────────────────────────

def check_site(r, base, admin_token, allow_http):
    r.section("HandsOnEdu · " + base)
    if base.startswith("https://"):
        pass  # reported once /health answers over a verified certificate
    elif allow_http:
        r.warn("Sin HTTPS (permitido con --allow-http: solo para pruebas locales)")
    else:
        r.fail("La dirección no usa HTTPS", "Sin HTTPS el navegador no da la cámara y Moodle no acepta la herramienta (deployment.md, «Proxy HTTPS»)")

    try:
        status, headers, body = fetch(base + "/health")
    except Unreachable as e:
        cert = str(e).startswith("certificado")
        r.fail("No se puede abrir {}/health: {}".format(base, e),
               "Renueva o corrige el certificado del proxy (Let's Encrypt: comprueba la renovación automática)" if cert
               else "Revisa DNS, el proxy y que el servicio esté en marcha (docker compose ps)")
        return None
    if base.startswith("https://"):
        r.ok("HTTPS con certificado válido")
    if status != 200:
        r.fail("/health responde HTTP {}".format(status), "docker compose logs --tail=50")
        return None
    version = json.loads(body).get("version", "?")
    r.ok("HandsOnEdu {} en marcha".format(version))
    v = parse_version(version)
    if v and v < MIN_SECURE_VERSION:
        r.warn("La versión {} no protege los datos de cada estudiante con credencial".format(version),
               "Actualiza a la última versión: ./deploy.sh <versión>")
    skew = clock_skew(headers.get("Date"))
    if skew is not None and abs(skew) > CLOCK_WARN_S:
        r.warn("La hora del servidor difiere {:+.0f} s de la de este equipo".format(skew),
               "Activa la sincronización de hora (NTP) en el servidor; con más de 60 s Moodle no puede iniciar sesión")
    site_date = headers.get("Date")

    try:
        _, _, body = fetch(base + "/api/lti/tool-config")
        login = json.loads(body).get("initiate_login_url", "")
        configured = normalize_base(login[: -len("/lti/login")]) if login.endswith("/lti/login") else login
        if configured == normalize_base(base):
            r.ok("PUBLIC_BASE_URL coincide con la dirección pública")
        else:
            r.fail("PUBLIC_BASE_URL es «{}», pero se accede por «{}»".format(configured, normalize_base(base)),
                   "Corrige PUBLIC_BASE_URL en .env (sin / final) y reinicia: Moodle usaría URLs equivocadas")
    except (Unreachable, ValueError) as e:
        r.fail("No se pudo leer /api/lti/tool-config: {}".format(e))

    try:
        _, _, body = fetch(base + "/lti/jwks")
        keys = json.loads(body).get("keys", [])
        if keys and keys[0].get("kty") == "RSA":
            r.ok("Claves LTI publicadas en /lti/jwks")
        else:
            r.fail("/lti/jwks no publica una clave RSA", "docker compose logs: la clave se crea al primer arranque")
    except (Unreachable, ValueError) as e:
        r.fail("No se pudo leer /lti/jwks: {}".format(e))

    platforms = None
    try:
        status, _, body = fetch(base + "/api/lti/platforms")
        if status == 401:
            r.ok("Las acciones de administración exigen ADMIN_TOKEN")
        elif status == 200:
            platforms = json.loads(body)
            r.fail("ADMIN_TOKEN está vacío: cualquiera puede registrar plataformas, plantillas y modelos",
                   "Define ADMIN_TOKEN en .env (openssl rand -hex 32) y reinicia")
        else:
            r.warn("/api/lti/platforms responde HTTP {}".format(status))
        if admin_token:
            status, _, body = fetch(base + "/api/lti/platforms", headers={"X-Admin-Token": admin_token})
            if status == 200:
                platforms = json.loads(body)
                r.ok("El ADMIN_TOKEN indicado es correcto ({} plataforma(s) LMS registrada(s))".format(len(platforms)))
            else:
                r.fail("El ADMIN_TOKEN indicado no es el del servidor (HTTP {})".format(status),
                       "Usa el valor de ADMIN_TOKEN del .env del servidor")
    except (Unreachable, ValueError) as e:
        r.fail("No se pudo comprobar la protección de administración: {}".format(e))

    try:
        _, headers, _ = fetch(base + "/aula")
        if camera_allowed(headers.get("Permissions-Policy")):
            r.ok("La política de permisos deja usar la cámara")
        else:
            r.fail("La cabecera Permissions-Policy bloquea la cámara: «{}»".format(headers.get("Permissions-Policy")),
                   "En el proxy usa: Permissions-Policy \"camera=(self)\"")
    except Unreachable as e:
        r.fail("No se pudo abrir /aula: {}".format(e))

    assets = [
        ("/vendor/mediapipe/vision_bundle.mjs", "javascript", True, "módulo JS de MediaPipe"),
        ("/vendor/mediapipe/wasm/vision_wasm_internal.wasm", "application/wasm", False, "WASM de MediaPipe"),
        ("/models/hand_landmarker.task", None, True, "modelo de manos"),
    ]
    for path, ctype, required, label in assets:
        try:
            status, headers, body = fetch(base + path, timeout=60)
        except Unreachable as e:
            r.fail("No se pudo descargar el {}: {}".format(label, e))
            continue
        got = (headers.get("Content-Type") or "").lower()
        if status != 200 or len(body) < 1000:
            r.fail("El {} no se sirve (HTTP {}, {} bytes)".format(label, status, len(body)),
                   "La imagen lo incluye: revisa que el proxy reenvíe {} a HandsOnEdu".format(path.rsplit("/", 1)[0] + "/"))
        elif ctype and ctype not in got:
            msg = "El {} llega como «{}» (se espera {})".format(label, got or "sin tipo", ctype)
            fix = "El proxy está cambiando el Content-Type: no lo sobrescribas para /vendor/"
            (r.fail if required else r.warn)(msg, fix)
        else:
            r.ok("{} ({:.1f} MB, {})".format(label[0].upper() + label[1:], len(body) / 1e6, got.split(";")[0] or "ok"))

    try:
        payload = json.dumps({"padding": "x" * BODY_PROBE_BYTES}).encode()
        status, _, _ = fetch(base + "/api/signs/lsec/templates/import", "POST", payload,
                             {"Content-Type": "application/json"}, timeout=60)
        if status == 413:
            r.warn("El proxy rechaza peticiones de {} MB (HTTP 413)".format(BODY_PROBE_BYTES // 2**20),
                   "Importar plantillas en el Estudio fallará: client_max_body_size 20m (Nginx) o request_body max_size 20MB (Caddy)")
        elif status in (401, 422):
            r.ok("El proxy admite subidas de {} MB (importar plantillas)".format(BODY_PROBE_BYTES // 2**20))
        else:
            r.warn("Una subida de {} MB respondió HTTP {}".format(BODY_PROBE_BYTES // 2**20, status))
    except Unreachable as e:
        r.warn("Una subida de {} MB falló: {}".format(BODY_PROBE_BYTES // 2**20, e),
               "Revisa el límite de tamaño y los tiempos del proxy")

    try:
        status = websocket_upgrade(base)
        if status == 101:
            r.ok("El proxy deja pasar WebSocket (motor de respaldo ?engine=server)")
        else:
            r.warn("WebSocket /ws/analyze responde HTTP {} en vez de 101".format(status),
                   "Solo afecta al motor de respaldo en el servidor; en Nginx añade el bloque location /ws/ de deployment.md")
    except (OSError, http.client.HTTPException) as e:
        r.warn("No se pudo probar WebSocket: {}".format(e))
    return {"date": site_date, "platforms": platforms}


def check_moodle(r, moodle, site):
    r.section("Moodle · " + moodle)
    try:
        status, headers, body = fetch(moodle + "/mod/lti/certs.php")
        keys = json.loads(body).get("keys", []) if status == 200 else []
        if keys:
            r.ok("Moodle publica sus claves LTI (/mod/lti/certs.php)")
        else:
            r.fail("/mod/lti/certs.php responde HTTP {} sin claves".format(status),
                   "¿Es la URL raíz de Moodle? ¿LTI 1.3 está habilitado (mod_lti)?")
    except (Unreachable, ValueError) as e:
        r.fail("No se llega a Moodle desde aquí: {}".format(e),
               "Si esto se ejecuta en el servidor de HandsOnEdu, revisa firewall/DNS de salida (03 §2)")
        return
    if site and site.get("date"):
        moodle_skew = clock_skew(headers.get("Date"), now=email.utils.parsedate_to_datetime(site["date"]).timestamp())
        if moodle_skew is not None:
            if abs(moodle_skew) > CLOCK_FAIL_S:
                r.fail("Las horas de Moodle y HandsOnEdu difieren {:+.0f} s".format(moodle_skew),
                       "Con más de 60 s el inicio de sesión LTI falla: activa NTP en ambos servidores")
            elif abs(moodle_skew) > CLOCK_WARN_S:
                r.warn("Las horas de Moodle y HandsOnEdu difieren {:+.0f} s (tolerancia 60 s)".format(moodle_skew),
                       "Activa NTP en ambos servidores")
            else:
                r.ok("Hora sincronizada con HandsOnEdu ({:+.0f} s)".format(moodle_skew))
    try:
        status, _, _ = fetch(moodle + "/mod/lti/token.php", "POST", b"", {"Content-Type": "application/x-www-form-urlencoded"})
        if status in (400, 401, 405):
            r.ok("El servicio de tokens de Moodle responde (necesario para enviar notas)")
        else:
            r.warn("/mod/lti/token.php responde HTTP {}".format(status))
    except Unreachable as e:
        r.fail("No se llega a /mod/lti/token.php: {}".format(e), "Sin esto las notas no llegan a Moodle")
    platforms = (site or {}).get("platforms")
    if platforms is not None:
        if any(normalize_base(p.get("issuer", "")) == normalize_base(moodle) for p in platforms):
            r.ok("Este Moodle está registrado en HandsOnEdu")
        else:
            r.warn("Este Moodle aún no está registrado en HandsOnEdu",
                   "Regístralo en /lti/setup con los datos de la herramienta en Moodle (03 §4)")


def main(argv=None):
    p = argparse.ArgumentParser(description="Comprobación de HandsOnEdu antes del piloto",
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    p.add_argument("url", help="Dirección pública de HandsOnEdu, p. ej. https://senas.miescuela.edu.ec")
    p.add_argument("--moodle", help="URL raíz de Moodle, p. ej. https://moodle.miescuela.edu.ec")
    p.add_argument("--admin-token", default=os.environ.get("ADMIN_TOKEN"),
                   help="Comprueba también ADMIN_TOKEN (por defecto, la variable de entorno ADMIN_TOKEN)")
    p.add_argument("--allow-http", action="store_true", help="Aceptar http:// (solo pruebas locales)")
    p.add_argument("--skip-site", action="store_true", help="Probar solo Moodle")
    args = p.parse_args(argv)

    r = Report()
    base = args.url.rstrip("/")
    site = None if args.skip_site else check_site(r, base, args.admin_token, args.allow_http)
    if args.moodle:
        check_moodle(r, args.moodle.rstrip("/"), site)
    print("\n{} fallo(s), {} aviso(s).".format(r.fails, r.warns))
    if r.fails:
        print("Corrige los ✗ antes del piloto. Guía: docs/onboarding/03-moodle-institucional.md")
    return 1 if r.fails else 0


if __name__ == "__main__":
    sys.exit(main())
