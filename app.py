"""Prototipo Vialseg: optimizacion diaria de hojas de ruta tecnica.

Ejecutar:
    pip install fastapi "uvicorn[standard]"
    uvicorn app:app --reload
"""
from __future__ import annotations

from datetime import datetime, timedelta, date
from pathlib import Path
from math import ceil, isfinite
from functools import lru_cache
from threading import Lock
from time import monotonic, sleep
from urllib.request import Request, urlopen
from urllib.error import URLError
import os
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import HTMLResponse
    from pydantic import BaseModel, Field
    FASTAPI_AVAILABLE = True
except (ImportError, AttributeError):
    # El modo integrado permite ejecutar el demo aun sin instalar paquetes.
    FASTAPI_AVAILABLE = False

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str = ""):
            self.status_code, self.detail = status_code, detail

    class BaseModel:
        pass

    def Field(default, **_kwargs):
        return default

    class HTMLResponse(str):
        pass

    class SimpleApp:
        def get(self, *_args, **_kwargs):
            return lambda fn: fn

        def post(self, *_args, **_kwargs):
            return lambda fn: fn

    FastAPI = SimpleApp  # type: ignore[misc,assignment]

app = FastAPI(title="Vialseg | Optimizador de Hojas de Ruta", version="0.1.0") if FASTAPI_AVAILABLE else SimpleApp()

BASE = {"id": "BASE-MARTINEZ", "name": "Base operativa - Martinez", "lat": -34.4904, "lon": -58.5039}
START_TIME = "08:00"
WORKDAY_MINUTES = 8 * 60
SERVICE_MINUTES = 11  # dentro del rango operativo de 10 a 12 minutos
ENTRY_MINUTES = 15
PLAN_FILE = Path(__file__).resolve().parent / '.local' / 'plan.json'
_plan_lock = Lock()
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
HERE_API_KEY = os.environ.get("HERE_API_KEY", "")
_road_lock = Lock()
_last_road_request = 0.0


# ---------------------------------------------------------------------------
# HERE Routing API (tráfico en tiempo real)
# Se activa automáticamente cuando HERE_API_KEY está definida.
# Sin clave, el sistema usa OSRM como siempre.
# ---------------------------------------------------------------------------

def _here_matrix(points: list[dict], departure_iso: str) -> tuple[list, list]:
    """Consulta HERE Matrix Routing API con tráfico según hora de salida.

    departure_iso: ISO 8601 sin offset, p. ej. '2026-10-03T08:00:00'
    Devuelve (durations_seg, distances_m) como matrices NxN, con None donde no hay camino.
    """
    n = len(points)
    origins = [{"lat": p["lat"], "lng": p["lon"]} for p in points]
    # RFC 3339 con offset de zona horaria de Argentina (UTC-3)
    dep_rfc3339 = departure_iso if "+" in departure_iso or departure_iso.endswith("Z") else departure_iso + "-03:00"
    payload = json.dumps({
        "origins": origins,
        "destinations": origins,
        "regionDefinition": {"type": "world"},
        "transportMode": "car",
        "matrixAttributes": ["travelTimes", "distances"],
        "departureTime": dep_rfc3339,
    }).encode()
    url = f"https://matrix.router.hereapi.com/v8/matrix?async=false&apiKey={HERE_API_KEY}"
    req = Request(url, data=payload, headers={
        "Content-Type": "application/json",
        "User-Agent": "Vialseg-prototype/0.3",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(503, detail="No se pudo consultar HERE Matrix API. Reintente.") from exc

    matrix_data = data.get("matrix", {})
    travel_times = matrix_data.get("travelTimes", [])
    distances_m = matrix_data.get("distances", [])
    error_codes = matrix_data.get("errorCodes", [])

    def to_matrix(flat: list, errors: list) -> list:
        rows = []
        for i in range(n):
            row = []
            for j in range(n):
                idx = i * n + j
                has_error = errors[idx] if idx < len(errors) else 0
                row.append(None if has_error else (flat[idx] if idx < len(flat) else None))
            rows.append(row)
        return rows

    dur = to_matrix(travel_times, error_codes)
    dist = to_matrix(distances_m, error_codes)
    return dur, dist


def _here_route_geometry(waypoints: list[dict], departure_iso: str) -> tuple[list, list]:
    """Consulta HERE Routes API para obtener geometría y tiempos de cada tramo con tráfico.

    Devuelve (geometry_coords [[lon, lat], ...], legs_list [{"duration": seg, "distance": m}, ...])
    """
    if len(waypoints) < 2:
        return [], []

    origin = f"{waypoints[0]['lat']},{waypoints[0]['lon']}"
    destination = f"{waypoints[-1]['lat']},{waypoints[-1]['lon']}"
    via_params = "".join(
        f"&via={p['lat']},{p['lon']}"
        for p in waypoints[1:-1]
    )
    url = (
        f"https://router.hereapi.com/v8/routes"
        f"?transportMode=car"
        f"&origin={origin}"
        f"&destination={destination}"
        f"{via_params}"
        f"&return=polyline,summary,travelSummary"
        f"&departureTime={departure_iso}"
        f"&apiKey={HERE_API_KEY}"
    )
    req = Request(url, headers={"User-Agent": "Vialseg-prototype/0.3"})
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.load(resp)
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(503, detail="No se pudo obtener la ruta de HERE. Reintente.") from exc

    try:
        route = data["routes"][0]
    except (KeyError, IndexError) as exc:
        raise HTTPException(503, detail="HERE no devolvió una ruta válida.") from exc

    # Decodificar polyline flexible (HERE usa encoding propio)
    geometry: list = []
    for section in route.get("sections", []):
        poly = section.get("polyline", "")
        # HERE usa Flexible Polyline encoding; decodificamos manualmente
        geometry.extend(_decode_here_polyline(poly))

    legs = [
        {
            "duration": sec.get("travelSummary", {}).get("duration", 0),
            "distance": sec.get("travelSummary", {}).get("length", 0),
        }
        for sec in route.get("sections", [])
    ]
    return geometry, legs


def _decode_here_polyline(encoded: str) -> list:
    """Decodifica HERE Flexible Polyline encoding a lista de [lon, lat]."""
    if not encoded:
        return []
    # Tabla de caracteres válidos en HERE Flexible Polyline
    DECODE_TABLE = {c: i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")}
    result, lat, lng = [], 0, 0
    i = 0
    # Saltar cabecera (primer carácter = versión, segundo = precisión y tipo)
    header_len = 2
    i += header_len
    precision = 5  # HERE usa 5 dígitos de precisión por defecto
    factor = 10 ** precision

    def decode_value(pos: int) -> tuple[int, int]:
        result_val, shift, delta = 0, 0, 0
        while pos < len(encoded):
            c = encoded[pos]
            pos += 1
            val = DECODE_TABLE.get(c, 0)
            delta |= (val & 0x1F) << shift
            shift += 5
            if val < 0x20:
                break
        return (-(delta >> 1) if delta & 1 else delta >> 1), pos

    try:
        while i < len(encoded):
            dlat, i = decode_value(i)
            dlng, i = decode_value(i)
            lat += dlat
            lng += dlng
            result.append([round(lng / factor, 6), round(lat / factor, 6)])
    except Exception:
        return []
    return result

# Esquema auditable de ponderacion. Los tres primeros criterios construyen
# el beneficio de resolver el ticket; cercania y jornada definen su inclusion.
SCORING_RULES = {
    "severidad": {"Leve": 1, "Medio": 3, "Alto": 7},
    "sla_factor": [(8, 1.00), (16, 1.10), (24, 1.25), (999_999, 1.40)],
    "comercial_factor": [(300_000, 1.00), (600_000, 1.05), (900_000, 1.12), (999_999_999, 1.20)],
    "cercania_factor": [(5, 1.20), (15, 1.00), (30, 0.80), (999_999, 0.60)],
}

# Datos ficticios, ubicados en barrios privados objetivo de Zona Norte / Provincia de Buenos Aires.
# Las coordenadas representan accesos o puntos de referencia del barrio; en produccion se
# deben reemplazar por la posicion GPS exacta de cada cinemometro.
RADARS = [
    {"id": "RAD-001", "name": "Ayres del Pilar · Acceso principal", "lat": -34.4372, "lon": -58.7849, "status": "Fuera de servicio", "priority": "Alto", "billing": 980000, "lead_hours": 18},
    {"id": "RAD-002", "name": "Highland Park CC · Acceso Panamericana", "lat": -34.4207, "lon": -58.7834, "status": "Intermitente", "priority": "Medio", "billing": 610000, "lead_hours": 9},
    {"id": "RAD-003", "name": "Santa Barbara · Acceso corredor Bancalari", "lat": -34.4300, "lon": -58.6520, "status": "Fuera de servicio", "priority": "Alto", "billing": 875000, "lead_hours": 26},
    {"id": "RAD-004", "name": "Estancias del Pilar · Acceso Champagnat", "lat": -34.4220, "lon": -58.8500, "status": "Error de calibracion", "priority": "Medio", "billing": 540000, "lead_hours": 14},
    {"id": "RAD-005", "name": "Pilar del Este · Acceso Caamaño", "lat": -34.4430, "lon": -58.8040, "status": "Fuera de servicio", "priority": "Alto", "billing": 1100000, "lead_hours": 32},
    {"id": "RAD-006", "name": "La Lomada · Acceso Panamericana km 45", "lat": -34.4470, "lon": -58.8380, "status": "Intermitente", "priority": "Leve", "billing": 220000, "lead_hours": 5},
    {"id": "RAD-007", "name": "Nordelta · Acceso principal", "lat": -34.4025, "lon": -58.6480, "status": "Fuera de servicio", "priority": "Alto", "billing": 950000, "lead_hours": 22},
    {"id": "RAD-008", "name": "Los Alisos · Nordelta", "lat": -34.3960, "lon": -58.6390, "status": "Error de comunicacion", "priority": "Medio", "billing": 420000, "lead_hours": 11},
    {"id": "RAD-009", "name": "Santa Maria de Tigre · Acceso Italia", "lat": -34.4210, "lon": -58.6220, "status": "Fuera de servicio", "priority": "Alto", "billing": 1200000, "lead_hours": 40},
    {"id": "RAD-010", "name": "El Encuentro · Corredor Benavidez", "lat": -34.4070, "lon": -58.6730, "status": "Intermitente", "priority": "Leve", "billing": 180000, "lead_hours": 4},
    {"id": "RAD-011", "name": "Haras Santa Maria · Acceso Ruta 25", "lat": -34.3790, "lon": -58.7850, "status": "Fuera de servicio", "priority": "Alto", "billing": 760000, "lead_hours": 28},
    {"id": "RAD-012", "name": "Martindale CC · Acceso Ruta 8", "lat": -34.4630, "lon": -58.8050, "status": "Error de calibracion", "priority": "Medio", "billing": 390000, "lead_hours": 16},
    {"id": "RAD-013", "name": "Campo Chico CC · Acceso Panamericana", "lat": -34.4260, "lon": -58.7200, "status": "Intermitente", "priority": "Leve", "billing": 150000, "lead_hours": 7},
    {"id": "RAD-014", "name": "Tortugas CC · Acceso principal", "lat": -34.4570, "lon": -58.7350, "status": "Fuera de servicio", "priority": "Medio", "billing": 690000, "lead_hours": 20},
    {"id": "RAD-015", "name": "Mayling Club de Campo · Acceso km 47", "lat": -34.4350, "lon": -58.8280, "status": "Error de comunicacion", "priority": "Leve", "billing": 250000, "lead_hours": 8},
]


class RouteRequest(BaseModel):
    start_date: str | None = None
    start_time: str = START_TIME
    end_time: str | None = None
    max_minutes: int = Field(WORKDAY_MINUTES, ge=60, strict=True)
    selected_ids: list[str] | None = None


@lru_cache(maxsize=32)
def _road_json(path: str, time_bucket: int) -> dict:
    """Cache breve y solicitudes serializadas para el servidor OSRM de demostracion."""
    global _last_road_request
    with _road_lock:
        sleep(max(0, 1.1 - (monotonic() - _last_road_request)))
        try:
            request = Request(OSRM_URL + path, headers={"User-Agent": "Vialseg-local-prototype/0.2"})
            with urlopen(request, timeout=20) as response:
                result = json.load(response)
            if result.get("code") != "Ok":
                raise ValueError("Sin recorrido vial")
            return result
        except (URLError, TimeoutError, ValueError, OSError) as exc:
            raise HTTPException(503, detail="No se pudo consultar el recorrido por calles. Reintente; no se usarán distancias en línea recta.") from exc
        finally:
            _last_road_request = monotonic()


def road_data(service: str, points: list[dict], options: str) -> dict:
    coordinates = ";".join(f'{p["lon"]},{p["lat"]}' for p in points)
    return _road_json(f"/{service}/v1/driving/{coordinates}?{options}", int(monotonic() // 600))


def road_matrix(points: list[dict], departure_iso: str | None = None) -> tuple[list, list]:
    """Matriz de tiempos y distancias entre todos los puntos.

    Con HERE_API_KEY usa HERE Matrix API con trafico real segun departure_iso.
    Sin clave usa OSRM (tiempos estaticos sin trafico).
    """
    if HERE_API_KEY:
        dep = departure_iso or datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        return _here_matrix(points, dep)

    # Fallback: OSRM
    data = road_data("table", points, "annotations=duration,distance")
    size = len(points)
    try:
        durations, distances = data["durations"], data["distances"]
        for matrix in (durations, distances):
            if len(matrix) != size or any(len(row) != size for row in matrix):
                raise ValueError("Matriz incompleta")
            if any(v is not None and (not isfinite(v) or v < 0) for row in matrix for v in row):
                raise ValueError("Valor vial invalido")
        return durations, distances
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(503, detail="El proveedor devolvio una matriz vial invalida.") from exc


def tier_factor(value: float, bands: list[tuple[float, float]]) -> float:
    """Devuelve el factor del primer tramo que contiene al valor."""
    return next(factor for limit, factor in bands if value <= limit)


def scoring(node: dict, km_from_current: float) -> dict:
    """Puntaje explicable: relevancia del problema ajustada por eficiencia geografica."""
    severity = SCORING_RULES["severidad"][node["priority"]]
    sla = tier_factor(node["lead_hours"], SCORING_RULES["sla_factor"])
    commercial = tier_factor(node["billing"], SCORING_RULES["comercial_factor"])
    proximity = tier_factor(km_from_current, SCORING_RULES["cercania_factor"])
    benefit = severity * sla * commercial
    return {
        "severity_points": severity,
        "sla_factor": sla,
        "commercial_factor": commercial,
        "proximity_factor": proximity,
        "benefit_score": round(benefit, 2),
        "route_score": round(benefit * proximity, 2),
    }


def entry_minutes(previous: dict, node: dict) -> int:
    """Un ingreso por visita continua al barrio; una reentrada vuelve a consumir tiempo."""
    same = node.get('neighborhood_id') and node.get('neighborhood_id') == previous.get('neighborhood_id')
    return 0 if same else ENTRY_MINUTES


def choose_order(nodes: list[dict], durations: list, distances: list, budget: int) -> list[int]:
    """Busqueda acotada: prioridad atendida temprano y cercania por calles.

    Cada estado es una secuencia; se conservan las 128 mejores de cada longitud.
    El retorno se verifica para cada extension. No garantiza el optimo global.
    """
    # (orden, minutos de servicio finalizado, utilidad, kilometros)
    frontier = [((), 0, 0.0, 0.0)]
    best, best_key = (), (0.0, 0, 0.0)
    for _ in nodes:
        candidates = []
        for order, elapsed, utility, km in frontier:
            current = order[-1] if order else 0
            for dest in range(1, len(nodes) + 1):
                if dest in order:
                    continue
                seconds, meters, back = durations[current][dest], distances[current][dest], durations[dest][0]
                if seconds is None or meters is None or back is None or distances[dest][0] is None:
                    continue
                previous = nodes[current - 1] if current else BASE
                done = elapsed + ceil(seconds / 60) + entry_minutes(previous, nodes[dest - 1]) + SERVICE_MINUTES
                total = done + ceil(back / 60)
                if total > budget:
                    continue
                score = scoring(nodes[dest - 1], meters / 1000)["route_score"]
                value = utility + score * (budget - done) / budget
                length = km + meters / 1000
                sequence = (*order, dest)
                key = (value, -total, -(length + distances[dest][0] / 1000))
                if key > best_key:
                    best, best_key = sequence, key
                candidates.append((sequence, done, value, length))
        if not candidates:
            break
        candidates.sort(key=lambda x: (-x[2], x[1], x[3], x[0]))
        frontier = candidates[:128]
    return list(best)


def build_route(nodes: list[dict], start_time: str, max_minutes: int, matrix=None, start_date: str | None = None) -> dict:
    if isinstance(max_minutes, bool) or not isinstance(max_minutes, int) or max_minutes < 60:
        raise HTTPException(422, detail="La jornada debe estar al menos 60 minutos")
    try:
        current_time = datetime.strptime(start_time, "%H:%M")
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, detail="start_time debe tener formato HH:MM") from exc

    # Construir ISO de salida combinando fecha (o hoy) con hora de inicio
    try:
        day_str = start_date or date.today().isoformat()
        departure_iso = f"{day_str}T{start_time}:00"
    except Exception:
        departure_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    points = [BASE, *nodes]
    durations, distances = matrix if matrix is not None else road_matrix(points, departure_iso)
    order = choose_order(nodes, durations, distances, max_minutes)
    route, elapsed, total_km, total_value = [], 0, 0.0, 0.0
    geometry, legs = [], []

    if order:
        waypoints = [BASE, *(points[i] for i in order), BASE]
        if HERE_API_KEY:
            # HERE Routes API: geometría y tiempos por tramo con tráfico real
            geometry, legs = _here_route_geometry(waypoints, departure_iso)
            if len(legs) != len(order) + 1:
                raise HTTPException(503, detail="HERE devolvio un recorrido con tramos incorrectos.")
        else:
            # Fallback OSRM
            mapped = road_data("route", waypoints,
                               "overview=full&geometries=geojson&continue_straight=false")
            try:
                mapped_route = mapped["routes"][0]
                legs = mapped_route["legs"]
                geometry = mapped_route["geometry"]["coordinates"]
                if len(legs) != len(order) + 1 or len(geometry) < 2:
                    raise ValueError("Recorrido incompleto")
                if any(not isfinite(leg[k]) or leg[k] < 0 for leg in legs for k in ("duration", "distance")):
                    raise ValueError("Tramo invalido")
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise HTTPException(503, detail="El proveedor devolvio un recorrido invalido.") from exc

    for index, dest in enumerate(order):
        node, leg = points[dest], legs[index]
        km, go = leg["distance"] / 1000, ceil(leg["duration"] / 60)
        arrival = current_time + timedelta(minutes=elapsed + go)
        previous = points[order[index - 1]] if index else BASE
        entry = entry_minutes(previous, node)
        service_start = arrival + timedelta(minutes=entry)
        departure = service_start + timedelta(minutes=SERVICE_MINUTES)
        elapsed += go + entry + SERVICE_MINUTES
        total_km += km
        node_scoring = scoring(node, km)
        total_value += node_scoring["benefit_score"]
        route.append({**node, "stop": len(route) + 1, "distance_km": round(km, 1), "travel_minutes": go,
                      "arrival": arrival.strftime("%H:%M"), "departure": departure.strftime("%H:%M"),
                      "entry_minutes": entry, "service_start": service_start.strftime("%H:%M"),
                      "service_minutes": SERVICE_MINUTES, **node_scoring})
    return_km = legs[-1]["distance"] / 1000 if legs else 0
    return_min = ceil(legs[-1]["duration"] / 60) if legs else 0
    elapsed += return_min
    total_km += return_km
    # La geometria final puede diferir de la matriz: nunca publicar una jornada excedida.
    if elapsed > max_minutes:
        raise HTTPException(503, detail="El recorrido final supera la jornada. Reintente con menos equipos.")
    provider = "HERE / tráfico en tiempo real" if HERE_API_KEY else "OSRM / OpenStreetMap"
    return {"base": BASE, "stops": route, "unassigned": [n for i, n in enumerate(nodes, 1) if i not in order],
            "total_km": round(total_km, 1), "total_minutes": elapsed,
            "return_time": (current_time + timedelta(minutes=elapsed)).strftime("%H:%M"),
            "return_travel_minutes": return_min, "return_distance_km": round(return_km, 1),
            "geometry": geometry, "routing_provider": provider, "live_traffic": bool(HERE_API_KEY),
            "sla_value": round(total_value, 1), "service_minutes": SERVICE_MINUTES,
            "scoring_rules": SCORING_RULES}


def workday_duration(start_time: str, end_time: str | None, max_minutes: int) -> int:
    if end_time is None:
        return max_minutes
    try:
        start = datetime.strptime(start_time, "%H:%M")
        end = datetime.strptime(end_time, "%H:%M")
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, detail="Inicio y fin deben tener formato HH:MM") from exc
    minutes = int((end - start).total_seconds() // 60)
    if minutes < 60:
        raise HTTPException(422, detail="El fin debe ser posterior al inicio y la jornada debe durar al menos 60 minutos, dentro del mismo día.")
    return minutes


def build_plan(nodes: list[dict], start_time: str, max_minutes: int, start_date: str | None = None, end_time: str | None = None) -> dict:
    max_minutes = workday_duration(start_time, end_time, max_minutes)
    if type(max_minutes) is not int or max_minutes < 60:
        raise HTTPException(422, detail="La jornada debe ser un entero al menos 60 minutos")
    try:
        day = date.fromisoformat(start_date) if start_date is not None else date.today()
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail="La fecha debe tener formato AAAA-MM-DD") from exc
    if not nodes:
        raise HTTPException(400, detail="No hay radares seleccionados")
    # La matriz inicial usa la hora de salida del primer día; jornadas siguientes recalculan con HERE
    departure_iso_day0 = f"{day.isoformat()}T{start_time}:00"
    all_durations, all_distances = road_matrix([BASE, *nodes], departure_iso_day0)
    remaining, days, offset = nodes.copy(), [], 0
    indices = {n['id']: i for i, n in enumerate(nodes, 1)}
    while remaining:
        selected = [0, *(indices[n['id']] for n in remaining)]
        matrix = tuple([[values[i][j] for j in selected] for i in selected]
                       for values in (all_durations, all_distances))
        # El SLA refleja las horas adicionales de espera, sin modificar los datos originales.
        aged = [{**n, 'lead_hours': n['lead_hours'] + 24 * offset} for n in remaining]
        day_str = (day + timedelta(days=offset)).isoformat()
        route = build_route(aged, start_time, max_minutes, matrix, start_date=day_str)
        if not route['stops']:
            break
        route['date'] = day_str
        days.append(route)
        visited = {n['id'] for n in route['stops']}
        remaining = [n for n in remaining if n['id'] not in visited]
        offset += 1
    return {'start_date': day.isoformat(), 'start_time': start_time, 'end_time': (datetime.strptime(start_time, '%H:%M') + timedelta(minutes=max_minutes)).strftime('%H:%M'), 'days': days,
            'created_at': datetime.now().isoformat(timespec='seconds'),
            'unscheduled': [{**n, 'reason': 'Sin camino viable o no cabe con ingreso, atencion y regreso en una jornada.'}
                            for n in remaining],
            'deferred_count': sum(len(d['stops']) for d in days[1:]),
            'entry_minutes': ENTRY_MINUTES, 'service_minutes': SERVICE_MINUTES,
            'max_minutes': max_minutes}


def save_plan(plan: dict) -> None:
    with _plan_lock:
        PLAN_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = PLAN_FILE.with_suffix('.tmp')
        temporary.write_text(json.dumps(plan, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, PLAN_FILE)


@app.get('/api/plan')
def saved_plan():
    with _plan_lock:
        return json.loads(PLAN_FILE.read_text(encoding='utf-8')) if PLAN_FILE.exists() else None


@app.get("/api/radars")
def radars():
    return {"base": BASE, "radars": RADARS}


@app.get("/api/scoring")
def scoring_rules():
    return SCORING_RULES


@app.post("/api/route")
def optimize_route(payload: RouteRequest):
    nodes = [r for r in RADARS if payload.selected_ids is None or r["id"] in payload.selected_ids]
    if not nodes:
        raise HTTPException(400, detail="No hay radares seleccionados")
    plan = build_plan(nodes, payload.start_time, payload.max_minutes, payload.start_date, payload.end_time)
    save_plan(plan)
    return plan


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return HTML


HTML = r'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vialseg · Hoja de Ruta Técnica</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>#map{height:460px}.num{background:#0f766e;color:white;border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-weight:bold}
:root{color-scheme:light;--ink:#172421;--muted:#65716d;--accent:#176b55;--line:#dfe5e1}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;background:#f5f6f4!important;color:var(--ink)!important}
.page-header{display:grid;grid-template-columns:minmax(0,1fr);gap:28px;margin-bottom:24px}
.page-heading{min-width:0;padding-top:8px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--accent);margin:0 0 14px}
.page-heading h1{font-size:clamp(28px,3.2vw,42px);font-weight:600;letter-spacing:-.045em;line-height:1.15;margin:0 0 12px}
.page-subtitle{font-size:14px;line-height:1.65;color:var(--muted);max-width:390px;margin:0}
.schedule-card{min-width:0;background:white;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 4px 18px #182d2105}
.schedule-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:24px}.schedule-heading h2{font-size:16px;font-weight:650;letter-spacing:-.02em;margin:0}.schedule-heading p{font-size:13px;color:var(--muted);margin:5px 0 0}.schedule-tag{font-size:9px;letter-spacing:.1em;color:var(--muted);white-space:nowrap;border:1px solid var(--line);border-radius:5px;padding:5px 7px}
.schedule-fields{display:grid;grid-template-columns:minmax(0,1.3fr) repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.schedule-field{min-width:0;display:flex;flex-direction:column;gap:8px}.schedule-field label{font-size:12px;font-weight:600;line-height:18px;white-space:nowrap}
.schedule-field input{display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;height:48px;border:1px solid #d8dfda;border-radius:9px;background:#fafbf9;color:var(--ink);padding:0 12px;font:500 16px/1.2 inherit;font-family:inherit;font-size:16px;font-variant-numeric:tabular-nums;letter-spacing:.01em;transition:border-color .15s,box-shadow .15s}
.schedule-field input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px #176b551a;background:white}.field-hint{font-size:11px;color:var(--muted);line-height:16px}
.schedule-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid #eef1ed;margin-top:20px;padding-top:18px}
#workdayDuration{font-size:12px;color:var(--muted);line-height:1.5;min-width:0}
#optimize{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;gap:20px;min-height:46px;background:var(--accent);color:white;border:0;border-radius:9px;padding:12px 18px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
#optimize:hover{background:#12533f}#optimize:focus-visible{outline:3px solid #176b5555;outline-offset:3px}#optimize:disabled{opacity:.5;cursor:wait}
@media(min-width:1100px){.page-header{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:center;gap:40px}}
@media(max-width:599px){.schedule-card{padding:20px}.schedule-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}.schedule-date{grid-column:1/-1}.schedule-heading{margin-bottom:20px}.schedule-tag{display:none}.schedule-footer{align-items:stretch;flex-direction:column;gap:12px}#optimize{width:100%}.page-header{gap:22px}.page-subtitle{font-size:13px}}
@media(prefers-reduced-motion:reduce){.schedule-field input,#optimize{transition:none}}
/* Vialseg identity: sky blue and lime, with quiet operational surfaces. */
:root{--ink:#202b30;--muted:#66747b;--accent:#086f91;--line:#e1e7ea;--sky:#00a5d5;--lime:#83c735}
body{background:#f6f8f9!important;color:var(--ink)!important}
body:before{content:"";display:block;height:4px;background:linear-gradient(90deg,var(--sky),var(--lime))}
main{max-width:1440px!important}
.eyebrow{color:var(--accent);letter-spacing:.14em}
.page-heading h1{max-width:440px}.page-header{margin-bottom:28px}
.schedule-card{box-shadow:0 6px 24px #20334304;border-radius:20px}
.schedule-field input{background:#f8fafb;border-color:var(--line)}
.schedule-field input:focus{box-shadow:0 0 0 3px #00a5d51a}
#optimize{background:var(--accent);box-shadow:0 2px 4px #086f9114}
#optimize:hover{background:#055a77}#optimize:focus-visible{outline-color:#00a5d560}
#routeStatus{color:var(--accent);line-height:1.6}#routeStatus:empty{display:none}
#planning{padding:24px;border:1px solid var(--line);border-radius:18px;margin-bottom:20px;background:linear-gradient(115deg,#fff 60%,#f3f9ed)}
#planning h2,aside h2{font-size:17px;letter-spacing:-.025em;font-weight:600}
#planNotice{color:var(--muted);line-height:1.6;margin:8px 0 16px}
#planning label{font-size:13px;font-weight:600;margin-right:10px}
select{min-height:44px;max-width:100%;border:1px solid var(--line)!important;border-radius:9px!important;background:#fff;font:inherit;font-size:13px;padding:10px 32px 10px 12px!important;color:var(--ink)}
select:focus-visible,button:focus-visible,input[type=checkbox]:focus-visible{outline:3px solid #00a5d550;outline-offset:3px}
main>section.grid{min-width:0}
main>section.grid>div,main>section.grid>aside{min-width:0;border:1px solid var(--line);box-shadow:0 2px 8px #20334303;border-radius:16px}
main>section.md\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
main>section.md\:grid-cols-4>div{padding:22px 24px}
main>section.md\:grid-cols-4 p{font-size:10px;font-weight:600;letter-spacing:.08em;line-height:1.6;margin-bottom:12px}
main>section.md\:grid-cols-4 b{font-size:28px;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
#sla{color:var(--accent)}
main>section:has(>#map){border:1px solid var(--line);border-radius:18px;box-shadow:none}
#map{height:420px;background:#eaf0f2}
.num{background:var(--accent);border:2px solid white;box-shadow:0 2px 6px #20334333;width:29px;height:29px;font-size:12px}
main>section:has(>#map)>p{padding:14px 20px;line-height:1.7;background:white}
[role=tablist]{display:inline-flex;gap:4px;padding:4px;background:#f0f3f5;border-radius:10px}
[role=tab]{border-radius:7px!important;font-size:13px;font-weight:600;min-height:40px;background:transparent!important;color:var(--muted)!important}
[role=tab][aria-selected=true]{background:white!important;color:var(--accent)!important;box-shadow:0 1px 4px #20334316}
[role=tabpanel] table{font-size:12px;font-variant-numeric:tabular-nums}
thead{background:#f8fafb!important}th{font-weight:500;white-space:nowrap}td{border-color:var(--line);vertical-align:middle}
tbody tr:hover{background:#f5fafc}td:nth-child(2){min-width:180px}td b{font-weight:600}
aside{align-self:start;padding:24px!important}aside>p{line-height:1.65;margin-top:8px}
#radarSelect{margin-top:8px;margin-bottom:18px}
#checks label{display:flex;align-items:center;gap:10px;min-height:48px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fafbfc;cursor:pointer}
#checks label:has(:checked){background:#f2f8eb;border-color:#cee2b8}
#checks input{width:17px;height:17px;flex-shrink:0;accent-color:#527f22}
#checks:disabled label{opacity:.55;cursor:default}
aside>div:has(#timer){background:#f4f7f8;margin-top:20px;padding:18px}
#timer{color:var(--ink);font-size:32px;letter-spacing:.04em}
#timerBtn{min-height:46px;background:var(--accent);font-size:13px;font-weight:600;border-radius:9px}
#timerBtn:hover:not(:disabled){background:#055a77}
#inspectionMessage{color:var(--accent);font-size:12px;line-height:1.6}
#history>div{border-color:var(--line);border-radius:12px;line-height:1.7}
@media(max-width:767px){main>section.md\:grid-cols-4{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}main>section.md\:grid-cols-4>div{padding:18px}main>section.md\:grid-cols-4 b{font-size:24px}#planning{padding:20px}#daySelect{display:block;width:100%;margin-top:8px}#map{height:340px}}
@media(max-width:359px){.schedule-fields{grid-template-columns:minmax(0,1fr)}.schedule-date{grid-column:auto}}
#checks #evidenceFile{display:block;width:100%;min-width:0;height:auto;margin-top:14px;padding:6px;border:1px solid #cde3ea;border-radius:12px;background:#f2f9fc;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;box-sizing:border-box}
#evidenceFile::file-selector-button{min-height:42px;margin-right:10px;padding:10px 16px;border:0;border-radius:8px;background:var(--accent);color:white;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
#evidenceFile:hover:not(:disabled)::file-selector-button{background:#055a77}
#evidenceFile:focus-visible{outline:3px solid #00a5d550;outline-offset:3px}
#evidenceFile:disabled{opacity:.5;cursor:not-allowed}
#evidenceFile:disabled::file-selector-button{cursor:not-allowed}
@media(prefers-reduced-motion:reduce){#evidenceFile::file-selector-button{transition:none}}
.closure{margin-top:24px;padding-top:22px;border-top:1px solid var(--line)}.closure label{display:block;font-size:12px;font-weight:600;margin:14px 0 6px}.closure textarea,.closure select{width:100%;min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px;background:#fafcfd;font:inherit;font-size:13px;resize:vertical}.closure textarea:focus{outline:2px solid #00a5d560}.closure button{width:100%;margin-top:18px;min-height:46px;border-radius:9px;background:var(--accent);color:white;font-size:13px;font-weight:600}.closure:disabled{opacity:.5}.closure .quick-options{display:flex;flex-wrap:wrap;gap:8px}.closure .quick-options button{width:auto;flex:1 1 auto;margin:0;padding:10px 12px;background:white;color:var(--ink);border:1px solid var(--line)}.closure .quick-options button[aria-pressed=true]{color:#075f7d;background:#e5f4fa;border-color:var(--accent)}.step-label{font-weight:600;font-size:14px;margin:18px 0 10px}.closure details{margin:18px 0;font-size:13px}.closure summary{cursor:pointer;color:var(--accent);padding:8px 0}#checks label[hidden]{display:none}</style></head>
<body class="bg-slate-100 text-slate-800"><main class="max-w-7xl mx-auto p-5 md:p-8"><header class="page-header"><div class="page-heading"><p class="eyebrow">VIALSEG / OPERACIONES</p><h1>Tu jornada, organizada.</h1><p class="page-subtitle">Planificá las visitas y seguí cada inspección desde un solo lugar.</p></div>
<section class="schedule-card" aria-labelledby="schedule-title"><div class="schedule-heading"><div><h2 id="schedule-title">Planificar jornada</h2><p>Elegí la fecha y tu horario de trabajo.</p></div><span class="schedule-tag">HOJA DE RUTA</span></div>
<div class="schedule-fields"><div class="schedule-field schedule-date"><label for="date">Fecha de la jornada</label><input id="date" type="text" placeholder="DD/MM/AAAA" inputmode="numeric" maxlength="10" aria-describedby="date-format"><span id="date-format" class="field-hint">Día / mes / año</span></div><div class="schedule-field"><label for="start">Hora de inicio</label><input id="start" onchange="updateDuration()" type="time" value="08:00" aria-label="Hora de inicio"></div><div class="schedule-field"><label for="end">Hora de fin</label><input id="end" onchange="updateDuration()" type="time" value="16:00" aria-label="Hora de fin"></div></div>
<div class="schedule-footer"><span id="workdayDuration" role="status" aria-live="polite"></span><button id="optimize" onclick="loadRoute()">Optimizar ruta <span aria-hidden="true">↗</span></button></div></section></header>
<p id="routeStatus" role="status" class="mb-4 text-sm text-teal-800"></p><section id="planning" class="bg-white p-4 rounded-xl mb-4" hidden><h2 class="font-bold">Visitas programadas</h2><p id="planNotice" class="text-sm my-2"></p><label for="daySelect">Ver jornada: </label><select id="daySelect" onchange="showDay()" class="border rounded p-2"></select><p id="planPending" class="text-amber-800 text-sm mt-2"></p></section><section class="grid md:grid-cols-4 gap-4 mb-5"><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PARADAS PLANIFICADAS</p><b id="stops" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">RECORRIDO ESTIMADO</p><b id="km" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">REGRESO A BASE</p><b id="return" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PUNTAJE OPERATIVO</p><b id="sla" class="text-2xl text-teal-700">—</b></div></section>
<section class="bg-white rounded-xl shadow-sm overflow-hidden mb-5"><div id="map"></div><p class="p-3 text-xs text-slate-500">Recorridos por calles: OSRM / OpenStreetMap. Tiempos estimados sin tráfico en vivo ni predicción por horario. Datos y accesos simulados · Ingreso: 15 min por barrio + atención: 11 min por equipo.</p></section>
<section class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden"><div class="p-4 border-b"><h2 class="font-bold">Inspecciones</h2><div class="flex gap-2 my-3" role="tablist" aria-label="Estado de inspecciones"><button id="pendingTab" role="tab" aria-selected="true" aria-controls="pendingPanel" onclick="showTab(false)" class="rounded-lg px-4 py-2 bg-teal-700 text-white">Pendientes</button><button id="doneTab" role="tab" aria-selected="false" aria-controls="donePanel" onclick="showTab(true)" class="rounded-lg px-4 py-2 bg-slate-100">Terminados</button></div><p class="text-xs text-slate-500">Puntaje = severidad × SLA × valor comercial × cercanía.</p></div><div id="pendingPanel" role="tabpanel" aria-labelledby="pendingTab"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-slate-500"><tr><th class="p-3">#</th><th class="p-3">Equipo / ubicación</th><th class="p-3">Severidad</th><th class="p-3">Puntaje</th><th class="p-3">Traslado</th><th class="p-3">Llegada al acceso</th><th class="p-3">Ingreso</th><th class="p-3">Inicio trabajo</th><th class="p-3">Atención</th><th class="p-3">Salida</th><th class="p-3">Km</th></tr></thead><tbody id="table"></tbody></table></div><p id="unassigned" class="p-3 text-xs text-amber-700"></p></div><div id="donePanel" role="tabpanel" aria-labelledby="doneTab" hidden class="p-4"><p class="text-xs text-slate-500 mb-3">Historial guardado en este navegador. Las nuevas inspecciones incluyen una imagen o video de evidencia.</p><div id="history"></div></div></div>
<aside class="bg-white rounded-xl shadow-sm p-5"><h2 class="font-bold">Evidencia y atención</h2><p class="text-sm text-slate-500 mb-4">Seleccioná el equipo, adjuntá la evidencia y registrá el resultado.</p><label for="radarSelect" class="text-sm font-semibold">Equipo pendiente</label><select id="radarSelect" onchange="selectInspection()" class="w-full border rounded p-2 mb-3"></select><fieldset id="checks" disabled><label hidden><input id="checkVisual" type="checkbox" onchange="updateCheck(0,this.checked)"> Inspección visual</label><label hidden><input id="checkCalibration" type="checkbox" onchange="updateCheck(1,this.checked)"> Calibración verificada</label><label class="block text-sm mb-4"><input id="checkPhoto" type="checkbox" disabled> Archivo adjunto</label><input id="evidenceFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onchange="attachEvidence(this)" aria-label="Adjuntar imagen o video de evidencia"><p class="text-xs text-slate-500 my-2">Imágenes JPG, PNG o WebP (1 MB). Videos MP4 o WebM (2 MB). Se guarda en este navegador.</p><img id="evidencePreview" hidden alt="Evidencia adjunta" style="max-width:100%;max-height:180px;border-radius:8px"><video id="evidenceVideo" hidden controls preload="metadata" aria-label="Video de evidencia" style="width:100%;max-height:240px;border-radius:8px"></video></fieldset><div class="text-center bg-slate-100 rounded-lg p-3"><span id="timer" class="font-mono text-3xl">00:00</span></div><button id="timerBtn" disabled onclick="toggleTimer()" class="w-full mt-3 bg-slate-800 text-white p-2 rounded-lg disabled:opacity-40">Iniciar atención</button><fieldset id="closure" disabled class="closure"><h2>Registrar mantenimiento</h2><p class="text-xs text-slate-500">Elegí las opciones. Escribí solo si hace falta.</p><input id="problem" type="hidden"><input id="result" type="hidden"><input id="work" type="hidden"><input id="reason" type="hidden"><p class="step-label">1. ¿Cómo quedó el equipo?</p><div class="quick-options"><button type="button" data-choice="result" data-value="Funcionando" aria-pressed="false" onclick="pickClosure(this)">Funcionando</button><button type="button" data-choice="result" data-value="Funcionando parcialmente" aria-pressed="false" onclick="pickClosure(this)">Parcial</button><button type="button" data-choice="result" data-value="Sin resolver" aria-pressed="false" onclick="pickClosure(this)">Sin resolver</button></div><p class="step-label">2. ¿Qué hiciste?</p><div class="quick-options"><button type="button" data-choice="work" data-value="Calibración" aria-pressed="false" onclick="pickClosure(this)">Calibración</button><button type="button" data-choice="work" data-value="Limpieza" aria-pressed="false" onclick="pickClosure(this)">Limpieza</button><button type="button" data-choice="work" data-value="Ajuste" aria-pressed="false" onclick="pickClosure(this)">Ajuste</button><button type="button" data-choice="work" data-value="Cambio de pieza" aria-pressed="false" onclick="pickClosure(this)">Cambio de pieza</button><button type="button" data-choice="work" data-value="Diagnóstico" aria-pressed="false" onclick="pickClosure(this)">Diagnóstico</button><button type="button" data-choice="work" data-value="Otro" aria-pressed="false" onclick="pickClosure(this)">Otro</button></div><div id="workDetailWrap" hidden><label for="workDetail">Describí el trabajo *</label><textarea id="workDetail" maxlength="2000" rows="2" oninput="saveClosure()"></textarea></div><div id="partsWrap" hidden><label for="parts">Repuesto utilizado (opcional)</label><textarea id="parts" maxlength="2000" rows="2" oninput="saveClosure()"></textarea></div><div id="reasonWrap" hidden><p class="step-label">¿Qué falta?</p><div class="quick-options"><button type="button" data-choice="reason" data-value="Repuesto" aria-pressed="false" onclick="pickClosure(this)">Repuesto</button><button type="button" data-choice="reason" data-value="Acceso" aria-pressed="false" onclick="pickClosure(this)">Acceso</button><button type="button" data-choice="reason" data-value="Soporte técnico" aria-pressed="false" onclick="pickClosure(this)">Soporte técnico</button><button type="button" data-choice="reason" data-value="Otro" aria-pressed="false" onclick="pickClosure(this)">Otro</button></div><p class="text-xs text-amber-700">Queda señalado para seguimiento. No tenés que programar otra visita.</p></div><div id="reasonDetailWrap" hidden><label for="reasonDetail">Contanos qué falta *</label><textarea id="reasonDetail" maxlength="2000" rows="2" oninput="saveClosure()"></textarea></div><details><summary>Agregar comentario (opcional)</summary><textarea aria-label="Comentario opcional" id="notes" maxlength="2000" rows="2" oninput="saveClosure()"></textarea></details><p class="text-xs text-slate-500">Adjuntá una foto o video en el control de evidencia para guardar.</p><button type="button" onclick="finishInspection()">Guardar mantenimiento</button></fieldset><p id="inspectionMessage" role="status" class="text-sm text-teal-800 mt-3"></p></aside></section></main>
<script>let map=L.map('map').setView([-34.58,-58.47],11), layers=[];L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
function clearMap(){layers.forEach(x=>map.removeLayer(x));layers=[]} function badge(p){return p==='Alto'?'bg-red-100 text-red-700':p==='Medio'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}
function displayDate(iso){return iso.split('-').reverse().join('/')}
function inputDate(){
 const value=document.querySelector('#date').value;
 if(!/^\d{2}\/\d{2}\/\d{4}$/.test(value))throw new Error('La fecha debe tener formato DD/MM/AAAA');
 const [d,m,y]=value.split('/');const iso=y+'-'+m+'-'+d;
 const parsed=new Date(iso+'T12:00:00Z');
 if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==iso)throw new Error('La fecha no es válida');
 return iso;
}
function jornadaMinutes(){
 const start=document.querySelector('#start').value,end=document.querySelector('#end').value;
 if(!start || !end)throw new Error('Completá inicio y fin de jornada.');
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const total=minutes(end)-minutes(start);
 if(total<60)throw new Error('El fin debe ser posterior al inicio; la jornada debe durar al menos 1 hora dentro del mismo día.');
 return total;
}
function updateDuration(){try{const n=jornadaMinutes();document.querySelector('#workdayDuration').textContent='Duración: '+Math.floor(n/60)+' h '+(n%60)+' min'}catch(e){document.querySelector('#workdayDuration').textContent=e.message}}
let currentPlan=null;
function displayPlan(plan){
 currentPlan=plan;document.querySelector('#planning').hidden=false;
 document.querySelector('#date').value=displayDate(plan.start_date);document.querySelector('#start').value=plan.start_time;const [h,m]=plan.start_time.split(':').map(Number);const finish=h*60+m+plan.max_minutes;document.querySelector('#end').value=plan.end_time || String(Math.floor(finish/60)%24).padStart(2,'0')+':'+String(finish%60).padStart(2,'0');updateDuration();
 const sel=document.querySelector('#daySelect');sel.replaceChildren();
 plan.days.forEach((day,i)=>{let option=document.createElement('option');option.value=i;option.textContent=displayDate(day.date)+' · '+day.stops.length+' equipos · '+day.total_minutes+' min';sel.appendChild(option)});
 document.querySelector('#planNotice').textContent=plan.days.length>1
  ?'No entra todo en un día: '+plan.deferred_count+' visitas programadas desde '+displayDate(plan.days[1].date)+'. Plan guardado en esta computadora. Días consecutivos, incluidos fines de semana.'
  :'Plan guardado en esta computadora para '+displayDate(plan.start_date)+'.';
 document.querySelector('#planPending').textContent=plan.unscheduled.length?'Sin fecha viable: '+plan.unscheduled.map(n=>n.id+' — '+n.reason).join(' / '):'';
 showDay();
}
function showDay(){let d=currentPlan.days[Number(document.querySelector('#daySelect').value)];
 if(!d){routeData=null;renderInspections();clearMap();document.querySelector('#table').innerHTML='';document.querySelector('#radarSelect').innerHTML='';document.querySelector('#unassigned').textContent='';['stops','km','return','sla'].forEach(id=>document.getElementById(id).textContent='—');document.querySelector('#routeStatus').textContent='No se encontró una jornada viable para las visitas seleccionadas.';return;}
 render(d);document.querySelector('#unassigned').textContent='';
 document.querySelector('#routeStatus').textContent=displayDate(d.date)+': '+d.total_minutes+' min, incluido ingreso, trabajo y regreso ('+d.return_travel_minutes+' min). Sin tráfico en vivo.';
}
async function loadRoute(){
 let button=document.querySelector('#optimize'),status=document.querySelector('#routeStatus');button.disabled=true;
 status.textContent='Calculando jornadas y programando pendientes…';
 try{const minutes=jornadaMinutes(),startDate=inputDate();const ids=radarCatalog.filter(r=>!isCompleted(r.id)).map(r=>r.id);if(!ids.length){status.textContent='Todos los equipos están terminados. Podés consultar el historial.';showTab(true);return;}let r=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_date:startDate,start_time:document.querySelector('#start').value,end_time:document.querySelector('#end').value,max_minutes:minutes,selected_ids:ids})});
 let d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Revisá fecha y horario.');displayPlan(d);
 }catch(e){status.textContent='No se guardó un nuevo plan: '+e.message+'. El plan anterior se conserva.'}finally{button.disabled=false}
}
async function restorePlan(){
 const today=new Date();document.querySelector('#date').value=[String(today.getDate()).padStart(2,'0'),String(today.getMonth()+1).padStart(2,'0'),today.getFullYear()].join('/');updateDuration();
 try{let r=await fetch('/api/plan');if(!r.ok)throw new Error();let p=await r.json();if(p)displayPlan(p);else await loadRoute()}
 catch(e){document.querySelector('#routeStatus').textContent='No se pudo recuperar el plan guardado.'}
}

function render(d){routeData=d;clearMap();let points=[[d.base.lat,d.base.lon]], base=L.marker(points[0]).bindPopup('<b>Base operativa</b><br>Martínez').addTo(map);layers.push(base);document.querySelector('#stops').textContent=d.stops.length;document.querySelector('#km').textContent=d.total_km+' km';document.querySelector('#return').textContent=d.return_time;document.querySelector('#sla').textContent=d.sla_value+' pts';let table='', select='<option value="">Seleccionar equipo…</option>';d.stops.forEach(s=>{points.push([s.lat,s.lon]);let marker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:'<div class="num">'+s.stop+'</div>'})}).bindPopup('<b>'+s.id+'</b><br>'+s.name+'<br>Severidad: '+s.priority+'<br>Puntaje de ruta: '+s.route_score);layers.push(marker);marker.addTo(map);table+=`<tr class="border-t"><td class="p-3 font-bold">${s.stop}</td><td class="p-3"><b>${s.id}</b><br><span class="text-slate-500">${s.name}</span></td><td class="p-3"><span class="${badge(s.priority)} px-2 py-1 rounded-full text-xs font-bold">${s.priority}</span></td><td class="p-3 font-bold">${s.route_score}</td><td class="p-3">${s.travel_minutes} min</td><td class="p-3">${s.arrival}</td><td class="p-3">${s.entry_minutes} min</td><td class="p-3">${s.service_start}</td><td class="p-3">${s.service_minutes} min</td><td class="p-3">${s.departure}</td><td class="p-3">${s.distance_km}</td></tr>`;select+=`<option value="${s.id}">${s.id} · ${s.name}</option>`});points.push([d.base.lat,d.base.lon]);let line=L.polyline(d.geometry.length?d.geometry.map(p=>[p[1],p[0]]):[points[0]],{color:'#086f91',weight:4,opacity:.8}).addTo(map);layers.push(line);map.fitBounds(line.getBounds(),{padding:[30,30]});document.querySelector('#table').innerHTML=table;document.querySelector('#radarSelect').innerHTML=select;document.querySelector('#unassigned').textContent=d.unassigned.length?'No incluidos por jornada o falta de camino: '+d.unassigned.map(x=>x.id).join(', '):'Todos los equipos seleccionados caben en la jornada.';renderInspections()}
const INSPECTION_KEY='vialseg.inspections.v1';
let inspectionState={drafts:{},history:[]}, routeData=null, radarCatalog=[], catalogBase=null, storageReady=true;
const checkIds=['checkVisual','checkCalibration','checkPhoto'];
function isCompleted(id){return inspectionState.history.some(x=>x.radar_id===id)}
function escapeText(value){const e=document.createElement('span');e.textContent=String(value);return e.innerHTML}
function elapsedSeconds(d){return (d.seconds||0)+(d.runningSince?Math.max(0,Math.floor((Date.now()-d.runningSince)/1000)):0)}
function durationText(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function saveState(next){
    try{localStorage.setItem(INSPECTION_KEY,JSON.stringify(next));inspectionState=next;return true}
    catch(e){document.querySelector('#inspectionMessage').textContent='No se pudo guardar. La tarea sigue pendiente; habilitá el almacenamiento del navegador e intentá otra vez.';return false}
}
function restoreState(){
    try{
        const raw=localStorage.getItem(INSPECTION_KEY);
        if(raw){
            const parsed=JSON.parse(raw);
            if(!parsed || !parsed.drafts || typeof parsed.drafts!=='object' || !Array.isArray(parsed.history))throw new Error('Historial inválido');
            inspectionState=parsed;
        }
    }catch(e){storageReady=false;document.querySelector('#inspectionMessage').textContent='No se pudo leer el historial guardado. Las inspecciones están bloqueadas para evitar sobrescribirlo.'}
}
function showTab(done){
    document.querySelector('#pendingPanel').hidden=done;document.querySelector('#donePanel').hidden=!done;
    for(const [id,active] of [['pendingTab',!done],['doneTab',done]]){
        const button=document.getElementById(id);button.setAttribute('aria-selected',String(active));
        button.className='rounded-lg px-4 py-2 '+(active?'bg-teal-700 text-white':'bg-slate-100');
    }
}
function renderInspections(){
    const select=document.querySelector('#radarSelect'), previous=select.value;
    const pending=routeData?routeData.stops.filter(r=>!isCompleted(r.id)):[];
    document.querySelector('#pendingTab').textContent='Pendientes ('+pending.length+')';
    document.querySelector('#doneTab').textContent='Terminados ('+inspectionState.history.length+')';
    select.replaceChildren(new Option('Seleccionar equipo…',''));
    for(const radar of pending)select.add(new Option(radar.id+' · '+radar.name,radar.id));
    if(pending.some(r=>r.id===previous))select.value=previous;
    const body=document.querySelector('#table');body.replaceChildren();
    for(const s of pending){
        const row=document.createElement('tr');row.className='border-t';
        for(const value of [s.stop,s.id+' · '+s.name,s.priority,s.route_score,s.travel_minutes+' min',s.arrival,s.entry_minutes+' min',s.service_start,s.service_minutes+' min',s.departure,s.distance_km]){
            const cell=document.createElement('td');cell.className='p-3';cell.textContent=value;row.appendChild(cell);
        }
        body.appendChild(row);
    }
    if(!pending.length)body.innerHTML='<tr><td colspan="11" class="p-4 text-slate-500">No hay inspecciones pendientes en esta ruta.</td></tr>';
    document.querySelector('#history').innerHTML=inspectionState.history.length?inspectionState.history.map(x=>
        '<article class="border rounded-lg p-4 mb-3"><h3 class="font-bold">'+escapeText(x.radar_id)+' · '+escapeText(x.name)+'</h3><p class="text-sm text-slate-500">Finalizada: '+escapeText(new Date(x.completed_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}))+'</p><p class="text-sm">Tiempo registrado: '+(x.started_at?durationText(x.seconds):'Sin cronómetro')+'</p><p class="text-sm text-teal-700 mt-2">'+(x.quick_closure?'Trabajo registrado': '✓ Inspección visual')+' · '+(x.quick_closure?'Resultado declarado':x.checks?.[1]?'✓ Calibración verificada':'Calibración no confirmada')+' · '+(hasEvidence(x)?'✓ Archivo adjunto':'Evidencia declarada anteriormente, sin imagen')+'</p>'+(hasEvidence(x)?(x.evidence.startsWith('data:video/')?'<video controls preload="metadata" aria-label="Video de evidencia" style="width:100%;max-height:320px;margin-top:12px;border-radius:8px" src="'+x.evidence+'"></video>':'<img alt="Evidencia de inspección" style="max-width:100%;max-height:320px;margin-top:12px;border-radius:8px" src="'+x.evidence+'">'):'')+closureHistory(x)+'</article>'
    ).join(''):'<p class="text-slate-500">Todavía no hay inspecciones terminadas.</p>';
    selectInspection();
}
function selectInspection(){
    const id=document.querySelector('#radarSelect').value,d=inspectionState.drafts[id];
    document.querySelector('#checks').disabled=!id || !storageReady;
    document.querySelector('#timerBtn').disabled=!id || !storageReady;
    checkIds.forEach((key,i)=>document.getElementById(key).checked=i===2?hasEvidence(d):Boolean(d?.checks[i]));
    document.querySelector('#checkPhoto').disabled=true;
    const preview=document.querySelector('#evidencePreview');
    const video=document.querySelector('#evidenceVideo'),isVideo=hasEvidence(d) && d.evidence.startsWith('data:video/');
    preview.hidden=!hasEvidence(d)||isVideo;preview.src=hasEvidence(d)&&!isVideo?d.evidence:'';
    video.pause();video.hidden=!isVideo;video.src=isVideo?d.evidence:'';
    document.querySelector('#evidenceFile').value='';
    document.querySelector('#closure').disabled=!id || !storageReady;
    closureKeys.forEach(k=>document.getElementById(k).value=d?.closure?.[k] || '');
    document.querySelector('#reasonWrap').hidden=!['Sin resolver','Funcionando parcialmente'].includes(d?.closure?.result);
    paintClosure();
    paintTimer();
}
function newDraft(){return {checks:[false,false,false],seconds:0,runningSince:null,started_at:null}}
function hasEvidence(d){return typeof d?.evidence==='string' && /^data:(image\/(jpeg|png|webp)|video\/(mp4|webm));base64,[A-Za-z0-9+/=]+$/.test(d.evidence)}
async function attachEvidence(input){
    const id=document.querySelector('#radarSelect').value,file=input.files[0];
    if(!id || !file || !storageReady)return;
    try{
        const isVideo=['video/mp4','video/webm'].includes(file.type);
        if(!isVideo && !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Elegí una imagen JPG, PNG o WebP, o un video MP4 o WebM.');
        if(file.size>(isVideo?2:1)*1024*1024)throw new Error('El máximo es 1 MB para imágenes y 2 MB para videos.');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer el archivo.'));reader.readAsDataURL(file)});
        await new Promise((resolve,reject)=>{
            const media=isVideo?document.createElement('video'):new Image();
            const timeout=setTimeout(()=>reject(new Error('No se pudo validar el archivo.')),15000);
            const ready=()=>{clearTimeout(timeout);resolve()};
            if(isVideo){media.preload='metadata';media.onloadedmetadata=()=>{if(media.videoWidth>0 && media.videoHeight>0)ready();else{clearTimeout(timeout);reject(new Error('El archivo no contiene video.'))}}}else media.onload=ready;
            media.onerror=()=>{clearTimeout(timeout);reject(new Error('Archivo inválido o formato no reproducible en este navegador.'))};media.src=data;
        });
        if(document.querySelector('#radarSelect').value!==id || isCompleted(id))return;
        updateCheck(2,true,data);
    }catch(e){document.querySelector('#inspectionMessage').textContent=e.message;input.value=''}
}
function updateCheck(index,checked,evidence=null){
    const id=document.querySelector('#radarSelect').value;
    if(!id || !storageReady || isCompleted(id))return;
    const next=JSON.parse(JSON.stringify(inspectionState)),d=next.drafts[id] || newDraft();
    if(index===2 && checked){
        if(!hasEvidence({evidence})){selectInspection();document.querySelector('#inspectionMessage').textContent='Adjuntá una imagen o video para completar la evidencia.';return}
        d.evidence=evidence;
    }
    d.checks[index]=checked;
    d.checks[2]=hasEvidence(d);
    next.drafts[id]=d;
    if(!saveState(next)){selectInspection();return}
    selectInspection();
}
const closureKeys=['problem','work','parts','notes','result','reason','workDetail','reasonDetail'];
function pickClosure(button){
    const key=button.dataset.choice,input=document.getElementById(key),value=button.dataset.value;
    if(key==='work'){const values=input.value?input.value.split(' · '):[];input.value=(values.includes(value)?values.filter(v=>v!==value):[...values,value]).join(' · ')}else input.value=value;
    saveClosure();
}
function paintClosure(){
    const work=document.getElementById('work').value.split(' · '),result=document.getElementById('result').value,reason=document.getElementById('reason').value;
    document.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.choice==='work'?work.includes(b.dataset.value):document.getElementById(b.dataset.choice).value===b.dataset.value)));
    document.getElementById('partsWrap').hidden=!work.includes('Cambio de pieza');
    document.getElementById('workDetailWrap').hidden=!work.includes('Otro');
    const revisit=['Sin resolver','Funcionando parcialmente'].includes(result);
    document.getElementById('reasonWrap').hidden=!revisit;
    document.getElementById('reasonDetailWrap').hidden=!revisit || reason!=='Otro';
}
function saveClosure(){
    const id=document.querySelector('#radarSelect').value;
    if(!id || !storageReady || isCompleted(id))return false;
    const next=JSON.parse(JSON.stringify(inspectionState)),d=next.drafts[id] || newDraft();
    d.closure=Object.fromEntries(closureKeys.map(k=>[k,document.getElementById(k).value]));next.drafts[id]=d;
    document.querySelector('#reasonWrap').hidden=!['Sin resolver','Funcionando parcialmente'].includes(d.closure.result);
    paintClosure();
    return saveState(next);
}
function finishInspection(){
    if(!saveClosure())return;
    const id=document.querySelector('#radarSelect').value,next=JSON.parse(JSON.stringify(inspectionState)),d=next.drafts[id],c=d.closure;
    const message=document.querySelector('#inspectionMessage');
    if(!c.work.trim() || !['Funcionando','Funcionando parcialmente','Sin resolver'].includes(c.result)){message.textContent='Elegí el resultado y al menos un trabajo realizado.';return}
    const revisit=c.result!=='Funcionando';
    if(revisit && !c.reason.trim()){message.textContent='Indicá el motivo y qué queda pendiente para la próxima visita.';return}
    if(c.work.split(' · ').includes('Otro') && !c.workDetail.trim()){message.textContent='Describí el trabajo realizado.';return}
    if(revisit && c.reason==='Otro' && !c.reasonDetail.trim()){message.textContent='Contanos qué falta.';return}
    if(!hasEvidence(d)){message.textContent='Adjuntá una foto o video para guardar el mantenimiento.';return}
    const radar=radarCatalog.find(r=>r.id===id);
    next.history.unshift({radar_id:id,name:radar.name,planned_date:routeData?.date || null,completed_at:new Date().toISOString(),started_at:d.started_at,seconds:elapsedSeconds(d),evidence:d.evidence,checks:[...d.checks],closure:c,quick_closure:true,needs_revisit:revisit});
    delete next.drafts[id];
    if(!saveState(next))return;
    renderInspections();selectInspection();showTab(true);message.textContent=revisit?'Mantenimiento registrado. Necesita otra visita (sin reprogramación automática).':'Mantenimiento finalizado y guardado.';
}
function closureHistory(x){
    if(!x.closure)return '';
    return '<div class="mt-3 text-sm">'+(x.needs_revisit?'<p class="text-amber-700 font-semibold">Necesita otra visita · sin reprogramar</p>':'')+[['Resultado','result'],['Problema','problem'],['Trabajo realizado','work'],['Repuestos','parts'],['Observaciones','notes'],['Pendiente','reason'],['Detalle del trabajo','workDetail'],['Detalle pendiente','reasonDetail']].filter(([label,key])=>x.closure[key]).map(([label,key])=>'<p style="white-space:pre-wrap;margin-top:8px"><b>'+label+':</b> '+escapeText(x.closure[key])+'</p>').join('')+'</div>';
}
function toggleTimer(){
    const id=document.querySelector('#radarSelect').value;
    if(!id || !storageReady || isCompleted(id))return;
    const next=JSON.parse(JSON.stringify(inspectionState)),d=next.drafts[id] || newDraft();
    if(d.runningSince){d.seconds=elapsedSeconds(d);d.runningSince=null}
    else{
        // Solo una atención activa; al iniciar otra, se pausa la anterior.
        for(const other of Object.values(next.drafts)){if(other.runningSince){other.seconds=elapsedSeconds(other);other.runningSince=null}}
        d.runningSince=Date.now();d.started_at=d.started_at || new Date().toISOString();
    }
    next.drafts[id]=d;saveState(next);paintTimer();
}
function paintTimer(){
    const d=inspectionState.drafts[document.querySelector('#radarSelect').value];
    document.querySelector('#timer').textContent=durationText(d?elapsedSeconds(d):0);
    document.querySelector('#timerBtn').textContent=d?.runningSince?'Pausar atención':d?.started_at?'Reanudar atención':'Iniciar atención';
}
async function initialize(){
 restoreState();
 try{const r=await fetch('/api/radars');if(!r.ok)throw new Error('No se pudieron cargar los equipos');const data=await r.json();radarCatalog=data.radars;catalogBase=data.base;renderInspections();await restorePlan()}
 catch(e){document.querySelector('#routeStatus').textContent=e.message}
}
window.addEventListener('storage',event=>{if(event.key===INSPECTION_KEY){restoreState();renderInspections()}});
setInterval(paintTimer,1000);initialize();</script></body></html>'''


class LocalHandler(BaseHTTPRequestHandler):
    """Servidor sin dependencias, utilizado solo cuando FastAPI no esta disponible."""
    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/", "/index.html"):
            body = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/radars":
            self._send_json({"base": BASE, "radars": RADARS})
        elif self.path == "/api/scoring":
            self._send_json(SCORING_RULES)
        elif self.path == '/api/plan':
            self._send_json(saved_plan())
        else:
            self._send_json({"detail": "No encontrado"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/route":
            self._send_json({"detail": "No encontrado"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or "{}")
            ids = data.get("selected_ids")
            nodes = [r for r in RADARS if ids is None or r["id"] in ids]
            if not nodes:
                self._send_json({"detail": "No hay radares seleccionados"}, 400)
                return
            plan = build_plan(nodes, data.get('start_time', START_TIME), data.get('max_minutes', WORKDAY_MINUTES), data.get('start_date'), data.get('end_time'))
            save_plan(plan)
            self._send_json(plan)
        except (ValueError, TypeError, HTTPException) as exc:
            self._send_json({"detail": getattr(exc, "detail", str(exc))}, getattr(exc, "status_code", 422))

    def log_message(self, _format: str, *_args: object) -> None:
        pass  # mantiene limpia la consola del demo


if __name__ == "__main__":
    if FASTAPI_AVAILABLE:
        import uvicorn
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        print("Vialseg disponible en http://127.0.0.1:8000")
        ThreadingHTTPServer(("127.0.0.1", 8000), LocalHandler).serve_forever()
