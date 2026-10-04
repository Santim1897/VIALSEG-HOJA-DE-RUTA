"""Modelo de centro de gravedad (Redes de Distribución, diapositivas 49-50).

Busca el punto (x, y) que minimiza el costo total de transporte
    TC = Σ_n d_n · D_n · F_n
donde d_n es la distancia al country n, D_n su "demanda" (cantidad de visitas o equipos)
y F_n el costo por km. Se resuelve con el método iterativo de Weiszfeld sobre un plano
en km (proyección local), y se compara contra las bases candidatas reales.
"""
from __future__ import annotations

from math import cos, radians, sqrt

KM_LAT = 111.32


def _plano(lat0: float):
    k_lon = KM_LAT * cos(radians(lat0))
    a_km = lambda lat, lon: (lon * k_lon, lat * KM_LAT)  # noqa: E731
    a_geo = lambda x, y: (y / KM_LAT, x / k_lon)  # noqa: E731
    return a_km, a_geo


def _costo(px: float, py: float, puntos: list) -> float:
    return sum(sqrt((px - x) ** 2 + (py - y) ** 2) * w for x, y, w in puntos)


def resolver_gravedad(datos: dict) -> dict:
    countries = datos["countries"]  # [{id, nombre, lat, lon, demanda}]
    candidatas = datos.get("candidatas", [])  # [{id, nombre, lat, lon}]
    F = float(datos.get("costo_km", 1.0))
    if not countries:
        return {"centro": None, "candidatas": []}
    lat0 = sum(c["lat"] for c in countries) / len(countries)
    a_km, a_geo = _plano(lat0)
    pts = [(*a_km(c["lat"], c["lon"]), float(c["demanda"]) * F) for c in countries]

    total = sum(w for *_, w in pts) or 1.0
    x = sum(px * w for px, _, w in pts) / total
    y = sum(py * w for _, py, w in pts) / total
    for _ in range(500):  # Weiszfeld
        num_x = num_y = den = 0.0
        for px, py, w in pts:
            dist = sqrt((x - px) ** 2 + (y - py) ** 2) or 1e-6
            num_x += w * px / dist
            num_y += w * py / dist
            den += w / dist
        nx, ny = num_x / den, num_y / den
        if abs(nx - x) + abs(ny - y) < 1e-6:
            break
        x, y = nx, ny

    lat, lon = a_geo(x, y)
    tc_centro = _costo(x, y, pts)
    evaluadas = []
    for cand in candidatas:
        cx, cy = a_km(cand["lat"], cand["lon"])
        tc = _costo(cx, cy, pts)
        evaluadas.append({**cand, "tc": round(tc, 1), "sobrecosto_pct": round((tc / tc_centro - 1) * 100, 1)})
    evaluadas.sort(key=lambda c: c["tc"])
    cercano = min(countries, key=lambda c: (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2)
    return {
        "centro": {"lat": round(lat, 5), "lon": round(lon, 5), "tc": round(tc_centro, 1),
                   "country_mas_cercano": cercano.get("nombre", cercano["id"])},
        "candidatas": evaluadas,
    }
