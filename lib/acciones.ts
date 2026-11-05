import "server-only";
import { CLAVE_VALIDA, hashear, PIN_VALIDO, publico } from "./auth";
import { ErrorUsuario } from "./cuentas";
import { jornadaDe, parametros, planificar } from "./motor";
import { valorar } from "./premio";
import { datosEjemplo, datosVacios } from "./seed";
import { store } from "./store";
import { horasDesde, hoy } from "./tiempo";
import type { Camioneta, Cierre, Country, CriterioRuteo, DB, Equipo, Evento, Falla, Jornada, Parametros, Posicion, TipoEvento, Usuario } from "./types";

const VENTANA_DESHACER_MS = 30 * 60_000;
const nuevoId = (prefijo: string) => `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const evento = (tipo: TipoEvento, actor: Usuario | null, extra: Partial<Evento> = {}): Evento => ({
  id: nuevoId("ev"), at: new Date().toISOString(), tipo, usuarioId: actor?.id, ...extra,
});
function falla(m: string): never {
  throw new ErrorUsuario(m);
}

// ================================================================== Conductor
function jornadaDelConductor(db: DB, conductorId: string): Jornada | null {
  return db.camionetas.filter((c) => c.activa !== false).map((c) => jornadaDe(db, c.id)).find((j) => j.conductorId === conductorId) ?? null;
}

export async function accionConductor(origin: string, actor: Usuario, cuerpo: Record<string, unknown>) {
  const s = store();
  const db = await s.leer();
  const j = jornadaDelConductor(db, actor.id) ?? falla("No tenés una camioneta asignada hoy. Consultá con administración.");
  const cam = j.camionetaId;
  const pos = cuerpo.pos as Posicion | undefined;
  const countryId = cuerpo.countryId as string | undefined;
  const guardar = (cambios: Partial<Jornada>) => s.guardar("jornadas", [{ ...j, heredado: false, ...cambios }]);
  const registrar = (tipo: TipoEvento, extra: Partial<Evento> = {}) => s.guardar("eventos", [evento(tipo, actor, { camionetaId: cam, ...extra })]);

  if (j.estado !== "activa" && !["iniciar", "reabrir"].includes(String(cuerpo.accion))) falla("La jornada no está activa");

  switch (cuerpo.accion) {
    case "iniciar":
      if (j.estado !== "pendiente") falla("La jornada ya fue iniciada");
      if (!db.usuarios.find((u) => u.id === actor.id)?.domicilio) falla("Administración debe configurar tu domicilio antes de iniciar la jornada");
      await guardar({ estado: "activa", iniciadaAt: new Date().toISOString(), posicion: pos ?? j.posicion, enSitio: null, destinoFijo: null });
      await registrar("inicio");
      return planificar(origin, cam, "inicio", pos);

    case "reabrir":
      if (j.estado !== "finalizada") falla("La jornada no está finalizada");
      if (!db.usuarios.find((u) => u.id === actor.id)?.domicilio) falla("Administración debe configurar tu domicilio antes de reabrir la jornada");
      await guardar({ estado: "activa", finalizadaAt: undefined });
      await registrar("reabrir");
      return planificar(origin, cam, "manual", pos);

    case "recalcular":
      return planificar(origin, cam, cuerpo.motivo === "periodico" ? "periodico" : "manual", pos);

    case "ir":
      if (!countryId || !j.countries.includes(countryId)) falla("Ese country no está en tu ruta de hoy");
      await guardar({ destinoFijo: countryId, posicion: pos ?? j.posicion });
      await registrar("ir", { countryId });
      return;

    case "llegue":
      if (!countryId || !j.countries.includes(countryId)) falla("Ese country no está en tu ruta de hoy");
      await guardar({ enSitio: countryId, destinoFijo: null });
      await registrar("llegue", { countryId });
      return;

    case "cancelar_llegada":
      await guardar({ enSitio: null, destinoFijo: j.enSitio });
      await registrar("cancelar_llegada", { countryId: j.enSitio ?? undefined });
      return;

    case "terminar": {
      const c = cuerpo.cierre as Omit<Cierre, "id" | "at" | "camionetaId">;
      if (!c?.countryId || !j.countries.includes(c.countryId)) falla("Ese country no está en tu ruta de hoy");
      const ahora = new Date().toISOString();
      const resueltas = db.fallas.filter((f) => c.fallasResueltas.includes(f.id) && f.countryId === c.countryId && f.estado === "abierta");
      const cierre: Cierre = { ...c, id: nuevoId("ci"), at: ahora, camionetaId: cam, conductorId: actor.id };
      await s.guardar("fallas", resueltas.map((f) => ({ ...f, estado: "resuelta" as const, cerradaAt: ahora })));
      await s.guardar("cierres", [cierre]);
      await guardar({
        enSitio: null, destinoFijo: null, forzado: j.forzado === c.countryId ? null : j.forzado,
        visitados: [...new Set([...j.visitados, c.countryId])],
        deshacer: { tipo: "terminado", countryId: c.countryId, fallas: resueltas.map((f) => f.id), cierreId: cierre.id, at: ahora },
      });
      await registrar("terminado", { countryId: c.countryId, detalle: `${resueltas.length} resueltas, ${c.fallasPendientes.length} pendientes` });
      const country = db.countries.find((x) => x.id === c.countryId)!;
      // Se recalcula desde el country donde terminó, no desde la base.
      return planificar(origin, cam, "terminado", pos ?? { lat: country.lat, lon: country.lon, at: ahora, fuente: "country" });
    }

    case "saltear":
      if (!countryId || !j.countries.includes(countryId)) falla("Ese country no está en tu ruta de hoy");
      await guardar({
        destinoFijo: null, enSitio: j.enSitio === countryId ? null : j.enSitio,
        salteados: [...j.salteados, { countryId, motivo: String(cuerpo.motivo ?? "Sin motivo"), at: new Date().toISOString() }],
        deshacer: { tipo: "salteado", countryId, fallas: [], at: new Date().toISOString() },
      });
      await registrar("salteado", { countryId, detalle: String(cuerpo.motivo ?? "") });
      return planificar(origin, cam, "salteado", pos);

    case "deshacer": {
      const d = j.deshacer ?? falla("No hay nada para deshacer");
      if (Date.now() - new Date(d.at).getTime() > VENTANA_DESHACER_MS) falla("Pasó demasiado tiempo para deshacer. Avisá a administración.");
      if (d.tipo === "terminado") {
        await s.guardar("fallas", db.fallas.filter((f) => d.fallas.includes(f.id)).map((f) => ({ ...f, estado: "abierta" as const, cerradaAt: undefined })));
        if (d.cierreId) await s.borrar("cierres", [d.cierreId]);
        await guardar({ visitados: j.visitados.filter((x) => x !== d.countryId), enSitio: d.countryId, deshacer: null });
      } else {
        const i = j.salteados.map((x) => x.countryId).lastIndexOf(d.countryId);
        await guardar({ salteados: j.salteados.filter((_, k) => k !== i), deshacer: null });
      }
      await registrar("deshacer", { countryId: d.countryId, detalle: d.tipo === "terminado" ? "Cierre deshecho" : "Salteo deshecho" });
      return planificar(origin, cam, "manual", pos);
    }

    case "finalizar":
      await guardar({ estado: "finalizada", finalizadaAt: new Date().toISOString(), destinoFijo: null, enSitio: null });
      await registrar("fin");
      return;
  }
  falla("Acción desconocida");
}

export async function estadoConductor(actor: Usuario) {
  const db = await store().leer();
  const jornada = jornadaDelConductor(db, actor.id);
  const base = { usuario: publico(actor), parametros: { navegador: parametros(db).navegador, recalculoMin: parametros(db).recalculoMin } };
  if (!jornada) return { ...base, jornada: null, camioneta: null, plan: null, countries: [], cierres: [] };
  const camioneta = db.camionetas.find((c) => c.id === jornada.camionetaId)!;
  const plan = db.planes.find((pl) => pl.id === jornada.planId && pl.fecha === jornada.fecha) ?? null;
  const countries = db.countries.filter((c) => jornada.countries.includes(c.id)).map((c) => ({
    id: c.id, nombre: c.nombre, zona: c.zona, lat: c.lat, lon: c.lon, direccion: c.direccion, contacto: c.contacto, notas: c.notas,
    fallas: db.fallas.filter((f) => f.countryId === c.id && f.estado === "abierta").map((f) => {
      const e = db.equipos.find((x) => x.id === f.equipoId);
      return { id: f.id, gravedad: f.gravedad, descripcion: f.descripcion, abiertaAt: f.abiertaAt, tipo: db.tipos_falla.find((t) => t.id === f.tipoId)?.nombre, producto: e?.producto, ubicacion: e?.ubicacion, numeroSerie: e?.numeroSerie };
    }),
  }));
  const { matriz: _m, ...jornadaLiviana } = jornada;
  return {
    ...base, camioneta, jornada: jornadaLiviana, plan, countries,
    cierres: db.cierres.filter((c) => c.conductorId === actor.id && hoy(new Date(c.at)) === jornada.fecha).map(({ foto, ...c }) => ({ ...c, conFoto: !!foto })),
  };
}

// ================================================================== Administración
async function replanificarActivas(origin: string, camionetas: string[], motivo: "admin" | "falla_nueva") {
  const db = await store().leer();
  for (const cam of camionetas) if (jornadaDe(db, cam).estado === "activa") await planificar(origin, cam, motivo);
}

const texto = (v: unknown, campo: string, max = 120) => {
  const t = String(v ?? "").trim();
  if (!t) falla(`Falta ${campo}`);
  return t.slice(0, max);
};
const numero = (v: unknown, campo: string, min = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) falla(`${campo} no es válido`);
  return n;
};
const coordenada = (lat: unknown, lon: unknown) => {
  const [la, lo] = [Number(lat), Number(lon)];
  if (!(la < -20 && la > -56 && lo < -50 && lo > -75)) falla("La ubicación no es válida (marcala en el mapa)");
  return { lat: la, lon: lo };
};

export async function accionAdmin(origin: string, actor: Usuario, cuerpo: Record<string, unknown>) {
  const s = store();
  const db = await s.leer();
  const registrar = (tipo: TipoEvento, extra: Partial<Evento> = {}) => s.guardar("eventos", [evento(tipo, actor, extra)]);
  const d = (cuerpo.datos ?? {}) as Record<string, unknown>;

  switch (cuerpo.accion) {
    // ---------------------------------------------------------- planificación del día
    case "plan_dia": {
      const fecha = String(cuerpo.fecha ?? hoy());
      if (fecha < hoy()) falla("No se puede modificar un día que ya pasó");
      const planes = cuerpo.planes as { camionetaId: string; conductorId: string | null; countries: string[]; criterioRuteo?: CriterioRuteo }[];
      const usados = new Map<string, string>();
      const conductores = new Map<string, string>();
      const jornadas: Jornada[] = [];
      for (const p of planes) {
        const cam = db.camionetas.find((c) => c.id === p.camionetaId && c.activa) ?? falla("Camioneta inexistente o dada de baja");
        if (p.conductorId) {
          const u = db.usuarios.find((x) => x.id === p.conductorId && x.rol === "conductor" && x.activo) ?? falla("Conductor inexistente o inactivo");
          if (conductores.has(u.id)) falla(`${u.nombre} está asignado a dos camionetas`);
          conductores.set(u.id, cam.nombre);
        }
        for (const c of p.countries) {
          if (usados.has(c)) falla(`${db.countries.find((x) => x.id === c)?.nombre} está en dos camionetas`);
          usados.set(c, cam.nombre);
        }
        const actual = jornadaDe(db, cam.id, fecha);
        const criterios: CriterioRuteo[] = ["combinado", "facturacion", "equipos_rotos", "espera", "gravedad", "combustible"];
        const criterioRuteo = p.criterioRuteo ?? actual.criterioRuteo ?? "combinado";
        if (!criterios.includes(criterioRuteo)) falla("Criterio de recorrido inválido");
        const countriesIguales = actual.countries.length === p.countries.length && actual.countries.every((id) => p.countries.includes(id));
        const criterioIgual = criterioRuteo === (actual.criterioRuteo ?? "combinado");
        const conductorIgual = (actual.conductorId ?? null) === (p.conductorId ?? null);
        if (actual.estado === "activa") {
          if (!conductorIgual) falla(`${cam.nombre} ya inició la jornada: no se puede cambiar el conductor`);
          if (!countriesIguales || !criterioIgual) {
            falla(`${cam.nombre} ya inició la jornada: no se pueden cambiar la distribución ni el objetivo hasta la próxima jornada`);
          }
        }
        // Si se modifica una jornada finalizada, el plan nuevo es una jornada pendiente:
        // no debe heredar visitas, posición ni el recorrido calculado de la prueba anterior.
        const reiniciarFinalizada = actual.estado === "finalizada" && (!conductorIgual || !countriesIguales || !criterioIgual);
        const base = reiniciarFinalizada ? {
          ...actual,
          estado: "pendiente" as const,
          visitados: [],
          salteados: [],
          posicion: undefined,
          destinoFijo: null,
          enSitio: null,
          forzado: null,
          planId: undefined,
          ultimoCalculo: undefined,
          iniciadaAt: undefined,
          finalizadaAt: undefined,
          deshacer: null,
          matriz: undefined,
        } : actual;
        jornadas.push({ ...base, heredado: false, conductorId: p.conductorId, criterioRuteo, countries: p.countries, forzado: p.countries.includes(base.forzado ?? "") ? base.forzado : null });
      }
      await s.guardar("jornadas", jornadas);
      await registrar("plan_dia", { detalle: String(cuerpo.resumen ?? `Plan del ${fecha} actualizado`) });
      return { ok: true };
    }
    case "forzar": {
      const cam = String(cuerpo.camionetaId);
      const j = jornadaDe(db, cam);
      await s.guardar("jornadas", [{ ...j, forzado: (cuerpo.countryId as string) || null }]);
      await registrar("edicion", { camionetaId: cam, countryId: (cuerpo.countryId as string) || undefined, detalle: cuerpo.countryId ? "Próximo destino forzado" : "Próximo destino automático" });
      await replanificarActivas(origin, [cam], "admin");
      return { ok: true };
    }
    case "recalcular_todas": {
      const activas = db.camionetas.filter((c) => c.activa !== false && jornadaDe(db, c.id).estado === "activa").map((c) => c.id);
      await replanificarActivas(origin, activas, "admin");
      return { ok: true, recalculadas: activas.length };
    }
    case "planificar":
      return planificar(origin, String(cuerpo.camionetaId), "admin");

    // ---------------------------------------------------------- fallas
    case "crear_falla": {
      const tipo = db.tipos_falla.find((t) => t.id === d.tipoId) ?? falla("Elegí el tipo de falla");
      const equipo = db.equipos.find((e) => e.id === d.equipoId && e.activo) ?? falla("Elegí el equipo");
      if (db.fallas.some((f) => f.equipoId === equipo.id && f.tipoId === tipo.id && f.estado === "abierta")) falla("Ese equipo ya tiene esa falla abierta");
      const nueva: Falla = {
        id: nuevoId("f"), equipoId: equipo.id, countryId: equipo.countryId, tipoId: tipo.id,
        gravedad: Math.min(5, Math.max(1, Number(d.gravedad ?? tipo.gravedad))), descripcion: (d.descripcion as string)?.trim() || undefined,
        creadaPor: actor.id, abiertaAt: new Date().toISOString(), estado: "abierta", origen: "admin",
      };
      await s.guardar("fallas", [nueva]);
      await registrar("falla_nueva", { countryId: equipo.countryId, detalle: tipo.nombre });
      const responsables = db.camionetas.filter((c) => jornadaDe(db, c.id).countries.includes(equipo.countryId)).map((c) => c.id);
      await replanificarActivas(origin, responsables, "falla_nueva");
      return { ok: true, asignadaA: responsables[0] ?? null };
    }
    case "editar_falla": {
      const f = db.fallas.find((x) => x.id === cuerpo.id) ?? falla("Falla inexistente");
      const cambios: Partial<Falla> = {};
      if (d.gravedad !== undefined) cambios.gravedad = Math.min(5, Math.max(1, Number(d.gravedad)));
      if (d.descripcion !== undefined) cambios.descripcion = String(d.descripcion).trim() || undefined;
      if (d.estado === "resuelta") Object.assign(cambios, { estado: "resuelta", cerradaAt: new Date().toISOString() });
      if (d.estado === "abierta") Object.assign(cambios, { estado: "abierta", cerradaAt: undefined });
      await s.guardar("fallas", [{ ...f, ...cambios }]);
      await registrar("falla_editada", { countryId: f.countryId, detalle: d.estado ? `Marcada ${d.estado}` : "Datos editados" });
      return { ok: true };
    }
    case "eliminar_falla": {
      const f = db.fallas.find((x) => x.id === cuerpo.id) ?? falla("Falla inexistente");
      await s.borrar("fallas", [f.id]);
      await registrar("baja", { countryId: f.countryId, detalle: "Falla eliminada (cargada por error)" });
      return { ok: true };
    }

    // ---------------------------------------------------------- countries y equipos
    case "guardar_country": {
      const existente = db.countries.find((c) => c.id === d.id);
      const c: Country = {
        ...(existente ?? { id: nuevoId("b"), activo: true, origen: "manual" as const }),
        nombre: texto(d.nombre, "el nombre"), zona: texto(d.zona, "la zona / localidad", 60),
        direccion: String(d.direccion ?? "").trim() || undefined, contacto: String(d.contacto ?? "").trim() || undefined,
        notas: String(d.notas ?? "").trim() || undefined,
        facturacion: numero(d.facturacion ?? 0, "La facturación"), ingresoMin: numero(d.ingresoMin ?? 15, "El tiempo de ingreso"),
        ...coordenada(d.lat, d.lon),
      };
      if (db.countries.some((x) => x.id !== c.id && x.activo && x.nombre.toLowerCase() === c.nombre.toLowerCase())) falla("Ya existe un country con ese nombre");
      await s.guardar("countries", [c]);
      await registrar(existente ? "edicion" : "alta", { countryId: c.id, detalle: `Country ${c.nombre}` });
      return { ok: true, id: c.id };
    }
    case "baja_country": {
      const c = db.countries.find((x) => x.id === cuerpo.id) ?? falla("Country inexistente");
      const enRuta = db.jornadas.some((j) => j.fecha >= hoy() && j.countries.includes(c.id));
      if (enRuta) falla("Está planificado en una ruta de hoy o de un día próximo: quitalo del plan primero");
      await s.guardar("countries", [{ ...c, activo: !c.activo }]);
      await registrar(c.activo ? "baja" : "alta", { countryId: c.id, detalle: `Country ${c.nombre} ${c.activo ? "dado de baja" : "reactivado"}` });
      return { ok: true };
    }
    case "guardar_equipo": {
      const existente = db.equipos.find((e) => e.id === d.id);
      const country = db.countries.find((c) => c.id === (d.countryId ?? existente?.countryId)) ?? falla("Country inexistente");
      const e: Equipo = {
        ...(existente ?? { id: nuevoId("e"), activo: true, countryId: country.id }),
        producto: (texto(d.producto, "el producto") as Equipo["producto"]), ubicacion: texto(d.ubicacion, "la ubicación dentro del barrio"),
        numeroSerie: String(d.numeroSerie ?? "").trim() || undefined, instaladoAt: String(d.instaladoAt ?? "").trim() || undefined,
      };
      await s.guardar("equipos", [e]);
      await registrar(existente ? "edicion" : "alta", { countryId: country.id, detalle: `Equipo ${e.numeroSerie ?? e.ubicacion}` });
      return { ok: true };
    }
    case "baja_equipo": {
      const e = db.equipos.find((x) => x.id === cuerpo.id) ?? falla("Equipo inexistente");
      if (e.activo && db.fallas.some((f) => f.equipoId === e.id && f.estado === "abierta")) falla("El equipo tiene fallas abiertas: resolvelas o eliminalas primero");
      await s.guardar("equipos", [{ ...e, activo: !e.activo }]);
      await registrar(e.activo ? "baja" : "alta", { countryId: e.countryId, detalle: `Equipo ${e.numeroSerie ?? e.ubicacion}` });
      return { ok: true };
    }

    // ---------------------------------------------------------- flota
    case "guardar_camioneta": {
      const existente = db.camionetas.find((c) => c.id === d.id);
      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!hhmm.test(String(d.inicio)) || !hhmm.test(String(d.fin)) || String(d.inicio) >= String(d.fin)) falla("Revisá el horario de la jornada");
      const c: Camioneta = {
        ...(existente ?? { id: nuevoId("c"), activa: true }),
        nombre: texto(d.nombre, "el nombre", 40), patente: String(d.patente ?? "").trim().toUpperCase(),
        color: /^#[0-9a-f]{6}$/i.test(String(d.color)) ? String(d.color) : "#00a5d5",
        inicio: String(d.inicio), fin: String(d.fin),
      };
      await s.guardar("camionetas", [c]);
      await registrar(existente ? "edicion" : "alta", { camionetaId: c.id, detalle: `Camioneta ${c.nombre}` });
      return { ok: true };
    }
    case "baja_camioneta": {
      const c = db.camionetas.find((x) => x.id === cuerpo.id) ?? falla("Camioneta inexistente");
      if (c.activa && db.jornadas.some((j) => j.camionetaId === c.id && j.fecha >= hoy() && (j.countries.length || j.estado === "activa"))) {
        falla("Tiene un plan de hoy o de un día próximo: vacialo primero");
      }
      await s.guardar("camionetas", [{ ...c, activa: !c.activa }]);
      await registrar(c.activa ? "baja" : "alta", { camionetaId: c.id, detalle: `Camioneta ${c.nombre}` });
      return { ok: true };
    }

    // ---------------------------------------------------------- usuarios
    case "guardar_usuario": {
      const existente = db.usuarios.find((u) => u.id === d.id);
      const rol = (existente?.rol ?? d.rol) as Usuario["rol"];
      if (rol !== "admin" && rol !== "conductor") falla("Rol inválido");
      const login = rol === "admin" ? texto(d.usuario, "el usuario", 40).toLowerCase() : undefined;
      if (login && db.usuarios.some((u) => u.id !== d.id && u.usuario === login)) falla("Ese usuario ya existe");
      let credenciales = {};
      if (!existente) {
        const secreto = String(d.secreto ?? "");
        if (rol === "admin" ? !CLAVE_VALIDA(secreto) : !PIN_VALIDO.test(secreto)) falla(rol === "admin" ? "La contraseña debe tener al menos 8 caracteres" : "El PIN debe tener 4 números");
        credenciales = { ...hashear(secreto), version: 1, debeCambiarClave: false };
      }
      const domicilioRaw = d.domicilio && typeof d.domicilio === "object" ? d.domicilio as Record<string, unknown> : null;
      const domicilio = rol === "conductor" && domicilioRaw
        ? { ...coordenada(domicilioRaw.lat, domicilioRaw.lon), direccion: texto(domicilioRaw.direccion, "la dirección del domicilio", 180) }
        : undefined;
      if (existente && rol === "conductor" && db.jornadas.some((j) => j.conductorId === existente.id && j.fecha === hoy() && j.estado === "activa")) {
        const anterior = existente.domicilio;
        const igual = !anterior && !domicilio || !!anterior && !!domicilio && anterior.lat === domicilio.lat && anterior.lon === domicilio.lon && anterior.direccion === domicilio.direccion;
        if (!igual) falla("No se puede cambiar el domicilio mientras el conductor tiene una jornada activa");
      }
      const u: Usuario = {
        ...(existente ?? { id: nuevoId("u"), rol, activo: true, creadoAt: new Date().toISOString(), hash: "", sal: "", version: 1 }),
        ...credenciales, nombre: texto(d.nombre, "el nombre", 60), usuario: login, telefono: String(d.telefono ?? "").trim() || undefined,
        domicilio,
      };
      await s.guardar("usuarios", [u]);
      await registrar(existente ? "edicion" : "alta", { detalle: `${rol === "admin" ? "Administrador" : "Conductor"} ${u.nombre}` });
      return { ok: true };
    }
    case "resetear_acceso": {
      const u = db.usuarios.find((x) => x.id === cuerpo.id) ?? falla("Usuario inexistente");
      const secreto = String(cuerpo.secreto ?? "");
      if (u.rol === "admin" ? !CLAVE_VALIDA(secreto) : !PIN_VALIDO.test(secreto)) falla(u.rol === "admin" ? "La contraseña debe tener al menos 8 caracteres" : "El PIN debe tener 4 números");
      await s.guardar("usuarios", [{ ...u, ...hashear(secreto), version: u.version + 1, intentosFallidos: 0, bloqueadoHasta: undefined, debeCambiarClave: false }]);
      await registrar("edicion", { detalle: `Acceso reseteado: ${u.nombre}` });
      return { ok: true };
    }
    case "baja_usuario": {
      const u = db.usuarios.find((x) => x.id === cuerpo.id) ?? falla("Usuario inexistente");
      if (u.id === actor.id) falla("No podés darte de baja a vos mismo");
      if (u.activo && db.jornadas.some((j) => j.conductorId === u.id && j.fecha >= hoy())) falla("Está asignado a una camioneta hoy o un día próximo: cambiá el plan primero");
      if (u.activo && u.rol === "admin" && db.usuarios.filter((x) => x.rol === "admin" && x.activo).length < 2) falla("Tiene que quedar al menos un administrador");
      await s.guardar("usuarios", [{ ...u, activo: !u.activo, version: u.version + 1 }]);
      await registrar(u.activo ? "baja" : "alta", { detalle: `${u.nombre} ${u.activo ? "desactivado" : "reactivado"}` });
      return { ok: true };
    }

    // ---------------------------------------------------------- configuración
    case "aplicar_gravedad": {
      const tipos = Array.isArray(cuerpo.tipos) ? cuerpo.tipos as DB["tipos_falla"] : db.tipos_falla;
      const gravedadPorTipo = new Map(tipos.map((tipo) => [tipo.id, tipo.gravedad]));
      const actualizadas = db.fallas
        .filter((f) => f.estado === "abierta" && gravedadPorTipo.has(f.tipoId))
        .map((f) => ({ ...f, gravedad: gravedadPorTipo.get(f.tipoId)! }));
      await s.guardar("tipos_falla", tipos);
      await s.guardar("fallas", actualizadas);
      const countries = new Set(actualizadas.map((f) => f.countryId));
      const camionetas = db.camionetas
        .filter((cam) => {
          const j = jornadaDe(db, cam.id);
          return j.estado === "activa" && j.countries.some((id) => countries.has(id));
        })
        .map((cam) => cam.id);
      await registrar("edicion", { detalle: `Gravedad aplicada a ${actualizadas.length} fallas abiertas` });
      await replanificarActivas(origin, camionetas, "admin");
      return { ok: true, actualizadas: actualizadas.length };
    }
    case "parametros":
      await s.guardar("parametros", [{ ...parametros(db), ...(cuerpo.parametros as Partial<Parametros>), id: "general" }]);
      if (cuerpo.tipos) await s.guardar("tipos_falla", cuerpo.tipos as DB["tipos_falla"]);
      await registrar("edicion", { detalle: "Configuración del modelo" });
      return { ok: true };
    case "datos_ejemplo":
    case "vaciar_datos": {
      if (cuerpo.confirmacion !== "CONFIRMAR") falla("Escribí CONFIRMAR para continuar");
      const nueva = cuerpo.accion === "vaciar_datos" ? datosVacios(db) : { ...datosEjemplo(), usuarios: [...db.usuarios.filter((u) => u.rol === "admin"), ...datosEjemplo().usuarios.filter((u) => u.rol === "conductor")] };
      await s.reiniciar(nueva);
      await registrar("datos", { detalle: cuerpo.accion === "vaciar_datos" ? "Datos operativos borrados" : "Datos de ejemplo cargados" });
      return { ok: true };
    }
  }
  falla("Acción desconocida");
}

// ================================================================== Lecturas
export async function estadoAdmin(fechaPlan?: string) {
  const db = await store().leer();
  const p = parametros(db);
  const val = valorar(db, p);
  const fecha = hoy();
  const camionetas = db.camionetas.filter((c) => c.activa);
  const jornadas = camionetas.map((c) => jornadaDe(db, c.id, fecha)).map(({ matriz: _m, ...j }) => j);
  const fechaP = fechaPlan && fechaPlan >= fecha ? fechaPlan : fecha;
  const jornadasPlan = camionetas.map((c) => jornadaDe(db, c.id, fechaP)).map(({ matriz: _m, ...j }) => j);
  // En vivo muestra solo rutas de jornadas activas. Una jornada finalizada puede
  // conservar su último plan para historial, pero no cuenta como recorrido vigente.
  const vigentes = jornadas.filter((j) => j.estado === "activa").map((j) => db.planes.find((pl) => pl.id === j.planId)).filter((x) => !!x);
  const abiertas = db.fallas.filter((f) => f.estado === "abierta");
  const resueltas = db.fallas.filter((f) => f.estado === "resuelta" && f.cerradaAt);
  const asignados = new Set(jornadas.flatMap((j) => j.countries));
  const servicio = vigentes.reduce((t, pl) => t + pl.paradas.reduce((a, x) => a + x.servicioMin, 0), 0);
  const total = vigentes.reduce((t, pl) => t + pl.minutosTotales, 0);
  const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const conFallasSet = new Set(abiertas.map((f) => f.countryId));
  const paradasVigentes = new Set(vigentes.flatMap((pl) => pl.paradas.map((p) => p.countryId)));
  const countriesPlanificadosHoy = paradasVigentes.size > 0 ? paradasVigentes : asignados;
  const visitadosHoy = new Set(jornadas.flatMap((j) => j.visitados));
  const pendientesProximos = [...conFallasSet].filter((c) => !countriesPlanificadosHoy.has(c));

  return {
    fecha, fechaPlan: fechaP, almacenamiento: store().tipo, parametros: p,
    usuarios: db.usuarios.map(publico), todasLasCamionetas: db.camionetas, camionetas,
    countries: db.countries, equipos: db.equipos, tipos: db.tipos_falla,
    fallas: [...abiertas, ...resueltas.filter((f) => horasDesde(f.cerradaAt!) < 24 * 30)],
    valoraciones: Object.fromEntries(val), jornadas, jornadasPlan,
    planes: Object.fromEntries(vigentes.map((pl) => [pl.camionetaId, pl])),
    historial: db.planes.filter((pl) => pl.fecha === fecha).sort((a, b) => b.creadoAt.localeCompare(a.creadoAt)).slice(0, 80).map(({ geometria: _g, ...resto }) => resto),
    eventos: [...db.eventos].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150),
    cierres: [...db.cierres].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100).map(({ foto, ...c }) => ({ ...c, conFoto: !!foto })),
    kpis: {
      fallasAbiertas: abiertas.length,
      criticas: abiertas.filter((f) => f.gravedad >= 4).length,
      horasPromedioCaido: Math.round(prom(abiertas.map((f) => horasDesde(f.abiertaAt)))),
      tiempoRespuestaHoras: Math.round(prom(resueltas.map((f) => (new Date(f.cerradaAt!).getTime() - new Date(f.abiertaAt).getTime()) / 3600_000))),
      resueltasHoy: resueltas.filter((f) => hoy(new Date(f.cerradaAt!)) === fecha).length,
      kmPlanificados: Math.round(vigentes.reduce((t, pl) => t + pl.kmTotales, 0)),
      pctServicio: total ? Math.round((servicio / total) * 100) : 0,
      countriesSinAsignar: db.countries.filter((c) => c.activo && (val.get(c.id)?.fallas.length ?? 0) > 0 && !asignados.has(c.id)).map((c) => c.id),
      barriosPlanificadosHoy: countriesPlanificadosHoy.size,
      barriosVisitadosHoy: visitadosHoy.size,
      barriosPendientesProximos: pendientesProximos.length,
      totalBarriosConFallas: conFallasSet.size,
    },
  };
}

export async function fotoCierre(id: string) {
  const db = await store().leer();
  return db.cierres.find((c) => c.id === id)?.foto ?? null;
}
