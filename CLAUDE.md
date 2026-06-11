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
docker compose exec hands-on-edu pytest tests/test_main.py::TestHealthEndpoint::test_status_200   # single test
docker compose exec hands-on-edu pytest --cov=app --cov-report=term-missing                        # coverage (target ≥80% on app/core/ and app/main.py)
```

Hot reload: `./app` and `./tests` are volume-mounted, so Python/HTML/CSS/JS changes apply without rebuild (uvicorn `--reload` handles Python). Only `Dockerfile`, `requirements.txt`, or `docker-compose.yml` changes need a rebuild.

`MODEL_PATH` in `app/core/hand_tracker.py` is hardcoded to `/app/models/hand_landmarker.task` — the app expects to run inside the container (the model is downloaded at image build time).

## Architecture

**All gesture intelligence lives in the browser; the backend is a thin landmark service.**

- The single WebSocket endpoint `WS /ws/analyze` (`app/main.py`) is shared by every module. The browser captures webcam frames via `getUserMedia()`, draws them mirrored to a canvas, and sends base64 JPEG frames; the backend decodes them and returns JSON: `{hands_detected, hands: [{handedness, landmarks (21 pts), finger_count, gesture}]}`. Protocol reference: `docs/websocket-protocol.md`.
- `app/core/hand_tracker.py` — `HandTracker`, the only MediaPipe wrapper, with finger counting and gesture classification (`fist`, `pointing`, `peace`, `open_hand`, etc.). A single global `_tracker` instance in `main.py` is reused across all connections.
- Each module (GestiEdu, MotivaSign, AttendEye, VirtualPainter, AirPiano) is a static page: `app/static/<module>.html` + `css/<module>.css` + `js/<module>.js`, served by a `FileResponse` route in `main.py`. All module logic (quiz state machines, drawing, attendance, scoring) is in its JS file.
- `app/modules/*/` are empty Python stubs reserved for future backend logic — don't expect logic there.
- `app/integrations/moodle/rest_api.py` — async httpx client for Moodle REST API (grades/completion), configured via `MOODLE_*` env vars in `.env`.

**Test mocking strategy** (`tests/conftest.py`): import order is critical — it imports `app.core.hand_tracker`, patches `HandLandmarker` there, and only then imports `app.main`, so `_tracker` is created against the mock and tests run without the model file or a camera. Synthetic landmarks are built with the `Lm` helper class.

## Conventions

- **New module**: follow the steps in `docs/development-guide.md` — static files + route in `main.py` + landing-page card in `index.html` + doc in `docs/modules/`. Copy the WebSocket/canvas pattern from an existing module's JS.
- **Frontend**: vanilla JS only (no frameworks). One CSS file per module with a BEM-like prefix (`.ge-` GestiEdu, `.ms-` MotivaSign, `.ae-` AttendEye, `.vp-` VirtualPainter). Always cancel `requestAnimationFrame` and close the WebSocket when leaving a screen.
- **Requirements workflow**: features are tracked as `docs/requirements/REQ-NNN-*.md` with a master table in `docs/requirements/INDEX.md` — update the REQ status there when implementing one. Changes are logged in `docs/changelog/CHANGELOG.md`, and the app version is bumped in the `FastAPI(version=...)` call in `app/main.py`.
- **Git**: branches `feature/<name>` or `fix/<description>`; commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`), often scoped per module, e.g. `feat(airpiano): ...`.
