# 03 · Conectar el Moodle institucional y hacer el piloto

> Para quién: la persona que administra Moodle, con apoyo de TI.
> Antes: HandsOnEdu instalado con HTTPS ([Despliegue](../deployment.md)). Lo ideal es haber hecho antes la [prueba local](./02-moodle-local.md).
> Referencia técnica (campos, flujo, API): [moodle-integration.md](../moodle-integration.md).

## 1. Datos que hay que reunir

| Dato | Ejemplo | Quién lo tiene |
|---|---|---|
| URL pública de HandsOnEdu (`PUBLIC_BASE_URL`) | `https://senas.miescuela.edu.ec` | TI |
| `ADMIN_TOKEN` de HandsOnEdu | (cadena larga) | TI, por un canal privado |
| URL de Moodle | `https://moodle.miescuela.edu.ec` | Admin. de Moodle |
| Cuenta de administrador de Moodle | | Admin. de Moodle |
| Un curso de prueba con un docente y 2–3 estudiantes de prueba | | Admin. de Moodle |

## 2. Conectividad (5 minutos, evita la mayoría de problemas)

La integración necesita tráfico **en los dos sentidos**:

| Desde | Hacia | Para qué | Cómo comprobarlo |
|---|---|---|---|
| Navegadores | HandsOnEdu (443) | Usar el Aula | Abrir `https://<handsonedu>/health` |
| Servidor Moodle | HandsOnEdu `/lti/jwks` | Moodle verifica las firmas de HandsOnEdu (Deep Linking y notas) | Desde el servidor Moodle: `curl -s https://<handsonedu>/lti/jwks` |
| Servidor HandsOnEdu | Moodle `/mod/lti/certs.php` y `/mod/lti/token.php` | Validar lanzamientos y enviar notas | `docker compose exec hands-on-edu python -c "import urllib.request;print(urllib.request.urlopen('https://<moodle>/mod/lti/certs.php').status)"` |

> **Si HandsOnEdu está en una IP privada o en un puerto distinto de 443**, Moodle bloquea esas llamadas por seguridad. Ajusta en Moodle *Administración del sitio → Generales → Seguridad → Seguridad HTTP*: **Hosts bloqueados por cURL** (quita la red privada de HandsOnEdu) y **Puertos permitidos por cURL**.

## 3. Crear la herramienta en Moodle

Sigue el [Paso 1 de moodle-integration.md](../moodle-integration.md#paso-1--crear-la-herramienta-en-moodle). Abre `https://<handsonedu>/lti/setup` al lado: tiene todas las URLs con botón *Copiar*.

Puntos que se olvidan con facilidad:

- [ ] **Contenedor de lanzamiento: Nueva ventana.** Dentro de un iframe la cámara no funciona.
- [ ] **Soporta Deep Linking** marcado.
- [ ] **Servicios → IMS LTI Assignment and Grade Services**: *Usar este servicio para la sincronización de calificaciones y la gestión de columnas*.
- [ ] **Servicios → IMS LTI Names and Role Provisioning**: *Usar este servicio para recuperar información de los miembros…* (lo usará el panel docente).
- [ ] **Privacidad → Compartir el nombre del usuario: Siempre** (si no, los estudiantes aparecen sin nombre).
- [ ] **Privacidad → Compartir el correo: Nunca** (HandsOnEdu no lo necesita).
- [ ] Uso de la configuración: *Mostrar en el selector de actividades y como herramienta preconfigurada*.

## 4. Registrar Moodle en HandsOnEdu

En Moodle, en la tarjeta de la herramienta, pulsa el icono de lista (**Ver detalles de configuración**) y copia los valores en el formulario de `https://<handsonedu>/lti/setup`. Escribir la URL de Moodle rellena sola las tres URLs; tú copias **ID de plataforma**, **ID de cliente** e **ID de despliegue**. El formulario pide el `ADMIN_TOKEN`.

✔ Comprueba: la plataforma aparece en la lista de `/lti/setup`.

## 5. Prueba técnica con usuarios de prueba (20 minutos)

Repite la prueba de [02 · Moodle local](./02-moodle-local.md#4-prueba-completa-15-minutos) en el curso de prueba y marca:

- [ ] El docente agrega una unidad con **Seleccionar contenido** y aparece la columna en Calificaciones.
- [ ] El estudiante abre la actividad: pestaña nueva, su nombre de Moodle, unidad resaltada.
- [ ] La cámara se activa sin avisos de seguridad.
- [ ] Al terminar la evaluación aparece *✔ Nota enviada a la plataforma*.
- [ ] La nota aparece en el libro de calificaciones.
- [ ] Repetir con nota menor no baja la nota.
- [ ] El docente que abre la actividad ve todas las unidades abiertas (modo docente).
- [ ] Un estudiante de **otro** curso no ve la actividad (control normal de Moodle).
- [ ] El docente abre **📊 Panel del curso** desde el Aula: aparecen los estudiantes del curso (también los que no entraron, si NRPS está activo) y la nota del estudiante de prueba.

## 6. Piloto con un grupo real (2–4 semanas)

| Semana | Qué hacer | Qué medir |
|---|---|---|
| 0 | Contenido validado de 1–2 unidades ([04](./04-contenido-lsec.md)); sesión con docentes ([05](./05-guia-docente.md)) | — |
| 1 | Clase guiada en laboratorio: todos entran desde Moodle a la Unidad 1 | ¿Cuántos activaron la cámara a la primera? ¿Equipos lentos? |
| 2–3 | Práctica autónoma y evaluaciones | Notas recibidas en Moodle vs. evaluaciones hechas; señas que el sistema no reconoce bien |
| 4 | Entrevista breve a docentes y a 3–5 estudiantes; revisión con el intérprete | Señas a regrabar o a corregir en el catálogo |

Registra los problemas con: fecha, curso, estudiante (usuario de Moodle), navegador y equipo, y captura de pantalla.

## 7. Lista para salir a producción

- [ ] HTTPS válido en HandsOnEdu (sin avisos del navegador).
- [ ] `PUBLIC_BASE_URL` definitivo. **Cambiarlo después obliga a reconfigurar la herramienta en Moodle.**
- [ ] `ADMIN_TOKEN` definido y guardado en el gestor de contraseñas de TI.
- [ ] Copia diaria de `data/` programada y probada (restaurar al menos una vez).
- [ ] Prueba técnica (sección 5) completa en el Moodle de producción.
- [ ] Unidades que se van a usar revisadas por un intérprete.
- [ ] Aviso de privacidad a estudiantes y familias: qué se guarda (nombre, resultados de práctica) y que el video **no** sale del equipo.
- [ ] Contacto de soporte definido para docentes (quién atiende y en qué horario).
