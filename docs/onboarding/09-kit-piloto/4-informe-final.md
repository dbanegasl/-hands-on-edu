# 4 · Informe final del piloto

> Plantilla para completar al cerrar el piloto. Los criterios de la sección 2 se **acuerdan antes de empezar** (semana −1), no al ver los resultados.
>
> Cada dato indica de dónde sale, para que otra persona pueda comprobarlo.

## 1. Datos del piloto

| Campo | Valor |
|---|---|
| Institución | |
| Curso(s) y grupo(s) | |
| Fechas | del ____ al ____ (__ semanas) |
| Estudiantes en el curso | (Panel → *Estudiantes*) |
| Docentes | |
| Unidades usadas | (y si estaban validadas por un intérprete) |
| Versión de HandsOnEdu | (`https://<dirección>/health`) |
| Moodle | versión |
| Equipos del laboratorio | número y tipo |

## 2. Criterios de éxito

Los valores son una **propuesta**: ajústalos en la reunión de arranque y no los cambies después.

| # | Criterio | Meta propuesta | Fuente | Resultado | ¿Cumple? |
|---|---|---|---|---|---|
| T1 | Equipos del laboratorio listos (✔ o ⚠) antes de la clase guiada | ≥ 90 % | Panel → *Equipos del laboratorio* | | |
| T2 | Equipos que activaron la cámara a la primera | ≥ 80 % | Panel → *Equipos del laboratorio* | | |
| T3 | Notas que llegaron a Moodle (tras reintentar) | 100 % | Panel → *Notas no enviadas* = 0 | | |
| T4 | Incidencias **bloqueantes** sin resolver al cierre | 0 | `incidencias.csv` | | |
| U1 | Estudiantes que practicaron al menos una vez fuera de la clase guiada | ≥ 70 % | Encuesta 3 §2, pregunta 10; Panel → actividad | | |
| U2 | Estudiantes que aprobaron la Unidad 1 (≥ 70 %) | ≥ 60 % | CSV del panel, columna de la Unidad 1 | | |
| R1 | Señas aceptadas **bien hechas** por el intérprete (3 de 3) | ≥ 85 % de las señas | `/validacion` → informe, tarjeta R1 (3 §4) | | |
| R2 | Señas que se aceptan **mal hechas** | 0 en la evaluación | `/validacion` → informe, tarjeta R2; las retiradas con `assess: false` ya no cuentan (3 §4) | | |
| S1 | «La plataforma me ayudó a aprender» (mediana) | ≥ 4 de 5 | Encuesta 3 §2, pregunta 7 | | |
| S2 | Docentes que lo volverían a usar | ≥ 2 de cada 3 | Entrevistas 3 §3, pregunta 7 | | |

## 3. Resultados

### 3.1 Técnicos

- **Diagnóstico de equipos:**
  - equipos probados ___;
  - listos ___, con avisos ___ y no aptos ___;
  - cámara a la primera ___ %;
  - velocidad mediana ___ cuadros/s.
- Avisos más frecuentes, de la tabla del panel: ___
- Clase guiada:
  - estudiantes que vieron su imagen con los puntos de la mano a los 15 minutos: ___ de ___;
  - estudiantes que terminaron la evaluación: ___.
- **Incidencias** (de `incidencias.csv`; con una tabla dinámica por categoría y gravedad):

  | Categoría | Bloqueante | Grave | Menor | Sugerencia | Resueltas |
  |---|---|---|---|---|---|
  | acceso | | | | | |
  | cámara | | | | | |
  | rendimiento | | | | | |
  | reconocimiento | | | | | |
  | notas | | | | | |
  | contenido | | | | | |
  | uso | | | | | |

### 3.2 Uso y aprendizaje

Del **CSV del panel** (⬇ Exportar CSV, guardado al final de la semana 3 y al cierre):

- Estudiantes con actividad: ___ de ___. Activos en la última semana: ___.
- Tiempo de práctica total del grupo: ___ h. Mediana por estudiante: ___ min.
- Evaluaciones hechas: ___. Unidades aprobadas por estudiante (mediana): ___.
- Seguimiento semanal:

  | Semana | Activos (7 días) | Evaluaciones hechas | Notas no enviadas | Señas difíciles anotadas |
  |---|---|---|---|---|
  | 2 | | | | |
  | 3 | | | | |

- **Señas con más dificultad** al cierre (panel) y lo que dijo el intérprete de cada una:

  | Seña | % de aciertos del grupo | Intérprete: ¿problema del sistema o del aprendizaje? | Acción |
  |---|---|---|---|
  | | | | |

### 3.3 Opinión

- Encuesta a estudiantes: ___ respuestas de ___. Mediana de cada afirmación del 1 al 8: ___.
- Lo que más gustó, con 3 frases textuales: ___
- Lo que cambiarían, con 3 frases textuales: ___
- Docentes:
  - recomendación de 1 a 10: ___;
  - tiempo extra por semana: ___ min;
  - frases clave: ___.

## 4. Lecciones aprendidas

| Qué funcionó | Qué no funcionó | Qué cambiar |
|---|---|---|
| | | |

## 5. Decisión

☐ **Continuar** tal cual: se cumplen todos los criterios, o los incumplidos tienen una causa resuelta.
☐ **Continuar con cambios**: los cambios están en la tabla de abajo.
☐ **No continuar por ahora**: motivo y condición para reconsiderarlo.

| Cambio necesario | Responsable | Fecha |
|---|---|---|
| | | |

**Próximos pasos:**
- más unidades validadas;
- grabaciones con varias personas para el modelo ([07](../07-entrenamiento-modelo.md));
- videos validados (REQ-020);
- más grupos.

Firmas o visto bueno: coordinación ______  ·  docentes ______  ·  TI ______

## 6. Al cerrar el piloto

- [ ] Guardar el CSV del panel, `incidencias.csv`, las encuestas y este informe donde la institución guarde la documentación del proyecto.
- [ ] Decidir qué pasa con los datos de los estudiantes ([08 §4](../08-privacidad.md#4-al-terminar-el-piloto-o-el-curso)): ¿se conservan para el siguiente período o se borran con `purge`?
- [ ] Borrar los diagnósticos de equipos si ya no hacen falta: `python -m app.privacy purge --diagnostics-days 0 --yes`.
- [ ] Reportar al equipo de desarrollo las incidencias de la plataforma, sin datos personales.
