# Estudio de Señas — Herramienta docente

## Propósito

Herramienta para docentes e intérpretes:

1. **Explorar** el catálogo de una lengua de señas (hoy LSEC) por categoría o con buscador.
2. **Probar en vivo** el reconocimiento de cualquier seña. Muestra un medidor de coincidencia, un veredicto, la **retroalimentación didáctica** (p. ej. "Junta los dedos índice y medio") y los 5 candidatos más probables con su fuente (`spec`, `template`, `dtw`).
3. **Grabar plantillas de referencia** para las señas que no se reconocen solo con descriptores: letras con movimiento, vocabulario, señas a dos manos o señas pendientes de documentar.
4. **Exportar/Importar** el dataset de plantillas en JSON para compartirlo entre instituciones.

## URL

`http://localhost:9876/signstudio`

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `app/static/signstudio.html` | Diseño de 3 columnas: catálogo · cámara + grabación · detalle |
| `app/static/css/signstudio.css` | Prefijo `.ss-` |
| `app/static/js/signstudio.js` | Lógica de la página |
| `app/static/js/ho-signs.js` | Motor de reconocimiento (ver `docs/sign-engine.md`) |

## Grabación

| Tipo | Procedimiento |
|------|---------------|
| Estática | Cuenta regresiva de 3 s → 12 muestras cada 110 ms con la seña quieta (máx. 5 s). Exige el número de manos de la seña. Mínimo 3 muestras. |
| Dinámica | Cuenta regresiva de 3 s → se graba la secuencia completa durante la duración elegida (1,2 / 2 / 3 / 4 s). Mínimo 5 cuadros. |

Atajo: **barra espaciadora** = grabar. El campo *Autor/a* se recuerda en el navegador.

## Indicadores del catálogo

| Chip | Significado |
|------|-------------|
| `Descriptor` | Tiene `handshape` en el catálogo: se reconoce sin grabaciones |
| `N` (violeta) | Número de plantillas grabadas |
| `Mov.` | Seña con movimiento (DTW) |
| `—` | Todavía no es reconocible: necesita una grabación |
| `Sin validar` | Contenido pendiente de validación lingüística |

## Seguridad

Si se define `ADMIN_TOKEN` en `.env`, guardar, eliminar o importar plantillas exige ese token. El Estudio lo pide la primera vez y lo guarda en `localStorage`. Leer el catálogo y las plantillas es público.
