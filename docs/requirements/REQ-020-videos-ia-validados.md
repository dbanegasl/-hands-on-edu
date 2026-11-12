# REQ-020 — Videos de referencia generados con IA y validados por intérprete

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-020 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | 🔄 En progreso (plataforma lista; falta producir y validar los videos) |
| **Módulo** | Aula de Señas · Estudio de Señas · contenido LSEC |
| **Depende de** | REQ-018 |

---

## Contexto

Las lecciones necesitan un video de referencia de cada seña. Grabar a intérpretes reales exige permisos de uso de imagen; en su lugar los videos se generan con IA (Google Flow: Nano Banana Pro + Omni) usando **4 avatares ficticios con identidad ecuatoriana** (2 mujeres, 2 hombres) y **un intérprete de LSEC los valida** antes de que lleguen a los estudiantes.

## Decisiones

- **Aviso obligatorio:** todo video generado con IA muestra *🤖 Video generado con IA · ✔ Validado por intérprete de LSEC: nombre (fecha)*. `media.ai_generated` es obligatorio en el catálogo para que el aviso no dependa de que alguien lo recuerde.
- **Sin validación no hay video para estudiantes:** sin `media.validated_by` el video solo lo ven docentes (`/aula?unlock=all`, Estudio de Señas) con el aviso *pendiente de validación*.
- **No se inventan señas:** las 26 señas sin descripción en el catálogo tienen prompts plantilla con campos `<<…>>` que se completan con el intérprete.
- **Mano dominante derecha y video sin voltear:** el estudiante imita en espejo.

## Implementado (v0.10.0)

- Documento de producción [`docs/content/videos-ia-lsec.md`](../content/videos-ia-lsec.md): política, flujo, especificaciones, 4 avatares con su prompt maestro, asignación por unidad, y por cada una de las 50 señas: avatar, duración (4 o 6 s), prompt del fotograma inicial, del fotograma final (señas con movimiento) y del video; lista de verificación del intérprete y registro en el catálogo.
- El documento se genera con `scripts/gen_video_prompts.py` desde `catalog.json`; el CI falla si queda desactualizado (`--check`).
- Esquema `media` validado en `app/signs/catalog.py`: `video` (obligatorio), `poster`, `avatar`, `ai_generated` (obligatorio), `validated_by`, `validated_at` (AAAA-MM-DD, requiere `validated_by`).
- `HO.Curriculum.mediaInfo()` decide visibilidad y aviso; lo usan el Aula (lecciones) y el Estudio de Señas.

## Pendiente

- [ ] Generar las imágenes maestras de los 4 avatares.
- [ ] Completar con un intérprete las descripciones de las 26 señas pendientes (actualizar `catalog.json` y regenerar el documento).
- [ ] Producir los videos y guardarlos en `app/static/media/lsec/<avatar>/<sign_id>.mp4` (evaluar Git LFS o almacenamiento externo si el volumen crece).
- [ ] Validación por intérprete y registro de `media` en el catálogo.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
