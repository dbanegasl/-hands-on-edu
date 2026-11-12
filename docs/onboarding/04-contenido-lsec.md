# 04 · Contenido LSEC: validación, plantillas y videos

> Para quién: el equipo de contenido (docentes de LSEC) y el **intérprete** que valida.
> Es el paso que más trabajo lleva y el más importante: el sistema solo enseña bien lo que el intérprete aprobó.

## 1. Qué contiene el curso y dónde vive

Todo el contenido está en un archivo: `app/content/lsec/catalog.json`.

| Parte | Qué es |
|---|---|
| `units` | 8 unidades en orden: vocales, consonantes I–III, letras con movimiento, números 1–5 y 6–10, saludos |
| `signs` | 50 señas, cada una con glosa, descripción, pista, número de manos, tipo (estática o con movimiento), `validated` y opcionalmente `handshape` (descriptor) y `media` (video) |
| `spelling_words` | Palabras para la actividad de deletreo |
| `language.status` | Hoy `borrador`: el contenido no está validado |

> El catálogo es un **borrador** basado en el alfabeto manual latinoamericano y en el Diccionario Oficial de LSEC «Gabriel Román» (CONADIS, 2014). **No lo presentes como validado** hasta completar este proceso.

El trabajo se hace en tres capas, en este orden:

```
1. Validar la descripción      2. Grabar plantillas            3. Producir el video
   (catálogo)                     (Estudio de Señas)               (IA + validación)
   ¿La seña es así en LSEC?  →    El sistema aprende a       →    El estudiante ve un
                                  reconocerla                      modelo de referencia
```

## 2. Validar las descripciones (intérprete + editor del catálogo)

Para cada seña de las unidades que se van a usar:

1. El intérprete revisa en el **Estudio de Señas** (`/signstudio`) la descripción y la pista. Todas las señas muestran el chip *Sin validar*.
2. Si la descripción es correcta, el editor cambia `"validated": false` por `true` en `catalog.json`.
3. Si no lo es, el intérprete dicta la descripción correcta y el editor la cambia en `description` y `hint` (en lenguaje sencillo, para estudiantes).
4. Las señas *pendientes de documentar* (vocabulario, algunas letras con movimiento) necesitan que el intérprete describa configuración, ubicación y movimiento.

Después de editar el catálogo:

```bash
python3 scripts/gen_video_prompts.py        # regenera los prompts de video con las descripciones nuevas
docker compose exec hands-on-edu pytest tests/test_api_signs.py   # el catálogo se valida al cargar
```

Si el catálogo tiene un error (clave desconocida, unidad con una seña inexistente), los tests fallan con un mensaje que dice exactamente qué corregir, y en la aplicación el Aula y el Estudio no cargan. **Corre siempre los tests antes de publicar.** Cuando todas las unidades en uso estén validadas, cambia `language.status` y la nota `validation_note`.

> **Cambiar el descriptor (`handshape`)** afecta al reconocimiento. Hazlo solo con la guía técnica [sign-engine.md](../sign-engine.md) y vuelve a probar la seña en vivo.

## 3. Grabar plantillas (docente o intérprete que signa)

Las señas sin descriptor (30 de 50: letras con movimiento, números 3 y 6–10, saludos y vocabulario) **no se pueden practicar** hasta que alguien grabe plantillas. Detalle: [Estudio de Señas](../modules/signstudio.md).

Preparación:

- Buena luz frontal, fondo liso, la persona de la cintura para arriba y las manos siempre dentro del cuadro.
- Equipo con cámara a la altura de la cara.
- Si el servidor tiene `ADMIN_TOKEN`, el Estudio lo pedirá al guardar la primera plantilla.

Procedimiento por seña:

1. En `/signstudio`, busca la seña y escribe tu nombre en *Autor/a*.
2. Pulsa **Grabar** (o la barra espaciadora). Hay 3 s de cuenta regresiva.
   - **Estática:** mantén la seña quieta hasta que termine la captura.
   - **Con movimiento:** elige la duración (1,2–4 s) y haz la seña completa una vez, a velocidad natural.
3. Graba **al menos 3 plantillas** por seña. Mejor si son de **2–3 personas distintas** (manos y estilos diferentes) y con pequeñas variaciones de distancia a la cámara.
4. Pruébala en vivo en el mismo Estudio: el medidor debe superar el umbral con la seña correcta y **no** con las señas parecidas (por ejemplo M/N, P/K).

Compartir: **⬇ Exportar dataset** genera un JSON con todas las plantillas; otra instalación lo carga con **⬆ Importar**. Así una institución puede aprovechar las grabaciones de otra.

## 4. Videos de referencia con IA (producción + validación)

Los videos se generan con IA usando **4 avatares ficticios** con identidad ecuatoriana. Así no se usa la imagen de ningún intérprete y no hacen falta permisos de imagen. El intérprete **valida** cada video, y la plataforma lo dice siempre: *🤖 Video generado con IA · ✔ Validado por intérprete de LSEC: nombre (fecha)*.

Todo el procedimiento, con los prompts listos por seña, está en **[videos-ia-lsec.md](../content/videos-ia-lsec.md)**. En resumen:

1. Generar una vez la imagen maestra de cada avatar (sección 4 del documento).
2. Por seña: fotograma inicial (y final si tiene movimiento) en Nano Banana Pro → video en Flow con Omni (4–6 s).
3. Revisar los dedos con zoom **antes** de generar el video; descartar generaciones con deformaciones.
4. Guardar en `app/static/media/lsec/<avatar>/<id_seña>.mp4`.
5. El intérprete revisa con la **lista de verificación** (sección 7).
6. Registrar `media` en el catálogo con `validated_by` y `validated_at` (sección 8).

| Estado del video en el catálogo | Quién lo ve |
|---|---|
| Sin `media` | Nadie: la lección muestra la descripción y la plantilla |
| `media` sin `validated_by` | Solo docentes, con el aviso *pendiente de validación* |
| `media` con `validated_by` | Estudiantes y docentes, con el aviso de IA + validación |

## 5. Registro de validación (recomendado)

Lleva una hoja compartida con una fila por seña:

| Seña | Descripción validada (quién, fecha) | Plantillas (n, autores) | Video (avatar, validado por, fecha) | Observaciones |
|---|---|---|---|---|

Sirve como respaldo del aval lingüístico y para planificar qué unidad se puede abrir a los estudiantes.

## 6. Publicar cambios de contenido

- **Plantillas:** se guardan en la base de datos y están disponibles al instante.
- **Catálogo y videos:** son archivos del repositorio. Haz los cambios en una rama, abre un pull request y despliega con `git pull` + `docker compose … up -d --build` ([Despliegue §4](../deployment.md#4-actualizar)). El CI comprueba el catálogo y que el documento de prompts esté al día.
