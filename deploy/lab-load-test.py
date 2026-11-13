#!/usr/bin/env python3
"""
Lab load test: N computers open the Aula at the same time (stdlib only).

Downloads what a browser downloads the first time it opens a page (HTML,
CSS/JS, the MediaPipe hand engine and model, catalog, templates, model) from N
threads at once, while measuring how fast /health still answers. Then repeats
as a browser with that cache would (fresh → nothing; otherwise a conditional
request). Prints bytes per computer, totals, and how long the whole class would
take on several link speeds.

Run it against YOUR install, outside class hours:

    python3 deploy/lab-load-test.py https://senas.example.edu
    python3 deploy/lab-load-test.py http://localhost:9876 --pcs 30 --page /aula --link-mbps 20
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import re
import ssl
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

UA = "HandsOnEdu-lab-load-test"
ENGINE_FILES = ("vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.wasm")
MODEL = "/models/hand_landmarker.task"
DEFAULT_LINKS = (10, 50, 100, 1000)


@dataclass
class Fetch:
    path: str
    status: int
    wire_bytes: int
    seconds: float
    headers: dict = field(default_factory=dict)
    error: str | None = None


def _ctx(insecure: bool) -> ssl.SSLContext | None:
    if not insecure:
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch(base: str, path: str, headers: dict | None = None, ctx=None, timeout: float = 120) -> Fetch:
    """GET with gzip accepted; counts body bytes as received (compressed)."""
    req = urllib.request.Request(urllib.parse.urljoin(base, path), headers={
        "User-Agent": UA, "Accept-Encoding": "gzip", **(headers or {})})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
            n = 0
            while chunk := res.read(65536):
                n += len(chunk)
            return Fetch(path, res.status, n, time.perf_counter() - t0, {k.lower(): v for k, v in res.headers.items()})
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return Fetch(path, exc.code, len(body), time.perf_counter() - t0,
                     {k.lower(): v for k, v in exc.headers.items()}, None if exc.code == 304 else f"HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001 — report any network failure
        return Fetch(path, 0, 0, time.perf_counter() - t0, {}, str(exc))


def page_assets(html: str) -> list[str]:
    """Same-origin scripts and stylesheets of a page, in order."""
    found = re.findall(r'<script[^>]+src="([^"]+)"', html) + re.findall(r'<link[^>]+href="([^"]+\.css[^"]*)"', html)
    return [u for u in dict.fromkeys(found) if u.startswith("/")]


def engine_paths(base: str, ctx) -> list[str]:
    """Hand-engine files where this version of the app loads them from."""
    js = fetch(base, "/static/js/ho-hands.js", ctx=ctx)
    text = ""
    if js.status == 200:
        req = urllib.request.Request(urllib.parse.urljoin(base, "/static/js/ho-hands.js"), headers={"User-Agent": UA})
        with urllib.request.urlopen(req, context=ctx) as res:
            text = res.read().decode("utf-8", "replace")
    m = re.search(r"MP_VERSION = '([^']+)'", text)
    candidates = []
    if m:
        candidates.append(f"/vendor/mediapipe@{m.group(1)}/")
    candidates.append("/vendor/mediapipe/")
    for prefix in candidates:
        if fetch(base, prefix + ENGINE_FILES[0], ctx=ctx).status == 200:
            return [prefix + f for f in ENGINE_FILES] + [MODEL]
    return [MODEL]


def plan(base: str, page: str, lang: str, ctx) -> list[str]:
    first = fetch(base, page, ctx=ctx)
    if first.status != 200:
        raise SystemExit(f"✗ {page}: {first.error or first.status}")
    req = urllib.request.Request(urllib.parse.urljoin(base, page), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx) as res:
        html = res.read().decode("utf-8", "replace")
    api = [f"/api/signs/{lang}/catalog", f"/api/signs/{lang}/templates", f"/api/signs/{lang}/model"]
    return [page] + page_assets(html) + engine_paths(base, ctx) + api


def fresh(headers: dict) -> bool:
    """Would a browser reuse this response without asking the server?"""
    cc = headers.get("cache-control", "").lower()
    if "no-cache" in cc or "no-store" in cc:
        return False
    m = re.search(r"max-age=(\d+)", cc)
    return bool(m and int(m.group(1)) > 0)


def revalidation_headers(headers: dict) -> dict:
    out = {}
    if headers.get("etag"):
        out["If-None-Match"] = headers["etag"]
    if headers.get("last-modified"):
        out["If-Modified-Since"] = headers["last-modified"]
    return out


def one_pc(base: str, paths: list[str], ctx, cached: dict | None = None) -> list[Fetch]:
    out = []
    for p in paths:
        if cached is not None:
            prev = cached.get(p)
            if prev and fresh(prev.headers):
                out.append(Fetch(p, 200, 0, 0.0, prev.headers))
                continue
            out.append(fetch(base, p, revalidation_headers(prev.headers) if prev else None, ctx))
        else:
            out.append(fetch(base, p, ctx=ctx))
    return out


def probe(base: str, ctx, stop: threading.Event, samples: list[float]) -> None:
    while not stop.is_set():
        f = fetch(base, "/health", ctx=ctx, timeout=30)
        samples.append(f.seconds if f.status == 200 else float("inf"))
        stop.wait(0.25)


def burst(base: str, paths: list[str], pcs: int, ctx, cached: dict | None = None):
    samples: list[float] = []
    stop = threading.Event()
    t = threading.Thread(target=probe, args=(base, ctx, stop, samples), daemon=True)
    t.start()
    t0 = time.perf_counter()
    with cf.ThreadPoolExecutor(max_workers=pcs) as pool:
        results = list(pool.map(lambda _: one_pc(base, paths, ctx, cached), range(pcs)))
    elapsed = time.perf_counter() - t0
    stop.set()
    t.join()
    return results, elapsed, samples


def mb(n: float) -> str:
    return f"{n / 1e6:.1f} MB"


def human_time(seconds: float) -> str:
    return f"{seconds:.0f} s" if seconds < 90 else f"{seconds / 60:.1f} min"


def report(title: str, results: list[list[Fetch]], elapsed: float, samples: list[float], links, out) -> int:
    per_pc = [sum(f.wire_bytes for f in r) for r in results]
    total = sum(per_pc)
    errors = [f for r in results for f in r if f.error]
    finite = sorted(s for s in samples if s != float("inf"))
    print(f"\n== {title}", file=out)
    print(f"   Por equipo: {mb(statistics.median(per_pc))} · total: {mb(total)} · {len(results)} equipos en {elapsed:.1f} s", file=out)
    if finite:
        p95 = finite[min(len(finite) - 1, int(len(finite) * 0.95))]
        print(f"   /health durante la carga: mediana {statistics.median(finite) * 1000:.0f} ms · p95 {p95 * 1000:.0f} ms", file=out)
    if total:
        est = " · ".join(f"{m:g} Mb/s ≈ {human_time(total * 8 / (m * 1e6))}" for m in links)
        print(f"   Tiempo solo por la red del enlace del servidor: {est}", file=out)
    if errors:
        print(f"   ✗ {len(errors)} descargas fallaron, p. ej. {errors[0].path}: {errors[0].error}", file=out)
    return len(errors)


def asset_table(results: list[Fetch], out) -> None:
    print("\n   Archivo                                              Bytes recibidos  Compresión  Caché", file=out)
    for f in results:
        enc = f.headers.get("content-encoding", "—")
        cc = f.headers.get("cache-control", "— (sin indicar)")
        print(f"   {f.path[:52]:<52} {f.wire_bytes:>15,}  {enc:<10}  {cc}", file=out)


def main(argv: list[str] | None = None, out=None) -> int:
    out = out or sys.stdout
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("base", help="dirección de la instalación, p. ej. https://senas.example.edu")
    p.add_argument("--pcs", type=int, default=30, help="equipos simultáneos (por defecto 30)")
    p.add_argument("--page", default="/aula", help="página que abren (por defecto /aula)")
    p.add_argument("--lang", default="lsec")
    p.add_argument("--link-mbps", type=float, action="append", help="velocidad del enlace a estimar (repetible)")
    p.add_argument("--insecure", action="store_true", help="no verificar el certificado (pruebas)")
    args = p.parse_args(argv)
    if not 1 <= args.pcs <= 200:
        p.error("--pcs entre 1 y 200")
    base = args.base.rstrip("/") + "/"
    ctx = _ctx(args.insecure)
    links = args.link_mbps or DEFAULT_LINKS

    paths = plan(base, args.page, args.lang, ctx)
    print(f"HandsOnEdu · prueba de carga del laboratorio: {args.pcs} equipos abren {args.page} a la vez", file=out)
    first, t1, s1 = burst(base, paths, args.pcs, ctx)
    asset_table(first[0], out)
    errors = report("Primera vez (navegador sin caché)", first, t1, s1, links, out)
    cache = {f.path: f for f in first[0]}
    again, t2, s2 = burst(base, paths, args.pcs, ctx, cached=cache)
    errors += report("Siguiente vez (con la caché del navegador)", again, t2, s2, links, out)
    print("\nLa estimación de tiempo cuenta solo el enlace del servidor; la red del laboratorio y la carga del "
          "motor en cada equipo (5–15 s) se suman.", file=out)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
