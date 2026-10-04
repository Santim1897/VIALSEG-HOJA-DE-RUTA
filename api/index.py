"""Servicio de optimización (FastAPI). En Vercel corre como función de Python.

Rutas:
    POST /api/py/ruteo       orden óptimo de visitas de una camioneta
    POST /api/py/asignacion  sugerencia de qué countries hace cada camioneta
    GET  /api/py/salud       verificación
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI  # noqa: E402

from _modelos.asignacion import resolver_asignacion  # noqa: E402
from _modelos.ruteo import resolver_ruteo  # noqa: E402

app = FastAPI(title="Vialseg · Optimizador", docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")


@app.get("/api/py/salud")
def salud():
    return {"ok": True, "motor": "OR-Tools + SCIP"}


@app.post("/api/py/ruteo")
def ruteo(datos: dict):
    return resolver_ruteo(datos)


@app.post("/api/py/asignacion")
def asignacion(datos: dict):
    return resolver_asignacion(datos)

