# REQ-008 — Autenticación Básica (Roles Docente / Estudiante)

> **Última actualización:** 2026-04-30

| Campo | Valor |
|-------|-------|
| **ID** | REQ-008 |
| **Tipo** | Feature |
| **Prioridad** | Alta |
| **Estado** | 📋 Pendiente |
| **Módulo** | Global |
| **Esfuerzo estimado** | L (8–12 horas) |

---

## Problema

La plataforma HandsOnEdu es actualmente **completamente pública**: cualquier persona con la URL puede:

- Acceder al dashboard del docente y ver resultados de todos los estudiantes.
- Acceder al editor de preguntas y modificar o eliminar el contenido de las evaluaciones.
- Ver reportes históricos de asistencia y calificaciones.

En un entorno institucional como **UNAE**, esto es un problema de privacidad y seguridad. Los datos de estudiantes (notas, asistencia) están protegidos por políticas institucionales y la normativa ecuatoriana de protección de datos.

---

## Alcance propuesto

### Sistema de autenticación

- Login con usuario/contraseña.
- Tokens **JWT** (JSON Web Tokens) con expiración de 8 horas.
- Contraseñas hasheadas con **bcrypt**.
- Librería: `python-jose[cryptography]` + `passlib[bcrypt]`.

### Roles

| Rol | Acceso |
|-----|--------|
| `teacher` | Acceso completo: módulos, dashboard, editor de preguntas, reportes |
| `student` | Solo módulos de práctica (GestiEdu modo estudiante, MotivaSign, AttendEye modo check-in, VirtualPainter) |

### Rutas protegidas

| Ruta | Rol requerido |
|------|--------------|
| `/dashboard` | `teacher` |
| `/gestiedu/editor` | `teacher` |
| `/api/dashboard/*` | `teacher` |
| `/api/gestiedu/questions` (write) | `teacher` |
| `/api/reports/*` | `teacher` |
| Módulos de práctica | `student` o sin auth (configurable) |

### Flujo de autenticación

```
1. Usuario accede a ruta protegida → redirect a /login
2. Usuario ingresa credenciales en /login
3. POST /api/auth/login → {token: "eyJ...", role: "teacher", expires_in: 28800}
4. Token almacenado en localStorage bajo clave 'handsonedu_token'
5. Todas las peticiones API incluyen: Authorization: Bearer <token>
6. Token expirado → redirect automático a /login
```

### Usuario administrador inicial

Configurable por variables de entorno (sin valores por defecto en el código):

```env
# .env
ADMIN_USER=admin
ADMIN_PASSWORD=changeme123
JWT_SECRET=your-random-secret-here-min-32-chars
```

> **⚠️ Seguridad:** `JWT_SECRET` debe ser una cadena aleatoria de al menos 32 caracteres. Generar con: `openssl rand -hex 32`. **Nunca commitear el .env real al repositorio.**

### Seed inicial

Al iniciar la aplicación, si no existe el usuario `admin` en la base de datos, crearlo con las credenciales de las variables de entorno.

---

## Archivos a crear

```
app/auth/
├── __init__.py
├── jwt.py          ← creación/validación de tokens JWT
├── models.py       ← modelo SQLAlchemy de usuarios
└── router.py       ← endpoints /api/auth/login, /api/auth/me, /api/auth/logout

app/templates/
├── login.html      ← página de login
└── (modificar templates existentes para redirigir si no autenticado)

app/static/js/
└── login.js        ← lógica del formulario de login, manejo del token
```

### Dependencias de Python a agregar

```
# requirements.txt
python-jose[cryptography]>=3.3
passlib[bcrypt]>=1.7
```

### Endpoints de autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Autenticar con usuario/contraseña → JWT |
| `GET` | `/api/auth/me` | Obtener datos del usuario autenticado |
| `POST` | `/api/auth/logout` | Invalidar token (blacklist) |

### Ejemplo de login

```bash
curl -X POST http://localhost:9876/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "changeme123"}'

# Respuesta exitosa:
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "teacher",
  "expires_in": 28800
}
```

### Middleware de protección

```python
# app/auth/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_teacher(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user
```

---

## Nuevas variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `ADMIN_USER` | Username del administrador inicial | Sí |
| `ADMIN_PASSWORD` | Contraseña del administrador (hasheada al crear) | Sí |
| `JWT_SECRET` | Clave secreta para firmar JWT (mín 32 chars) | Sí |

Actualizar `.env.example` con estas variables (sin valores reales).

---

## Criterio de aceptación

- ✅ `GET /dashboard` sin token retorna **401 Unauthorized**.
- ✅ `POST /api/auth/login` con credenciales correctas retorna JWT válido.
- ✅ JWT incluido en headers permite acceso a rutas protegidas.
- ✅ El token **expira en 8 horas** (verificable decodificando el JWT).
- ✅ Contraseña del admin guardada como **hash bcrypt** (nunca en texto plano en la DB).
- ✅ Con credenciales incorrectas: respuesta `401` con mensaje genérico (sin revelar si el usuario existe).
- ✅ Los módulos de práctica siguen siendo accesibles sin login (o con login de estudiante).
- ✅ Logout invalida el token (no puede usarse después).

---

## Dependencias

| Requisito | Tipo |
|-----------|------|
| REQ-005 (SQLite) | **Bloqueante** — los usuarios se guardan en SQLite |

---

*Volver al [Índice de Requisitos](./INDEX.md)*
