"""Prototipo Vialseg: optimizacion diaria de hojas de ruta tecnica.

Ejecutar:
    pip install fastapi "uvicorn[standard]"
    uvicorn app:app --reload
"""
from __future__ import annotations

from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from typing import Literal
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
MIN_WORKDAY_MINUTES = 60
WORKDAY_ERROR = "La jornada debe ser un número entero entre 60 y 480 minutos e incluir el regreso a base."
SERVICE_MINUTES = 11  # dentro del rango operativo de 10 a 12 minutos
AVERAGE_SPEED_KMH = 30

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
    start_time: str = START_TIME
    max_minutes: int = Field(WORKDAY_MINUTES, ge=MIN_WORKDAY_MINUTES, le=WORKDAY_MINUTES, strict=True)
    selected_ids: list[str] | None = None


def distance_km(a: dict, b: dict) -> float:
    """Haversine con factor 1.22 como aproximacion de recorrido vial urbano."""
    r = 6371.0
    dlat, dlon = radians(b["lat"] - a["lat"]), radians(b["lon"] - a["lon"])
    h = sin(dlat / 2) ** 2 + cos(radians(a["lat"])) * cos(radians(b["lat"])) * sin(dlon / 2) ** 2
    return 1.22 * (2 * r * asin(sqrt(h)))


def travel_minutes(km: float) -> int:
    return max(1, round(km / AVERAGE_SPEED_KMH * 60))


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


def validate_workday(max_minutes: int) -> int:
    """Regla compartida por ambos servidores y las llamadas directas al algoritmo."""
    if type(max_minutes) is not int or not MIN_WORKDAY_MINUTES <= max_minutes <= WORKDAY_MINUTES:
        raise HTTPException(422, detail=WORKDAY_ERROR)
    return max_minutes


def build_route(nodes: list[dict], start_time: str, max_minutes: int) -> dict:
    validate_workday(max_minutes)
    try:
        current_time = datetime.strptime(start_time, "%H:%M")
    except ValueError as exc:
        raise HTTPException(422, detail="start_time debe tener formato HH:MM") from exc
    pending, route, current, elapsed = nodes.copy(), [], BASE, 0
    total_km, total_value = 0.0, 0.0
    # Heuristica de maxima ganancia: prioriza el beneficio del ticket por severidad,
    # SLA y contrato, con ajuste de eficiencia por cercania.
    while pending:
        ranked = sorted(
            pending,
            key=lambda n: scoring(n, distance_km(current, n))["route_score"],
            reverse=True,
        )
        chosen = None
        for candidate in ranked:
            km = distance_km(current, candidate)
            go = travel_minutes(km)
            back = travel_minutes(distance_km(candidate, BASE))
            if elapsed + go + SERVICE_MINUTES + back <= max_minutes:
                chosen = (candidate, km, go)
                break
        if not chosen:
            break
        node, km, go = chosen
        arrival = current_time + timedelta(minutes=elapsed + go)
        departure = arrival + timedelta(minutes=SERVICE_MINUTES)
        elapsed += go + SERVICE_MINUTES
        total_km += km
        node_scoring = scoring(node, km)
        total_value += node_scoring["benefit_score"]
        route.append({**node, "stop": len(route) + 1, "distance_km": round(km, 1), "travel_minutes": go,
                      "arrival": arrival.strftime("%H:%M"), "departure": departure.strftime("%H:%M"),
                      "service_minutes": SERVICE_MINUTES, **node_scoring})
        current = node
        pending.remove(node)
    return_km = distance_km(current, BASE) if route else 0
    return_min = travel_minutes(return_km) if route else 0
    elapsed += return_min
    total_km += return_km
    return {"base": BASE, "stops": route, "unassigned": pending, "total_km": round(total_km, 1),
            "total_minutes": elapsed, "return_time": (current_time + timedelta(minutes=elapsed)).strftime("%H:%M"),
            "sla_value": round(total_value, 1), "service_minutes": SERVICE_MINUTES,
            "scoring_rules": SCORING_RULES}


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
    return build_route(nodes, payload.start_time, payload.max_minutes)


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return HTML


HTML = r'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vialseg · Hoja de Ruta Técnica</title><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>#map{height:460px}.num{background:#0f766e;color:white;border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-weight:bold}</style></head>
<body class="bg-slate-100 text-slate-800"><main class="max-w-7xl mx-auto p-5 md:p-8"><header class="flex flex-wrap justify-between gap-4 mb-7"><div><p class="text-teal-700 font-bold tracking-widest text-xs">VIALSEG · OPERACIONES</p><h1 class="text-3xl font-bold">Optimizador de hoja de ruta</h1><p class="text-slate-500">Propuesta de Mejora 1 · Mantenimiento de cinemómetros</p></div><div class="bg-white rounded-xl shadow-sm px-5 py-3"><label class="text-xs font-semibold">INICIO DE JORNADA</label><input id="start" type="time" value="08:00" class="ml-2 border rounded px-2 py-1"><button onclick="loadRoute()" class="ml-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-4 py-2 rounded-lg">Optimizar ruta</button></div></header>
<p id="routeError" role="alert" hidden class="mb-5 rounded-lg bg-red-100 text-red-800 p-3"></p>
<section class="grid md:grid-cols-4 gap-4 mb-5"><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PARADAS PLANIFICADAS</p><b id="stops" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">RECORRIDO ESTIMADO</p><b id="km" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">REGRESO A BASE</p><b id="return" class="text-2xl">—</b></div><div class="bg-white p-4 rounded-xl shadow-sm"><p class="text-xs text-slate-500">PUNTAJE OPERATIVO</p><b id="sla" class="text-2xl text-teal-700">—</b></div></section>
<section class="bg-white rounded-xl shadow-sm overflow-hidden mb-5"><div id="map"></div><p class="p-3 text-xs text-slate-500">Estimación vial: Haversine × 1,22 · Velocidad urbana promedio 30 km/h · Atención por equipo: 11 min.</p></section>
<section class="grid lg:grid-cols-3 gap-5"><div class="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden"><div class="p-4 border-b"><h2 class="font-bold">Inspecciones</h2><div class="flex gap-2 my-3" role="tablist" aria-label="Estado de inspecciones"><button id="pendingTab" role="tab" aria-selected="true" aria-controls="pendingPanel" onclick="showTab(false)" class="rounded-lg px-4 py-2 bg-teal-700 text-white">Pendientes</button><button id="doneTab" role="tab" aria-selected="false" aria-controls="donePanel" onclick="showTab(true)" class="rounded-lg px-4 py-2 bg-slate-100">Terminados</button></div><p class="text-xs text-slate-500">Puntaje = severidad × SLA × valor comercial × cercanía.</p></div><div id="pendingPanel" role="tabpanel" aria-labelledby="pendingTab"><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-slate-500"><tr><th class="p-3">#</th><th class="p-3">Equipo / ubicación</th><th class="p-3">Severidad</th><th class="p-3">Puntaje</th><th class="p-3">Llegada</th><th class="p-3">Atención</th><th class="p-3">Salida</th><th class="p-3">Km</th></tr></thead><tbody id="table"></tbody></table></div><p id="unassigned" class="p-3 text-xs text-amber-700"></p></div><div id="donePanel" role="tabpanel" aria-labelledby="doneTab" hidden class="p-4"><p class="text-xs text-slate-500 mb-3">Historial guardado en este navegador. Las casillas registran la declaración del técnico; no adjuntan fotos.</p><div id="history"></div></div></div>
<aside class="bg-white rounded-xl shadow-sm p-5"><h2 class="font-bold">Checklist de inspección</h2><p class="text-sm text-slate-500 mb-4">Al marcar los tres controles, la tarea pasa automáticamente a Terminados.</p><label for="radarSelect" class="text-sm font-semibold">Equipo pendiente</label><select id="radarSelect" onchange="selectInspection()" class="w-full border rounded p-2 mb-3"></select><fieldset id="checks" disabled><label class="block text-sm mb-2"><input id="checkVisual" type="checkbox" onchange="updateCheck(0,this.checked)"> Inspección visual</label><label class="block text-sm mb-2"><input id="checkCalibration" type="checkbox" onchange="updateCheck(1,this.checked)"> Calibración verificada</label><label class="block text-sm mb-4"><input id="checkPhoto" type="checkbox" onchange="updateCheck(2,this.checked)"> Evidencia fotográfica cargada</label></fieldset><div class="text-center bg-slate-100 rounded-lg p-3"><span id="timer" class="font-mono text-3xl">00:00</span></div><button id="timerBtn" disabled onclick="toggleTimer()" class="w-full mt-3 bg-slate-800 text-white p-2 rounded-lg disabled:opacity-40">Iniciar atención</button><p id="inspectionMessage" role="status" class="text-sm text-teal-800 mt-3"></p></aside></section></main>
<script>let map=L.map('map').setView([-34.58,-58.47],11), layers=[];L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
function clearMap(){layers.forEach(x=>map.removeLayer(x));layers=[]} function badge(p){return p==='Alto'?'bg-red-100 text-red-700':p==='Medio'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}
async function loadRoute(){
    let error=document.querySelector('#routeError');
    error.hidden=true;
    try{
        const ids=radarCatalog.filter(r=>!isCompleted(r.id)).map(r=>r.id);
        if(!ids.length){render({base:catalogBase,stops:[],unassigned:[],total_km:0,total_minutes:0,return_time:document.querySelector('#start').value,sla_value:0});return;}
        let r=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start_time:document.querySelector('#start').value,max_minutes:480,selected_ids:ids})});
        let d=await r.json();
        if(!r.ok){
            let detail=d.detail;
            if(Array.isArray(detail)) detail=detail.map(x=>x.loc?.includes('max_minutes')?'La jornada debe ser un número entero entre 60 y 480 minutos e incluir el regreso a base.':x.msg).join(' ');
            throw new Error(detail || 'No se pudo calcular la ruta.');
        }
        render(d);
    }catch(e){
        error.textContent='No se actualizó la ruta: '+e.message;
        error.hidden=false;
    }
}
function render(d){routeData=d;clearMap();let points=[[d.base.lat,d.base.lon]], base=L.marker(points[0]).bindPopup('<b>Base operativa</b><br>Martínez').addTo(map);layers.push(base);document.querySelector('#stops').textContent=d.stops.length;document.querySelector('#km').textContent=d.total_km+' km';document.querySelector('#return').textContent=d.return_time;document.querySelector('#sla').textContent=d.sla_value+' pts';let table='', select='<option value="">Seleccionar equipo…</option>';d.stops.forEach(s=>{points.push([s.lat,s.lon]);let marker=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:'<div class="num">'+s.stop+'</div>'})}).bindPopup('<b>'+s.id+'</b><br>'+s.name+'<br>Severidad: '+s.priority+'<br>Puntaje de ruta: '+s.route_score);layers.push(marker);marker.addTo(map);table+=`<tr class="border-t"><td class="p-3 font-bold">${s.stop}</td><td class="p-3"><b>${s.id}</b><br><span class="text-slate-500">${s.name}</span></td><td class="p-3"><span class="${badge(s.priority)} px-2 py-1 rounded-full text-xs font-bold">${s.priority}</span></td><td class="p-3 font-bold">${s.route_score}</td><td class="p-3">${s.arrival}</td><td class="p-3">${s.service_minutes} min</td><td class="p-3">${s.departure}</td><td class="p-3">${s.distance_km}</td></tr>`;select+=`<option value="${s.id}">${s.id} · ${s.name}</option>`});points.push([d.base.lat,d.base.lon]);let line=L.polyline(points,{color:'#0f766e',weight:4,opacity:.8}).addTo(map);layers.push(line);map.fitBounds(line.getBounds(),{padding:[30,30]});document.querySelector('#table').innerHTML=table;document.querySelector('#radarSelect').innerHTML=select;document.querySelector('#unassigned').textContent=d.unassigned.length?'Fuera de jornada: '+d.unassigned.map(x=>x.id).join(', '):'Todos los equipos seleccionados caben en la jornada.';renderInspections()}
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
        for(const value of [s.stop,s.id+' · '+s.name,s.priority,s.route_score,s.arrival,s.service_minutes+' min',s.departure,s.distance_km]){
            const cell=document.createElement('td');cell.className='p-3';cell.textContent=value;row.appendChild(cell);
        }
        body.appendChild(row);
    }
    if(!pending.length)body.innerHTML='<tr><td colspan="8" class="p-4 text-slate-500">No hay inspecciones pendientes en esta ruta.</td></tr>';
    document.querySelector('#history').innerHTML=inspectionState.history.length?inspectionState.history.map(x=>
        '<article class="border rounded-lg p-4 mb-3"><h3 class="font-bold">'+escapeText(x.radar_id)+' · '+escapeText(x.name)+'</h3><p class="text-sm text-slate-500">Finalizada: '+escapeText(new Date(x.completed_at).toLocaleString('es-AR'))+'</p><p class="text-sm">Tiempo registrado: '+(x.started_at?durationText(x.seconds):'Sin cronómetro')+'</p><p class="text-sm text-teal-700 mt-2">✓ Inspección visual · ✓ Calibración verificada · ✓ Evidencia fotográfica declarada</p></article>'
    ).join(''):'<p class="text-slate-500">Todavía no hay inspecciones terminadas.</p>';
    selectInspection();
}
function selectInspection(){
    const id=document.querySelector('#radarSelect').value,d=inspectionState.drafts[id];
    document.querySelector('#checks').disabled=!id || !storageReady;
    document.querySelector('#timerBtn').disabled=!id || !storageReady;
    checkIds.forEach((key,i)=>document.getElementById(key).checked=Boolean(d?.checks[i]));
    paintTimer();
}
function newDraft(){return {checks:[false,false,false],seconds:0,runningSince:null,started_at:null}}
function updateCheck(index,checked){
    const id=document.querySelector('#radarSelect').value;
    if(!id || !storageReady || isCompleted(id))return;
    const next=JSON.parse(JSON.stringify(inspectionState)),d=next.drafts[id] || newDraft();
    d.checks[index]=checked;next.drafts[id]=d;
    const completed=d.checks.every(Boolean);
    if(completed){
        const radar=radarCatalog.find(r=>r.id===id);
        next.history.unshift({radar_id:id,name:radar.name,completed_at:new Date().toISOString(),started_at:d.started_at,seconds:elapsedSeconds(d),checks:[...d.checks]});
        delete next.drafts[id];
    }
    if(!saveState(next)){selectInspection();return}
    if(completed){
        renderInspections();showTab(true);
        document.querySelector('#inspectionMessage').textContent=id+' finalizada y guardada en Terminados.';
    }
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
    try{const response=await fetch('/api/radars');if(!response.ok)throw new Error('No se pudieron cargar los equipos');const data=await response.json();radarCatalog=data.radars;catalogBase=data.base;await loadRoute()}
    catch(e){const error=document.querySelector('#routeError');error.textContent=e.message;error.hidden=false}
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
        else:
            self._send_json({"detail": "No encontrado"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/route":
            self._send_json({"detail": "No encontrado"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or "{}")
            max_minutes = validate_workday(data.get("max_minutes", WORKDAY_MINUTES))
            ids = data.get("selected_ids")
            nodes = [r for r in RADARS if ids is None or r["id"] in ids]
            if not nodes:
                self._send_json({"detail": "No hay radares seleccionados"}, 400)
                return
            self._send_json(build_route(nodes, data.get("start_time", START_TIME), max_minutes))
        except (ValueError, TypeError, HTTPException) as exc:
            self._send_json({"detail": getattr(exc, "detail", str(exc))}, 422)

    def log_message(self, _format: str, *_args: object) -> None:
        pass  # mantiene limpia la consola del demo


if __name__ == "__main__":
    if FASTAPI_AVAILABLE:
        import uvicorn
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        print("Vialseg disponible en http://127.0.0.1:8000")
        ThreadingHTTPServer(("127.0.0.1", 8000), LocalHandler).serve_forever()
