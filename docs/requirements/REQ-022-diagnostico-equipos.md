# REQ-022 — Diagnóstico de equipos antes de la clase

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-022 |
| **Tipo** | Feature |
| **Prioridad** | Alta (semana 1 del piloto) |
| **Estado** | ✅ Hecho (v0.21.0) |
| **Módulo** | Global / Panel docente |

---

## Problema

La primera clase en el laboratorio es el momento de más dudas. Para la semana 1, el plan del piloto ([03 §6](../onboarding/03-moodle-institucional.md#6-piloto-con-un-grupo-real-24-semanas)) pide medir dos cosas:
- ¿cuántos activaron la cámara a la primera?
- ¿qué equipos son lentos?

Sin una herramienta, esas respuestas llegan durante la clase, cuando ya no hay tiempo de resolver nada.

## Solución

### `/diagnostico`

Comprueba un equipo en unos 30 segundos, con el mismo motor que el Aula:

| Paso | Qué comprueba |
|---|---|
| Navegador y conexión segura | HTTPS, dentro de un marco o no, versión del navegador, WebAssembly, WebGL y almacenamiento |
| Servidor | `/health` y latencia |
| Cámara | Permiso, si existe, si está en uso por otro programa y resolución |
| Motor | Carga (`HO.createHandSource`), si corre en el equipo o en el servidor, y tiempo de carga |
| Velocidad | Cuadros por segundo durante 6 s, tras 1,5 s de calentamiento, en tarjeta gráfica o procesador, y si vio una mano |

- **Resultado:** ✔ listo, ⚠ con avisos o ✗ no apto. Cada problema viene con su solución en lenguaje sencillo, y hay una línea de resumen para copiar.
- **Umbrales de velocidad:**
  - fluido desde 15 cuadros/s;
  - de 8 a 15, con aviso;
  - por debajo de 8, no apto.
- **Sala y puesto:** son opcionales. Se pueden pasar en la URL (`?sala=…&puesto=…`) y el equipo los recuerda.
- **Envío:** el resultado técnico se envía a `POST /api/diagnostics`, sin datos del estudiante ni imágenes. La cámara se apaga al terminar.

### Panel docente: «Equipos del laboratorio»

- **Últimos 7 días, con filtro por sala:**
  - equipos probados;
  - listos, con avisos y no aptos;
  - **cámara a la primera** (el primer intento de cada puesto);
  - velocidad mediana.
- **Tabla:** el último resultado de cada puesto, primero los que tienen problemas.
- **Enlace para los equipos,** con la sala ya puesta.
- **Acceso:** el del panel (docente LTI o `ADMIN_TOKEN`). Si la tarjeta falla, no afecta al resto del panel.

### Datos

- **Tabla `device_checks`** (migración `0003`). Guarda:
  - sala y puesto;
  - veredicto;
  - navegador y sistema;
  - cámara y resolución;
  - motor, tiempo de carga y FPS;
  - si vio una mano;
  - los códigos de los avisos.
- Aparece en `/privacidad`.
- `python -m app.privacy purge --diagnostics-days N` borra los antiguos.

## Pruebas

- `tests/js/diagnostico.test.cjs`:
  - navegador y sistema;
  - errores de la cámara;
  - veredicto y umbrales;
  - orden de los avisos;
  - resumen y cuerpo del envío.

  Encontró un fallo: con un navegador al día se añadía un aviso vacío.
- `tests/test_diagnostics.py`:
  - validación;
  - último resultado por puesto;
  - cámara a la primera;
  - ventana de días;
  - acceso;
  - `purge`.
- **E2E en Chromium con cámara simulada** (foto real de una mano):
  - la mano se detecta a 24–27 cuadros/s con el procesador;
  - la cámara se apaga al terminar;
  - una cámara bloqueada da «no apto» con la solución;
  - el panel muestra los dos equipos, con el problemático primero.
