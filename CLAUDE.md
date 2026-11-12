# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HandsOnEdu — educational platform using MediaPipe hand tracking. FastAPI backend + vanilla JS frontend, runs in Docker. Documentation and domain language are in Spanish; code identifiers and core docstrings are in English.

## Commands

```bash
# Run the app (http://localhost:9876, Swagger at /docs)
docker compose up --build        # first time / after Dockerfile or requirements.txt changes
docker compose up                # normally

# Tests (dev deps are NOT in the image; install them in the container first)
docker compose exec hands-on-edu pip install -r requirements-dev.txt
docker compose exec hands-on-edu pytest
node --test tests/js/*.test.cjs                                     # browser engine + sign engine (host Node ≥ 20)
docker compose exec hands-on-edu python -m tests.fixtures.gen_gesture_parity   # regenerate Python↔JS parity fixture after changing gesture heuristics
node scripts/train-sign-model.cjs [--out m.json] [--publish]               # train + cross-validate the sign classifier from the server's templates (REQ-010)
docker compose exec -u "$(id -u):$(id -g)" hands-on-edu alembic revision --autogenerate -m "…"   # new schema migration after changing app/models.py
python3 deploy/check-install.py https://<host> [--moodle https://<lms>] [--allow-http]   # pre-pilot checks of an install (stdlib only)
python3 scripts/release.py check [--tag vX.Y.Z]                             # APP_VERSION ↔ CHANGELOG ↔ tag (CI runs it)
docker build -t handsonedu:ci . && scripts/test-deploy.sh handsonedu:ci    # end-to-end test of deploy/deploy.sh (install, backup, rollback)
docker compose exec hands-on-edu pytest tests/test_main.py::TestHealthEndpoint::test_status_200   # single test
docker compose exec hands-on-edu pytest --cov=app --cov-report=term-missing                        # coverage (CI enforces ≥80% overall; .github/workflows/ci.yml)
```

With the local Moodle (`docker-compose.moodle.yml`), always recreate the app with **both** files (`docker compose -f docker-compose.yml -f docker-compose.moodle.yml up -d hands-on-edu`): plain `docker compose up` drops its `PUBLIC_BASE_URL` and `extra_hosts` and breaks LTI.

Hot reload: `./app`, `./tests` and `./data` (SQLite) are volume-mounted, so Python/HTML/CSS/JS changes apply without rebuild (uvicorn `--reload` handles Python). Only `Dockerfile`, `requirements.txt`, or `docker-compose.yml` changes need a rebuild.

`MODEL_PATH` in `app/core/hand_tracker.py` is hardcoded to `/app/models/hand_landmarker.task` — the app expects to run inside the container (the model is downloaded at image build time).

## Architecture

**Hand detection and all gesture/sign intelligence run in the browser; the backend serves content and stores data.** Product direction: a reference platform for teaching sign language (LSEC, Ecuador) integrated with LMSs via LTI 1.3 + AGS + Deep Linking (REQ-019).

- `app/static/js/ho-hands.js` runs MediaPipe Hand Landmarker (Tasks JS 0.10.35, WASM vendored at `/vendor/mediapipe/`, model at `/models/`) on the mirrored canvas. Modules get hands via `HO.createHandSource({onResult, onStatus})`, which returns the in-browser `LocalHandEngine` or falls back to the server `HO.HandSocket` (`WS /ws/analyze`, `app/api/ws.py`; force with `?engine=server`). Both emit the same JSON: `{hands_detected, engine, hands: [{handedness, confidence, landmarks, world_landmarks, aspect, fingers_up, finger_count, gesture, gesture_raw}]}` — `docs/websocket-protocol.md`.
- The JS gesture logic is a port of `app/core/hand_tracker.py` (`HandTracker`, `finger_states`, `GestureSmoother`, per-connection on the server). **Keep them in sync**: change Python, regenerate `tests/fixtures/gesture_parity.json`, port to JS; both test suites check the fixture.
- `app/static/js/ho-curriculum.js` — DOM-free course logic for the Aula (`HO.Curriculum`: unit unlocking from passed `quiz:<unit>` sessions, spaced review, fingerspelling tokenizer, `HoldVerifier`). Keep UI out of it so `node --test` covers it.
- `app/static/js/ho-signs.js` — sign recognizer (`HO.Signs.SignRecognizer`): handshape specs from the catalog (with Spanish didactic feedback), kNN over teacher-recorded templates, DTW for moving signs, optional trained model blended in (`blendModel`). Geometry conventions were calibrated on real photos (`tests/fixtures/real_hands.json`); read `docs/sign-engine.md` before changing them (e.g. on the mirrored canvas MediaPipe labels the real right hand `"Left"`).
- `app/static/js/ho-signs-model.js` — **trained classifier (REQ-010)** `HO.SignModel`: tiny MLP in pure JS for static one-hand signs, trained/evaluated in the browser (Sign Studio) or with `node scripts/train-sign-model.cjs`; grouped-by-recording cross-validation decides whether to publish. Server only validates/stores the JSON (`sign_models`, `/api/signs/{lang}/model(s)`). If you change `featureVector`, bump `FEATURE_VERSION` (old models are then ignored) and regenerate `tests/fixtures/sign_model_small.json` with `node tests/fixtures/gen_sign_model.cjs`.
- Reference videos are AI-generated (fictional avatars) and shown to learners only after interpreter validation (`media.validated_by`); `media.ai_generated` is mandatory so the UI always discloses it. `docs/content/videos-ia-lsec.md` is generated by `scripts/gen_video_prompts.py` from the catalog — regenerate it after catalog changes (CI runs `--check`).
- Sign content is data: `app/content/<lang>/catalog.json`, schema-validated by `app/signs/catalog.py` (unknown handshape keys fail loudly). LSEC content is a draft flagged `validated: false` — don't present it as validated.
- Backend: `app/main.py` wires routers `app/api/{pages,ws,signs,learning}.py`; settings in `app/config.py` (`DATABASE_URL`, `ADMIN_TOKEN`, …); SQLAlchemy 2.0 models in `app/models.py` (`Learner`, `ActivitySession`, `SignAttempt`, `SignTemplate`, `SignModel`, LTI tables, `AttendanceSession`/`AttendanceRecord`). **Schema = Alembic migrations** in `app/migrations/versions/`, applied on startup by `app/migrate.py` (lock so several workers don't race; baseline `0001` is idempotent to adopt pre-0.16 `create_all` DBs). Changing a model ⇒ `alembic revision --autogenerate -m "…"` (don't import `app.models` in revisions); `tests/test_migrations.py` fails on drift or multiple heads. Write endpoints for templates require `X-Admin-Token` when `ADMIN_TOKEN` is set. **Learner data (TD-013)**: `/api/learners/{id}*` and `/api/sessions*` need that learner's credential — `X-Learner-Token` (secret returned once by `POST /api/learners`, stored hashed in `learners.secret_hash`, kept by the browser in the `ho.aula.profiles` entry; pre-0.17 profiles get one via `POST /api/learners/{id}/claim`), the learner's own LTI Bearer token, or a configured admin token (`LearnerCredentials` in `app/api/deps.py`). In tests the `client` fixture behaves like the owning browser (adds the token automatically); use `stranger` for a client without profiles.
- Each module (GestiEdu, MotivaSign, AttendEye, VirtualPainter, AirPiano, Estudio de Señas `/signstudio`, Aula de Señas `/aula`, Panel docente `/panel`) is a static page: `app/static/<module>.html` + `css/<module>.css` + `js/<module>.js`, registered in `PAGES` in `app/api/pages.py`. All module logic (quiz state machines, drawing, attendance, scoring) is in its JS file.
- **Saved results of the gesture modules (REQ-005)** — `app/static/js/ho-learning.js` (`HO.Learning`, + `css/ho-learning.css` `.ho-lp`): "¿Quién juega?" picker sharing the Aula's learner profiles (`localStorage` `ho.aula.profiles`/`ho.aula.current`), `Recorder` (best-effort `activity_sessions` + `sign_attempts`; a failed save never breaks a game), admin-token requests. GestiEdu (`quiz`) and MotivaSign (`challenge`, `learn`, language `gestos`) use the generic session tables; AttendEye (names typed by the teacher, per class) has its own tables and `app/api/attendance.py` (admin token). The panel's installation scope summarises them (`modules`, `other_sessions`); the course (LTI) scope does not.
- `app/modules/*/` are empty Python stubs reserved for future backend logic — don't expect logic there.
- **LTI 1.3 (REQ-019)** — `app/integrations/lti/` (`launch.py`: OIDC login + id_token validation; `keys.py`: tool RSA key in DB, JWKS, the browser's launch token; `services.py`: AGS best-score passback in a BackgroundTask, Deep Linking) and `app/api/lti.py`. The browser gets the launch token in the URL fragment `#lti=` and sends `Authorization: Bearer`; `POST /api/sessions` links such sessions to the launch (`lti_session_links`) and `finish` publishes `quiz:<unit>` scores. Needs `PUBLIC_BASE_URL`. Admin guide: `docs/moodle-integration.md`; setup page `/lti/setup`.
- **Teacher panel (REQ-007)** — `app/api/panel.py` + `/panel` (`panel.html`/`css/panel.css` `.pn-`/`js/panel.js`, inline-SVG charts, no libraries). Scope via `panel_scope`: LTI instructor token → that course (`LtiContext` + NRPS roster from `services.fetch_roster`, sessions linked to launches of that context) or admin token → all learners. Instructor sessions never count. Doc: `docs/modules/panel.md`.
- `app/integrations/moodle/rest_api.py` — legacy async httpx client for the Moodle REST API (`MOODLE_*` env vars); grades go through LTI AGS now.

**Test mocking strategy** (`tests/conftest.py`): sets `DATABASE_URL=sqlite://` (in-memory, reset per `client` fixture) before importing anything, imports `app.core.hand_tracker`, patches `HandLandmarker` there, and only then imports `app.main`; WS tests patch `app.api.ws._new_tracker`. LTI tests (`tests/test_lti.py`) fake the platform with an `httpx.MockTransport` by patching `http_client` in `app.integrations.lti.launch` and `.services`. Synthetic landmarks come from `make_hand()` / the `Lm` helper. JS tests (`tests/js/*.test.cjs`, `node:test`) load the browser files directly — they export via `module.exports` when present.

## Conventions

- **New module**: follow the steps in `docs/development-guide.md` — static files + entry in `PAGES` (`app/api/pages.py`) + landing-page card in `index.html` + doc in `docs/modules/`. Copy the WebSocket/canvas pattern from an existing module's JS.
- **Frontend**: vanilla JS only (no frameworks). One CSS file per module with a BEM-like prefix (`.ge-` GestiEdu, `.ms-` MotivaSign, `.ae-` AttendEye, `.vp-` VirtualPainter, `.ss-` Estudio de Señas, `.au-` Aula de Señas, `.pn-` Panel docente). Load `ho-common.js` then `ho-hands.js` (then `ho-signs.js`, and `ho-curriculum.js` for course logic, if needed) before the module script. Always cancel `requestAnimationFrame` and close the WebSocket when leaving a screen.
- **Releases (REQ-011)**: bump `APP_VERSION` + add a `## [X.Y.Z]` CHANGELOG section, merge to `main`, push tag `vX.Y.Z` → `.github/workflows/release.yml` re-runs CI, pushes `ghcr.io/dbanegasl/handsonedu:X.Y.Z`, creates the GitHub Release and (if `DEPLOY_HOST` is set) runs `deploy/deploy.sh` on the server over SSH. The image's default command is production (no `--reload`; dev compose adds it). The app runs as unprivileged user `app` (uid 1000): `docker/entrypoint.sh` starts as root, chowns `DATA_DIR` and drops privileges with `setpriv` — so `docker compose exec` is still root (fine for pip/pytest) and `./data` is owned by uid 1000. Server install uses only `deploy/` (compose + `.env` + `deploy.sh`); keep `deploy.sh` and `scripts/test-deploy.sh` shellcheck-clean.
- **Requirements workflow**: features are tracked as `docs/requirements/REQ-NNN-*.md` with a master table in `docs/requirements/INDEX.md` — update the REQ status there when implementing one. Changes are logged in `docs/changelog/CHANGELOG.md`, and the app version is bumped in the `FastAPI(version=...)` call in `app/main.py`.
- **Git**: branches `feature/<name>` or `fix/<description>`; commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`), often scoped per module, e.g. `feat(airpiano): ...`.
