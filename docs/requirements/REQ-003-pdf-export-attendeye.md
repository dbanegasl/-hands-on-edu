# REQ-003 — Exportación PDF del Reporte de Asistencia (AttendEye)

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-003 |
| **Tipo** | Mejora |
| **Prioridad** | Media |
| **Estado** | ✅ Hecho |
| **Módulo** | AttendEye |
| **Esfuerzo estimado** | S (1–3 horas) |

---

## Problema

El reporte de asistencia generado por AttendEye existe **únicamente en memoria de sesión del navegador**. Al cerrar la pestaña o recargar la página, los datos se pierden permanentemente.

En el contexto institucional de **UNAE**, los docentes deben entregar registros de asistencia a coordinación académica. Actualmente no existe ningún mecanismo de exportación, lo que obliga a transcribir los datos manualmente o hacer una captura de pantalla (no aceptada como evidencia formal).

---

## Alcance propuesto

### Botón de exportación

- Agregar botón **"Exportar PDF"** en la pantalla de reporte de AttendEye (visible solo cuando hay al menos un registro).
- El botón debe estar deshabilitado mientras la sesión de asistencia está en curso.

### Contenido del PDF generado

El PDF debe contener los siguientes elementos en orden:

1. **Encabezado institucional**
   - Logo de UNAE (imagen embebida en base64 o placeholder con texto).
   - Nombre de la institución: "Universidad Nacional de Educación — UNAE".
   - Nombre del módulo: "Registro de Asistencia — AttendEye".

2. **Metadatos de sesión**
   - Nombre del docente (campo de texto libre, solicitado antes de exportar).
   - Fecha y hora de la sesión (ISO 8601, generada automáticamente).
   - Número de estudiantes registrados.

3. **Tabla de asistencia**
   | # | Nombre del estudiante | Estado | Hora de registro |
   |---|----------------------|--------|-----------------|
   - Estado: `Presente` / `Ausente` / `Tardanza`.
   - Filas con colores alternados para legibilidad.

4. **Resumen**
   - Total presentes / Total ausentes / Total tardanzas.
   - Porcentaje de asistencia.

5. **Firma del docente**
   - Campo de texto: "Nombre y firma del docente: _______________".
   - Espacio en blanco para firma física si se imprime.

### Flujo de usuario

```
[Fin de sesión AttendEye]
        ↓
[Pantalla de reporte con tabla]
        ↓
[Click en "Exportar PDF"]
        ↓
[Modal: "Ingrese su nombre para el reporte" + campo de texto]
        ↓
[Click en "Generar"] → descarga automática de asistencia-YYYY-MM-DD.pdf
```

---

## Tecnología

Generación del PDF **en el frontend**, sin backend adicional:

- **jsPDF v2+** (CDN) — generación del documento PDF.
- **jsPDF-AutoTable** (CDN) — renderizado de la tabla de asistencia con estilos.

```html
<!-- Agregar en attendeye.html -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
```

> **Nota:** Si el proyecto requiere funcionamiento completamente offline, evaluar bundlear jsPDF en el proceso de build o copiar los archivos a `app/static/js/vendor/`.

---

## Archivos a modificar

```
app/templates/attendeye.html   ← agregar imports CDN de jsPDF, botón "Exportar PDF", modal de nombre
app/static/js/attendeye.js     ← agregar función exportToPDF(), lógica del modal
```

### Firma de la función a implementar

```javascript
/**
 * Genera y descarga el reporte de asistencia como PDF.
 * @param {string} teacherName - Nombre del docente para el encabezado
 * @param {Array<{name: string, status: string, time: string}>} records - Registros de asistencia
 */
function exportToPDF(teacherName, records) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  // ... implementación
  doc.save(`asistencia-${new Date().toISOString().split('T')[0]}.pdf`);
}
```

---

## Criterio de aceptación

- ✅ Click en **"Exportar PDF"** abre un modal solicitando el nombre del docente.
- ✅ Tras confirmar, se descarga automáticamente el archivo `asistencia-YYYY-MM-DD.pdf`.
- ✅ El PDF contiene: encabezado institucional, nombre del docente, fecha/hora, tabla de asistencia con todos los registros, resumen numérico y campo de firma.
- ✅ La tabla en el PDF tiene los mismos datos que la tabla visible en pantalla.
- ✅ El botón está **deshabilitado** si no hay registros de asistencia.
- ✅ El PDF se genera correctamente en Chrome, Firefox y Edge modernos.
- ✅ No se realiza ninguna petición de red adicional al backend para generar el PDF.

---

## Dependencias

| Biblioteca | Versión mínima | Fuente |
|-----------|---------------|--------|
| jsPDF | 2.5.1 | CDN (Cloudflare) |
| jsPDF-AutoTable | 3.8.2 | CDN (Cloudflare) |

No depende de otros REQs.

---

*Volver al [Índice de Requisitos](./INDEX.md)*
