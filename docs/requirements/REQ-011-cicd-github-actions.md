# REQ-011 — Pipeline CI/CD con GitHub Actions

> **Última actualización:** 2026-11-12

| Campo | Valor |
|-------|-------|
| **ID** | REQ-011 |
| **Tipo** | Tech-Debt |
| **Prioridad** | Alta |
| **Estado** | ✅ Hecho — CI en v0.9.0; entrega continua (imagen publicada, despliegue con respaldo y reversión automática) en v0.15.0 |
| **Módulo** | Global / DevOps |
| **Esfuerzo estimado** | M (3–5 horas) |

---

## Implementación (v0.15.0)

```
git tag v0.15.0 && git push origin v0.15.0
        │
        ▼  .github/workflows/release.yml
 verify ── la etiqueta coincide con APP_VERSION y hay sección en el CHANGELOG (scripts/release.py)
   │
 ci ────── el mismo ci.yml de cada PR (pytest ≥80 %, node --test, imagen, deploy.sh de punta a punta)
   │
 publish ─ construye la imagen → prueba de humo (arranca, /health con esa versión, páginas y WASM)
   │        → ghcr.io/dbanegasl/handsonedu:{0.15.0, 0.15, latest} → GitHub Release con las notas del CHANGELOG
   │
 deploy ── (solo si está la variable DEPLOY_HOST; entorno «production», con aprobación opcional)
            ssh servidor → deploy/deploy.sh 0.15.0:
              descarga la imagen → copia de la base → cambia la versión → reinicia
              → espera /health con la versión esperada → si falla, vuelve sola a la anterior
```

Cambios respecto a la propuesta original (abajo, como referencia histórica):

| Original | Implementado | Por qué |
|---|---|---|
| Docker Hub con usuario y contraseña | **GitHub Container Registry** con el `GITHUB_TOKEN` del propio workflow | Ningún secreto de registro que gestionar; la imagen queda junto al código |
| `ssh … docker-compose up -d` desde una acción de terceros | `ssh` del runner (con `known_hosts` obligatorio) que ejecuta **`deploy/deploy.sh`** en el servidor | Toda la lógica de despliegue vive en un script versionado que TI también usa a mano; la clave puede restringirse a ese único comando (`--from-ssh`) |
| Despliegue sin red de seguridad | **Copia de la base antes de cambiar**, comprobación de `/health` **con la versión esperada** y **reversión automática** | Una versión que no arranca no deja el servicio caído |
| Siempre despliega | El despliegue es **opcional** (variable `DEPLOY_HOST`) y pasa por el entorno `production` | Cada institución decide si actualiza sola o a mano con `./deploy.sh` |
| — | **Ejecutar a mano** el workflow con una versión → despliega (o revierte a) una versión ya publicada sin construir nada | Reversión en un clic |
| — | La imagen ya no arranca con `--reload` (solo el compose de desarrollo lo añade); `.dockerignore` impide copiar `.env`, `data/` o `.git` dentro de la imagen | Una imagen pública no puede llevar secretos ni datos |
| Badge de CI | Badges de CI y de la última versión en el README | |

### Archivos

| Archivo | Para qué |
|---|---|
| `.github/workflows/ci.yml` | Se añadió: coherencia versión/CHANGELOG, `shellcheck`, validación de los compose, «sin secretos en la imagen» y `scripts/test-deploy.sh`. También es reutilizable (`workflow_call`) |
| `.github/workflows/release.yml` | Entrega continua (diagrama de arriba) |
| `scripts/release.py` | `check [--tag]`, `version`, `notes X.Y.Z` (solo biblioteca estándar) |
| `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/deploy.sh` | Instalación en el servidor **sin clonar el repositorio**: solo esta carpeta y un `.env` |
| `scripts/test-deploy.sh` | Prueba de punta a punta de `deploy.sh`: instalación, copia antes de actualizar, reversión ante una versión que no se presenta como tal, rechazo de entradas no válidas |
| `.dockerignore` | Fuera de la imagen: `.env*`, `data/`, `.git`, `tests/`, modelos locales |

### Configuración (una vez, en GitHub)

Paso a paso en [deployment.md §4](../deployment.md#4-actualizar):

- **Variables** (*Settings → Secrets and variables → Actions → Variables*): `DEPLOY_HOST`, `DEPLOY_USER`, opcionales `DEPLOY_PORT`, `DEPLOY_PATH` (`/opt/handsonedu`), `PUBLIC_BASE_URL`.
- **Secretos:** `DEPLOY_SSH_KEY` (clave privada solo para desplegar) y `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -H servidor`).
- **Entorno** `production` (*Settings → Environments*) con revisores obligatorios si se quiere aprobar cada despliegue.
- **Paquete** `handsonedu` en GHCR: hacerlo público tras la primera publicación, o hacer `docker login ghcr.io` en el servidor.
- **Protección de `main`:** exigir los checks de CI antes de fusionar (*Settings → Branches*). Es un ajuste del repositorio; no se puede versionar.

### Pendiente

- ~~Migraciones de esquema (TD-012)~~: resuelto en v0.16.0 (Alembic al arrancar; `deploy.sh` restaura la copia si una versión que migró el esquema falla).
- Imagen multiarquitectura (arm64) si alguna institución usa servidores ARM.
- El contenedor corre como root (heredado); pasar a un usuario sin privilegios exige migrar los permisos de `data/` de las instalaciones existentes.

---

## Propuesta original (2026-04-30 — referencia histórica)

## Problema

No existe ningún pipeline de integración o despliegue automático. El proceso actual es:

1. Desarrollador hace cambios locales.
2. Ejecuta los tests manualmente (si los recuerda).
3. Hace `git push` sin validación automática.
4. En el servidor: `git pull && docker-compose up --build` de forma manual.

**Consecuencias:**

- Un `push` con error de sintaxis puede llegar a producción sin ser detectado.
- No hay garantía de que los tests pasen antes de fusionar un PR.
- El despliegue manual es lento, propenso a errores y requiere acceso SSH al servidor.
- Sin badges de estado, es difícil saber la salud del repositorio a primera vista.

---

## Alcance propuesto

### Workflow `ci.yml` — Integración Continua

**Disparador:** Cada `push` y cada `pull_request` a cualquier rama.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["main", "develop"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run tests with coverage
        run: pytest --cov=app --cov-report=term-missing --cov-fail-under=80

      - name: Lint with ruff
        run: ruff check app/

      - name: Build Docker image
        run: docker build -t handsonedu:ci-test .
```

**Condición de merge bloqueado:** El workflow CI debe estar en estado `✅ passing` para poder fusionar un PR en `main`. Configurar en GitHub: `Settings → Branches → Branch protection rules → Require status checks to pass`.

### Workflow `cd.yml` — Despliegue Continuo

**Disparador:** Push a rama `main` con tag que coincide con `v*.*.*`.

```yaml
# .github/workflows/cd.yml
name: CD

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USER }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ secrets.DOCKER_USER }}/handsonedu:latest
            ${{ secrets.DOCKER_USER }}/handsonedu:${{ github.ref_name }}

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/handsonedu
            docker pull ${{ secrets.DOCKER_USER }}/handsonedu:latest
            docker-compose up -d --no-deps app
```

### Badge de CI en README

Agregar al final del README existente:

```markdown
## Estado del proyecto

![CI](https://github.com/OWNER/handsonedu/actions/workflows/ci.yml/badge.svg)
```

---

## Archivos a crear

```
.github/
└── workflows/
    ├── ci.yml   ← integración continua (tests + lint + docker build)
    └── cd.yml   ← despliegue continuo (build + push Docker + deploy SSH)
```

## Archivos a modificar

```
README.md   ← agregar badge de CI
```

---

## Secrets de GitHub a configurar

Ir a `Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Descripción | Usado en |
|--------|-------------|---------|
| `DOCKER_USER` | Username de Docker Hub | `cd.yml` |
| `DOCKER_PASSWORD` | Password o token de Docker Hub | `cd.yml` |
| `DEPLOY_HOST` | IP o hostname del servidor de producción | `cd.yml` |
| `DEPLOY_USER` | Usuario SSH del servidor | `cd.yml` |
| `DEPLOY_SSH_KEY` | Clave SSH privada (RSA o ED25519) | `cd.yml` |

---

## Criterio de aceptación

- ✅ **PR sin tests pasando = merge bloqueado** (branch protection activado en GitHub).
- ✅ `push` a cualquier rama ejecuta CI automáticamente.
- ✅ Workflow CI completa en < 5 minutos.
- ✅ `push` a `main` con tag `v1.0.0` dispara el workflow CD automáticamente.
- ✅ CD hace `docker push` y el despliegue SSH sin intervención manual.
- ✅ Badge de CI en README refleja el estado actual del pipeline.
- ✅ Si los tests fallan, el workflow CI marca el commit como `❌ failing` y bloquea el merge.

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-001 (tests) | **Bloqueante** — CI sin tests no tiene valor; los tests deben existir primero |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
