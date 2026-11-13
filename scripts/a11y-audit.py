#!/usr/bin/env python3
"""
Accessibility audit (NTE INEN-ISO/IEC 40500 ≈ WCAG 2.0, levels A and AA) of the
HandsOnEdu pages with axe-core in a real browser, in light and dark mode, on a
desktop and a phone-sized window — including the states a learner reaches
(Aula: profile, route, lesson; validation: review and report; device check:
result). Exits 1 if axe finds any violation.

Needs Playwright (`pip install playwright && playwright install chromium`) and
axe-core's `axe.min.js` (`npm pack axe-core@4.10.3 && tar xzf axe-core-4.10.3.tgz`
→ `package/axe.min.js`). It opens the camera with Chromium's fake device.

    python3 scripts/a11y-audit.py http://localhost:9876 --axe package/axe.min.js

It creates one learner profile in the Aula and deletes it at the end (with the
same credential the browser holds), so run it against a test install.
What axe cannot judge (screen-reader wording, sign videos, real use) is in
docs/accessibility.md.
"""
from __future__ import annotations

import argparse
import json
import sys

PAGES = ["/", "/aula", "/panel", "/privacidad", "/diagnostico", "/validacion", "/signstudio", "/lti/setup",
         "/lti/deeplink", "/gestiedu", "/motivasign", "/attendeye", "/virtualpainter", "/airpiano", "/testing"]
VIEWPORTS = {"escritorio": {"width": 1280, "height": 900}, "móvil": {"width": 390, "height": 844}}
TAGS = ["wcag2a", "wcag2aa"]

RUN_AXE = """async (tags) => {
  const r = await axe.run(document, {runOnly: {type: 'tag', values: tags}, resultTypes: ['violations']});
  return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, url: v.helpUrl,
    nodes: v.nodes.slice(0, 5).map(n => ({target: n.target.join(' '), why: n.failureSummary}))}));
}"""

DELETE_PROFILES = """async () => {
  let profiles = [];
  try { profiles = JSON.parse(localStorage.getItem('ho.aula.profiles') || '[]'); } catch (_) { /* none */ }
  for (const p of profiles) {
    if (p.id && p.token) {
      await fetch('/api/learners/' + encodeURIComponent(p.id), {method: 'DELETE', headers: {'X-Learner-Token': p.token}});
    }
  }
  localStorage.clear();
  return profiles.length;
}"""


def audit(page, axe_source: str) -> list[dict]:
    if not page.evaluate("typeof window.axe !== 'undefined'"):
        page.add_script_tag(content=axe_source)
    return page.evaluate(RUN_AXE, TAGS)


def walk(page, base: str, axe_source: str, label: str, record) -> None:
    for path in PAGES:
        page.goto(base + path)
        page.wait_for_timeout(1200)
        record(f"{path} [{label}]", audit(page, axe_source))

    # Aula: profile → route → first lesson (camera on).
    page.goto(base + "/aula")
    page.evaluate(DELETE_PROFILES)
    page.reload()
    page.wait_for_selector("#au-name")
    record(f"/aula perfil [{label}]", audit(page, axe_source))
    page.fill("#au-name", "Auditoría accesibilidad")
    page.keyboard.press("Enter")
    page.wait_for_selector("#screen-path.active #au-units button", timeout=30000)
    record(f"/aula ruta [{label}]", audit(page, axe_source))
    page.locator("#au-units button:has-text('Lección')").first.click()
    page.wait_for_selector("#screen-activity.active", timeout=30000)
    page.wait_for_timeout(4000)
    record(f"/aula lección [{label}]", audit(page, axe_source))
    page.click("#au-btn-exit")
    page.wait_for_timeout(500)
    page.evaluate(DELETE_PROFILES)

    # Validation tool: review screen and report (nothing is saved until «Guardar»).
    page.goto(base + "/validacion")
    page.wait_for_selector("#vl-units .vl-unit")
    page.fill("#vl-reviewer", "Auditoría")
    page.locator("#vl-units input[type=checkbox]").first.check()
    page.click("#vl-start")
    page.wait_for_timeout(4000)
    record(f"/validacion revisión [{label}]", audit(page, axe_source))
    page.click("#vl-stop")
    page.wait_for_timeout(800)
    record(f"/validacion informe [{label}]", audit(page, axe_source))

    # Device check: the result screen (it posts a technical record, no identity).
    page.goto(base + "/diagnostico")
    page.click("#dg-start")
    page.wait_for_selector("#dg-result:not([hidden])", timeout=180000)
    record(f"/diagnostico resultado [{label}]", audit(page, axe_source))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("base", help="dirección de la instalación de pruebas, p. ej. http://localhost:9876")
    p.add_argument("--axe", required=True, help="ruta a axe.min.js (axe-core 4.x)")
    p.add_argument("--json", help="guardar el resultado completo en este archivo")
    p.add_argument("--quick", action="store_true", help="solo modo claro en escritorio")
    args = p.parse_args(argv)

    from playwright.sync_api import sync_playwright  # dev-only dependency

    with open(args.axe, encoding="utf-8") as fh:
        axe_source = fh.read()
    base = args.base.rstrip("/")
    results: dict[str, list[dict]] = {}

    def record(name: str, violations: list[dict]) -> None:
        results[name] = violations
        mark = "✔" if not violations else "✗"
        print(f"{mark} {name}" + (f": {', '.join(v['id'] for v in violations)}" if violations else ""), flush=True)

    combos = [("light", "escritorio")] if args.quick else [(s, v) for s in ("light", "dark") for v in VIEWPORTS]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        for scheme, view in combos:
            page = browser.new_page(viewport=VIEWPORTS[view], color_scheme=scheme)
            walk(page, base, axe_source, f"{'claro' if scheme == 'light' else 'oscuro'}, {view}", record)
            page.close()
        browser.close()

    failing = {k: v for k, v in results.items() if v}
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(results, fh, ensure_ascii=False, indent=1)
    print(f"\n{len(results)} pantallas auditadas (WCAG 2.0 A/AA, axe-core) · {len(failing)} con problemas")
    for name, violations in failing.items():
        for v in violations:
            print(f"\n✗ {name} · {v['id']} ({v['impact']}): {v['help']}\n  {v['url']}")
            for n in v["nodes"]:
                print(f"  - {n['target']}\n    {(n['why'] or '').replace(chr(10), ' · ')}")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
