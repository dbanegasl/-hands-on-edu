# 07 · Manual de grabación y entrenamiento del modelo

> **Para quién:** el equipo de contenido (docentes de LSEC e intérpretes) y la persona que coordina el reconocimiento de señas. No hace falta saber programación.
> **Resultado:** un modelo entrenado con grabaciones de varias personas, evaluado con datos reales y publicado solo si mejora el reconocimiento.
> **Tiempo:** unos 15 minutos de grabación por persona más 5 minutos de entrenamiento y revisión. Se repite cuando se agregan grabaciones.

---

## 1. Qué es y qué no es

HandsOnEdu reconoce las señas con tres herramientas que se complementan:

| Herramienta | De dónde sale | Qué aporta |
|---|---|---|
| **Descriptores** | El catálogo (configuración de dedos, pulgar, palma) | Reconoce sin grabaciones y da la corrección en español («Extiende el dedo medio») |
| **Plantillas** | Grabaciones hechas en el Estudio de Señas | Compara al estudiante con ejemplos reales; imprescindibles para las señas sin descriptor y para las que tienen movimiento |
| **Modelo entrenado** | Aprendido a partir de todas las plantillas | Aprende qué distingue a las señas parecidas (M/N, U/V/R, A/S/E) a partir de varias personas |

El modelo **se suma** a las otras dos, no las reemplaza. Si no hay modelo, todo funciona igual.

**Qué cubre hoy:** las **33 señas estáticas de una mano**, es decir, el alfabeto sin movimiento y los números del 1 al 9. **No cubre** las señas con movimiento (J, Ñ, Z, LL, CH, RR, saludos, 10…) ni las de dos manos, que siguen reconociéndose solo con sus plantillas.

**Privacidad:** el Estudio **no guarda video ni imágenes**. Cada grabación son las coordenadas de 21 puntos de la mano durante 1,5 s, más el nombre que se escriba en *Autor/a*. Aun así, informa a cada persona de para qué se usan sus grabaciones y deja constancia de su consentimiento (§9).

---

## 2. Antes de empezar

**Personas.** Lo más importante para un buen modelo es grabar **con varias personas distintas**:

| Nivel | Personas que graban | Grabaciones por seña | Para qué alcanza |
|---|---|---|---|
| Mínimo | 1 | 2 | Probar el flujo. El informe avisará de que la cifra es optimista |
| **Recomendado** | **3** (p. ej. intérprete + 2 docentes) | **2 por persona → 6** | Primer modelo para usar en clase |
| Bueno | 5 o más, con manos de distinto tamaño (también jóvenes) y alguna persona zurda | 2 por persona | Reconocimiento estable con estudiantes nuevos |

Las personas deben **signar con fluidez**: el modelo aprende exactamente lo que se le muestra. Si una seña está mal hecha en las grabaciones, el modelo aprenderá a aceptarla mal hecha.

**Lugar y equipo:**

- Portátil o PC con cámara web y Chrome o Edge actualizado.
- Luz frontal (ventana o lámpara delante de la persona, no detrás). Fondo liso.
- La persona a 50–80 cm de la cámara, visible de la cintura para arriba, con la mano **entera** dentro del cuadro.
- Si el servidor tiene `ADMIN_TOKEN`, tenlo a mano: el Estudio lo pide al guardar la primera grabación y al publicar el modelo.

**Contenido validado.** Graba solo señas cuya configuración ya revisó el intérprete ([04 §2](./04-contenido-lsec.md#2-validar-las-descripciones-intérprete--editor-del-catálogo)). Si la descripción del catálogo cambia después, hay que volver a grabar esa seña.

---

## 3. Qué grabar: plan de la sesión

Graba **todas** las señas de la lista, aunque ya se reconozcan con descriptor: el modelo aprende a distinguirlas comparándolas entre sí. Empieza por los grupos de señas parecidas, que es donde el modelo más ayuda:

| Prioridad | Grupo (se confunden entre sí) | Señas |
|---|---|---|
| 1 | Puño con variaciones del pulgar | A · S · E · T · M · N |
| 1 | Dos dedos arriba | U · V · R · 2 · H · K |
| 1 | Índice arriba | D · 1 |
| 2 | Mano redondeada | C · O |
| 2 | Mano plana | B · 4 · 5 |
| 2 | Meñique | I · Y |
| 3 | Resto del alfabeto estático | F · G · L · P · Q · W · X |
| 3 | Resto de números | 3 · 6 · 7 · 8 · 9 |

Son 33 señas. Con 2 grabaciones cada una salen **66 grabaciones por persona, unos 12–15 minutos**.

**Hoja de control** (imprímela o cópiala en una hoja de cálculo):

| Seña | Persona 1 (×2) | Persona 2 (×2) | Persona 3 (×2) | Nota |
|---|---|---|---|---|
| A | ☐☐ | ☐☐ | ☐☐ | |
| S | ☐☐ | ☐☐ | ☐☐ | |
| … | | | | |

---

## 4. Procedimiento de grabación

Para cada persona:

1. Abre `/signstudio` y escribe su nombre en **Autor/a** (se recuerda en ese navegador). Usa siempre el mismo nombre para la misma persona: el informe cuenta cuántas personas distintas grabaron.
2. Pulsa **📷 Activar cámara** y comprueba que el esqueleto de la mano se dibuja bien.
3. Por cada seña de la lista:
   1. Búscala en el catálogo (buscador o pestañas) y selecciónala.
   2. Pulsa **⏺ Grabar plantilla** o la **barra espaciadora**. Hay 3 s de cuenta regresiva.
   3. Haz la seña y **mantenla quieta** hasta que termine la captura (12 muestras, ~1,5 s).
   4. Repite para la **segunda grabación**, con una pequeña variación: un poco más cerca o más lejos de la cámara, o con la mano algo más a un lado. Así el modelo no depende de una sola posición.
4. **Cambia de mano solo si la persona es zurda de verdad:** el sistema ya trata igual la mano izquierda y la derecha. No grabes con la mano que no se usa para signar.

**Si una grabación sale mal** (mano cortada por el borde, seña equivocada, se movió antes de tiempo): bórrala con 🗑 en *Plantillas de esta seña* y vuelve a grabar. Una grabación mala perjudica más de lo que ayuda una buena.

**Comprobación rápida en vivo:** después de grabar una seña, hazla y mira *Verificación en vivo*. El medidor debe superar el umbral con la seña correcta. Haz también su seña parecida (p. ej. N cuando está seleccionada M): **no** debería aceptarse.

---

## 5. Entrenar y evaluar

Cuando haya grabaciones de al menos 2 señas con 2 grabaciones cada una (lo ideal es tener el plan del §3 completo):

1. En el Estudio, tarjeta **🧠 Modelo entrenado** → **Entrenar y evaluar**.
2. Espera unos segundos. Todo ocurre en tu navegador: no cierres la pestaña.
3. Aparece el informe.

### Cómo se evalúa (por qué el informe es fiable)

Antes de proponer el modelo, el Estudio lo pone a prueba **con grabaciones que no vio al entrenar**:

1. Separa las grabaciones en grupos.
2. Entrena con todos los grupos menos uno.
3. Prueba con el grupo apartado.
4. Repite hasta haber probado todas las grabaciones.

Cada grabación se aparta **entera**, nunca la mitad. Si no, el modelo se examinaría con fotos casi idénticas a las que estudió.

En cada prueba compara el reconocimiento **sin modelo** (lo que hay hoy) y **con modelo**, usando la misma regla que el Aula aplica al estudiante.

### Cómo leer el informe

| Indicador | Qué significa | Qué buscar |
|---|---|---|
| **Seña correcta aceptada** | % de veces que, haciendo bien la seña, el sistema la acepta | Que **suba** con el modelo |
| **Seña equivocada aceptada** | % de veces que el sistema aceptaría *otra* seña con lo que se hizo | Que **no suba** (idealmente 0–2 %) |
| **Acierto (1.ª opción)** | % de veces que la seña correcta queda primera entre las del modelo | Que no baje |

- **Recuadro verde** («El modelo mejora…»): aparece el botón **Publicar modelo**.
- **Recuadro naranja** («no mejora…»): no se ofrece publicar. Sigue con el §6.
- **Tabla por seña (peor primero):** muestra en qué señas falla. Una seña con aceptación baja *con* modelo necesita más grabaciones, sobre todo de otras personas.
- **Confusiones más frecuentes** (p. ej. «M → N (14)»): graba más ejemplos de **las dos** señas del par, cuidando la diferencia (en M/N, el número de dedos sobre el pulgar).
- **«Con una sola grabación»:** esas señas no entran en el modelo; grábalas otra vez.
- **«Todas las grabaciones son de la misma persona»:** la cifra es optimista. Con estudiantes reales será menor. Antes de usarlo en clase, consigue grabaciones de al menos otra persona.

**Orientación para decidir** (no son reglas fijas):

| Situación | Decisión |
|---|---|
| Recomendado, 3+ personas, ninguna seña por debajo de ~50 % de aceptación con modelo | Publicar |
| Recomendado, pero 1 sola persona | Publicar para probar con el equipo; no anunciarlo a estudiantes hasta tener más personas |
| Recomendado, pero algunas señas muy bajas | Publicar y planificar grabaciones de esas señas |
| No recomendado | No publicar; grabar más (§6) |

---

## 6. Si el modelo no mejora

Por orden de impacto:

1. **Más personas** grabando las mismas señas. Es lo que más ayuda.
2. **Revisar las grabaciones** de las señas peor valoradas: borrar las que tengan la seña mal hecha o la mano cortada.
3. **Grabar los pares confundidos** con especial cuidado en el rasgo que los distingue.
4. **Variar las condiciones:** distancia, luz y cámara (otro portátil).
5. Volver a **Entrenar y evaluar**.

Que no mejore también puede ser una buena noticia: si los descriptores y las plantillas ya aciertan casi siempre, el modelo no tiene margen para mejorar. El informe lo muestra en la columna «sin modelo».

---

## 7. Publicar, comprobar y volver atrás

1. **Publicar modelo** (pide el token si está configurado). La tarjeta pasa a **Activo**.
2. **Comprobar en vivo** en el Estudio: selecciona una seña del modelo y hazla. En *Candidatos* la fuente aparece como `…+model`.
3. **Comprobar con alguien que no grabó** (la prueba más honesta). Pide a una persona que no participó en las grabaciones que haga en el Estudio cada seña de la tabla del §3 y anota cuáles se aceptan a la primera. Si una seña falla con esta persona, grábala también con ella.
4. El **Aula** usa el modelo desde la siguiente vez que un estudiante la abre (no hace falta reiniciar nada).

**Desactivar:** botón **Desactivar** en la misma tarjeta. El reconocimiento vuelve a descriptores y plantillas al instante.

**Volver a un modelo anterior** (lo hace TI; cada publicación queda guardada):

```bash
# Listar los modelos publicados (más reciente primero), con su informe
curl -s https://handsonedu.tu-institucion.edu.ec/api/signs/lsec/models

# Activar uno anterior por su id
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://handsonedu.tu-institucion.edu.ec/api/signs/lsec/models/<id>/activate
```

---

## 8. Cuándo volver a entrenar

La tarjeta avisa: *«Desde entonces hay N grabaciones nuevas…»*. Vuelve a entrenar y evaluar:

- después de cada sesión de grabación;
- si se borraron grabaciones malas;
- si el intérprete cambió la descripción de una seña (y se regrabó);
- tras importar un dataset de otra institución.

El modelo publicado **no cambia solo**: sigue siendo el mismo hasta que alguien publique uno nuevo.

---

## 9. Registro recomendado

Lleva un registro sencillo (hoja de cálculo) para saber de dónde salió cada modelo:

| Fecha | Personas que grabaron (y consentimiento) | Señas / grabaciones | Correcta aceptada (sin → con) | Equivocada aceptada (sin → con) | ¿Publicado? | Quién decidió |
|---|---|---|---|---|---|---|
| 2026-12-01 | Intérprete A, Docente B, Docente C (✔) | 33 / 198 | 61 % → 78 % | 3 % → 2 % | Sí | Coordinación LSEC |

---

## 10. Compartir grabaciones entre instituciones

Las grabaciones valen más cuantas más personas distintas aportan. En *Plantillas de esta seña*:

- **⬇ Exportar dataset** descarga un JSON con todas las grabaciones (puntos de la mano y autor, sin imágenes).
- **⬆ Importar** las carga en otra instalación.

Después de importar, vuelve a **Entrenar y evaluar**. Antes de compartir, acuerda con las personas que grabaron que sus grabaciones salgan de la institución, y pon un seudónimo en el autor si lo prefieren.

---

## 11. Para TI: entrenar sin navegador

El mismo código del Estudio se puede ejecutar en un servidor con Node 20 o superior, útil para automatizarlo o revisar los números:

```bash
# Evaluar con las grabaciones del servidor (no publica nada)
node scripts/train-sign-model.cjs --base https://handsonedu.tu-institucion.edu.ec

# Evaluar un dataset exportado
node scripts/train-sign-model.cjs --templates plantillas-lsec-2026-12-01.json

# Publicar solo si mejora (sale con código 2 si no se recomienda)
ADMIN_TOKEN=… node scripts/train-sign-model.cjs --base https://… --publish
```

Detalle técnico (características, red, evaluación, API): [REQ-010](../requirements/REQ-010-custom-ml-classifier.md) y [motor de señas §4.4](../sign-engine.md).

---

## 12. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| «Se necesitan al menos 2 señas estáticas de una mano con 2 grabaciones cada una» | Pocas grabaciones de señas estáticas | Grabar al menos 2 veces 2 señas (idealmente el plan del §3) |
| No aparece **Publicar modelo** | El modelo no mejora con estos datos | §6 |
| El informe avisa «misma persona» | Todas las grabaciones tienen el mismo *Autor/a* (o vacío) | Grabar con otras personas y escribir su nombre |
| Una seña bien hecha se acepta en el Estudio pero no en el Aula del estudiante | Distinta luz, distancia o cámara | Grabar esa seña en condiciones parecidas a las del aula |
| Tras publicar, una seña empeoró | Grabaciones malas de esa seña o de su pareja | Revisar y borrar grabaciones malas, reentrenar; mientras tanto, **Desactivar** |
| El entrenamiento tarda mucho | Equipo lento o muchísimas grabaciones | Es normal que tarde hasta medio minuto con miles de grabaciones; no cierres la pestaña |
