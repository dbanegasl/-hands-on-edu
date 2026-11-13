# Accesibilidad — informe de conformidad

> **Última actualización:** 2026-11-13 · versión 0.24.0 · [REQ-024](./requirements/REQ-024-accesibilidad.md)

| | |
|---|---|
| **Norma** | NTE INEN-ISO/IEC 40500 (Ecuador), equivalente a **WCAG 2.0**, niveles **A y AA** |
| **Alcance** | Todas las páginas: Aula de Señas, Panel docente, Diagnóstico, Privacidad, Validación, Estudio de Señas, Conectar con Moodle, portada y módulos gestuales (GestiEdu, MotivaSign, AttendEye, VirtualPainter, AirPiano, Testing Lab) |
| **Navegadores** | Chrome/Edge (Chromium) de escritorio y móvil, modo claro y oscuro |
| **Estado** | Sin incumplimientos detectados por las pruebas automáticas. Revisión manual de teclado, foco, ampliación y tiempo hecha. **Pendiente:** prueba con lector de pantalla y con usuarios (ver §4) |

## 1. Cómo se comprueba

| Prueba | Qué cubre | Cuándo corre |
|---|---|---|
| `tests/test_accessibility.py` (pytest, sin navegador) | Por página: `lang="es"`, `<title>`, un `<main>`, zoom no bloqueado, `id` únicos, lienzos e imágenes con nombre, botones con nombre, campos con etiqueta, foco visible en sus estilos. Además, el contraste ≥ 4,5:1 de cada paleta (texto y texto atenuado sobre cada fondo, también en modo oscuro) | En cada CI |
| `scripts/a11y-audit.py` (axe-core 4.10 en Chromium) | Reglas `wcag2a` + `wcag2aa` en 21 pantallas × claro/oscuro × escritorio/móvil = **84 estados**, incluidos los que alcanza el estudiante: Aula (perfil, ruta, lección con cámara), Validación (revisión, informe) y resultado del Diagnóstico | En cada CI (job *Docker*, contra la imagen construida) |
| Revisión manual (teclado, foco, ampliación, tiempo) | Lo que axe no puede juzgar; ver §2 | Antes de cada versión con cambios de interfaz |

Ejecutar la auditoría contra una instalación **de pruebas** (crea un perfil y lo borra al terminar):

```bash
pip install playwright && python3 -m playwright install chromium
npm pack axe-core@4.10.3 && tar xzf axe-core-4.10.3.tgz
python3 scripts/a11y-audit.py http://localhost:9876 --axe package/axe.min.js [--quick] [--json informe.json]
```

## 2. Resultado por criterio

Antes de esta versión, axe encontró 8 tipos de problema en 7 páginas (más de 100 elementos), casi todos de contraste. Ahora: **0**.

| Criterio WCAG 2.0 | Qué se hizo |
|---|---|
| 1.1.1 Contenido no textual | Cada `<canvas>` tiene nombre («Tu cámara con las manos detectadas», «Lienzo con tu dibujo», «Teclado del piano») o está oculto si es decorativo. El esqueleto de la mano de la portada tiene descripción en español. Las señas se presentan siempre con texto: glosa, descripción y pista |
| 1.2.x Multimedia | Los videos de referencia son de lengua de señas y **no tienen audio**. Su alternativa en texto es la glosa con la descripción de la seña |
| 1.3.1 Información y relaciones | Una región `<main>` por página. Campos con `<label>` asociada. Las tablas desplazables del panel y de la validación son regiones con nombre |
| 1.4.1 Uso del color | El acierto o error nunca depende solo del color: ✔/✘ y texto. Las señas sin grabación aparecen tachadas y con borde discontinuo |
| 1.4.3 Contraste mínimo | Paletas corregidas: botón primario de la portada, botones de módulos, texto atenuado de AttendEye, VirtualPainter, AirPiano y GestiEdu, y unidades bloqueadas del Aula (antes con `opacity`, que bajaba el texto a 3,5:1). Mínimo 4,5:1, comprobado por la CI |
| 1.4.4 Cambio de tamaño del texto | El zoom no está bloqueado. A 320 y 640 px de ancho (texto al 200 %) no hay desplazamiento horizontal: la barra de la portada y la de MotivaSign se reacomodan |
| 2.1.1 Teclado | Todo se maneja con el teclado: Aula (perfil, unidades, actividades, *Saltar*, *Salir*), panel (filas con Enter/Espacio), validación (atajos) |
| 2.2.1 Tiempo ajustable | **⏱ Sin límite de tiempo** en el Aula: la Evaluación y el Repaso esperan la seña, y *Saltar* sigue disponible. Queda registrado y el docente lo ve en el panel. La Validación del intérprete conserva el límite a propósito, porque mide la regla real de la evaluación |
| 2.4.1 Evitar bloques | Regiones `<nav>` y `<main>` en todas las páginas |
| 2.4.2 Titulado | Título propio en cada página |
| 2.4.3 Orden del foco | En el Aula el foco pasa al título de cada pantalla nueva. El diálogo del estudiante en el panel retiene el foco (Tab/Mayús+Tab) y al cerrarlo con Esc lo devuelve a la fila |
| 2.4.7 Foco visible | Contorno de 3 px en todas las páginas (`:focus-visible`). Antes, AttendEye y VirtualPainter lo quitaban |
| 3.1.1 Idioma | `lang="es"` |
| 3.3.2 Etiquetas | Los campos que solo tenían `placeholder` ahora tienen etiqueta: búsqueda del Estudio, token del panel, clase y lista de AttendEye |
| 4.1.2 Nombre, función, valor | Botones de icono con `aria-label`. ⏱ y 🔇 indican su estado (`aria-pressed`, icono). Mensajes en regiones `aria-live`: en el Aula, «Seña 2 de 5: U», «Correcto», «No reconocida: U» |

## 3. Límites conocidos (no son incumplimientos, pero hay que decirlos)

- **La actividad principal pide hacer señas con la mano frente a una cámara.** Es la esencia de aprender una lengua de señas, no una barrera técnica, pero un estudiante con movilidad reducida en manos o brazos no podrá completarla. La institución debe prever una evaluación alternativa.
- **Los sonidos** (acierto/error) siempre van acompañados de una señal visual. El público sordo no pierde información.
- **Los módulos gestuales de demostración** (VirtualPainter, AirPiano, GestiEdu, MotivaSign, AttendEye) pasan la auditoría, pero son experiencias visuales y gestuales sin alternativa equivalente. No forman parte del curso ni de la nota.
- **Sin límite de tiempo en evaluaciones con nota:** decide la institución. La opción no cambia la regla de acierto (mantener la seña 1,2 s), solo quita el temporizador.

## 4. Pendiente (requiere personas)

| Qué | Quién | Cómo |
|---|---|---|
| Lector de pantalla: NVDA + Firefox/Chrome en Windows; TalkBack en Android | Docente o TI con NVDA | Recorrer el perfil, la ruta, una lección y una evaluación. Anotar si cada anuncio se entiende |
| Estudiantes sordos y con baja visión en el piloto | Kit piloto ([09](./onboarding/09-kit-piloto/README.md)) | Pregunta 11 de la encuesta a estudiantes; incidencias con la categoría `accesibilidad` |
| Revisión externa | Opcional, si la institución la exige para contratar | Este informe + `a11y-audit.py --json` como evidencia |
