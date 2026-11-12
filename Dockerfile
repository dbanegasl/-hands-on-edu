FROM python:3.11-slim

# System dependencies required by OpenCV and MediaPipe
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgles2 \
    libegl1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer cache optimization)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the MediaPipe Hand Landmarker model at build time
RUN mkdir -p /app/models && \
    wget -q https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task \
    -O /app/models/hand_landmarker.task

# Vendor MediaPipe Tasks JS (bundle + WASM) so the in-browser hand engine works
# on school networks that block CDNs. Keep in sync with MP_VERSION in
# app/static/js/ho-hands.js and the mediapipe version in requirements.txt.
ARG MP_JS_VERSION=0.10.35
RUN mkdir -p /app/vendor/mediapipe/wasm && cd /app/vendor/mediapipe && \
    base=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_JS_VERSION} && \
    wget -q $base/vision_bundle.mjs && \
    for f in vision_wasm_internal.js vision_wasm_internal.wasm \
             vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do \
        wget -q $base/wasm/$f -O wasm/$f; \
    done

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
