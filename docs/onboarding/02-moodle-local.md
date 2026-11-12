# 02 · Moodle local de prueba

> Para quién: TI o desarrolladores que quieren ver la integración funcionando **antes** de tocar el Moodle de la institución.
> Resultado: un Moodle 4.5 en tu equipo con un curso, un docente y dos estudiantes, conectado a HandsOnEdu por LTI 1.3.
> ⚠️ Solo para pruebas: contraseñas fijas y sin HTTPS.

## 1. Requisitos

- Docker con Compose v2 y unos 3 GB libres (imágenes de Moodle y MariaDB).
- Puertos libres **9876** (HandsOnEdu) y **8080** (Moodle).
- Google Chrome o Chromium (para la cámara en `http://`, ver paso 4).

## 2. Levantar los servicios

```bash
docker compose -f docker-compose.yml -f docker-compose.moodle.yml up -d
./scripts/moodle-dev-setup.sh
```

La primera vez Moodle se instala solo (entre 3 y 8 minutos); el script espera. Después:

1. Crea en Moodle la herramienta externa **HandsOnEdu — Aula de Señas** (LTI 1.3, keyset, Deep Linking, AGS y NRPS, nueva ventana).
2. Crea el curso **LSEC1** con usuarios de prueba.
3. Registra ese Moodle en HandsOnEdu (lo mismo que harías en `/lti/setup`).

Al terminar, muestra:

| | URL | Usuario / contraseña |
|---|---|---|
| Moodle | http://moodle.localtest.me:8080 | `admin` / `Admin1234!` |
| Docente | | `docente` / `Docente123!` |
| Estudiantes | | `estudiante` / `Estudiante123!` · `estudiante2` / `Estudiante123!` |
| HandsOnEdu | http://handsonedu.localtest.me:9876 | — |

Puedes volver a ejecutar el script: reutiliza todo lo que ya existe y deja las contraseñas como arriba.

> **¿Por qué `localtest.me`?** Es un dominio público que siempre apunta a `127.0.0.1`. Así el navegador y los dos contenedores usan **las mismas direcciones** (dentro de Docker se redirigen al host con `extra_hosts`), y los identificadores LTI coinciden en todos lados, como en producción.

## 3. Permitir la cámara en `http://` (una sola vez)

Los navegadores solo dan la cámara en HTTPS o en `localhost`. Para esta prueba:

1. En Chrome abre `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
2. Escribe `http://handsonedu.localtest.me:9876`, cambia a **Enabled** y pulsa **Relaunch**.

(En producción no hace falta: el servidor tiene HTTPS.)

## 4. Prueba completa (15 minutos)

### Como docente

1. Entra a Moodle como `docente` → curso **Lengua de Señas Ecuatoriana I** → activa **Modo de edición**.
2. **Añadir una actividad o recurso** → **HandsOnEdu — Aula de Señas**.
3. Pulsa **Seleccionar contenido**. Se abre HandsOnEdu dentro de una ventana de Moodle.
4. Marca **Unidad 6: Números 1–5** (deja *Con calificación* marcado) → **Agregar al curso**.
5. Moodle rellena el nombre *Aula de Señas · Números 1–5* → **Guardar cambios y regresar al curso**.

✔ Comprueba: en **Calificaciones** del curso aparece la columna *Aula de Señas · Números 1–5* sobre 100.

### Como estudiante (en otra ventana de incógnito)

1. Entra como `estudiante` → abre la actividad → se abre HandsOnEdu en una pestaña nueva.
2. ✔ Arriba dice *Conectado desde Moodle local de prueba* y tu nombre es **Ana Quishpe**, sin pedir cuenta.
3. ✔ La unidad *Números 1–5* está abierta y resaltada, aunque las anteriores no estén aprobadas.
4. Pulsa **Evaluación**, permite la cámara y haz las señas de los números (o pulsa *Saltar*).
5. ✔ Al terminar aparece *✔ Nota enviada a la plataforma: N/100*.

### De vuelta como docente

✔ En **Calificaciones** aparece la nota de Ana. Si ella repite la evaluación y saca menos, la nota no baja (se conserva la mejor).

Esta misma prueba se automatizó y pasó contra Moodle 4.5.4: Deep Linking → lanzamiento del estudiante → evaluación → nota 40/100 en el libro de calificaciones.

## 5. Qué mirar si algo falla

```bash
docker compose logs -f hands-on-edu          # peticiones /lti/login, /lti/launch, /api/...
docker logs -f hoe_moodle                    # Moodle (Apache)
```

Errores frecuentes: [06 · Problemas frecuentes](./06-problemas-frecuentes.md).

## 6. Apagar o borrar

```bash
docker compose -f docker-compose.yml -f docker-compose.moodle.yml stop            # apagar (conserva datos)
docker compose -f docker-compose.yml -f docker-compose.moodle.yml down -v         # borrar Moodle por completo
```

`down -v` borra los volúmenes de Moodle, pero no la base de HandsOnEdu (`./data`). Si vuelves a crear Moodle, el script reemplaza el registro anterior de la plataforma.
