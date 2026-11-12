#!/usr/bin/env python3
"""Generate docs/content/videos-ia-lsec.md — AI avatar + video prompt catalog.

The document is derived from app/content/lsec/catalog.json so it stays in sync
with the signs, units and descriptions. Signs still "pendiente de documentar"
get fill-in templates: we never invent LSEC handshapes or movements.

    python3 scripts/gen_video_prompts.py           # (re)write the document
    python3 scripts/gen_video_prompts.py --check   # exit 1 if it is out of date (CI)

Standard library only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "app" / "content" / "lsec" / "catalog.json"
OUT = ROOT / "docs" / "content" / "videos-ia-lsec.md"

BACKGROUND = "plain seamless medium cool-grey studio background (#A9AEB3)"

# ── Avatars ──────────────────────────────────────────────────────────────────
# Fictional people. Clothing is chosen to contrast with each avatar's skin tone
# (interpreter practice): dark clothes for lighter skin, light clothes for darker skin.

AVATARS = {
    "sofia": {
        "name": "Sofía", "pron": ("she", "her"), "gender": "Femenino",
        "identity": "Mestiza de la Sierra (Quito), 28 años",
        "clothes_es": "Camiseta lisa azul marino de manga larga",
        "look": (
            "a fictional 28-year-old Ecuadorian mestiza woman from Quito. Warm light-brown skin, "
            "dark brown eyes, natural eyebrows, dark brown hair pulled back into a neat low bun so the "
            "face and neck are fully visible, no loose strands. She wears a plain navy-blue long-sleeved "
            "crew-neck top with no logos, patterns or text"
        ),
    },
    "andres": {
        "name": "Andrés", "pron": ("he", "his"), "gender": "Masculino",
        "identity": "Afroecuatoriano de Esmeraldas, 34 años",
        "clothes_es": "Camisa lisa celeste claro de manga larga (contraste con piel oscura)",
        "look": (
            "a fictional 34-year-old Afro-Ecuadorian man from Esmeraldas. Deep brown skin, dark eyes, "
            "very short black hair, a short neatly trimmed beard. He wears a plain light sky-blue "
            "long-sleeved shirt, buttoned, with no logos, patterns, pockets or text"
        ),
    },
    "killa": {
        "name": "Killa", "pron": ("she", "her"), "gender": "Femenino",
        "identity": "Kichwa Otavalo (Imbabura), 24 años",
        "clothes_es": "Blusa blanca con bordado discreto solo en el cuello y fachalina azul oscuro lisa; sin collares (walkas) para no competir con las manos",
        "look": (
            "a fictional 24-year-old Kichwa Otavalo woman from Imbabura, Ecuador. Medium brown skin, dark "
            "eyes, long straight black hair gathered at the nape and wrapped in a traditional woven hair "
            "ribbon (wango), face fully visible. Traditional Otavalo attire adapted for signing clarity: a "
            "white blouse with discreet embroidery only along the neckline, and a plain dark-navy "
            "fachalina shawl draped over the shoulders and fastened behind, so the chest area stays clear. "
            "No necklaces and no earrings"
        ),
    },
    "ramon": {
        "name": "Ramón", "pron": ("he", "his"), "gender": "Masculino",
        "identity": "Montubio de la Costa (Manabí), 52 años",
        "clothes_es": "Camisa lisa verde oscuro de manga larga",
        "look": (
            "a fictional 52-year-old Montubio man from rural Manabí on the Ecuadorian coast. Sun-weathered "
            "olive-brown skin, warm crow's-feet, short salt-and-pepper hair, a neatly trimmed grey "
            "moustache. He wears a plain dark forest-green long-sleeved button shirt with no patterns, "
            "pockets or text"
        ),
    },
}

UNIT_AVATAR = {"u1": "sofia", "u2": "andres", "u3": "killa", "u4": "ramon",
               "u5": "sofia", "u6": "andres", "u7": "killa"}
GREETING_ROTATION = ["sofia", "andres", "killa", "ramon"]

# ── English handshape text for signs the catalog already describes ───────────
# Faithful translation of catalog.json "description" (draft, pending validation).

HANDSHAPE_EN = {
    "a": "closed fist with the thumb straight and resting against the side of the index finger",
    "b": "the four fingers fully extended upward and pressed together, the thumb folded across the palm",
    "c": "fingers and thumb curved into the shape of the letter C, as if holding a glass",
    "d": "index finger extended straight up; middle, ring and little fingers curved so their tips touch the tip of the thumb, forming a circle",
    "e": "all four fingers bent at the knuckles like hooks, fingertips resting over the thumb, which is tucked across the palm",
    "f": "thumb and index fingertips touching to form a circle; middle, ring and little fingers extended upward and slightly spread",
    "i": "closed fist with only the little finger extended straight up; the thumb rests over the curled fingers",
    "l": "index finger pointing straight up and thumb extended out to the side, forming an L; the other fingers curled into the palm",
    "o": "all fingers curved so that their tips touch the tip of the thumb, forming a round O",
    "r": "index and middle fingers extended upward with the middle finger crossed over the index; the other fingers closed, the thumb over them",
    "s": "closed fist with the thumb crossed in front of the curled fingers",
    "u": "index and middle fingers extended straight up and pressed together; the other fingers closed, the thumb over them",
    "v": "index and middle fingers extended up and spread apart in a V; the other fingers closed, the thumb over them",
    "w": "index, middle and ring fingers extended up and spread apart; the thumb holds down the little finger",
    "x": "index finger bent like a hook; the other fingers closed into a fist",
    "y": "thumb and little finger extended out; the index, middle and ring fingers curled into the palm",
    "num_1": "only the index finger extended straight up; the other fingers and the thumb folded into a fist",
    "num_2": "index and middle fingers extended up and spread apart; the other fingers and the thumb folded",
    "num_4": "index, middle, ring and little fingers extended up and spread; the thumb folded into the palm",
    "num_5": "open hand with all five fingers extended and spread apart",
}

PALM_EN = {
    "forward": "Palm facing the viewer (toward the camera).",
    "side": "Palm facing sideways, toward the signer's left, so the handshape is seen in profile.",
}

# Dynamic signs whose movement the catalog already describes. Directions are
# written from the SIGNER's perspective; the viewer sees them mirrored.
DYNAMIC_EN = {
    "ch": {"base": "c", "start": "to shoulder height, in front of the right shoulder",
           "end": "to shoulder height, about 15 cm further toward the signer's own right (further LEFT in the image)",
           "motion": "moves the C handshape in one short, smooth sideways slide toward the signer's own right, keeping the handshape unchanged",
           "doubt": "Dirección del desplazamiento lateral por confirmar."},
    "j": {"base": "i", "start": "to shoulder height, in front of the right shoulder, little finger pointing up",
          "end": "to chest height, slightly lower than the start, with the wrist rotated so the palm faces the signer",
          "motion": "traces the letter J in the air with the tip of the little finger: a straight stroke down, then a small curve inward toward the body, ending with the wrist rotated; written from the signer's perspective (the viewer sees it mirrored)",
          "doubt": "Trazo y giro final de muñeca por confirmar."},
    "z": {"base": "num_1", "start": "so that the index fingertip is at the upper-left of the signing space from the signer's perspective (upper-RIGHT area of the image), at shoulder height",
          "end": "so that the index fingertip is at the lower-right of the signing space from the signer's perspective (lower-LEFT area of the image), at chest height",
          "motion": "traces a letter Z in the air with the index fingertip, as written from the signer's own perspective: a horizontal stroke to the signer's right, a diagonal stroke down to the signer's left, and a horizontal stroke to the signer's right (the viewer sees a mirrored Z)",
          "doubt": "Tamaño y velocidad del trazo por confirmar."},
}

DURATION = {"static": 4, "dynamic": 4, "greeting": 6, "two_hands": 6}

CONSTRAINTS = (
    "Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, "
    "missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, "
    "subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and "
    "camera framing as the reference image; 16:9 landscape."
)

VIDEO_RULES = (
    "Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, "
    "background and lighting throughout. Anatomically correct hands with exactly five fingers at every "
    "moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if "
    "talking, no music, no sound effects. No text or captions."
)


# ── Prompt builders ──────────────────────────────────────────────────────────

def avatar_prompt(a: dict) -> str:
    return (
        f"Photorealistic studio photograph of {a['look']}. A fictional person who does not resemble any "
        "real individual or celebrity. Reference image for a sign-language teaching video. "
        "No jewelry, no rings, no watch, no bracelets; short natural unpainted fingernails. "
        "Friendly, calm and approachable expression, mouth closed, looking straight into the camera. "
        "Front view, centered, shoulders square to the camera, framed from slightly above the top of the "
        "head down to the hips, with generous empty space on both sides for signing. Both hands relaxed "
        "and fully visible, resting loosely together in front of the lower torso at waist height. "
        f"{BACKGROUND[0].upper() + BACKGROUND[1:]}, soft even frontal lighting with no harsh shadows on the face or hands. "
        "Sharp focus, natural skin texture, 50 mm lens look, 16:9 landscape, high resolution."
    )


def _who(av: dict) -> tuple[str, str, str]:
    she, her = av["pron"]
    return av["name"], she, her


def frame_prompt(av: dict, gloss: str, kind_label: str, hand_text: str, palm: str, location: str,
                 extra: str = "") -> str:
    name, she, her = _who(av)
    return (
        f"Using the attached reference image, keep exactly the same person ({name}): same face, hairstyle, "
        "clothing, plain background, lighting and camera framing (front view, top of the head to the hips). "
        f"{name} is a sign-language model demonstrating the {kind_label} \"{gloss}\" in Ecuadorian Sign "
        f"Language (LSEC). {she.capitalize()} raises {her} RIGHT hand (which appears on the LEFT side of the "
        f"image from the viewer's point of view) {location}, about 20 cm in front of the body, and forms "
        f"this handshape: {hand_text}. {palm} {extra}"
        f"The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at "
        f"the camera, mouth closed. {CONSTRAINTS}"
    ).replace("  ", " ")


def static_video_prompt(av: dict, gloss: str, kind_label: str, seconds: int) -> str:
    name, she, her = _who(av)
    return (
        f"Animate this exact frame. {name} holds the handshape of the {kind_label} \"{gloss}\" perfectly "
        f"still in front of {her} right shoulder for the entire clip; the fingers keep exactly the same "
        f"position and do not move. Only subtle natural life: slow breathing, one natural blink, and a "
        f"slight friendly nod in the last second. {VIDEO_RULES} Duration: {seconds} seconds."
    )


def dynamic_video_prompt(av: dict, gloss: str, kind_label: str, motion: str, seconds: int,
                         face: str = "") -> str:
    name, she, her = _who(av)
    return (
        f"Use the first image as the start frame and the second image as the end frame. {name} performs "
        f"the {kind_label} \"{gloss}\" in Ecuadorian Sign Language (LSEC) with {her} right hand: during "
        f"the first half second {she} holds the start position, then {she} {motion}, smoothly and at a "
        f"clear teaching pace, and holds the end position still until the clip ends. {face}"
        f"{VIDEO_RULES} Duration: {seconds} seconds."
    ).replace("  ", " ")


# ── Document ─────────────────────────────────────────────────────────────────

def _code(text: str) -> str:
    return f"```text\n{text}\n```"


def _avatar_for(sign_id: str, unit_id: str | None, greeting_idx: int) -> str:
    if unit_id in UNIT_AVATAR:
        return UNIT_AVATAR[unit_id]
    return GREETING_ROTATION[greeting_idx % len(GREETING_ROTATION)]


def _kind_label(sign: dict) -> str:
    return {"dactilologia": "fingerspelled letter", "numeros": "number"}.get(sign["category"], "sign")


def _placeholder_static(av: dict, sign: dict) -> tuple[str, str]:
    kl = _kind_label(sign)
    frame = frame_prompt(
        av, sign["gloss"], kl,
        "<<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, "
        "doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>",
        "<<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>>",
        "<<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>")
    video = static_video_prompt(av, sign["gloss"], kl, DURATION["static"])
    return frame, video


def _placeholder_dynamic(av: dict, sign: dict, seconds: int) -> tuple[str, str, str]:
    name, she, her = _who(av)
    kl = _kind_label(sign)
    two = sign.get("hands", 1) == 2
    hands_txt = ("BOTH hands (right hand on the LEFT of the image, left hand on the RIGHT of the image)"
                 if two else f"{her} RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view)")
    common = (
        f"Using the attached reference image, keep exactly the same person ({name}): same face, hairstyle, "
        "clothing, plain background, lighting and camera framing (front view, top of the head to the hips). "
        f"{name} is a sign-language model demonstrating the {kl} \"{sign['gloss']}\" in Ecuadorian Sign "
        f"Language (LSEC). Using {hands_txt}, "
    )
    face = "<<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>"
    start = (common + f"{she} shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN "
             f"INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. "
             + ("" if two else "The left hand rests relaxed at the waist. ")
             + f"Facial expression: {face}. {CONSTRAINTS}")
    end = (common + f"{she} shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, "
           f"<<ORIENTACIÓN DE LA PALMA>>. Facial expression: {face}. {CONSTRAINTS}")
    video = (
        f"Use the first image as the start frame and the second image as the end frame. {name} performs "
        f"the {kl} \"{sign['gloss']}\" in Ecuadorian Sign Language (LSEC): during the first half second "
        f"{she} holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y "
        f"velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end "
        f"position until the clip ends. Facial expression throughout: {face}. {VIDEO_RULES} "
        f"Duration: {seconds} seconds."
    )
    return start, end, video


def render() -> str:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    signs = {s["id"]: s for s in cat["signs"]}
    unit_of = {sid: u["id"] for u in cat["units"] for sid in u["signs"]}
    L: list[str] = []
    w = L.append

    w("# Videos de referencia LSEC generados con IA — Avatares y catálogo de prompts")
    w("")
    w("> **Documento generado** por `scripts/gen_video_prompts.py` a partir de `app/content/lsec/catalog.json`. "
      "No lo edites a mano: cambia el catálogo o el script y vuelve a generarlo (`python3 scripts/gen_video_prompts.py`). "
      "El CI comprueba que esté al día.")
    w("")
    w("## 1. Política")
    w("")
    w("- Los videos se generan con IA (Google Flow: **Nano Banana Pro** para imágenes y **Omni** para video) usando "
      "**4 avatares ficticios** con identidad ecuatoriana. No se usa la imagen de ningún intérprete real, así que no "
      "hacen falta permisos de uso de imagen.")
    w("- **Ningún video llega a los estudiantes sin la validación de un intérprete de LSEC.** El intérprete revisa "
      "cada video con la lista de verificación de la sección 7 y su nombre y la fecha quedan en el catálogo.")
    w("- La plataforma muestra siempre el aviso: *🤖 Video generado con IA · ✔ Validado por intérprete de LSEC: "
      "nombre (fecha)*. Los videos pendientes solo los ve el docente (`/aula?unlock=all` y el Estudio de Señas).")
    w("- Las señas que el catálogo marca como *pendientes de documentar* tienen prompts **plantilla** con campos "
      "`<<…>>` que se completan con la descripción del intérprete. No inventamos configuraciones ni movimientos.")
    w("- Los modelos de video todavía fallan con los dedos: espera descartar varias generaciones por seña. "
      "Revisa los términos de uso de tu plan de Google Flow para material educativo.")
    w("")
    w("## 2. Flujo de producción")
    w("")
    w("1. **Avatar (una vez por avatar):** genera la imagen maestra con el prompt de la sección 4 en Nano Banana Pro. "
      "Elige la mejor y guárdala como `avatar_<id>.png`. Esa imagen es la referencia de todo lo demás.")
    w("2. **Fotograma inicial:** en Nano Banana Pro adjunta `avatar_<id>.png` y usa el prompt *Fotograma inicial* de la seña. "
      "Revisa los dedos con zoom antes de seguir: es mucho más barato corregir una imagen que un video.")
    w("3. **Fotograma final** (solo señas con movimiento): igual, con el prompt *Fotograma final*.")
    w("4. **Video:** en Flow, modo de fotogramas a video con **Omni**: fotograma inicial (y final, si existe) + prompt *Video*. "
      "Duración indicada en la ficha (4, 6 o 10 s como máximo). Si Omni no acepta fotograma final, usa solo el inicial: el prompt ya describe la posición final.")
    w("5. **Exporta** en MP4 (H.264), 1280×720 o 1920×1080, sin audio. Nombre: `<sign_id>.mp4` en "
      "`app/static/media/lsec/<id_avatar>/` (p. ej. `app/static/media/lsec/sofia/a.mp4`). "
      "Opcional: un póster `<sign_id>.jpg` (el fotograma inicial) en la misma carpeta.")
    w("6. **Validación por intérprete** (sección 7) y **registro en el catálogo** (sección 8).")
    w("")
    w("## 3. Especificaciones comunes")
    w("")
    w("| Aspecto | Especificación | Por qué |")
    w("|---|---|---|")
    w("| Mano dominante | Derecha. En la imagen aparece a la **izquierda** (vista del espectador). **No voltear el video.** | El estudiante imita en espejo; la cámara del aula ya se muestra espejada |")
    w("| Encuadre | Frontal, de la cabeza a la cadera, espacio libre a los lados | Es el espacio de signado; manos nunca cortadas |")
    w(f"| Fondo | Liso gris medio frío (#A9AEB3), idéntico para los 4 avatares | Contraste con piel y ropa, sin distracciones |")
    w("| Ropa | Lisa, manga larga, contrastada con el tono de piel; sin estampados ni logos | Las manos se leen sobre el torso |")
    w("| Accesorios | Sin anillos, relojes, pulseras ni collares; uñas cortas sin pintar | No compiten con la configuración |")
    w("| Rostro | Visible, cabello recogido, boca cerrada salvo que la seña lo requiera | Los componentes no manuales también son parte de la seña |")
    w("| Iluminación | Suave, frontal, sin sombras duras sobre manos | Dedos legibles |")
    w("| Formato | 16:9, sin texto ni subtítulos, sin audio | La plataforma añade glosa y avisos |")
    w("")
    w("Los prompts están en **inglés** porque los modelos siguen con más precisión las instrucciones anatómicas en ese idioma; las fichas y notas están en español.")
    w("")
    w("## 4. Avatares")
    w("")
    w("| ID | Nombre | Género | Identidad | Vestimenta |")
    w("|---|---|---|---|---|")
    for aid, a in AVATARS.items():
        w(f"| `{aid}` | {a['name']} | {a['gender']} | {a['identity']} | {a['clothes_es']} |")
    w("")
    w("Las cuatro personas son **ficticias**. Para la representación de identidades (en especial la vestimenta kichwa "
      "otavaleña) conviene pedir también la opinión de personas de esas comunidades.")
    w("")
    for aid, a in AVATARS.items():
        w(f"### Avatar `{aid}` — {a['name']}")
        w("")
        w("**Prompt Nano Banana Pro (imagen maestra):**")
        w("")
        w(_code(avatar_prompt(a)))
        w("")
    w("## 5. Asignación de avatares")
    w("")
    w("| Unidad | Avatar |")
    w("|---|---|")
    for u in cat["units"]:
        if u["id"] in UNIT_AVATAR:
            w(f"| {u['title']} | {AVATARS[UNIT_AVATAR[u['id']]]['name']} |")
        else:
            w(f"| {u['title']} | Rotan los 4 avatares |")
    w("")
    w("Un avatar por unidad da coherencia dentro de cada lección y variedad a lo largo del curso. "
      "Más adelante se puede generar la misma seña con varios avatares.")
    w("")

    w("## 6. Catálogo de prompts por seña")
    w("")
    ready = sum(1 for s in cat["signs"] if s["id"] in HANDSHAPE_EN or s["id"] in DYNAMIC_EN)
    w(f"**{ready} de {len(cat['signs'])}** señas tienen prompts completos (a partir de la descripción del catálogo, que sigue siendo borrador). "
      f"Las otras **{len(cat['signs']) - ready}** tienen plantillas para completar con el intérprete.")
    w("")
    greeting_idx = 0
    for unit in cat["units"]:
        w(f"### {unit['title']}")
        w("")
        for sid in unit["signs"]:
            s = signs[sid]
            is_greeting = unit["id"] not in UNIT_AVATAR
            aid = _avatar_for(sid, unit["id"], greeting_idx)
            if is_greeting:
                greeting_idx += 1
            av = AVATARS[aid]
            kl = _kind_label(s)
            hs = s.get("handshape") or {}
            two = s.get("hands", 1) == 2

            if s["kind"] == "static" and sid in HANDSHAPE_EN:
                status, seconds = "✅ Descrita en el catálogo (borrador)", DURATION["static"]
                palm = PALM_EN.get(hs.get("palm"), "Palm facing the viewer.")
                frames = [("Fotograma inicial", frame_prompt(av, s["gloss"], kl, HANDSHAPE_EN[sid], palm,
                                                              "to shoulder height, in front of the right shoulder"))]
                video = static_video_prompt(av, s["gloss"], kl, seconds)
                notes = [] if hs.get("palm") else ["Orientación de la palma por confirmar (por defecto, hacia la cámara)."]
            elif s["kind"] == "dynamic" and sid in DYNAMIC_EN:
                d = DYNAMIC_EN[sid]
                status, seconds = "✅ Descrita en el catálogo (borrador)", DURATION["dynamic"]
                base_hs = (signs[d["base"]].get("handshape") or {})
                palm = PALM_EN.get(base_hs.get("palm"), "Palm facing the viewer.")
                hand_text = HANDSHAPE_EN[d["base"]]
                frames = [
                    ("Fotograma inicial", frame_prompt(av, s["gloss"], kl, hand_text, palm, d["start"])),
                    ("Fotograma final", frame_prompt(av, s["gloss"], kl, hand_text, palm, d["end"],
                                                     "This is the END position of the movement. ")),
                ]
                video = dynamic_video_prompt(av, s["gloss"], kl, d["motion"], seconds)
                notes = [d["doubt"]]
            elif s["kind"] == "static":
                status, seconds = "⚠️ Pendiente: completar con el intérprete", DURATION["static"]
                fr, video = _placeholder_static(av, s)
                frames = [("Fotograma inicial", fr)]
                notes = ["Completa los campos `<<…>>` con la descripción del intérprete antes de generar."]
            else:
                seconds = DURATION["two_hands"] if two else DURATION["greeting"] if is_greeting else DURATION["dynamic"]
                status = "⚠️ Pendiente: completar con el intérprete"
                start, end, video = _placeholder_dynamic(av, s, seconds)
                frames = [("Fotograma inicial", start), ("Fotograma final", end)]
                notes = ["Completa los campos `<<…>>` con la descripción del intérprete antes de generar."]
                if sid in ("ll", "rr", "enie"):
                    notes.append(f"El catálogo solo dice «{s.get('motion', s['description'])}»: falta precisar configuración y movimiento.")
                if is_greeting or two:
                    notes.append("Incluye la expresión facial: en LSEC forma parte de la seña.")

            w(f"#### {s['gloss']} — `{sid}`")
            w("")
            w(f"| Avatar | Tipo | Manos | Duración | Contenido | Archivo |")
            w("|---|---|---|---|---|---|")
            kind_es = "Con movimiento" if s["kind"] == "dynamic" else "Estática"
            w(f"| {av['name']} (`{aid}`) | {kind_es} | {s.get('hands', 1)} | {seconds} s | {status} | "
              f"`app/static/media/lsec/{aid}/{sid}.mp4` |")
            w("")
            w(f"Descripción del catálogo: *{s['description']}*")
            w("")
            for n in notes:
                w(f"> {n}")
                w("")
            for i, (label, text) in enumerate(frames, 1):
                w(f"**{i}. {label}** (Nano Banana Pro, adjuntar `avatar_{aid}.png`):")
                w("")
                w(_code(text))
                w("")
            if len(frames) == 1:
                w("*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*")
                w("")
            w(f"**{len(frames) + 1}. Video** (Omni, {seconds} s):")
            w("")
            w(_code(video))
            w("")

    w("## 7. Lista de verificación del intérprete")
    w("")
    w("Para cada video, el intérprete de LSEC confirma:")
    w("")
    for item in [
        "**Configuración:** la forma de la mano es la de LSEC (dedos extendidos, doblados, cerrados y contactos correctos).",
        "**Orientación:** la palma y los dedos apuntan hacia donde corresponde.",
        "**Ubicación:** la seña se hace en el lugar correcto del espacio o del cuerpo.",
        "**Movimiento:** trayectoria, dirección, repeticiones y velocidad correctas (señas dinámicas).",
        "**Componentes no manuales:** la expresión facial y la postura acompañan bien a la seña.",
        "**Mano dominante:** se hace con la derecha y el video no está volteado.",
        "**Anatomía:** cinco dedos en cada mano en todo momento; sin deformaciones, parpadeos ni dedos fusionados.",
        "**Naturalidad:** la seña se entiende como la haría una persona sorda o un intérprete.",
    ]:
        w(f"- [ ] {item}")
    w("")
    w("Si algo falla, se anota qué corregir y se regenera (normalmente basta con ajustar el fotograma inicial). "
      "Si la descripción del catálogo resulta incorrecta, se corrige primero `catalog.json` y se vuelve a generar este documento.")
    w("")
    w("## 8. Registro en el catálogo")
    w("")
    w("Cuando el video está validado, añade `media` a la seña en `app/content/lsec/catalog.json`:")
    w("")
    w("```json")
    w(json.dumps({"media": {
        "video": "/static/media/lsec/sofia/a.mp4",
        "poster": "/static/media/lsec/sofia/a.jpg",
        "avatar": "sofia",
        "ai_generated": True,
        "validated_by": "Nombre del intérprete",
        "validated_at": "2026-11-20",
    }}, ensure_ascii=False, indent=2))
    w("```")
    w("")
    w("- `ai_generated` es obligatorio: la plataforma muestra el aviso de IA según este campo.")
    w("- Sin `validated_by`, el video solo lo ven los docentes, con el aviso *pendiente de validación*.")
    w("- La validación del **video** no cambia `validated` de la **seña** (que se refiere a su descripción en el catálogo); "
      "el intérprete puede validar ambas a la vez.")
    w("")
    return "\n".join(L)


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT.relative_to(ROOT)} is out of date: run python3 scripts/gen_video_prompts.py", file=sys.stderr)
            return 1
        print("video prompt document is up to date")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
