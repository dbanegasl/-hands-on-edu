# REQ-007 — Dashboard del Docente

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-007 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho (v0.12.0) para el Aula de Señas — ver [docs/modules/panel.md](../modules/panel.md) |
| **Módulo** | Aula de Señas (`/panel`) |
| **Esfuerzo estimado** | L (8–15 horas) |

---

## Problema

Actualmente **no existe ninguna vista consolidada para el docente**. Para revisar resultados, el docente debe:

1. Entrar a cada módulo individualmente.
2. Ver solo los datos de la sesión activa en memoria.
3. No tiene acceso a ningún historial de sesiones anteriores.
4. No puede comparar el desempeño de estudiantes entre sesiones.
5. No puede generar reportes consolidados para presentar a coordinación.

Esto hace que HandsOnEdu sea percibido como una herramienta de demostración y no como una herramienta pedagógica de seguimiento real.

---

## Alcance propuesto

### Ruta del dashboard

```
/dashboard
```

Protegida por autenticación de docente (REQ-008). Mientras no esté implementado REQ-008, proteger con PIN básico (similar al enfoque de REQ-006).

### Secciones del dashboard

#### 1. Resumen general (cards superiores)

Una card por módulo con:
- Nombre del módulo e ícono.
- Fecha y hora de la última sesión.
- Promedio de resultados de la última sesión.
- Número total de estudiantes evaluados (histórico).

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   GestiEdu      │  │   MotivaSign    │  │   AttendEye     │
│ Última sesión   │  │ Última sesión   │  │ Última sesión   │
│ 2026-04-28      │  │ 2026-04-27      │  │ 2026-04-28      │
│ Promedio: 7.8   │  │ Nivel prom: 3   │  │ Asistencia: 92% │
│ 25 estudiantes  │  │ 18 estudiantes  │  │ 30 estudiantes  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

#### 2. Historial de sesiones (tabla con filtros)

Tabla con columnas: Fecha | Módulo | Docente | Estudiantes | Resultado promedio | Acciones.

Filtros:
- Por módulo (dropdown).
- Por rango de fecha (date pickers).
- Por docente (si hay múltiples usuarios).

Acciones por fila:
- 👁 **Ver detalle** → abre página de reporte completo de esa sesión.
- 📄 **Exportar CSV** → descarga CSV de esa sesión.

#### 3. Gráfica de progreso semanal

- Librería: **Chart.js** (CDN, sin instalación).
- Gráfica de línea: eje X = semanas, eje Y = promedio de resultados.
- Una línea por módulo.
- Período visible: últimas 8 semanas (configurable).

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

#### 4. Exportación general

- Botón **"Exportar todo CSV"** → descarga `reporte-general-YYYY-MM-DD.csv` con todos los resultados filtrados actualmente en la tabla.
- Columnas del CSV: Fecha, Módulo, Docente, Estudiante, Resultado, Detalles.

---

## Archivos a crear

```
app/templates/dashboard.html    ← HTML del dashboard con layout de cards, tabla y gráfica
app/static/js/dashboard.js      ← lógica: carga de datos, filtros, Chart.js, exportación CSV
app/static/css/dashboard.css    ← estilos específicos del dashboard
app/api/dashboard.py            ← endpoints de datos para el dashboard
```

### Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/dashboard/summary` | Cards de resumen por módulo |
| `GET` | `/api/dashboard/sessions` | Lista de sesiones con filtros (query params: `module`, `from`, `to`, `teacher`) |
| `GET` | `/api/dashboard/progress` | Datos de la gráfica semanal por módulo |
| `GET` | `/api/dashboard/export-csv` | Exportar resultados filtrados como CSV |

### Ejemplo de respuesta `/api/dashboard/summary`

```json
{
  "gestiedu": {
    "last_session_date": "2026-04-28T14:30:00",
    "average_grade": 7.8,
    "total_students": 25
  },
  "motivasign": {
    "last_session_date": "2026-04-27T10:00:00",
    "average_level": 3,
    "total_students": 18
  },
  "attendeye": {
    "last_session_date": "2026-04-28T08:00:00",
    "attendance_rate": 0.92,
    "total_students": 30
  }
}
```

---

## Criterio de aceptación

- ✅ Dashboard muestra datos **reales** de sesiones guardadas en SQLite (no datos mockeados).
- ✅ La gráfica de Chart.js **renderiza correctamente** con datos históricos.
- ✅ Los filtros de la tabla **funcionan** (por módulo, fecha, docente).
- ✅ Exportar CSV descarga el archivo con los datos filtrados actualmente visibles.
- ✅ Las cards de resumen muestran los valores correctos según la base de datos.
- ✅ El dashboard es **responsive** y usable en tablets (resolución mínima 768px).
- ✅ Con base de datos vacía, muestra estado vacío amigable ("No hay sesiones registradas").

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-005 (SQLite) | **Bloqueante** — sin persistencia no hay datos que mostrar |
| REQ-008 (autenticación) | Recomendado — para proteger el dashboard en producción |

---

## Implementación (v0.12.0, 2026-11-12)

El alcance se reorientó a la dirección del producto (curso de LSEC integrado con Moodle por LTI, REQ-019):

| Propuesta original | Implementado |
|---|---|
| `/dashboard` protegido con PIN | `/panel`, con dos accesos: **docente desde Moodle** (lanzamiento LTI con rol de docente → solo su curso) o **token de administrador** (toda la instalación) |
| Cards por módulo (GestiEdu, MotivaSign, AttendEye) | Tarjetas del Aula de Señas. Los módulos de gestos aún no guardan sesiones (REQ-005) |
| Historial de sesiones con filtros | Mapa de calor estudiante × unidad (mejor nota) con búsqueda y orden; detalle por estudiante con sus actividades y dominio por seña |
| Gráfica semanal con Chart.js (CDN) | Barras SVG propias (sin CDN: la instalación funciona sin salida a Internet), con tooltip y vista de tabla |
| Exportar CSV | `GET /api/panel/export.csv` |
| — | **Lista del curso por NRPS** (incluye a quien nunca abrió la actividad) |
| — | **Estado de las notas en Moodle** y reintento de envíos fallidos |
| — | Señas con más dificultad del grupo |

Probado contra Moodle 4.5.4 (`docker-compose.moodle.yml`): lanzamiento del docente → *Panel del curso* → lista NRPS con el estudiante sin actividad → detalle → CSV.

**Pendiente:** resúmenes de los módulos de gestos (depende de REQ-005) y filtros por fecha.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
