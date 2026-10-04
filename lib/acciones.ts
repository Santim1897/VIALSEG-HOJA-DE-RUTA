import "server-only";
import { valorar } from "./premio";
import { idJornada, jornadaDe, parametros, planificar } from "./motor";
import { datosIniciales } from "./seed";
import { store } from "./store";
import { hoy, horasDesde } from "./tiempo";
import type { Cierre, DB, Evento, Falla, Jornada, Parametros, Posicion, TipoEvento } from "./types";

const evento = (tipo: TipoEvento, extra: Partial<Evento> = {}): Evento => ({
  id: `ev${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), tipo, ...extra,
});

async function conJornada(camionetaId: string, cambio: (j: Jornada, db: DB) => Jornada | void) {
  const db = await store().leer();
  const j = jornadaDe(db, camionetaId);
  const nueva = cambio(j, db) ?? j;
  await store().guardar("jornadas", [nueva]);
  return nueva;
}

// ------------------------------------------------------------------ Conductor
export async function accionConductor(origin: string, cuerpo: Record<string, unknown>) {
  const cam = String(cuerpo.camionetaId);
  const pos = cuerpo.pos as Posicion | undefined;
  const countryId = cuerpo.countryId as string | undefined;
  const s = store();

  switch (cuerpo.accion) {
    case "iniciar":
      await conJornada(cam, (j) => ({ ...j, estado: "activa", iniciadaAt: new Date().toISOString(), posicion: pos ?? j.posicion, enSitio: null, destinoFijo: null }));
      await s.guardar("eventos", [evento("inicio", { camionetaId: cam })]);
      return planificar(origin, cam, "inicio", pos);

    case "recalcular":
      return planificar(origin, cam, (cuerpo.motivo as "periodico" | "manual") ?? "manual", pos);

    case "ir":
      await conJornada(cam, (j) => ({ ...j, destinoFijo: countryId, posicion: pos ?? j.posicion }));
      await s.guardar("eventos", [evento("ir", { camionetaId: cam, countryId })]);
      return { ok: true };

    case "llegue":
      await conJornada(cam, (j) => ({ ...j, enSitio: countryId, destinoFijo: null, forzado: j.forzado === countryId ? null : j.forzado }));
      await s.guardar("eventos", [evento("llegue", { camionetaId: cam, countryId })]);
      return { ok: true };

    case "terminar": {
      const c = cuerpo.cierre as Omit<Cierre, "id" | "at" | "camionetaId">;
      const db = await s.leer();
      const ahora = new Date().toISOString();
      const resueltas = db.fallas.filter((f) => c.fallasResueltas.includes(f.id)).map((f) => ({ ...f, estado: "resuelta" as const, cerradaAt: ahora }));
      await s.guardar("fallas", resueltas);
      await s.guardar("cierres", [{ ...c, id: `ci${Date.now()}`, at: ahora, camionetaId: cam }]);
      await conJornada(cam, (j) => ({
        ...j, enSitio: null, destinoFijo: null, forzado: j.forzado === c.countryId ? null : j.forzado,
        visitados: [...new Set([...j.visitados, c.countryId])],
      }));
      const country = db.countries.find((x) => x.id === c.countryId)!;
      await s.guardar("eventos", [evento("terminado", { camionetaId: cam, countryId: c.countryId, detalle: `${resueltas.length} resueltas, ${c.fallasPendientes.length} pendientes` })]);
      // Se recalcula desde el country donde terminó, no desde la base.
      return planificar(origin, cam, "terminado", pos ?? { lat: country.lat, lon: country.lon, at: ahora, fuente: "country" });
    }

    case "saltear":
      await conJornada(cam, (j) => ({
        ...j, destinoFijo: null, enSitio: j.enSitio === countryId ? null : j.enSitio,
        salteados: [...j.salteados, { countryId: countryId!, motivo: String(cuerpo.motivo ?? "Sin motivo"), at: new Date().toISOString() }],
      }));
      await s.guardar("eventos", [evento("salteado", { camionetaId: cam, countryId, detalle: String(cuerpo.motivo ?? "") })]);
      return planificar(origin, cam, "salteado", pos);

    case "finalizar":
      await conJornada(cam, (j) => ({ ...j, estado: "finalizada", finalizadaAt: new Date().toISOString(), destinoFijo: null, enSitio: null }));
      await s.guardar("eventos", [evento("fin", { camionetaId: cam })]);
      return { ok: true };
  }
  throw new Error("Acción desconocida");
}

// ------------------------------------------------------------------ Administración
async function replanificarActivas(origin: string, camionetas: string[], motivo: "admin" | "falla_nueva") {
  const db = await store().leer();
  for (const cam of camionetas) if (jornadaDe(db, cam).estado === "activa") await planificar(origin, cam, motivo);
}

export async function accionAdmin(origin: string, cuerpo: Record<string, unknown>) {
  const s = store();
  switch (cuerpo.accion) {
    case "asignar": {
      // { asignacion: { c1: [countryIds], c2: [...] } } para hoy
      const asignacion = cuerpo.asignacion as Record<string, string[]>;
      const db = await s.leer();
      await s.guardar("jornadas", Object.entries(asignacion).map(([cam, countries]) => ({ ...jornadaDe(db, cam), countries })));
      await s.guardar("eventos", [evento("asignacion", { detalle: "Asignación del día actualizada" })]);
      await replanificarActivas(origin, Object.keys(asignacion), "admin");
      return { ok: true };
    }
    case "forzar": {
      const cam = String(cuerpo.camionetaId);
      await conJornada(cam, (j) => ({ ...j, forzado: (cuerpo.countryId as string) || null }));
      await replanificarActivas(origin, [cam], "admin");
      return { ok: true };
    }
    case "planificar":
      return planificar(origin, String(cuerpo.camionetaId), "admin");

    case "crear_falla": {
      const db = await s.leer();
      const tipo = db.tipos_falla.find((t) => t.id === cuerpo.tipoId);
      const equipo = db.equipos.find((e) => e.id === cuerpo.equipoId);
      if (!tipo || !equipo) throw new Error("Falta el equipo o el tipo de falla");
      const falla: Falla = {
        id: `f${Date.now()}`, equipoId: equipo.id, countryId: equipo.countryId, tipoId: tipo.id,
        gravedad: Number(cuerpo.gravedad ?? tipo.gravedad), descripcion: (cuerpo.descripcion as string) || undefined,
        abiertaAt: new Date().toISOString(), estado: "abierta", origen: "admin",
      };
      await s.guardar("fallas", [falla]);
      await s.guardar("eventos", [evento("falla_nueva", { countryId: equipo.countryId, detalle: tipo.nombre })]);
      const responsables = db.camionetas.filter((c) => jornadaDe(db, c.id).countries.includes(equipo.countryId)).map((c) => c.id);
      await replanificarActivas(origin, responsables, "falla_nueva");
      return { ok: true, falla, asignadaA: responsables[0] ?? null };
    }
    case "editar_falla": {
      const db = await s.leer();
      const f = db.fallas.find((x) => x.id === cuerpo.id);
      if (!f) throw new Error("Falla inexistente");
      const cambios = cuerpo.cambios as Partial<Falla>;
      if (cambios.estado === "resuelta") cambios.cerradaAt = new Date().toISOString();
      await s.guardar("fallas", [{ ...f, ...cambios }]);
      return { ok: true };
    }
    case "parametros": {
      const db = await s.leer();
      await s.guardar("parametros", [{ ...parametros(db), ...(cuerpo.parametros as Partial<Parametros>), id: "general" }]);
      if (cuerpo.tipos) await s.guardar("tipos_falla", cuerpo.tipos as DB["tipos_falla"]);
      return { ok: true };
    }
    case "reiniciar_demo":
      await s.reiniciar(datosIniciales());
      return { ok: true };
  }
  throw new Error("Acción desconocida");
}

// ------------------------------------------------------------------ Lecturas
export async function estadoAdmin() {
  const db = await store().leer();
  const p = parametros(db);
  const val = valorar(db, p);
  const fecha = hoy();
  const jornadas = db.camionetas.map((c) => jornadaDe(db, c.id, fecha));
  const vigentes = jornadas.map((j) => db.planes.find((pl) => pl.id === j.planId)).filter((x) => !!x);
  const abiertas = db.fallas.filter((f) => f.estado === "abierta");
  const resueltas = db.fallas.filter((f) => f.estado === "resuelta" && f.cerradaAt);
  const asignados = new Set(jornadas.flatMap((j) => j.countries));
  const servicio = vigentes.reduce((t, pl) => t + pl.paradas.reduce((a, x) => a + x.servicioMin, 0), 0);
  const total = vigentes.reduce((t, pl) => t + pl.minutosTotales, 0);
  const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    fecha, almacenamiento: store().tipo, parametros: p,
    camionetas: db.camionetas, countries: db.countries, equipos: db.equipos, tipos: db.tipos_falla,
    fallas: [...abiertas, ...resueltas.filter((f) => horasDesde(f.cerradaAt!) < 72)],
    valoraciones: Object.fromEntries(val), jornadas,
    planes: Object.fromEntries(vigentes.map((pl) => [pl.camionetaId, pl])),
    historial: db.planes.filter((pl) => pl.fecha === fecha).sort((a, b) => b.creadoAt.localeCompare(a.creadoAt)).slice(0, 60)
      .map(({ geometria: _g, ...resto }) => resto),
    eventos: [...db.eventos].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40),
    cierres: [...db.cierres].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(({ foto, ...c }) => ({ ...c, conFoto: !!foto })),
    kpis: {
      fallasAbiertas: abiertas.length,
      criticas: abiertas.filter((f) => f.gravedad >= 4).length,
      horasPromedioCaido: Math.round(prom(abiertas.map((f) => horasDesde(f.abiertaAt)))),
      tiempoRespuestaHoras: Math.round(prom(resueltas.map((f) => (new Date(f.cerradaAt!).getTime() - new Date(f.abiertaAt).getTime()) / 3600_000))),
      resueltasHoy: resueltas.filter((f) => hoy(new Date(f.cerradaAt!)) === fecha).length,
      kmPlanificados: Math.round(vigentes.reduce((t, pl) => t + pl.kmTotales, 0)),
      pctServicio: total ? Math.round((servicio / total) * 100) : 0,
      countriesSinAsignar: db.countries.filter((c) => (val.get(c.id)?.fallas.length ?? 0) > 0 && !asignados.has(c.id)).map((c) => c.id),
    },
  };
}

export async function estadoConductor(camionetaId: string) {
  const db = await store().leer();
  const cam = db.camionetas.find((c) => c.id === camionetaId);
  if (!cam) throw new Error("Camioneta inexistente");
  const jornada = jornadaDe(db, camionetaId);
  const plan = db.planes.find((pl) => pl.id === jornada.planId && pl.fecha === jornada.fecha) ?? null;
  const ids = new Set([...(plan?.paradas.map((x) => x.countryId) ?? []), ...(jornada.enSitio ? [jornada.enSitio] : [])]);
  const countries = db.countries.filter((c) => ids.has(c.id)).map((c) => ({
    ...c,
    fallas: db.fallas.filter((f) => f.countryId === c.id && f.estado === "abierta").map((f) => {
      const e = db.equipos.find((x) => x.id === f.equipoId);
      return { ...f, tipo: db.tipos_falla.find((t) => t.id === f.tipoId)?.nombre, producto: e?.producto, ubicacion: e?.ubicacion };
    }),
  }));
  const { matriz: _m, ...jornadaLiviana } = jornada;
  return {
    camioneta: cam, jornada: jornadaLiviana, plan: plan && { ...plan, geometria: [] }, countries,
    parametros: { navegador: parametros(db).navegador, recalculoMin: parametros(db).recalculoMin },
    idJornada: idJornada(camionetaId),
  };
}
