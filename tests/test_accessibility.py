"""
Static accessibility checks (NTE INEN-ISO/IEC 40500 ≈ WCAG 2.0 A/AA) that run in
every CI build without a browser. The full audit with axe-core in a real
browser is scripts/a11y-audit.py (CI's Docker job runs it against the image);
docs/accessibility.md lists what neither can judge.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

import pytest

from app.api.pages import PAGES

STATIC = Path(__file__).resolve().parents[1] / "app" / "static"
EXTRA_PAGES = ["lti-setup.html", "lti-deeplink.html"]
HTML_FILES = sorted(set(PAGES.values()) | set(EXTRA_PAGES))


class PageScan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_lang = None
        self.title = ""
        self.viewport = None
        self.mains = 0
        self.ids: list[str] = []
        self.label_for: set[str] = set()
        self.stylesheets: list[str] = []
        self.canvases: list[dict] = []
        self.images: list[dict] = []
        self.fields: list[tuple[dict, bool]] = []  # (attrs, inside a <label>)
        self.buttons: list[dict] = []
        self._stack: list[str] = []
        self._button: dict | None = None
        self._in_title = False
        self._labels = 0

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "html":
            self.html_lang = a.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta" and a.get("name") == "viewport":
            self.viewport = a.get("content", "")
        elif tag == "main":
            self.mains += 1
        elif tag == "link" and a.get("rel") == "stylesheet":
            self.stylesheets.append(a.get("href", ""))
        elif tag == "label":
            self._labels += 1
            if a.get("for"):
                self.label_for.add(a["for"])
        elif tag == "canvas":
            self.canvases.append(a)
        elif tag == "img":
            self.images.append(a)
        elif tag in ("input", "select", "textarea"):
            self.fields.append((a, self._labels > 0))
        elif tag == "button":
            self._button = {**a, "_text": ""}
            self.buttons.append(self._button)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "label":
            self._labels = max(0, self._labels - 1)
        elif tag == "button":
            self._button = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._button is not None:
            self._button["_text"] += data


def scan(name: str) -> PageScan:
    s = PageScan()
    s.feed((STATIC / name).read_text(encoding="utf-8"))
    return s


@pytest.mark.parametrize("name", HTML_FILES)
class TestPageStructure:
    def test_language_title_and_main(self, name):
        s = scan(name)
        assert s.html_lang == "es", "3.1.1: <html lang=\"es\">"
        assert s.title.strip(), "2.4.2: every page needs a <title>"
        assert s.mains == 1, "1.3.1/2.4.1: exactly one <main> region"

    def test_zoom_not_blocked(self, name):
        vp = (scan(name).viewport or "").replace(" ", "").lower()
        assert "user-scalable=no" not in vp and "maximum-scale=1" not in vp, "1.4.4: never block zoom"

    def test_ids_unique(self, name):
        ids = scan(name).ids
        assert len(ids) == len(set(ids)), "4.1.1: duplicate id " + str({i for i in ids if ids.count(i) > 1})

    def test_canvases_and_images_are_named_or_hidden(self, name):
        s = scan(name)
        for c in s.canvases:
            assert c.get("aria-label") or c.get("aria-labelledby") or c.get("aria-hidden") == "true", \
                f"1.1.1: <canvas id={c.get('id')}> needs aria-label (or aria-hidden if decorative)"
        for img in s.images:
            assert "alt" in img, f"1.1.1: <img src={img.get('src')}> needs alt"

    def test_buttons_have_a_name(self, name):
        for b in scan(name).buttons:
            assert b["_text"].strip() or b.get("aria-label") or b.get("aria-labelledby") or b.get("title"), \
                f"4.1.2: <button id={b.get('id')}> has no accessible name"

    def test_form_fields_are_labelled(self, name):
        s = scan(name)
        for a, wrapped in s.fields:
            if a.get("type") in ("hidden", "submit", "button", "reset"):
                continue
            assert wrapped or a.get("id") in s.label_for or a.get("aria-label") or a.get("aria-labelledby"), \
                f"1.3.1/3.3.2: field id={a.get('id')} name={a.get('name')} has no label"

    def test_keyboard_focus_is_visible(self, name):
        css = "".join((STATIC / href.removeprefix("/static/")).read_text(encoding="utf-8")
                      for href in scan(name).stylesheets if href.startswith("/static/"))
        assert ":focus-visible" in css, "2.4.7: the page's styles must draw a visible keyboard focus"


# ── Contrast of the palettes (1.4.3, 4.5:1 for normal text) ──────────────────

def _luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def tokens(css_file: str, dark: bool = False) -> dict[str, str]:
    """Custom properties of :root, with the prefers-color-scheme: dark overrides if `dark`."""
    css = (STATIC / "css" / css_file).read_text(encoding="utf-8")
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    root = re.search(r"(?<![\w-]):root\s*\{([^}]*)\}", css)
    out = dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b", root.group(1))) if root else {}
    if dark:
        m = re.search(r"prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}", css)
        if m:
            out.update(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b", m.group(1)))
    return out


DARK_THEMES = {  # prefix → stylesheet (dark pages: muted and body text on every background)
    "au": "aula.css", "ae": "attendeye.css", "vp": "virtualpainter.css", "ap": "airpiano.css",
    "ms": "motivasign.css", "ss": "signstudio.css",
}
LIGHT_DARK_THEMES = {"dg": "diagnostico.css", "pv": "privacidad.css", "vl": "validacion.css"}


def _pairs():
    for p, f in DARK_THEMES.items():
        for fg in ("text", "muted"):
            for bg in ("bg", "surface", "surface2"):
                yield f, False, f"--{p}-{fg}", f"--{p}-{bg}"
    for p, f in LIGHT_DARK_THEMES.items():
        for dark in (False, True):
            for fg in ("text", "muted"):
                for bg in ("bg", "surface"):
                    yield f, dark, f"--{p}-{fg}", f"--{p}-{bg}"
    for fg, bg in (("--text", "--bg"), ("--muted", "--bg"), ("--muted", "--surface"), ("--muted", "#f1f5f9"),
                   ("#ffffff", "--primary"), ("--dark-text", "--dark-bg"), ("--dark-muted", "--dark-bg"),
                   ("--dark-muted", "--dark-surface"), ("--dark-muted", "--dark-surface2")):
        yield "styles.css", False, fg, bg
    yield "gestiedu.css", False, "--ge-primary", "#ffffff"
    yield "gestiedu.css", False, "--ge-muted", "#ffffff"


@pytest.mark.parametrize("css_file,dark,fg,bg", list(_pairs()))
def test_palette_contrast(css_file, dark, fg, bg):
    t = tokens(css_file, dark)
    colors = [t.get(x) if x.startswith("--") else x for x in (fg, bg)]
    assert None not in colors, f"{css_file}: token missing ({fg}, {bg})"
    ratio = contrast(*colors)
    assert ratio >= 4.5, f"{css_file}{' (oscuro)' if dark else ''}: {fg} on {bg} = {ratio:.2f}:1 < 4.5:1"


def test_contrast_formula():
    assert contrast("#000000", "#ffffff") == pytest.approx(21.0)
    assert contrast("#777777", "#ffffff") == pytest.approx(4.48, abs=0.01)


def test_landing_module_buttons_have_contrast():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    for bg, fg in re.findall(r"background:(#[0-9a-fA-F]{6});color:(#[0-9a-fA-F]{6}|white)", html):
        fg = "#ffffff" if fg == "white" else fg
        assert contrast(fg, bg) >= 4.5, f"index.html button {fg} on {bg} = {contrast(fg, bg):.2f}:1"
