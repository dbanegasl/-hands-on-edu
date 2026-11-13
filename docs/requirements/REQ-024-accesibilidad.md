# REQ-024 — Accesibilidad (NTE INEN-ISO/IEC 40500 ≈ WCAG 2.0 AA)

> **Última actualización:** 2026-11-13

| Campo | Valor |
|-------|-------|
| **ID** | REQ-024 |
| **Tipo** | Mejora |
| **Prioridad** | Alta (antes del piloto; requisito habitual de instituciones públicas) |
| **Estado** | ✅ Hecho (v0.24.0) |
| **Módulo** | Global |

---

## Problema

En Ecuador, la norma de accesibilidad web es la NTE INEN-ISO/IEC 40500, equivalente a WCAG 2.0. Una plataforma para enseñar lengua de señas tiene que cumplirla:
- su público incluye personas sordas y con otras discapacidades;
- una institución pública puede exigirla para adoptarla.

No se había medido. La primera auditoría con axe-core encontró 8 tipos de problema en 7 páginas, más de 100 elementos en total:
- contraste insuficiente: botones de la portada, texto atenuado de los módulos y unidades bloqueadas del Aula;
- tablas desplazables a las que no se llega con el teclado.

Además, varios puntos que axe no detecta:
- sin región `<main>`;
- lienzos de cámara sin nombre;
- foco del teclado invisible en AttendEye y VirtualPainter;
- campos con solo `placeholder`;
- desbordamiento horizontal a 320 px;
- el Aula no movía el foco al cambiar de pantalla ni anunciaba las señas;
- la Evaluación tenía un límite de 12 s por seña que no se podía ajustar (criterio 2.2.1).

## Solución

- **Correcciones** en todas las páginas: contraste ≥ 4,5:1, `<main>`, nombres accesibles, etiquetas, foco visible, reflujo y foco retenido en el diálogo del panel. Detalle por criterio en [docs/accessibility.md](../accessibility.md).
- **Aula:**
  - el foco pasa al título de cada pantalla;
  - región `aria-live` («Seña 2 de 5: U», «Correcto», «No reconocida: U»);
  - **⏱ Sin límite de tiempo**: la Evaluación y el Repaso esperan la seña; *Saltar* sigue disponible. La preferencia se guarda en el navegador. La sesión la registra (`details.no_time_limit`) y el panel la muestra.
- **Pruebas que impiden retroceder:**
  - `tests/test_accessibility.py` revisa la estructura de cada página y el contraste de cada paleta, sin navegador;
  - `scripts/a11y-audit.py` pasa axe-core (`wcag2a` + `wcag2aa`) por 84 estados: 21 pantallas × claro/oscuro × escritorio/móvil, incluidos Aula con cámara, Validación y Diagnóstico. La CI lo ejecuta contra la imagen construida.
- **Kit piloto:**
  - categoría de incidencia `accesibilidad`;
  - pregunta 11 de la encuesta a estudiantes (ayudas usadas y barreras).

## Criterios de aceptación

- [x] axe-core sin incumplimientos WCAG 2.0 A/AA en las 84 pantallas auditadas, en la CI.
- [x] Contraste ≥ 4,5:1 de todas las paletas, comprobado sin navegador.
- [x] Recorrido completo del Aula con el teclado; el foco nunca se pierde ni queda oculto.
- [x] Sin desplazamiento horizontal a 320 px ni con el texto al 200 %.
- [x] Límite de tiempo desactivable por el estudiante y visible para el docente.
- [ ] Prueba con lector de pantalla (NVDA y TalkBack) y con estudiantes durante el piloto (ver [accessibility.md §4](../accessibility.md#4-pendiente-requiere-personas)).
