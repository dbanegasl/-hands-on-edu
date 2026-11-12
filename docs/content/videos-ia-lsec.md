# Videos de referencia LSEC generados con IA — Avatares y catálogo de prompts

> **Documento generado** por `scripts/gen_video_prompts.py` a partir de `app/content/lsec/catalog.json`. No lo edites a mano: cambia el catálogo o el script y vuelve a generarlo (`python3 scripts/gen_video_prompts.py`). El CI comprueba que esté al día.

## 1. Política

- Los videos se generan con IA (Google Flow: **Nano Banana Pro** para imágenes y **Omni** para video) usando **4 avatares ficticios** con identidad ecuatoriana. No se usa la imagen de ningún intérprete real, así que no hacen falta permisos de uso de imagen.
- **Ningún video llega a los estudiantes sin la validación de un intérprete de LSEC.** El intérprete revisa cada video con la lista de verificación de la sección 7 y su nombre y la fecha quedan en el catálogo.
- La plataforma muestra siempre el aviso: *🤖 Video generado con IA · ✔ Validado por intérprete de LSEC: nombre (fecha)*. Los videos pendientes solo los ve el docente (`/aula?unlock=all` y el Estudio de Señas).
- Las señas que el catálogo marca como *pendientes de documentar* tienen prompts **plantilla** con campos `<<…>>` que se completan con la descripción del intérprete. No inventamos configuraciones ni movimientos.
- Los modelos de video todavía fallan con los dedos: espera descartar varias generaciones por seña. Revisa los términos de uso de tu plan de Google Flow para material educativo.

## 2. Flujo de producción

1. **Avatar (una vez por avatar):** genera la imagen maestra con el prompt de la sección 4 en Nano Banana Pro. Elige la mejor y guárdala como `avatar_<id>.png`. Esa imagen es la referencia de todo lo demás.
2. **Fotograma inicial:** en Nano Banana Pro adjunta `avatar_<id>.png` y usa el prompt *Fotograma inicial* de la seña. Revisa los dedos con zoom antes de seguir: es mucho más barato corregir una imagen que un video.
3. **Fotograma final** (solo señas con movimiento): igual, con el prompt *Fotograma final*.
4. **Video:** en Flow, modo de fotogramas a video con **Omni**: fotograma inicial (y final, si existe) + prompt *Video*. Duración indicada en la ficha (4, 6 o 10 s como máximo). Si Omni no acepta fotograma final, usa solo el inicial: el prompt ya describe la posición final.
5. **Exporta** en MP4 (H.264), 1280×720 o 1920×1080, sin audio. Nombre: `<sign_id>.mp4` en `app/static/media/lsec/<id_avatar>/` (p. ej. `app/static/media/lsec/sofia/a.mp4`). Opcional: un póster `<sign_id>.jpg` (el fotograma inicial) en la misma carpeta.
6. **Validación por intérprete** (sección 7) y **registro en el catálogo** (sección 8).

## 3. Especificaciones comunes

| Aspecto | Especificación | Por qué |
|---|---|---|
| Mano dominante | Derecha. En la imagen aparece a la **izquierda** (vista del espectador). **No voltear el video.** | El estudiante imita en espejo; la cámara del aula ya se muestra espejada |
| Encuadre | Frontal, de la cabeza a la cadera, espacio libre a los lados | Es el espacio de signado; manos nunca cortadas |
| Fondo | Liso gris medio frío (#A9AEB3), idéntico para los 4 avatares | Contraste con piel y ropa, sin distracciones |
| Ropa | Lisa, manga larga, contrastada con el tono de piel; sin estampados ni logos | Las manos se leen sobre el torso |
| Accesorios | Sin anillos, relojes, pulseras ni collares; uñas cortas sin pintar | No compiten con la configuración |
| Rostro | Visible, cabello recogido, boca cerrada salvo que la seña lo requiera | Los componentes no manuales también son parte de la seña |
| Iluminación | Suave, frontal, sin sombras duras sobre manos | Dedos legibles |
| Formato | 16:9, sin texto ni subtítulos, sin audio | La plataforma añade glosa y avisos |

Los prompts están en **inglés** porque los modelos siguen con más precisión las instrucciones anatómicas en ese idioma; las fichas y notas están en español.

## 4. Avatares

| ID | Nombre | Género | Identidad | Vestimenta |
|---|---|---|---|---|
| `sofia` | Sofía | Femenino | Mestiza de la Sierra (Quito), 28 años | Camiseta lisa azul marino de manga larga |
| `andres` | Andrés | Masculino | Afroecuatoriano de Esmeraldas, 34 años | Camisa lisa celeste claro de manga larga (contraste con piel oscura) |
| `killa` | Killa | Femenino | Kichwa Otavalo (Imbabura), 24 años | Blusa blanca con bordado discreto solo en el cuello y fachalina azul oscuro lisa; sin collares (walkas) para no competir con las manos |
| `ramon` | Ramón | Masculino | Montubio de la Costa (Manabí), 52 años | Camisa lisa verde oscuro de manga larga |

Las cuatro personas son **ficticias**. Para la representación de identidades (en especial la vestimenta kichwa otavaleña) conviene pedir también la opinión de personas de esas comunidades.

### Avatar `sofia` — Sofía

**Prompt Nano Banana Pro (imagen maestra):**

```text
Photorealistic studio photograph of a fictional 28-year-old Ecuadorian mestiza woman from Quito. Warm light-brown skin, dark brown eyes, natural eyebrows, dark brown hair pulled back into a neat low bun so the face and neck are fully visible, no loose strands. She wears a plain navy-blue long-sleeved crew-neck top with no logos, patterns or text. A fictional person who does not resemble any real individual or celebrity. Reference image for a sign-language teaching video. No jewelry, no rings, no watch, no bracelets; short natural unpainted fingernails. Friendly, calm and approachable expression, mouth closed, looking straight into the camera. Front view, centered, shoulders square to the camera, framed from slightly above the top of the head down to the hips, with generous empty space on both sides for signing. Both hands relaxed and fully visible, resting loosely together in front of the lower torso at waist height. Plain seamless medium cool-grey studio background (#A9AEB3), soft even frontal lighting with no harsh shadows on the face or hands. Sharp focus, natural skin texture, 50 mm lens look, 16:9 landscape, high resolution.
```

### Avatar `andres` — Andrés

**Prompt Nano Banana Pro (imagen maestra):**

```text
Photorealistic studio photograph of a fictional 34-year-old Afro-Ecuadorian man from Esmeraldas. Deep brown skin, dark eyes, very short black hair, a short neatly trimmed beard. He wears a plain light sky-blue long-sleeved shirt, buttoned, with no logos, patterns, pockets or text. A fictional person who does not resemble any real individual or celebrity. Reference image for a sign-language teaching video. No jewelry, no rings, no watch, no bracelets; short natural unpainted fingernails. Friendly, calm and approachable expression, mouth closed, looking straight into the camera. Front view, centered, shoulders square to the camera, framed from slightly above the top of the head down to the hips, with generous empty space on both sides for signing. Both hands relaxed and fully visible, resting loosely together in front of the lower torso at waist height. Plain seamless medium cool-grey studio background (#A9AEB3), soft even frontal lighting with no harsh shadows on the face or hands. Sharp focus, natural skin texture, 50 mm lens look, 16:9 landscape, high resolution.
```

### Avatar `killa` — Killa

**Prompt Nano Banana Pro (imagen maestra):**

```text
Photorealistic studio photograph of a fictional 24-year-old Kichwa Otavalo woman from Imbabura, Ecuador. Medium brown skin, dark eyes, long straight black hair gathered at the nape and wrapped in a traditional woven hair ribbon (wango), face fully visible. Traditional Otavalo attire adapted for signing clarity: a white blouse with discreet embroidery only along the neckline, and a plain dark-navy fachalina shawl draped over the shoulders and fastened behind, so the chest area stays clear. No necklaces and no earrings. A fictional person who does not resemble any real individual or celebrity. Reference image for a sign-language teaching video. No jewelry, no rings, no watch, no bracelets; short natural unpainted fingernails. Friendly, calm and approachable expression, mouth closed, looking straight into the camera. Front view, centered, shoulders square to the camera, framed from slightly above the top of the head down to the hips, with generous empty space on both sides for signing. Both hands relaxed and fully visible, resting loosely together in front of the lower torso at waist height. Plain seamless medium cool-grey studio background (#A9AEB3), soft even frontal lighting with no harsh shadows on the face or hands. Sharp focus, natural skin texture, 50 mm lens look, 16:9 landscape, high resolution.
```

### Avatar `ramon` — Ramón

**Prompt Nano Banana Pro (imagen maestra):**

```text
Photorealistic studio photograph of a fictional 52-year-old Montubio man from rural Manabí on the Ecuadorian coast. Sun-weathered olive-brown skin, warm crow's-feet, short salt-and-pepper hair, a neatly trimmed grey moustache. He wears a plain dark forest-green long-sleeved button shirt with no patterns, pockets or text. A fictional person who does not resemble any real individual or celebrity. Reference image for a sign-language teaching video. No jewelry, no rings, no watch, no bracelets; short natural unpainted fingernails. Friendly, calm and approachable expression, mouth closed, looking straight into the camera. Front view, centered, shoulders square to the camera, framed from slightly above the top of the head down to the hips, with generous empty space on both sides for signing. Both hands relaxed and fully visible, resting loosely together in front of the lower torso at waist height. Plain seamless medium cool-grey studio background (#A9AEB3), soft even frontal lighting with no harsh shadows on the face or hands. Sharp focus, natural skin texture, 50 mm lens look, 16:9 landscape, high resolution.
```

## 5. Asignación de avatares

| Unidad | Avatar |
|---|---|
| Vocales | Sofía |
| Consonantes I | Andrés |
| Consonantes II | Killa |
| Consonantes III | Ramón |
| Letras con movimiento | Sofía |
| Números 1–5 | Andrés |
| Números 6–10 | Killa |
| Saludos y cortesía | Rotan los 4 avatares |

Un avatar por unidad da coherencia dentro de cada lección y variedad a lo largo del curso. Más adelante se puede generar la misma seña con varios avatares.

## 6. Catálogo de prompts por seña

**23 de 50** señas tienen prompts completos (a partir de la descripción del catálogo, que sigue siendo borrador). Las otras **27** tienen plantillas para completar con el intérprete.

### Vocales

#### A — `a`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/a.mp4` |

Descripción del catálogo: *Puño cerrado con el pulgar estirado al costado del índice.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "A" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: closed fist with the thumb straight and resting against the side of the index finger. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Sofía holds the handshape of the fingerspelled letter "A" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### E — `e`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/e.mp4` |

Descripción del catálogo: *Los cuatro dedos doblados en gancho sobre el pulgar recogido.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "E" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: all four fingers bent at the knuckles like hooks, fingertips resting over the thumb, which is tucked across the palm. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Sofía holds the handshape of the fingerspelled letter "E" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### I — `i`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/i.mp4` |

Descripción del catálogo: *Meñique extendido hacia arriba; los demás dedos cerrados y el pulgar sobre ellos.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "I" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: closed fist with only the little finger extended straight up; the thumb rests over the curled fingers. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Sofía holds the handshape of the fingerspelled letter "I" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### O — `o`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/o.mp4` |

Descripción del catálogo: *Todos los dedos curvados tocando la punta del pulgar formando una O.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "O" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: all fingers curved so that their tips touch the tip of the thumb, forming a round O. Palm facing sideways, toward the signer's left, so the handshape is seen in profile. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Sofía holds the handshape of the fingerspelled letter "O" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### U — `u`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/u.mp4` |

Descripción del catálogo: *Índice y medio extendidos y juntos hacia arriba.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "U" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index and middle fingers extended straight up and pressed together; the other fingers closed, the thumb over them. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Sofía holds the handshape of the fingerspelled letter "U" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Consonantes I

#### B — `b`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/b.mp4` |

Descripción del catálogo: *Cuatro dedos extendidos y juntos; el pulgar doblado sobre la palma.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the fingerspelled letter "B" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: the four fingers fully extended upward and pressed together, the thumb folded across the palm. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the fingerspelled letter "B" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### C — `c`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/c.mp4` |

Descripción del catálogo: *Dedos y pulgar curvados formando la letra C, vista de lado.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the fingerspelled letter "C" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: fingers and thumb curved into the shape of the letter C, as if holding a glass. Palm facing sideways, toward the signer's left, so the handshape is seen in profile. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the fingerspelled letter "C" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### D — `d`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/d.mp4` |

Descripción del catálogo: *Índice extendido hacia arriba; medio, anular y meñique curvados tocando la punta del pulgar.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the fingerspelled letter "D" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index finger extended straight up; middle, ring and little fingers curved so their tips touch the tip of the thumb, forming a circle. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the fingerspelled letter "D" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### F — `f`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/f.mp4` |

Descripción del catálogo: *Pulgar e índice se tocan formando un círculo; medio, anular y meñique extendidos.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the fingerspelled letter "F" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: thumb and index fingertips touching to form a circle; middle, ring and little fingers extended upward and slightly spread. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the fingerspelled letter "F" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### L — `l`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/l.mp4` |

Descripción del catálogo: *Índice hacia arriba y pulgar estirado hacia el lado formando una L.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the fingerspelled letter "L" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index finger pointing straight up and thumb extended out to the side, forming an L; the other fingers curled into the palm. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the fingerspelled letter "L" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Consonantes II

#### R — `r`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/r.mp4` |

Descripción del catálogo: *Índice y medio extendidos y cruzados; los demás dedos cerrados.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "R" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index and middle fingers extended upward with the middle finger crossed over the index; the other fingers closed, the thumb over them. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "R" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### S — `s`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/s.mp4` |

Descripción del catálogo: *Puño cerrado con el pulgar cruzado por delante de los dedos.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "S" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: closed fist with the thumb crossed in front of the curled fingers. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "S" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### V — `v`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/v.mp4` |

Descripción del catálogo: *Índice y medio extendidos y separados en V.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "V" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index and middle fingers extended up and spread apart in a V; the other fingers closed, the thumb over them. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "V" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### W — `w`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/w.mp4` |

Descripción del catálogo: *Índice, medio y anular extendidos y separados; el pulgar sujeta al meñique.*

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "W" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index, middle and ring fingers extended up and spread apart; the thumb holds down the little finger. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "W" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### X — `x`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/x.mp4` |

Descripción del catálogo: *Índice doblado en gancho; los demás dedos cerrados.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "X" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index finger bent like a hook; the other fingers closed into a fist. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "X" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### Y — `y`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/killa/y.mp4` |

Descripción del catálogo: *Pulgar y meñique extendidos; los demás dedos cerrados.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the fingerspelled letter "Y" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: thumb and little finger extended out; the index, middle and ring fingers curled into the palm. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the fingerspelled letter "Y" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Consonantes III

#### G — `g`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/g.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "G" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "G" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### H — `h`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/h.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "H" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "H" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### K — `k`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/k.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "K" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "K" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### M — `m`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/m.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "M" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "M" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### N — `n`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/n.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "N" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "N" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### P — `p`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/p.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "P" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "P" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### Q — `q`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/q.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "Q" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "Q" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### T — `t`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/t.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the fingerspelled letter "T" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Ramón holds the handshape of the fingerspelled letter "T" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Letras con movimiento

#### CH — `ch`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/ch.mp4` |

Descripción del catálogo: *Configuración de C con movimiento lateral corto.*

> Dirección del desplazamiento lateral por confirmar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "CH" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: fingers and thumb curved into the shape of the letter C, as if holding a glass. Palm facing sideways, toward the signer's left, so the handshape is seen in profile. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "CH" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, about 15 cm further toward the signer's own right (further LEFT in the image), about 20 cm in front of the body, and forms this handshape: fingers and thumb curved into the shape of the letter C, as if holding a glass. Palm facing sideways, toward the signer's left, so the handshape is seen in profile. This is the END position of the movement. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "CH" in Ecuadorian Sign Language (LSEC) with her right hand: during the first half second she holds the start position, then she moves the C handshape in one short, smooth sideways slide toward the signer's own right, keeping the handshape unchanged, smoothly and at a clear teaching pace, and holds the end position still until the clip ends. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### J — `j`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/j.mp4` |

Descripción del catálogo: *Configuración de I trazando una J en el aire con el meñique.*

> Trazo y giro final de muñeca por confirmar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "J" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, little finger pointing up, about 20 cm in front of the body, and forms this handshape: closed fist with only the little finger extended straight up; the thumb rests over the curled fingers. Palm facing the viewer (toward the camera). The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "J" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to chest height, slightly lower than the start, with the wrist rotated so the palm faces the signer, about 20 cm in front of the body, and forms this handshape: closed fist with only the little finger extended straight up; the thumb rests over the curled fingers. Palm facing the viewer (toward the camera). This is the END position of the movement. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "J" in Ecuadorian Sign Language (LSEC) with her right hand: during the first half second she holds the start position, then she traces the letter J in the air with the tip of the little finger: a straight stroke down, then a small curve inward toward the body, ending with the wrist rotated; written from the signer's perspective (the viewer sees it mirrored), smoothly and at a clear teaching pace, and holds the end position still until the clip ends. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### LL — `ll`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/ll.mp4` |

Descripción del catálogo: *Configuración de L con movimiento.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> El catálogo solo dice «Movimiento de la configuración L»: falta precisar configuración y movimiento.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "LL" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "LL" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "LL" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### Ñ — `enie`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/enie.mp4` |

Descripción del catálogo: *Configuración de N con movimiento.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> El catálogo solo dice «Movimiento ondulante»: falta precisar configuración y movimiento.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "Ñ" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "Ñ" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "Ñ" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### RR — `rr`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/rr.mp4` |

Descripción del catálogo: *Configuración de R con movimiento.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> El catálogo solo dice «Movimiento de la configuración R»: falta precisar configuración y movimiento.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "RR" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "RR" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "RR" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### Z — `z`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/sofia/z.mp4` |

Descripción del catálogo: *Índice extendido trazando una Z en el aire.*

> Tamaño y velocidad del trazo por confirmar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "Z" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) so that the index fingertip is at the upper-left of the signing space from the signer's perspective (upper-RIGHT area of the image), at shoulder height, about 20 cm in front of the body, and forms this handshape: only the index finger extended straight up; the other fingers and the thumb folded into a fist. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the fingerspelled letter "Z" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) so that the index fingertip is at the lower-right of the signing space from the signer's perspective (lower-LEFT area of the image), at chest height, about 20 cm in front of the body, and forms this handshape: only the index finger extended straight up; the other fingers and the thumb folded into a fist. Palm facing the viewer. This is the END position of the movement. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the fingerspelled letter "Z" in Ecuadorian Sign Language (LSEC) with her right hand: during the first half second she holds the start position, then she traces a letter Z in the air with the index fingertip, as written from the signer's own perspective: a horizontal stroke to the signer's right, a diagonal stroke down to the signer's left, and a horizontal stroke to the signer's right (the viewer sees a mirrored Z), smoothly and at a clear teaching pace, and holds the end position still until the clip ends. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Números 1–5

#### 1 — `num_1`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/num_1.mp4` |

Descripción del catálogo: *Índice extendido hacia arriba; los demás dedos cerrados.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the number "1" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: only the index finger extended straight up; the other fingers and the thumb folded into a fist. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the number "1" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 2 — `num_2`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/num_2.mp4` |

Descripción del catálogo: *Índice y medio extendidos y separados.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the number "2" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index and middle fingers extended up and spread apart; the other fingers and the thumb folded. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the number "2" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 3 — `num_3`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/andres/num_3.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the number "3" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the number "3" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 4 — `num_4`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/num_4.mp4` |

Descripción del catálogo: *Cuatro dedos extendidos y separados; el pulgar recogido.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the number "4" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: index, middle, ring and little fingers extended up and spread; the thumb folded into the palm. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the number "4" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 5 — `num_5`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Estática | 1 | 4 s | ✅ Descrita en el catálogo (borrador) | `app/static/media/lsec/andres/num_5.mp4` |

Descripción del catálogo: *Mano abierta con los cinco dedos extendidos y separados.*

> Orientación de la palma por confirmar (por defecto, hacia la cámara).

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the number "5" in Ecuadorian Sign Language (LSEC). He raises his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) to shoulder height, in front of the right shoulder, about 20 cm in front of the body, and forms this handshape: open hand with all five fingers extended and spread apart. Palm facing the viewer. The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Andrés holds the handshape of the number "5" perfectly still in front of his right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Números 6–10

#### 6 — `num_6`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/num_6.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "6" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the number "6" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 7 — `num_7`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/num_7.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "7" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the number "7" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 8 — `num_8`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/num_8.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "8" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the number "8" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 9 — `num_9`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Estática | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/num_9.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "9" in Ecuadorian Sign Language (LSEC). She raises her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view) <<UBICACIÓN: p. ej. to shoulder height, in front of the right shoulder>>, about 20 cm in front of the body, and forms this handshape: <<CONFIGURACIÓN DE LA MANO, en inglés, dictada por el intérprete: qué dedos están extendidos, doblados o cerrados, dónde está el pulgar y qué dedos se tocan>>. <<ORIENTACIÓN DE LA PALMA: p. ej. Palm facing the viewer.>> The left hand rests relaxed at the waist, out of the way. Calm, friendly expression, looking at the camera, mouth closed. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

*Fotograma final: no se necesita (la seña es estática; el video mantiene la posición).*

**2. Video** (Omni, 4 s):

```text
Animate this exact frame. Killa holds the handshape of the number "9" perfectly still in front of her right shoulder for the entire clip; the fingers keep exactly the same position and do not move. Only subtle natural life: slow breathing, one natural blink, and a slight friendly nod in the last second. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

#### 10 — `num_10`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Con movimiento | 1 | 4 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/num_10.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "10" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the number "10" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 4 s):

```text
Use the first image as the start frame and the second image as the end frame. Killa performs the number "10" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 4 seconds.
```

### Saludos y cortesía

#### HOLA — `hola`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/hola.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "HOLA" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "HOLA" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the sign "HOLA" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### ADIÓS — `adios`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/andres/adios.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "ADIÓS" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "ADIÓS" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Andrés performs the sign "ADIÓS" in Ecuadorian Sign Language (LSEC): during the first half second he holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### BUENOS DÍAS — `buenos_dias`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/buenos_dias.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the sign "BUENOS DÍAS" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the sign "BUENOS DÍAS" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Killa performs the sign "BUENOS DÍAS" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### GRACIAS — `gracias`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/gracias.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the sign "GRACIAS" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the sign "GRACIAS" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Ramón performs the sign "GRACIAS" in Ecuadorian Sign Language (LSEC): during the first half second he holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### POR FAVOR — `por_favor`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/por_favor.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "POR FAVOR" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "POR FAVOR" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the sign "POR FAVOR" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### SÍ — `si`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/andres/si.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "SÍ" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "SÍ" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Andrés performs the sign "SÍ" in Ecuadorian Sign Language (LSEC): during the first half second he holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### NO — `no`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Killa (`killa`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/killa/no.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the sign "NO" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_killa.png`):

```text
Using the attached reference image, keep exactly the same person (Killa): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Killa is a sign-language model demonstrating the sign "NO" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Killa performs the sign "NO" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### BIEN — `bien`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Ramón (`ramon`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/ramon/bien.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the sign "BIEN" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_ramon.png`):

```text
Using the attached reference image, keep exactly the same person (Ramón): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Ramón is a sign-language model demonstrating the sign "BIEN" in Ecuadorian Sign Language (LSEC). Using his RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), he shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Ramón performs the sign "BIEN" in Ecuadorian Sign Language (LSEC): during the first half second he holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### MAL — `mal`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Sofía (`sofia`) | Con movimiento | 1 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/sofia/mal.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "MAL" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. The left hand rests relaxed at the waist. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_sofia.png`):

```text
Using the attached reference image, keep exactly the same person (Sofía): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Sofía is a sign-language model demonstrating the sign "MAL" in Ecuadorian Sign Language (LSEC). Using her RIGHT hand (which appears on the LEFT side of the image from the viewer's point of view), she shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Sofía performs the sign "MAL" in Ecuadorian Sign Language (LSEC): during the first half second she holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

#### NOMBRE — `nombre`

| Avatar | Tipo | Manos | Duración | Contenido | Archivo |
|---|---|---|---|---|---|
| Andrés (`andres`) | Con movimiento | 2 | 6 s | ⚠️ Pendiente: completar con el intérprete | `app/static/media/lsec/andres/nombre.mp4` |

Descripción del catálogo: *Pendiente de documentar con intérprete LSEC.*

> Completa los campos `<<…>>` con la descripción del intérprete antes de generar.

> Incluye la expresión facial: en LSEC forma parte de la seña.

**1. Fotograma inicial** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "NOMBRE" in Ecuadorian Sign Language (LSEC). Using BOTH hands (right hand on the LEFT of the image, left hand on the RIGHT of the image), he shows the START position: <<CONFIGURACIÓN INICIAL>>, located <<UBICACIÓN INICIAL, p. ej. next to the forehead / in front of the chest>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**2. Fotograma final** (Nano Banana Pro, adjuntar `avatar_andres.png`):

```text
Using the attached reference image, keep exactly the same person (Andrés): same face, hairstyle, clothing, plain background, lighting and camera framing (front view, top of the head to the hips). Andrés is a sign-language model demonstrating the sign "NOMBRE" in Ecuadorian Sign Language (LSEC). Using BOTH hands (right hand on the LEFT of the image, left hand on the RIGHT of the image), he shows the END position: <<CONFIGURACIÓN FINAL>>, located <<UBICACIÓN FINAL>>, <<ORIENTACIÓN DE LA PALMA>>. Facial expression: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Constraints: photorealistic; exactly five fingers on each hand, anatomically correct, no extra, missing or merged fingers; the signing hand is in sharp focus and not cropped; no text, captions, subtitles, logos or watermarks; no other people; same person, clothing, background, lighting and camera framing as the reference image; 16:9 landscape.
```

**3. Video** (Omni, 6 s):

```text
Use the first image as the start frame and the second image as the end frame. Andrés performs the sign "NOMBRE" in Ecuadorian Sign Language (LSEC): during the first half second he holds the start position, then <<MOVIMIENTO: trayectoria, dirección, repeticiones y velocidad, desde la perspectiva de quien señala>>, at a clear teaching pace, and holds the end position until the clip ends. Facial expression throughout: <<EXPRESIÓN FACIAL / COMPONENTES NO MANUALES, p. ej. warm smile, eyebrows raised>>. Static camera on a tripod: no zoom, no pan, no cuts, no transitions. Same person, clothing, background and lighting throughout. Anatomically correct hands with exactly five fingers at every moment; fingers must not morph, merge or flicker. Silent video: no speech, no lip movement as if talking, no music, no sound effects. No text or captions. Duration: 6 seconds.
```

## 7. Lista de verificación del intérprete

Para cada video, el intérprete de LSEC confirma:

- [ ] **Configuración:** la forma de la mano es la de LSEC (dedos extendidos, doblados, cerrados y contactos correctos).
- [ ] **Orientación:** la palma y los dedos apuntan hacia donde corresponde.
- [ ] **Ubicación:** la seña se hace en el lugar correcto del espacio o del cuerpo.
- [ ] **Movimiento:** trayectoria, dirección, repeticiones y velocidad correctas (señas dinámicas).
- [ ] **Componentes no manuales:** la expresión facial y la postura acompañan bien a la seña.
- [ ] **Mano dominante:** se hace con la derecha y el video no está volteado.
- [ ] **Anatomía:** cinco dedos en cada mano en todo momento; sin deformaciones, parpadeos ni dedos fusionados.
- [ ] **Naturalidad:** la seña se entiende como la haría una persona sorda o un intérprete.

Si algo falla, se anota qué corregir y se regenera (normalmente basta con ajustar el fotograma inicial). Si la descripción del catálogo resulta incorrecta, se corrige primero `catalog.json` y se vuelve a generar este documento.

## 8. Registro en el catálogo

Cuando el video está validado, añade `media` a la seña en `app/content/lsec/catalog.json`:

```json
{
  "media": {
    "video": "/static/media/lsec/sofia/a.mp4",
    "poster": "/static/media/lsec/sofia/a.jpg",
    "avatar": "sofia",
    "ai_generated": true,
    "validated_by": "Nombre del intérprete",
    "validated_at": "2026-11-20"
  }
}
```

- `ai_generated` es obligatorio: la plataforma muestra el aviso de IA según este campo.
- Sin `validated_by`, el video solo lo ven los docentes, con el aviso *pendiente de validación*.
- La validación del **video** no cambia `validated` de la **seña** (que se refiere a su descripción en el catálogo); el intérprete puede validar ambas a la vez.
