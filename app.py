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
_road_lock = Lock()
_last_road_request = 0.0

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
    max_minutes: int = Field(WORKDAY_MINUTES, ge=60, le=WORKDAY_MINUTES)
    selected_ids: list[str] | None = None


@lru_cache(maxsize=32)
def _road_json(path: str, time_bucket: int) -> dict:
    """Cache breve y solicitudes serializadas para el servidor de demostracion."""
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


def road_matrix(points: list[dict]) -> tuple[list, list]:
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
        raise HTTPException(503, detail="El proveedor devolvió una matriz vial inválida.") from exc


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


def build_route(nodes: list[dict], start_time: str, max_minutes: int, matrix=None) -> dict:
    if isinstance(max_minutes, bool) or not isinstance(max_minutes, int) or not 60 <= max_minutes <= WORKDAY_MINUTES:
        raise HTTPException(422, detail="La jornada debe estar entre 60 y 480 minutos")
    try:
        current_time = datetime.strptime(start_time, "%H:%M")
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, detail="start_time debe tener formato HH:MM") from exc
    points = [BASE, *nodes]
    durations, distances = matrix if matrix is not None else road_matrix(points)
    order = choose_order(nodes, durations, distances, max_minutes)
    route, elapsed, total_km, total_value = [], 0, 0.0, 0.0
    geometry, legs = [], []
    if order:
        mapped = road_data("route", [BASE, *(points[i] for i in order), BASE],
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
            raise HTTPException(503, detail="El proveedor devolvió un recorrido inválido.") from exc
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
    return {"base": BASE, "stops": route, "unassigned": [n for i, n in enumerate(nodes, 1) if i not in order],
            "total_km": round(total_km, 1), "total_minutes": elapsed,
            "return_time": (current_time + timedelta(minutes=elapsed)).strftime("%H:%M"),
            "return_travel_minutes": return_min, "return_distance_km": round(return_km, 1),
            "geometry": geometry, "routing_provider": "OSRM / OpenStreetMap", "live_traffic": False,
            "sla_value": round(total_value, 1), "service_minutes": SERVICE_MINUTES,
            "scoring_rules": SCORING_RULES}


def build_plan(nodes: list[dict], start_time: str, max_minutes: int, start_date: str | None = None) -> dict:
    try:
        day = date.fromisoformat(start_date) if start_date is not None else date.today()
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, detail="La fecha debe tener formato AAAA-MM-DD") from exc
    if not nodes:
        raise HTTPException(400, detail="No hay radares seleccionados")
    all_durations, all_distances = road_matrix([BASE, *nodes])
    remaining, days, offset = nodes.copy(), [], 0
    indices = {n['id']: i for i, n in enumerate(nodes, 1)}
    while remaining:
        selected = [0, *(indices[n['id']] for n in remaining)]
        matrix = tuple([[values[i][j] for j in selected] for i in selected]
                       for values in (all_durations, all_distances))
        # El SLA refleja las horas adicionales de espera, sin modificar los datos originales.
        aged = [{**n, 'lead_hours': n['lead_hours'] + 24 * offset} for n in remaining]
        route = build_route(aged, start_time, max_minutes, matrix)
        if not route['stops']:
            break
        route['date'] = (day + timedelta(days=offset)).isoformat()
        days.append(route)
        visited = {n['id'] for n in route['stops']}
        remaining = [n for n in remaining if n['id'] not in visited]
        offset += 1
    return {'start_date': day.isoformat(), 'start_time': start_time, 'days': days,
            'created_at': datetime.now().isoformat(timespec='seconds'),
            'unscheduled': [{**n, 'reason': 'Sin camino viable o no cabe con ingreso, atención y regreso en una jornada.'}
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
    plan = build_plan(nodes, payload.start_time, payload.max_minutes, payload.start_date)
    save_plan(plan)
    return plan


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return HTML


HTML = r'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vialseg · Hoja de Ruta Técnica</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>#map{height:460px}.num{background:#0f766e;color:white;border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-weight:bold}</style></head>
<body class="bg-slate-100 text-slate-800"><main class="max-w-7xl mx-auto p-5 md:p-8"><header class="flex flex-wrap justify-between gap-4 mb-7"><div><p class="text-teal-700 font-bold tracking-widest text-xs">VIALSEG · OPERACIONES</p><h1 class="text-3xl font-bold">Optimizador de hoja de ruta</h1><p class="text-slate-500">Propuesta de Mejora 1 · Mantenimiento de cinemómetros</p></div><div class="bg-white rounded-xl shadow-sm px-5 py-3"><label for="date" class="text-xs font-semibold">FECHA</label><input id="date" type="date" class="border rounded px-2 py-1 mr-3"><label class="text-xs font-semibold">INICIO DE JORNADA</label><input id="start" type="time" value="08:00" class="ml-2 border rounded px-2 py-1"><button id="optimize" onclick="loadRoute()" class="ml-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-4 py-2 rounded-lg">Optimizar ruta</button></div></header>
<p id="routeStatus" role="status" class="mb-4 text-sm text-teal-800"></p><section id="planning" class="bg-white p-4 rounded-xl mb-4" hidden><h2 class="font-bold">Visitas programadas</h2><p id="planNotice" class="text-sm my-2"></p><label for="daySelect">Ver jornada: </label><select id="daySelect" onchange="showDay()" class="border rounded p-2"></select><p id="planPending" class="text-amber-800 text-sm mt-2"></p></section><section class="grid md:grid-cols-4 gap-4 mb-5"><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PARADAS PLANIFICADAS</p><b id="stops" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">RECORRIDO ESTIMADO</p><b id="km" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">REGRESO A BASE</p><b id="return" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PUNTAJE OPERATIVO</p><b id="sla" class="text-2xl text-teal-700">—</b></div></section>
<section class="bg-white rounded-xl shadow-sm overflow-hidden mb-5"><div id="map"></div><p class="p-3 text-xs text-slate-500">Recorridos por calles: OSRM / OpenStreetMap. Tiempos estimados sin tráfico en vivo ni predicción por horario. Datos y accesos simulados · Ingreso: 15 min por barrio + atención: 11 min por equipo.</p></section>
<section class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden"><div class="p-4 border-b"><h2 class="font-bold">Itinerario secuenciado</h2><p class="text-xs text-slate-500">Puntaje = severidad × SLA × valor comercial × cercanía.</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-slate-500"><tr><th class="p-3">#</th><th class="p-3">Equipo / ubicación</th><th class="p-3">Severidad</th><th class="p-3">Puntaje</th><th class="p-3">Traslado</th><th class="p-3">Llegada al acceso</th><th class="p-3">Ingreso</th><th class="p-3">Inicio trabajo</th><th class="p-3">Atención</th><th class="p-3">Salida</th><th class="p-3">Km</th></tr></thead><tbody id="table"></tbody></table></div><p id="unassigned" class="p-3 text-xs text-amber-700"></p></div>
<aside class="bg-white rounded-xl shadow-sm p-5"><h2 class="font-bold">Checklist OT (mock)</h2><p class="text-sm text-slate-500 mb-4">Registrar atención técnica en sitio.</p><select id="radarSelect" class="w-full border rounded p-2 mb-3"></select><label class="block text-sm mb-2"><input type="checkbox"> Inspección visual</label><label class="block text-sm mb-2"><input type="checkbox"> Calibración verificada</label><label class="block text-sm mb-4"><input type="checkbox"> Evidencia fotográfica cargada</label><div class="text-center bg-slate-100 rounded-lg p-3"><span id="timer" class="font-mono text-3xl">00:00</span></div><button id="timerBtn" onclick="toggleTimer()" class="w-full mt-3 bg-slate-800 text-white p-2 rounded-lg">Iniciar atención</button></aside></section></main>
<script>let map=L.map('map').setView([-34.58,-58.47],11), layers=[], seconds=0, ticking=false, interval;L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
function clearMap(){layers.forEach(x=>map.removeLayer(x));layers=[]} function badge(p){return p==='Alto'?'bg-red-100 text-red-700':p==='Medio'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}
let currentPlan=null;
function displayPlan(plan){
 currentPlan=plan;document.querySelector('#planning').hidden=false;
 document.querySelector('#date').value=plan.start_date;document.querySelector('#start').value=plan.start_time;
 const sel=document.querySelector('#daySelect');sel.replaceChildren();
 plan.days.forEach((day,i)=>{let option=document.createElement('option');option.value=i;option.textContent=day.date+' · '+day.stops.length+' equipos · '+day.total_minutes+' min';sel.appendChild(option)});
 document.querySelector('#planNotice').textContent=plan.days.length>1
  ?'No entra todo en un día: '+plan.deferred_count+' visitas programadas desde '+plan.days[1].date+'. Plan guardado en esta computadora. Días consecutivos, incluidos fines de semana.'
  :'Plan guardado en esta computadora para '+plan.start_date+'.';
 document.querySelector('#planPending').textContent=plan.unscheduled.length?'Sin fecha viable: '+plan.unscheduled.map(n=>n.id+' — '+n.reason).join(' / '):'';
 showDay();
}
function showDay(){let d=currentPlan.days[Number(document.querySelector('#daySelect').value)];
 if(!d){clearMap();document.querySelector('#table').innerHTML='';document.querySelector('#radarSelect').innerHTML='';document.querySelector('#unassigned').textContent='';['stops','km','return','sla'].forEach(id=>document.getElementById(id).textContent='—');document.querySelector('#routeStatus').textContent='No se encontró una jornada viable para las visitas seleccionadas.';return;}
 render(d);document.querySelector('#unassigned').textContent='';
 document.querySelector('#routeStatus').textContent=d.date+': '+d.total_minutes+' min, incluido ingreso, trabajo y regreso ('+d.return_travel_minutes+' min). Sin tráfico en vivo.';
}
async function loadRoute(){
 let button=document.querySelector('#optimize'),status=document.querySelector('#routeStatus');button.disabled=true;
 status.textContent='Calculando jornadas y programando pendientes…';
 try{let r=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_date:document.querySelector('#date').value,start_time:document.querySelector('#start').value,max_minutes:480})});
 let d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Revisá fecha y horario.');displayPlan(d);
 }catch(e){status.textContent='No se guardó un nuevo plan: '+e.message+'. El plan anterior se conserva.'}finally{button.disabled=false}
}
async function restorePlan(){
 const today=new Date();document.querySelector('#date').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 try{let r=await fetch('/api/plan');if(!r.ok)throw new Error();let p=await r.json();if(p)displayPlan(p);else document.querySelector('#routeStatus').textContent='Elegí la fecha y presioná Optimizar ruta para guardar la programación.'}
 catch(e){document.querySelector('#routeStatus').textContent='No se pudo recuperar el plan guardado.'}
}

function render(d){clearMap();let points=[[d.base.lat,d.base.lon]], base=L.marker(points[0]).bindPopup('<b>Base operativa</b><br>Martínez').addTo(map);layers.push(base);document.querySelector('#stops').textContent=d.stops.length;document.querySelector('#km').textContent=d.total_km+' km';document.querySelector('#return').textContent=d.return_time;document.querySelector('#sla').textContent=d.sla_value+' pts';let table='', select='<option value="">Seleccionar equipo…</option>';d.stops.forEach(s=>{points.push([s.lat,s.lon]);let marker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:'<div class="num">'+s.stop+'</div>'})}).bindPopup('<b>'+s.id+'</b><br>'+s.name+'<br>Severidad: '+s.priority+'<br>Puntaje de ruta: '+s.route_score);layers.push(marker);marker.addTo(map);table+=`<tr class="border-t"><td class="p-3 font-bold">${s.stop}</td><td class="p-3"><b>${s.id}</b><br><span class="text-slate-500">${s.name}</span></td><td class="p-3"><span class="${badge(s.priority)} px-2 py-1 rounded-full text-xs font-bold">${s.priority}</span></td><td class="p-3 font-bold">${s.route_score}</td><td class="p-3">${s.travel_minutes} min</td><td class="p-3">${s.arrival}</td><td class="p-3">${s.entry_minutes} min</td><td class="p-3">${s.service_start}</td><td class="p-3">${s.service_minutes} min</td><td class="p-3">${s.departure}</td><td class="p-3">${s.distance_km}</td></tr>`;select+=`<option value="${s.id}">${s.id} · ${s.name}</option>`});points.push([d.base.lat,d.base.lon]);let line=L.polyline(d.geometry.length?d.geometry.map(p=>[p[1],p[0]]):[points[0]],{color:'#0f766e',weight:4,opacity:.8}).addTo(map);layers.push(line);map.fitBounds(line.getBounds(),{padding:[30,30]});document.querySelector('#table').innerHTML=table;document.querySelector('#radarSelect').innerHTML=select;document.querySelector('#unassigned').textContent=d.unassigned.length?'No incluidos por jornada o falta de camino: '+d.unassigned.map(x=>x.id).join(', '):'Todos los equipos seleccionados caben en la jornada.'}
function toggleTimer(){ticking=!ticking;let b=document.querySelector('#timerBtn');b.textContent=ticking?'Pausar atención':'Reanudar atención';if(ticking){interval=setInterval(()=>{seconds++;let m=String(Math.floor(seconds/60)).padStart(2,'0'),s=String(seconds%60).padStart(2,'0');document.querySelector('#timer').textContent=m+':'+s},1000)}else clearInterval(interval)}restorePlan();</script></body></html>'''


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
            plan = build_plan(nodes, data.get('start_time', START_TIME), data.get('max_minutes', WORKDAY_MINUTES), data.get('start_date'))
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
