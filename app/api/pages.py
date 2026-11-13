"""HTML page routes (one static page per module)."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(include_in_schema=False)

STATIC = "app/static"

PAGES = {
    "/": "index.html",
    "/gestiedu": "gestiedu.html",
    "/motivasign": "motivasign.html",
    "/attendeye": "attendeye.html",
    "/virtualpainter": "virtualpainter.html",
    "/airpiano": "airpiano.html",
    "/testing": "testing.html",
    "/signstudio": "signstudio.html",
    "/aula": "aula.html",
    "/panel": "panel.html",
    "/privacidad": "privacidad.html",
    "/diagnostico": "diagnostico.html",
    "/validacion": "validacion.html",
}


def _page(filename: str):
    async def handler():
        return FileResponse(f"{STATIC}/{filename}")

    return handler


for _path, _file in PAGES.items():
    router.add_api_route(_path, _page(_file), methods=["GET"])
