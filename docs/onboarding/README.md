# Puesta en marcha de HandsOnEdu — Guías de onboarding

Guías para quienes implementan HandsOnEdu en una institución: el equipo de TI, la persona que administra Moodle, el equipo de contenido con intérpretes de LSEC y los docentes.

## Qué es, en una frase

Un curso de Lengua de Señas Ecuatoriana (LSEC) que reconoce las señas del estudiante con la cámara, **dentro del navegador**, y se integra con Moodle por LTI 1.3: el estudiante entra desde su curso sin otra cuenta y su nota llega sola al libro de calificaciones.

## Ruta recomendada

| # | Paso | Quién | Guía | Tiempo |
|---|---|---|---|---|
| 1 | Probar todo en un equipo local, con un Moodle de prueba | TI | [02 · Moodle local de prueba](./02-moodle-local.md) | 30 min |
| 2 | Instalar HandsOnEdu en un servidor con HTTPS | TI | [Despliegue](../deployment.md) | 1–2 h |
| 3 | Conectar el Moodle institucional y hacer la prueba piloto | Admin. de Moodle + TI | [03 · Moodle institucional](./03-moodle-institucional.md) | 1 h + piloto |
| 4 | Validar el contenido LSEC, grabar plantillas y producir videos | Equipo de contenido + intérprete | [04 · Contenido LSEC](./04-contenido-lsec.md) | Continuo |
| 5 | Formar a los docentes | Coordinación académica | [05 · Guía para docentes](./05-guia-docente.md) | 1 sesión |
| 6 | Grabar con varias personas y entrenar el modelo de reconocimiento | Equipo de contenido | [07 · Grabación y entrenamiento del modelo](./07-entrenamiento-modelo.md) | 15 min/persona + 5 min |
| 7 | Aviso de privacidad, derechos de los estudiantes y plazo de conservación | Protección de datos + TI | [08 · Privacidad](./08-privacidad.md) | 1 h, antes del piloto |
| 8 | Hacer el piloto: guion de la primera clase, incidencias, encuestas e informe final | Coordinación + docentes | [09 · Kit del piloto](./09-kit-piloto/README.md) | 2–4 semanas |
| — | Cuando algo falla | Todos | [06 · Problemas frecuentes](./06-problemas-frecuentes.md) | — |

Los pasos 1–3 son técnicos y se hacen una vez. El paso 4 es el que más trabajo lleva y **condiciona lo que se puede enseñar**: hoy el catálogo es un borrador sin validar (ver abajo).

## Estado actual que debes conocer

| Tema | Estado | Qué implica |
|---|---|---|
| Integración Moodle (LTI 1.3, AGS, Deep Linking) | ✅ Probada de punta a punta con **Moodle 4.5.4** (docker local) | Falta una prueba piloto en el Moodle de la institución |
| Catálogo LSEC | 🟡 Borrador (`status: borrador`, señas con `validated: false`) | Un intérprete debe revisarlo antes de usarlo con estudiantes |
| Reconocimiento | 50 señas en el catálogo; 20 se reconocen solo con descriptores (16 letras y los números 1, 2, 4 y 5). Las otras 30 necesitan plantillas grabadas por un docente o intérprete | Una unidad sin ninguna seña reconocible aparece como *Próximamente*; dentro de una unidad, las señas sin plantilla se omiten |
| Videos de referencia | 📝 Prompts listos para 4 avatares de IA; ningún video producido ni validado aún | Las lecciones se muestran sin video hasta que se produzcan y validen |
| Panel docente | ✅ `/panel` (REQ-007): progreso por estudiante, unidad y seña; lista del curso por NRPS; CSV | Activa NRPS en la herramienta de Moodle para ver también a quien no ha entrado |
| Modelo entrenado | ✅ Disponible (REQ-010) para las 33 señas estáticas de una mano; **sin medir aún con grabaciones reales** | Seguir [07](./07-entrenamiento-modelo.md): grabar con 3+ personas, entrenar, publicar solo si el informe lo recomienda |

## Requisitos mínimos, de un vistazo

- **Servidor:** Linux con Docker; 2 vCPU y 2 GB de RAM bastan (el video no pasa por el servidor).
- **Dominio con HTTPS** (obligatorio para la cámara y para LTI).
- **Moodle 4.x** (o cualquier LMS con LTI 1.3 Advantage) con permiso para crear herramientas externas.
- **Estudiantes:** Chrome, Edge o Firefox actualizado y cámara web. Funciona en portátiles de gama media; en equipos sin GPU, el reconocimiento va algo más lento.
- **Intérprete de LSEC** disponible para validar contenido.

## Glosario

| Término | Significado |
|---|---|
| **LTI 1.3** | Estándar para conectar herramientas externas con un LMS de forma segura (inicio de sesión firmado) |
| **AGS** | *Assignment and Grade Services*: el servicio LTI por el que HandsOnEdu envía las notas a Moodle |
| **Deep Linking** | El docente elige desde Moodle qué unidad abre cada actividad |
| **NRPS** | *Names and Role Provisioning*: lista de participantes del curso (lo usará el panel docente) |
| **Issuer / Client ID / Deployment ID** | Identificadores que Moodle genera al crear la herramienta; HandsOnEdu los necesita para confiar en los lanzamientos |
| **Plantilla** | Grabación de referencia de una seña hecha en el Estudio de Señas; el motor compara al estudiante con ella |
| **Descriptor** | Descripción geométrica de una configuración de mano en el catálogo; permite reconocer sin grabaciones |
| **Glosa** | Nombre escrito de una seña (p. ej. `HOLA`) |
| **Modelo entrenado** | Red neuronal pequeña aprendida de las plantillas; se combina con descriptores y plantillas y solo se publica si mejora |
