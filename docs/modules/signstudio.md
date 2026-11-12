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
| `app/static/js/ho-signs-model.js` | Entrenamiento, evaluación e inferencia del modelo (REQ-010) |

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

## Modelo entrenado (REQ-010)

La tarjeta **🧠 Modelo entrenado** muestra si hay un modelo activo, con cuántas grabaciones se entrenó y si hay grabaciones nuevas o eliminadas desde entonces.

**Entrenar y evaluar** entrena una red pequeña en el propio navegador con las grabaciones de las señas estáticas de una mano (al menos 2 por seña). Antes la evalúa con validación cruzada por grabación y muestra:

- con y sin modelo: *seña correcta aceptada*, *seña equivocada aceptada* y *acierto*;
- la tabla por seña (peor primero), las confusiones más frecuentes y las señas que tienen una sola grabación.

Solo si mejora aparece **Publicar modelo** (pide el token). El Aula y el Estudio lo usan desde ese momento, y en los candidatos en vivo la fuente aparece como `…+model`. **Desactivar** vuelve al motor sin modelo.

Sin navegador: `node scripts/train-sign-model.cjs` (`--out`, `--publish`, `--templates`). Manual para el equipo de contenido: [onboarding 07](../onboarding/07-entrenamiento-modelo.md).

## Seguridad

Si se define `ADMIN_TOKEN` en `.env`, guardar, eliminar o importar plantillas exige ese token. El Estudio lo pide la primera vez y lo guarda en `localStorage`. Leer el catálogo, las plantillas y el modelo activo es público; publicar, activar o desactivar modelos exige el token.
