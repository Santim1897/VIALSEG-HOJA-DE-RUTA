// Orquesta un cálculo: arma los datos, consulta tiempos, llama al optimizador (Python/OR-Tools) y guarda el plan.
import "server-only";
import { PARAMETROS_INICIALES } from "./catalogo";
import { premioFaltante } from "./heuristica";
import { valorar } from "./premio";
import { fila, matriz, trazado, type Matriz } from "./rutas";
import { SEDE } from "./sede";
import { store } from "./store";
import { aMinutos, hoy, minutosDelDia } from "./tiempo";
import type { CacheMatriz, CriterioRuteo, DB, Jornada, MotivoPlan, Parada, Plan, Posicion, RetornoBase } from "./types";

const VIGENCIA_MATRIZ_MS = 30 * 60_000;
// La asignación aproxima el manejo con la ida desde la ubicación de la camioneta: se deja 15% de la jornada para traslados entre countries.
const HOLGURA = 0.85;

// Se completa con los valores iniciales por si la base tiene parámetros guardados de una versión anterior.
export const parametros = (db: DB) => ({ ...PARAMETROS_INICIALES, ...db.parametros[0] });
export const idJornada = (camionetaId: string, fecha = hoy()) => `${fecha}_${camionetaId}`;

/**
 * Jornada de una camioneta para una fecha. Si administración todavía no la planificó, se propone
 * la del último día planificado: mismo conductor y los countries que siguen con fallas abiertas.
 * Se guarda recién cuando el conductor la inicia o administración la confirma en Planificación.
 */
export function jornadaDe(db: DB, camionetaId: string, fecha = hoy()): Jornada {
  const existente = db.jornadas.find((j) => j.id === idJornada(camionetaId, fecha));
  if (existente) return existente;
  const previa = db.jornadas
    .filter((j) => j.camionetaId === camionetaId && j.fecha < fecha && !j.heredado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const conFallas = new Set(db.fallas.filter((f) => f.estado === "abierta").map((f) => f.countryId));
  const activos = new Set(db.countries.filter((c) => c.activo !== false).map((c) => c.id));
  const conductorActivo = db.usuarios.some((u) => u.id === previa?.conductorId && u.activo && u.rol === "conductor");
  return {
    id: idJornada(camionetaId, fecha), fecha, camionetaId, estado: "pendiente", salteados: [], visitados: [],
    conductorId: conductorActivo ? previa!.conductorId : null,
    criterioRuteo: previa?.criterioRuteo ?? "combinado",
    countries: (previa?.countries ?? []).filter((c) => conFallas.has(c) && activos.has(c)),
    heredado: !!previa,
  };
}

async function optimizador<T>(origin: string, modelo: string, datos: unknown): Promise<T> {
  const base = (process.env.OPTIMIZADOR_URL ?? origin).replace(/\/$/, "");
  const res = await fetch(`${base}/api/py/${modelo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Optimizador ${res.status}`);
  return res.json();
}

interface ResultadoRuteo {
  estado: string;
  orden: string[];
  llegadas: Record<string, number>;
  no_visitados: string[];
  objetivo: number;
  minutos_totales: number;
  segundos: number;
  metodo?: string;
}

/** Minutos disponibles hasta el fin de jornada. Fuera de horario (demo) se usa la jornada completa. */
function disponible(inicio: string, fin: string) {
  const ahora = minutosDelDia();
  const [a, b] = [aMinutos(inicio), aMinutos(fin)];
  return ahora >= a && ahora < b ? b - ahora : b - a;
}

export async function planificar(origin: string, camionetaId: string, motivo: MotivoPlan, pos?: Posicion): Promise<Plan> {
  const s = store();
  const db = await s.leer();
  const p = parametros(db);
  const cam = db.camionetas.find((c) => c.id === camionetaId);
  if (!cam) throw new Error("Camioneta inexistente");
  const jornada = jornadaDe(db, camionetaId);
  const conductor = db.usuarios.find((u) => u.id === jornada.conductorId && u.rol === "conductor");
  const destino = conductor?.domicilio ?? SEDE;
  const val = valorar(db, p);
  const ahora = new Date();

  const salteados = new Set(jornada.salteados.map((x) => x.countryId));
  const candidatos = jornada.countries.filter(
    (id) => !jornada.visitados.includes(id) && !salteados.has(id) && (val.get(id)?.fallas.length ?? 0) > 0,
  );
  const country = (id: string) => db.countries.find((c) => c.id === id)!;
  const enSitio = jornada.enSitio && candidatos.includes(jornada.enSitio) ? jornada.enSitio : null;
  const desde: Posicion = enSitio
    ? { ...country(enSitio), at: ahora.toISOString(), fuente: "country" }
    : motivo === "inicio" && conductor?.domicilio
      ? { ...conductor.domicilio, at: ahora.toISOString(), fuente: "domicilio" }
      : pos ?? jornada.posicion ?? { lat: destino.lat, lon: destino.lon, at: ahora.toISOString(), fuente: conductor?.domicilio ? "domicilio" : "sede" };

  const baseRetorno: Posicion = { lat: destino.lat, lon: destino.lon, at: ahora.toISOString(), fuente: conductor?.domicilio ? "domicilio" : "sede" };

  // Tiempos: matriz completa, o solo la fila desde la posición actual si la matriz guardada es reciente.
  // El recorrido comienza en el domicilio al iniciar, usa la ubicación actual al recalcular y termina en el domicilio asignado.
  const ids = ["inicio", ...candidatos, "base"];
  const puntos = [desde, ...candidatos.map(country), baseRetorno];
  const cache = jornada.matriz;
  let m: Matriz;
  if (motivo === "periodico" && cache && cache.ids.join() === ids.join() && Date.now() - new Date(cache.at).getTime() < VIGENCIA_MATRIZ_MS) {
    const f = await fila(desde, puntos.slice(1));
    m = {
      min: [[0, ...f.min[0]], ...cache.min.slice(1)],
      km: [[0, ...f.km[0]], ...cache.km.slice(1)],
      proveedor: f.proveedor,
      conTrafico: f.conTrafico,
    };
  } else {
    m = await matriz(puntos);
  }

  const fijo = [jornada.forzado, enSitio, jornada.destinoFijo].find((x) => x && candidatos.includes(x)) ?? null;
  const criterioRuteo: CriterioRuteo = jornada.criterioRuteo ?? "combinado";
  const recompensa = (id: string) => {
    const x = val.get(id)!;
    switch (criterioRuteo) {
      case "facturacion": return x.facturacion;
      case "equipos_rotos": return x.equiposRotos;
      case "espera": return x.esperaHoras;
      case "gravedad": return x.gravedadTotal;
      case "combustible": return 1;
      default: return x.premio;
    }
  };
  const entrada = {
    criterio: criterioRuteo,
    countries: candidatos.map((id) => ({ id, premio: recompensa(id), servicio: val.get(id)!.servicioMin })),
    tiempos: m.min.map((f) => f.map((v) => Math.round(v * 10) / 10)),
    distancias: m.km.map((f) => f.map((v) => Math.round(v * 10) / 10)),
    disponible: disponible(cam.inicio, cam.fin),
  };

  let motor = "";
  let r: ResultadoRuteo;
  try {
    r = await optimizador<ResultadoRuteo>(origin, "ruteo", { ...entrada, fijo });
    motor = r.metodo ?? "Optimizador";
  } catch (e) {
    console.warn("Optimizador no disponible, uso heurística:", e);
    motor = "Heurística de respaldo (optimizador no disponible)";
    r = premioFaltante({ ...entrada, fijo });
  }

  // Si el conductor ya va a un destino, ver si con el tráfico actual convenía otro (sin cambiarlo solo).
  let sugerencia: Plan["sugerencia"] = null;
  if (fijo && fijo === jornada.destinoFijo && !jornada.forzado && !enSitio && !motor.startsWith("Heur")) {
    const libre = await optimizador<ResultadoRuteo>(origin, "ruteo", entrada).catch(() => null);
    const ahorro = libre && libre.orden.length >= r.orden.length ? r.minutos_totales - libre.minutos_totales : 0;
    if (libre?.orden[0] && libre.orden[0] !== fijo && ahorro >= p.umbralCambioMin) {
      sugerencia = { countryId: libre.orden[0], mensaje: `Con el tráfico actual conviene ir primero a ${country(libre.orden[0]).nombre}: ahorrás ~${Math.round(ahorro)} min.` };
    }
  }

  const paradas: Parada[] = [];
  let previo = 0;
  for (const id of r.orden) {
    const k = ids.indexOf(id);
    paradas.push({
      countryId: id,
      llegadaMin: r.llegadas[id],
      eta: new Date(ahora.getTime() + r.llegadas[id] * 60_000).toISOString(),
      premio: val.get(id)!.premio,
      servicioMin: val.get(id)!.servicioMin,
      fallas: val.get(id)!.fallas.map((f) => f.id),
      minDesdeAnterior: Math.round(m.min[previo][k]),
      kmDesdeAnterior: Math.round(m.km[previo][k] * 10) / 10,
    });
    previo = k;
  }
  const kBase = ids.length - 1;
  const minRegreso = Math.round(m.min[previo][kBase] * 10) / 10;
  const kmRegreso = Math.round(m.km[previo][kBase] * 10) / 10;
  const kmTotales = Math.round((paradas.reduce((t, x) => t + x.kmDesdeAnterior, 0) + kmRegreso) * 10) / 10;

  const retornoBase: RetornoBase = {
    eta: new Date(ahora.getTime() + r.minutos_totales * 60_000).toISOString(),
    minutos: minRegreso,
    km: kmRegreso,
    llegadaMin: r.minutos_totales,
    nombre: conductor?.domicilio ? `Casa de ${conductor.nombre}` : SEDE.nombre,
    direccion: conductor?.domicilio?.direccion ?? SEDE.direccion,
    lat: destino.lat,
    lon: destino.lon,
  };

  const puntosGeometria = r.orden.length > 0
    ? [desde, ...r.orden.map(country), baseRetorno]
    : [desde, baseRetorno];

  const plan: Plan = {
    id: `p${ahora.getTime()}_${camionetaId}`,
    jornadaId: jornada.id, camionetaId, fecha: jornada.fecha, creadoAt: ahora.toISOString(), motivo, desde,
    paradas, noVisitados: r.no_visitados, minutosTotales: r.minutos_totales, kmTotales,
    retornoBase, criterioRuteo,
    objetivo: r.objetivo, estado: r.estado, segundos: r.segundos, motor, proveedor: m.proveedor, conTrafico: m.conTrafico,
    geometria: await trazado(puntosGeometria), sugerencia,
  };
  const nuevaCache: CacheMatriz = { ids, min: m.min, km: m.km, at: motivo === "periodico" && cache ? cache.at : ahora.toISOString(), proveedor: m.proveedor };
  await s.guardar("planes", [plan]);
  await s.guardar("jornadas", [{ ...jornada, posicion: desde, planId: plan.id, ultimoCalculo: plan.creadoAt, matriz: nuevaCache }]);
  return plan;
}

/** Sugerencia de asignación de countries a camionetas según el criterio elegido para la fecha. */
export async function sugerirAsignacion(
  origin: string,
  fecha = hoy(),
  criteriosElegidos: Record<string, CriterioRuteo> = {},
) {
  const db = await store().leer();
  const p = parametros(db);
  const val = valorar(db, p);
  const conFallas = db.countries.filter((c) => c.activo !== false && (val.get(c.id)?.fallas.length ?? 0) > 0);
  const camionetas = db.camionetas.filter((c) => c.activa !== false);
  const jornadas = new Map(camionetas.map((c) => [c.id, jornadaDe(db, c.id, fecha)]));
  const asignacion: Record<string, string[]> = Object.fromEntries(camionetas.map((c) => [c.id, []]));
  const carga_minutos: Record<string, number> = Object.fromEntries(camionetas.map((c) => [c.id, 0]));
  const usados = new Set<string>();
  const criterios = Object.fromEntries(camionetas.map((c) => [
    c.id,
    jornadas.get(c.id)?.estado === "activa"
      ? jornadas.get(c.id)!.criterioRuteo ?? "combinado"
      : criteriosElegidos[c.id] ?? jornadas.get(c.id)?.criterioRuteo ?? "combinado",
  ]));
  const countryById = new Map(conFallas.map((c) => [c.id, c]));
  const fijos = camionetas.flatMap((cam) => {
    const j = jornadas.get(cam.id)!;
    return j.estado === "activa" ? j.countries.filter((id) => countryById.has(id)).map((country) => ({ camioneta: cam.id, country })) : [];
  });

  // Se preservan las paradas de jornadas activas y se reservan antes de asignar las pendientes.
  for (const fijo of fijos) {
    if (usados.has(fijo.country)) continue;
    usados.add(fijo.country);
    asignacion[fijo.camioneta].push(fijo.country);
  }

  let objetivo = 0;
  let todoOptimo = true;
  let segundos = 0;
  let proveedor = "sin recorridos";
  for (const cam of camionetas) {
    const jornada = jornadas.get(cam.id)!;
    const criterio = criterios[cam.id];
    const existentes = asignacion[cam.id];
    const disponibles = conFallas.filter((c) => !usados.has(c.id));
    if (jornada.estado === "activa" || disponibles.length === 0) {
      carga_minutos[cam.id] = existentes.reduce((suma, id) => suma + (val.get(id)?.servicioMin ?? 0), 0);
      continue;
    }

    const conductor = db.usuarios.find((u) => u.id === jornada.conductorId && u.rol === "conductor");
    const casa = conductor?.domicilio ?? SEDE;
    // Matriz completa: casa → countries candidatos → casa. El optimizador de rutas
    // elige el subconjunto y el orden bajo la jornada, sumando atención y todos los traslados.
    const m = await matriz([casa, ...disponibles, casa]);
    proveedor = m.proveedor;
    const recompensa = (id: string) => {
      const x = val.get(id)!;
      switch (criterio) {
        case "facturacion": return x.facturacion;
        case "equipos_rotos": return x.equiposRotos;
        case "espera": return x.esperaHoras;
        case "gravedad": return x.gravedadTotal;
        case "combustible": return 1;
        default: return x.premio;
      }
    };
    const r = await optimizador<ResultadoRuteo>(origin, "ruteo", {
      criterio,
      countries: disponibles.map((c) => ({
        id: c.id,
        premio: recompensa(c.id),
        servicio: val.get(c.id)!.servicioMin,
      })),
      tiempos: m.min.map((fila) => fila.map((min) => Math.round(min * 10) / 10)),
      distancias: m.km.map((fila) => fila.map((km) => Math.round(km * 10) / 10)),
      // Se reserva 20% de margen: la duración estimada debe caber en el 83,3% del turno.
      disponible: (aMinutos(cam.fin) - aMinutos(cam.inicio)) / 1.2,
    });
    todoOptimo &&= r.estado === "OPTIMO";
    segundos += r.segundos;
    existentes.push(...r.orden);
    for (const id of r.orden) usados.add(id);
    carga_minutos[cam.id] = r.minutos_totales;
    objetivo += r.objetivo;
  }

  return {
    estado: todoOptimo ? "OPTIMO" : "FACTIBLE",
    asignacion,
    sin_asignar: conFallas.map((c) => c.id).filter((id) => !usados.has(id)),
    carga_minutos,
    objetivo: Math.round(objetivo * 1000) / 1000,
    segundos: Math.round(segundos * 1000) / 1000,
    proveedor,
    orden_prioridad: camionetas.map((c) => c.id),
  };
}
