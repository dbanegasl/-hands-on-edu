# REQ-011 — Pipeline CI/CD con GitHub Actions

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-011 |
| **Tipo** | Tech-Debt |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global / DevOps |
| **Esfuerzo estimado** | M (3–5 horas) |

---

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
      - name: Deploy to UNAE server via SSH
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
| `DEPLOY_HOST` | IP o hostname del servidor UNAE | `cd.yml` |
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
