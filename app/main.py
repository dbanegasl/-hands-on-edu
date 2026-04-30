from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

app = FastAPI(
    title="HandsOnEdu",
    description="Plataforma Educativa con Control Gestual — UNAE",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <html>
      <head><title>HandsOnEdu</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1>🖐️ HandsOnEdu</h1>
        <p>Plataforma Educativa con Control Gestual</p>
        <p><a href="/docs">📖 API Docs</a></p>
      </body>
    </html>
    """


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
