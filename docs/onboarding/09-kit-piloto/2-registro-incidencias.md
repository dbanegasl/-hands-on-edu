# 2 · Registro de incidencias

> Una sola lista para todo el piloto: la hoja de cálculo [`incidencias.csv`](./incidencias.csv), que se abre en Excel o Google Sheets. Va separada por punto y coma, así que Excel en español la abre en columnas directamente. Trae una fila de ejemplo: bórrala al empezar. Durante la clase se anota en papel y después se copia.

## Qué anotar

| Campo | Ejemplo | Notas |
|---|---|---|
| `id` | 7 | Correlativo |
| `fecha_hora` | 2026-11-20 10:15 | |
| `quien_reporta` | Docente 3B | Rol, no hace falta el nombre |
| `curso` | LSEC 1 — 3B | |
| `puesto` | PC-07 | El que se escribió en `/diagnostico` |
| `usuario_moodle` | `est03` | **Solo si hace falta para reproducirlo.** Nunca la contraseña. Son datos personales ([08](../08-privacidad.md)) |
| `navegador_sistema` | Chrome 130 · Windows | Lo dice el resumen de `/diagnostico` |
| `categoria` | camara | Ver la tabla de abajo |
| `gravedad` | bloqueante | Ver la tabla de abajo |
| `que_paso` | La cámara se ve negra | Lo que se vio, con las palabras del mensaje si lo hubo |
| `que_se_esperaba` | Ver la imagen con los puntos | |
| `sena` | `hola` | Solo para problemas de reconocimiento |
| `afecta_a_otros` | sí, 3 equipos | ¿Le pasa a más gente? |
| `captura` | `inc-07.png` | Nombre del archivo de la captura de pantalla |
| `responsable` | TI | Ver el reparto de abajo |
| `estado` | abierta | `abierta`, `en curso`, `resuelta` o `no se reproduce` |
| `solucion` | Se cerró Teams | Qué se hizo |
| `fecha_cierre` | 2026-11-20 | |

## Categorías y a quién le toca

| `categoria` | Ejemplos | Responsable | Primera ayuda |
|---|---|---|---|
| `acceso` | No entra a Moodle, la actividad no abre, pide otra contraseña | Admin. de Moodle | [06 · Entrada desde Moodle](../06-problemas-frecuentes.md#entrada-desde-moodle) |
| `camara` | Sin permiso, en uso, imagen negra | TI | `/diagnostico` en ese equipo |
| `rendimiento` | Muy lento, se congela | TI | `/diagnostico` (velocidad) |
| `reconocimiento` | Una seña bien hecha no se reconoce, o una mal hecha se acepta | Intérprete + contenido | [3 §4](./3-encuestas.md#4-revisión-del-intérprete-semana-4-3045-minutos) y [04](../04-contenido-lsec.md) |
| `notas` | No llegó la nota a Moodle, nota distinta | Admin. de Moodle + TI | Panel → detalle → **↻ Reintentar**; [06 · Notas](../06-problemas-frecuentes.md#notas-que-no-llegan-a-moodle) |
| `contenido` | Descripción confusa, video incorrecto, falta una seña | Intérprete + contenido | [04](../04-contenido-lsec.md) |
| `uso` | No entiende qué hacer, botón poco claro | Coordinación | Recoger para el informe (mejoras) |
| `accesibilidad` | No puede usarlo con teclado, lector de pantalla, zoom o el tiempo no le alcanza | Coordinación + TI | ⏱ *Sin límite de tiempo* en el Aula; [accesibilidad](../../accessibility.md) |
| `otro` | | Coordinación | |

## Gravedad

| `gravedad` | Significa | Plazo propuesto |
|---|---|---|
| `bloqueante` | Alguien no puede practicar o no recibe su nota | Antes de la próxima clase |
| `grave` | Funciona, pero con un error que confunde o hace perder tiempo (por ejemplo, una seña que casi nunca se reconoce) | En la semana |
| `menor` | Molesto, pero hay forma de seguir | Al cierre del piloto |
| `sugerencia` | Idea de mejora | Para el informe |

**Problemas de la plataforma:** si TI confirma que es un fallo de HandsOnEdu, se reporta al equipo de desarrollo (en GitHub) con los datos de la [guía 06](../06-problemas-frecuentes.md#cómo-reportar-un-problema), **sin datos personales**.

## Formulario en papel

Imprime esta parte para anotar durante la clase.

---

**Incidencia n.º ____**   Fecha y hora: ____________   Puesto: ________   Curso: ______________

Categoría (marca una):  ☐ acceso  ☐ cámara  ☐ rendimiento  ☐ reconocimiento  ☐ notas  ☐ contenido  ☐ uso  ☐ accesibilidad  ☐ otro

Gravedad:  ☐ bloqueante  ☐ grave  ☐ menor  ☐ sugerencia     ¿Le pasa a otros?  ☐ no  ☐ sí: ______

Qué pasó (mensaje en pantalla, si hubo):
______________________________________________________________________________
______________________________________________________________________________

Qué se esperaba: ____________________________________________________________

Seña (si es de reconocimiento): ______________   ¿Se hizo captura?  ☐ sí  ☐ no

Qué se hizo en el momento: _____________________________________________________

---
