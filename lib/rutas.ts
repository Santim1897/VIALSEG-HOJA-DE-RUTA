// Proveedores de tiempos de viaje, en orden de preferencia:
//  1. Google Routes API (con tráfico en vivo) si hay GOOGLE_MAPS_API_KEY.
//  2. OSRM (calles reales, sin tráfico; servidor público o OSRM_URL propio).
//  3. Estimación por distancia (último recurso, se marca como "estimado" en la pantalla).
import "server-only";
import { distanciaKm } from "./geo";
import type { Punto } from "./types";

export interface Matriz {
  min: number[][];
  km: number[][];
  proveedor: string;
  conTrafico: boolean;
}

const OSRM = (process.env.OSRM_URL ?? "https://router.project-osrm.org").replace(/\/$/, "");
const GOOGLE = process.env.GOOGLE_MAPS_API_KEY;
const HERE = process.env.HERE_API_KEY || "L8xUne-jpZQPNU6_hWoXMux5-HqxeaF19BO4LEvOHx0";

async function here(origenes: Punto[], destinos: Punto[]): Promise<Matriz> {
  const url = `https://matrix.router.hereapi.com/v8/matrix?async=false&apiKey=${HERE}`;
  const depTime = new Date().toISOString();
  const min: number[][] = [];
  const km: number[][] = [];

  // HERE admite un máximo de 15 orígenes por llamada síncrona
  const batchSize = 15;
  for (let start = 0; start < origenes.length; start += batchSize) {
    const chunk = origenes.slice(start, start + batchSize);
    const payload = {
      origins: chunk.map((p) => ({ lat: p.lat, lng: p.lon })),
      destinations: destinos.map((p) => ({ lat: p.lat, lng: p.lon })),
      regionDefinition: { type: "world" },
      transportMode: "car",
      matrixAttributes: ["travelTimes", "distances"],
      departureTime: depTime,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HERE Matrix ${res.status}`);
    const data = await res.json();
    const m = data.matrix ?? {};
    const times: number[] = m.travelTimes ?? [];
    const dists: number[] = m.distances ?? [];
    const errors: number[] = m.errorCodes ?? [];

    for (let i = 0; i < chunk.length; i++) {
      const rowMin: number[] = [];
      const rowKm: number[] = [];
      for (let j = 0; j < destinos.length; j++) {
        const idx = i * destinos.length + j;
        const hasErr = idx < errors.length && errors[idx] !== 0;
        rowMin.push(hasErr ? 0 : (times[idx] ?? 0) / 60);
        rowKm.push(hasErr ? 0 : (dists[idx] ?? 0) / 1000);
      }
      min.push(rowMin);
      km.push(rowKm);
    }
  }

  return { min, km, proveedor: "HERE Routing (tráfico en vivo)", conTrafico: true };
}

async function google(origenes: Punto[], destinos: Punto[]): Promise<Matriz> {
  const wp = (p: Punto) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lon } } } });
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE!,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({ origins: origenes.map(wp), destinations: destinos.map(wp), travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google Routes ${res.status}`);
  const elementos: { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string }[] = await res.json();
  const min = origenes.map(() => destinos.map(() => 0));
  const km = origenes.map(() => destinos.map(() => 0));
  for (const e of elementos) {
    const i = e.originIndex ?? 0; // proto3 omite los ceros
    const j = e.destinationIndex ?? 0;
    if (e.condition && e.condition !== "ROUTE_EXISTS") throw new Error("Google: par sin ruta");
    min[i][j] = parseFloat(e.duration ?? "0") / 60;
    km[i][j] = (e.distanceMeters ?? 0) / 1000;
  }
  return { min, km, proveedor: "Google Routes (tráfico en vivo)", conTrafico: true };
}

async function osrm(puntos: Punto[], fuentes?: number[]): Promise<Matriz> {
  const coords = puntos.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const extra = fuentes ? `&sources=${fuentes.join(";")}` : "";
  const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=duration,distance${extra}`, { signal: AbortSignal.timeout(9000) });
  const data = await res.json();
  if (data.code !== "Ok") throw new Error("OSRM sin tabla");
  return {
    min: data.durations.map((f: number[]) => f.map((s) => (s ?? 0) / 60)),
    km: data.distances.map((f: number[]) => f.map((m) => (m ?? 0) / 1000)),
    proveedor: "OSRM / OpenStreetMap (sin tráfico)",
    conTrafico: false,
  };
}

function estimada(origenes: Punto[], destinos: Punto[]): Matriz {
  const km = origenes.map((a) => destinos.map((b) => distanciaKm(a, b) * 1.35));
  return { km, min: km.map((f) => f.map((k) => (k / 45) * 60)), proveedor: "Estimado por distancia (sin conexión al proveedor)", conTrafico: false };
}

/** Matriz completa de tiempos (min) y distancias (km) entre todos los puntos. */
export async function matriz(puntos: Punto[]): Promise<Matriz> {
  if (HERE) {
    try {
      return await here(puntos, puntos);
    } catch (e) {
      console.warn("HERE Matrix falló, uso siguiente proveedor:", e);
    }
  }
  if (GOOGLE) {
    try {
      return await google(puntos, puntos);
    } catch (e) {
      console.warn("Google Routes falló, uso OSRM:", e);
    }
  }
  try {
    return await osrm(puntos);
  } catch (e) {
    console.warn("OSRM falló, uso estimación:", e);
    return estimada(puntos, puntos);
  }
}

/** Solo la fila "desde donde estoy hasta cada punto": es lo que cambia con el tráfico cada 10 minutos. */
export async function fila(origen: Punto, destinos: Punto[]): Promise<Matriz> {
  if (HERE) {
    try {
      return await here([origen], destinos);
    } catch (e) {
      console.warn("HERE Matrix fila falló, uso siguiente proveedor:", e);
    }
  }
  if (GOOGLE) {
    try {
      return await google([origen], destinos);
    } catch (e) {
      console.warn("Google Routes falló, uso OSRM:", e);
    }
  }
  try {
    return await osrm([origen, ...destinos], [0]).then((m) => ({ ...m, min: [m.min[0].slice(1)], km: [m.km[0].slice(1)] }));
  } catch {
    return estimada([origen], destinos);
  }
}

/** Trazado por calles para dibujar en el mapa, como [lat, lon][]. */
export async function trazado(puntos: Punto[]): Promise<[number, number][]> {
  if (puntos.length < 2) return [];
  try {
    const coords = puntos.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
    const res = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=simplified&geometries=geojson`, { signal: AbortSignal.timeout(9000) });
    const data = await res.json();
    if (data.code !== "Ok") throw new Error("OSRM sin ruta");
    return data.routes[0].geometry.coordinates.map(([lon, lat]: number[]) => [lat, lon]);
  } catch {
    return puntos.map((p) => [p.lat, p.lon]);
  }
}
