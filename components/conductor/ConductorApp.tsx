"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { estadoConductor } from "@/lib/acciones";
import { COLOR_GRAVEDAD, MOTIVOS_SALTEO, NOMBRE_GRAVEDAD, nombreProducto, TRABAJOS } from "@/lib/catalogo";
import { linkGoogleMaps, linkWaze } from "@/lib/geo";
import { SEDE } from "@/lib/sede";
import { duracion, hora, horasDesde } from "@/lib/tiempo";
import type { Posicion } from "@/lib/types";
import { MapaRutaDinamico } from "../MapaDinamico";

type Estado = Awaited<ReturnType<typeof estadoConductor>>;
type CountryRuta = Estado["countries"][number];
type Cuerpo = Record<string, unknown> & { accion: string };

const K_ESTADO = "vialseg-conductor-estado";
const K_COLA = "vialseg-conductor-cola";
const VENTANA_DESHACER_MS = 30 * 60_000;

// ---------------------------------------------------------------- utilidades
const leer = <T,>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
};
const escribir = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin espacio: la app sigue funcionando */
  }
};

function ubicacion(): Promise<Posicion | undefined> {
  return new Promise((ok) => {
    if (!("geolocation" in navigator)) return ok(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, at: new Date().toISOString(), fuente: "gps" }),
      () => ok(undefined),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function comprimir(archivo: File): Promise<string> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

// Aplicación local de una acción cuando no hay señal (se sincroniza al volver).
function optimista(e: Estado, c: Cuerpo): Estado {
  if (!e.jornada) return e;
  const j = { ...e.jornada };
  const plan = e.plan ? { ...e.plan, paradas: [...e.plan.paradas] } : null;
  const id = (c.countryId ?? (c.cierre as { countryId?: string })?.countryId) as string | undefined;
  const quitar = () => plan && (plan.paradas = plan.paradas.filter((p) => p.countryId !== id));
  if (c.accion === "iniciar" || c.accion === "reabrir") j.estado = "activa";
  if (c.accion === "ir") j.destinoFijo = id;
  if (c.accion === "llegue") j.enSitio = id;
  if (c.accion === "cancelar_llegada") j.enSitio = null;
  if (c.accion === "terminar") {
    j.visitados = [...j.visitados, id!];
    j.enSitio = null;
    quitar();
  }
  if (c.accion === "saltear") {
    j.salteados = [...j.salteados, { countryId: id!, motivo: String(c.motivo), at: new Date().toISOString() }];
    j.enSitio = null;
    quitar();
  }
  if (c.accion === "finalizar") j.estado = "finalizada";
  return { ...e, jornada: j, plan };
}

// ---------------------------------------------------------------- app
export default function ConductorApp() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [online, setOnline] = useState(true);
  const [cola, setCola] = useState<Cuerpo[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hoja, setHoja] = useState<null | "cierre" | "saltear" | "menu" | "finalizar">(null);
  const [pestana, setPestana] = useState<"ahora" | "ruta" | "hoy">("ahora");
  const estadoRef = useRef<Estado | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const guardarEstado = useCallback((e: Estado) => {
    estadoRef.current = e;
    setEstado(e);
    escribir(K_ESTADO, e);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/conductor", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      guardarEstado(data);
    } catch {
      /* sin señal: queda lo guardado */
    }
  }, [guardarEstado]);

  const enviarCola = useCallback(async () => {
    const pendientes = leer<Cuerpo[]>(K_COLA, []);
    if (!pendientes.length || !navigator.onLine) return;
    for (let i = 0; i < pendientes.length; i++) {
      try {
        const res = await fetch("/api/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendientes[i]) });
        if (res.status >= 500 || res.status === 0) throw new Error();
        const data = await res.json();
        if (!data.error) guardarEstado(data);
      } catch {
        const resto = pendientes.slice(i);
        escribir(K_COLA, resto);
        setCola(resto);
        return;
      }
    }
    escribir(K_COLA, []);
    setCola([]);
  }, [guardarEstado]);

  const ejecutar = useCallback(async (cuerpo: Cuerpo, etiqueta = cuerpo.accion) => {
    setOcupado(etiqueta);
    setError("");
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const res = await fetch("/api/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      guardarEstado(data);
    } catch (e) {
      if (e instanceof TypeError) {
        const nueva = [...leer<Cuerpo[]>(K_COLA, []), cuerpo];
        escribir(K_COLA, nueva);
        setCola(nueva);
        if (estadoRef.current) guardarEstado(optimista(estadoRef.current, cuerpo));
      } else {
        setError(e instanceof Error ? e.message : "Error");
      }
    } finally {
      setOcupado(null);
    }
  }, [guardarEstado]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza con el almacenamiento local y la red al abrir */
    const guardado = leer<Estado | null>(K_ESTADO, null);
    if (guardado) {
      estadoRef.current = guardado;
      setEstado(guardado);
    }
    setCola(leer<Cuerpo[]>(K_COLA, []));
    setOnline(navigator.onLine);
    /* eslint-enable react-hooks/set-state-in-effect */
    enviarCola().then(cargar);
    const on = () => { setOnline(true); enviarCola().then(cargar); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [cargar, enviarCola]);

  // Actualización por tráfico mientras la jornada está activa (y al volver a abrir la app).
  useEffect(() => {
    const revisar = async () => {
      const e = estadoRef.current;
      if (!e?.jornada || e.jornada.estado !== "activa" || !navigator.onLine || document.hidden) return;
      const ultimo = e.jornada.ultimoCalculo ? new Date(e.jornada.ultimoCalculo).getTime() : 0;
      if (Date.now() - ultimo < e.parametros.recalculoMin * 60_000) {
        if (!document.hidden) cargar();
        return;
      }
      await ejecutar({ accion: "recalcular", motivo: "periodico", pos: await ubicacion() }, "auto");
    };
    const t = setInterval(revisar, 60_000);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [ejecutar, cargar]);

  const salir = async () => {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "salir" }) });
    localStorage.removeItem(K_ESTADO);
    localStorage.removeItem(K_COLA);
    window.location.href = "/login";
  };

  if (!estado) return <Pantalla><p className="mt-32 text-center text-slate-400">Cargando…</p></Pantalla>;

  const { usuario, camioneta, jornada, plan, countries, parametros, cierres } = estado;
  const encabezado = { nombre: usuario.nombre, camioneta: camioneta?.nombre, online, pendientes: cola.length, menu: () => setHoja("menu") };

  if (!jornada || !camioneta) {
    return (
      <Pantalla {...encabezado}>
        <section className="mt-20 text-center">
          <h1 className="text-2xl font-semibold">No tenés una camioneta asignada hoy</h1>
          <p className="mt-3 text-slate-400">Cuando administración te asigne una, la vas a ver acá.</p>
          <button onClick={cargar} className="mt-8 h-12 rounded-2xl bg-white/10 px-6 font-medium">Actualizar</button>
        </section>
        {hoja === "menu" && <HojaMenu cerrar={() => setHoja(null)} salir={salir} />}
      </Pantalla>
    );
  }

  const country = (id?: string | null) => countries.find((c) => c.id === id);
  const actualId = jornada.enSitio ?? plan?.paradas[0]?.countryId;
  const actual = country(actualId);
  const parada = plan?.paradas.find((p) => p.countryId === actualId);
  const navegar = (p: { lat: number; lon: number }) => (parametros.navegador === "google" ? linkGoogleMaps(p) : linkWaze(p));
  const destinoFinal = {
    nombre: plan?.retornoBase?.nombre ?? SEDE.nombre,
    direccion: plan?.retornoBase?.direccion ?? SEDE.direccion,
    lat: plan?.retornoBase?.lat ?? SEDE.lat,
    lon: plan?.retornoBase?.lon ?? SEDE.lon,
  };
  const deshacer = jornada.deshacer && ahora - new Date(jornada.deshacer.at).getTime() < VENTANA_DESHACER_MS ? jornada.deshacer : null;
  const sugerido = plan?.sugerencia && !jornada.enSitio ? country(plan.sugerencia.countryId) : null;

  return (
    <Pantalla {...encabezado} pestanas={{ actual: pestana, cambiar: setPestana }}>
      {error && <div className="mb-4 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</div>}

      {jornada.estado === "pendiente" && pestana === "ahora" && (
        <section className="mt-4">
          <p className="text-slate-400">{camioneta.nombre}{camioneta.patente && ` · ${camioneta.patente}`}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hoy tenés {jornada.countries.length} {jornada.countries.length === 1 ? "country" : "countries"}</h1>
          <ul className="mt-6 space-y-2">
            {countries.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>{c.nombre}<span className="block text-sm text-slate-400">{c.zona}</span></span>
                <span className="text-sm text-slate-400">{c.fallas.length} {c.fallas.length === 1 ? "equipo" : "equipos"}</span>
              </li>
            ))}
          </ul>
          <BotonGrande className="mt-8" onClick={async () => ejecutar({ accion: "iniciar", pos: await ubicacion() })} disabled={!!ocupado || !jornada.countries.length || !usuario.domicilio}>
            {ocupado === "iniciar" ? "Calculando tu recorrido…" : !usuario.domicilio ? "Domicilio sin configurar" : "Iniciar jornada"}
          </BotonGrande>
          <p className="mt-3 text-center text-xs text-slate-500">{usuario.domicilio ? `El recorrido sale desde tu domicilio: ${usuario.domicilio.direccion}.` : "No tenés un domicilio configurado; el recorrido sale desde la sede Vialseg."}</p>
        </section>
      )}

      {jornada.estado === "activa" && pestana === "ahora" && (
        <>
          {deshacer && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3 text-sm">
              <span className="text-slate-300">{deshacer.tipo === "terminado" ? "Cerraste" : "Salteaste"} {country(deshacer.countryId)?.nombre}</span>
              <button className="font-semibold text-lima" disabled={!!ocupado} onClick={() => ejecutar({ accion: "deshacer" })}>Deshacer</button>
            </div>
          )}
          {sugerido && (
            <div className="mb-4 rounded-2xl bg-amber-400/15 p-4 text-sm text-amber-100">
              <p>{plan?.sugerencia?.mensaje}</p>
              <button className="mt-2 font-semibold text-amber-300" disabled={!!ocupado}
                onClick={async () => { await ejecutar({ accion: "ir", countryId: sugerido.id }); await ejecutar({ accion: "recalcular", motivo: "manual" }); }}>
                Ir a {sugerido.nombre}
              </button>
            </div>
          )}

          {actual ? (
            <section className="rounded-3xl bg-noche-2 p-6 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">{jornada.enSitio ? "Estás en" : "Próximo destino"}</p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-tight">{actual.nombre}</h1>
              <p className="text-slate-400">{actual.direccion ?? actual.zona}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {!jornada.enSitio && parada && <Dato>Llegás {hora(parada.eta)}</Dato>}
                {!jornada.enSitio && parada && <Dato>{parada.minDesdeAnterior} min · {parada.kmDesdeAnterior} km</Dato>}
                <Dato>{actual.fallas.length} {actual.fallas.length === 1 ? "equipo" : "equipos"}</Dato>
              </div>
              {actual.notas && <p className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-300">{actual.notas}</p>}
              {actual.contacto && <a href={`tel:${actual.contacto.replace(/[^\d+]/g, "")}`} className="mt-2 block text-sm text-cielo">Contacto: {actual.contacto}</a>}

              {jornada.enSitio ? (
                <>
                  <ListaFallas fallas={actual.fallas} />
                  <BotonGrande className="mt-6" onClick={() => setHoja("cierre")}>Terminé</BotonGrande>
                  <div className="mt-3 flex justify-between text-sm text-slate-400">
                    <button onClick={() => ejecutar({ accion: "cancelar_llegada" })} disabled={!!ocupado}>Todavía no llegué</button>
                    <button onClick={() => setHoja("saltear")}>No pude hacerlo</button>
                  </div>
                </>
              ) : (
                <>
                  <a href={navegar(actual)} target="_blank" rel="noreferrer"
                    onClick={() => jornada.destinoFijo !== actual.id && ejecutar({ accion: "ir", countryId: actual.id })}
                    className="mt-6 flex h-16 w-full items-center justify-center rounded-2xl bg-lima text-lg font-semibold text-noche transition active:scale-[0.98]">
                    Ir con {parametros.navegador === "google" ? "Google Maps" : "Waze"}
                  </a>
                  <button onClick={() => ejecutar({ accion: "llegue", countryId: actual.id })} disabled={!!ocupado}
                    className="mt-3 h-14 w-full rounded-2xl bg-white/10 font-semibold transition active:scale-[0.98]">Llegué</button>
                  <div className="mt-3 flex justify-between text-sm text-slate-400">
                    <a href={parametros.navegador === "google" ? linkWaze(actual) : linkGoogleMaps(actual)} target="_blank" rel="noreferrer">Abrir en {parametros.navegador === "google" ? "Waze" : "Google Maps"}</a>
                    <button onClick={() => setHoja("saltear")}>No puedo ir</button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="rounded-3xl bg-noche-2 p-6 text-center ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">{plan ? "Recorrido completo" : "Sin recorrido"}</p>
              <h1 className="mt-2 text-2xl font-semibold">{plan ? "No te quedan visitas pendientes" : "Se calcula cuando haya señal"}</h1>
              {plan?.retornoBase && (
                <div className="mt-4 rounded-2xl bg-white/5 p-4 text-left ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-lima">Destino final</p>
                    <span className="tabular text-sm font-semibold text-lima">Llegada ~{hora(plan.retornoBase.eta)}</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-white">{destinoFinal.nombre}</p>
                  <p className="text-xs text-slate-400">{destinoFinal.direccion}</p>
                  <p className="mt-2 text-xs text-slate-300">
                    {plan.retornoBase.km} km · ~{Math.round(plan.retornoBase.minutos)} min de viaje dentro de tu jornada ({camioneta.inicio} a {camioneta.fin})
                  </p>
                  <a
                    href={navegar(destinoFinal)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-lima font-semibold text-noche transition active:scale-[0.98]"
                  >
                    Navegar al domicilio
                  </a>
                </div>
              )}
              {plan && <button onClick={() => setHoja("finalizar")} className="mt-4 h-12 w-full rounded-2xl bg-white/10 text-sm font-semibold text-white">Finalizar jornada</button>}
            </section>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
            <div className="text-xs text-slate-400">
              <span>Recorrido {jornada.ultimoCalculo ? hora(jornada.ultimoCalculo) : "—"}</span>
              {plan?.retornoBase && (
                <span className="block text-slate-300">
                  Regreso al domicilio: <b className="text-white">{hora(plan.retornoBase.eta)}</b> (jornada hasta {camioneta.fin})
                </span>
              )}
            </div>
            <button onClick={async () => ejecutar({ accion: "recalcular", motivo: "manual", pos: await ubicacion() })} disabled={!!ocupado}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {ocupado === "recalcular" || ocupado === "auto" ? "Recalculando…" : "Recalcular recorrido"}
            </button>
          </div>
        </>
      )}

      {pestana === "ruta" && (
        <PestanaRuta estado={estado} />
      )}

      {pestana === "hoy" && (
        <section>
          <h2 className="text-lg font-semibold">Tu día</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Atendidos", jornada.visitados.length], ["Pendientes", plan?.paradas.length ?? 0], ["Salteados", jornada.salteados.length]].map(([t, v]) => (
              <div key={t as string} className="rounded-2xl bg-white/5 py-3"><p className="tabular text-2xl font-semibold">{v}</p><p className="text-xs text-slate-400">{t}</p></div>
            ))}
          </div>
          <ul className="mt-5 space-y-2">
            {cierres.length === 0 && <li className="text-sm text-slate-400">Todavía no cerraste ninguna visita.</li>}
            {cierres.map((c) => (
              <li key={c.id} className="rounded-2xl bg-white/5 px-4 py-3 text-sm">
                <p className="flex justify-between"><span className="font-medium">{country(c.countryId)?.nombre}</span><span className="tabular text-slate-400">{hora(c.at)}</span></p>
                <p className="text-slate-400">{c.resultado === "resuelto" ? "Todo resuelto" : c.resultado === "parcial" ? "Resuelto en parte" : "Sin resolver"}{c.trabajos.length ? ` · ${c.trabajos.join(", ")}` : ""}{c.conFoto ? " · con foto" : ""}</p>
              </li>
            ))}
          </ul>
          {jornada.estado === "activa" && <button onClick={() => setHoja("finalizar")} className="mt-8 h-12 w-full rounded-2xl bg-white/5 text-sm font-medium text-slate-300">Finalizar jornada</button>}
          {jornada.estado === "finalizada" && <button onClick={() => ejecutar({ accion: "reabrir" })} disabled={!!ocupado} className="mt-8 h-12 w-full rounded-2xl bg-white/5 text-sm font-medium text-slate-300">Reabrir jornada</button>}
        </section>
      )}

      {jornada.estado === "finalizada" && pestana === "ahora" && (
        <section className="mt-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">Jornada finalizada</p>
          <h1 className="mt-3 text-3xl font-semibold">{jornada.visitados.length} {jornada.visitados.length === 1 ? "country atendido" : "countries atendidos"}</h1>
          <p className="mt-2 text-slate-400">{cierres.length} visitas registradas{jornada.salteados.length ? ` · ${jornada.salteados.length} salteados` : ""}.</p>
          <button onClick={() => ejecutar({ accion: "reabrir" })} disabled={!!ocupado} className="mt-10 h-12 rounded-2xl bg-white/10 px-6 font-medium">
            {ocupado === "reabrir" ? "Reabriendo…" : "Reabrir jornada"}
          </button>
          <p className="mt-3 text-xs text-slate-500">Mañana arranca una jornada nueva con lo que planifique administración.</p>
        </section>
      )}

      {hoja === "cierre" && actual && (
        <HojaCierre fallas={actual.fallas} cerrar={() => setHoja(null)} confirmar={async (datos) => {
          setHoja(null);
          await ejecutar({ accion: "terminar", cierre: { countryId: actual.id, ...datos }, pos: await ubicacion() });
        }} />
      )}
      {hoja === "saltear" && actual && (
        <HojaSaltear nombre={actual.nombre} cerrar={() => setHoja(null)} confirmar={async (motivo) => {
          setHoja(null);
          await ejecutar({ accion: "saltear", countryId: actual.id, motivo, pos: await ubicacion() });
        }} />
      )}
      {hoja === "finalizar" && (
        <Hoja titulo="Finalizar jornada" cerrar={() => setHoja(null)}>
          <p className="mt-3 text-slate-300">{plan?.paradas.length ? `Te quedan ${plan.paradas.length} countries sin visitar. Quedan pendientes para otro día.` : "¿Terminaste por hoy?"}</p>
          <BotonGrande className="mt-6" onClick={() => { setHoja(null); ejecutar({ accion: "finalizar" }); }}>Finalizar</BotonGrande>
        </Hoja>
      )}
      {hoja === "menu" && (
        <HojaMenu
          cerrar={() => setHoja(null)}
          salir={salir}
          acciones={[
            ...(jornada.estado === "activa" ? [
              { texto: "Recalcular recorrido", hacer: async () => { setHoja(null); await ejecutar({ accion: "recalcular", motivo: "manual", pos: await ubicacion() }); } },
              { texto: "Ver recorrido del día", hacer: () => { setHoja(null); setPestana("ruta"); } },
              { texto: "Finalizar jornada", hacer: () => setHoja("finalizar") },
            ] : []),
            ...(jornada.estado === "pendiente" ? [{ texto: "Iniciar jornada", hacer: async () => { setHoja(null); await ejecutar({ accion: "iniciar", pos: await ubicacion() }); } }] : []),
            ...(jornada.estado === "finalizada" ? [{ texto: "Reabrir jornada", hacer: () => { setHoja(null); ejecutar({ accion: "reabrir" }); } }] : []),
          ]}
        />
      )}
    </Pantalla>
  );
}

// ---------------------------------------------------------------- pestaña ruta
function PestanaRuta({ estado }: { estado: Estado }) {
  const { jornada, plan, countries, camioneta } = estado;
  if (!jornada || !camioneta) return null;
  const c = (id: string) => countries.find((x) => x.id === id)!;
  const salteado = (id: string) => jornada.salteados.find((s) => s.countryId === id);
  const pendientes: { countryId: string; eta?: string }[] = plan?.paradas
    ?? jornada.countries.filter((id) => !jornada.visitados.includes(id) && !salteado(id)).map((id) => ({ countryId: id }));
  const sinLugar = plan?.noVisitados ?? [];
  const orden = [
    ...jornada.visitados.map((id) => ({ id, estado: "hecho" as const })),
    ...(jornada.enSitio && !pendientes.some((p) => p.countryId === jornada.enSitio) ? [{ id: jornada.enSitio, estado: "aca" as const }] : []),
    ...pendientes.map((p) => ({ id: p.countryId, estado: (p.countryId === jornada.enSitio ? "aca" : "pendiente") as "aca" | "pendiente", eta: p.eta })),
    ...jornada.salteados.map((s) => ({ id: s.countryId, estado: "salteado" as const })),
    ...sinLugar.filter((id) => !salteado(id)).map((id) => ({ id, estado: "sinlugar" as const })),
  ].filter((x, i, a) => countries.some((k) => k.id === x.id) && a.findIndex((y) => y.id === x.id) === i);

  let n = 0;
  return (
    <section>
      {!plan && <p className="mb-3 text-sm text-slate-400">El orden de visita se calcula al iniciar la jornada, desde donde estés.</p>}
      <div className="h-[42dvh] overflow-hidden rounded-3xl ring-1 ring-white/10">
        <MapaRutaDinamico
          geometria={plan?.geometria ?? []}
          color={camioneta.color}
          posicion={jornada.posicion}
          paradas={[
            ...jornada.visitados.filter((id) => countries.some((k) => k.id === id)).map((id) => ({ lat: c(id).lat, lon: c(id).lon, orden: 0, hecho: true })),
            ...pendientes.map((p, i) => ({ lat: c(p.countryId).lat, lon: c(p.countryId).lon, orden: i + 1 })),
          ]}
        />
      </div>
      <ol className="mt-4 space-y-2">
        {orden.map((x) => (
          <li key={x.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${x.estado === "aca" ? "bg-lima/15 ring-1 ring-lima/40" : "bg-white/5"}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${x.estado === "hecho" ? "bg-white/10 text-slate-400" : x.estado === "pendiente" || x.estado === "aca" ? "text-noche" : "bg-white/5 text-slate-500"}`}
              style={x.estado === "pendiente" || x.estado === "aca" ? { background: camioneta.color } : undefined}>
              {x.estado === "hecho" ? "✓" : x.estado === "pendiente" || x.estado === "aca" ? ++n : "–"}
            </span>
            <span className={`flex-1 ${x.estado === "hecho" || x.estado === "salteado" ? "text-slate-500" : ""}`}>
              {c(x.id).nombre}
              <span className="block text-xs text-slate-400">
                {x.estado === "hecho" ? "Atendido" : x.estado === "aca" ? "Estás acá" : x.estado === "salteado" ? `Salteado · ${salteado(x.id)?.motivo}` : x.estado === "sinlugar" ? "No entra en la jornada de hoy" : `${c(x.id).fallas.length} ${c(x.id).fallas.length === 1 ? "equipo" : "equipos"}`}
              </span>
            </span>
            {"eta" in x && x.eta && x.estado === "pendiente" && <span className="tabular text-sm text-slate-400">{hora(x.eta)}</span>}
          </li>
        ))}
        {plan?.retornoBase && (
          <li className="flex items-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-slate-300">
              🏁
            </span>
            <span className="flex-1 text-slate-200">
              Regreso al domicilio ({destinoFinal.nombre})
              <span className="block text-xs text-slate-400">
                Fin de jornada · {plan.retornoBase.km} km · ~{Math.round(plan.retornoBase.minutos)} min de viaje
              </span>
            </span>
            <span className="tabular text-sm font-semibold text-lima">{hora(plan.retornoBase.eta)}</span>
          </li>
        )}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- piezas
function Pantalla({ children, nombre, camioneta, online = true, pendientes = 0, menu, pestanas }: {
  children: React.ReactNode; nombre?: string; camioneta?: string; online?: boolean; pendientes?: number; menu?: () => void;
  pestanas?: { actual: string; cambiar: (p: "ahora" | "ruta" | "hoy") => void };
}) {
  return (
    <main className="min-h-dvh bg-noche text-white">
      <header className="sticky top-0 z-[1200] bg-noche/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            {camioneta && <p className="text-xs text-slate-400">{camioneta}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-lima" : "bg-amber-400"}`} title={online ? "Conectado" : "Sin señal"} />
            {menu && <button onClick={menu} aria-label="Menú" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-lg">⋯</button>}
          </div>
        </div>
        {(!online || pendientes > 0) && (
          <p className="bg-amber-400/15 px-5 py-2 text-center text-xs text-amber-200">
            {!online && "Sin señal: seguí trabajando, se envía todo al volver. "}
            {pendientes > 0 && `${pendientes} ${pendientes === 1 ? "acción pendiente" : "acciones pendientes"} de envío.`}
          </p>
        )}
      </header>
      <div className="mx-auto max-w-md px-5 pt-2" style={{ paddingBottom: pestanas ? "calc(6rem + env(safe-area-inset-bottom))" : "calc(2.5rem + env(safe-area-inset-bottom))" }}>{children}</div>
      {pestanas && (
        <nav className="fixed inset-x-0 bottom-0 z-[1200] border-t border-white/10 bg-noche/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-md grid-cols-3">
            {([["ahora", "Ahora"], ["ruta", "Recorrido"], ["hoy", "Mi día"]] as const).map(([k, t]) => (
              <button key={k} onClick={() => pestanas.cambiar(k)} className={`py-4 text-sm font-medium ${pestanas.actual === k ? "text-lima" : "text-slate-400"}`}>{t}</button>
            ))}
          </div>
        </nav>
      )}
    </main>
  );
}

const Dato = ({ children }: { children: React.ReactNode }) => <span className="tabular rounded-full bg-white/10 px-3 py-1.5 text-slate-200">{children}</span>;

function BotonGrande({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`flex h-16 w-full items-center justify-center rounded-2xl bg-lima text-lg font-semibold text-noche transition active:scale-[0.98] disabled:opacity-60 ${className}`}>
      {children}
    </button>
  );
}

function ListaFallas({ fallas }: { fallas: CountryRuta["fallas"] }) {
  return (
    <ul className="mt-6 space-y-2">
      {fallas.map((f) => (
        <li key={f.id} className="flex gap-3 rounded-2xl bg-white/5 px-4 py-3">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_GRAVEDAD[f.gravedad] }} />
          <span className="min-w-0">
            <span className="font-medium">{f.producto ? nombreProducto(f.producto) : "Equipo"}</span>
            <span className="block text-sm text-slate-300">{f.tipo}</span>
            <span className="block text-xs text-slate-400">{f.ubicacion}{f.numeroSerie ? ` · ${f.numeroSerie}` : ""} · {NOMBRE_GRAVEDAD[f.gravedad]} · hace {duracion(horasDesde(f.abiertaAt))}</span>
            {f.descripcion && <span className="mt-1 block text-xs text-slate-400">“{f.descripcion}”</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Hoja({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1500] flex items-end bg-black/60" onClick={cerrar}>
      <div className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-noche-2 p-6 text-white" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{titulo}</h2>
          <button onClick={cerrar} className="text-sm text-slate-400">Cancelar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HojaMenu({ cerrar, salir, acciones = [] }: { cerrar: () => void; salir: () => void; acciones?: { texto: string; hacer: () => void }[] }) {
  return (
    <Hoja titulo="Menú" cerrar={cerrar}>
      <div className="mt-5 space-y-2">
        {acciones.map((a) => (
          <button key={a.texto} onClick={a.hacer} className="h-14 w-full rounded-2xl bg-white/5 px-4 text-left font-medium">{a.texto}</button>
        ))}
        <button onClick={() => window.location.reload()} className="h-14 w-full rounded-2xl bg-white/5 px-4 text-left font-medium">Actualizar datos</button>
        <button onClick={salir} className="h-14 w-full rounded-2xl bg-white/5 px-4 text-left font-medium text-red-300">Cerrar sesión</button>
      </div>
      <p className="mt-4 text-xs text-slate-500">Si cerrás sesión vas a tener que volver a ingresar tu PIN.</p>
    </Hoja>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2.5 text-sm transition ${activo ? "bg-lima font-semibold text-noche" : "bg-white/10 text-slate-200"}`}>
      {children}
    </button>
  );
}

function HojaCierre({ fallas, cerrar, confirmar }: {
  fallas: CountryRuta["fallas"];
  cerrar: () => void;
  confirmar: (d: { fallasResueltas: string[]; fallasPendientes: string[]; resultado: "resuelto" | "parcial" | "sin_resolver"; trabajos: string[]; nota?: string; foto?: string }) => void;
}) {
  const [resueltas, setResueltas] = useState<string[]>(fallas.map((f) => f.id));
  const [trabajos, setTrabajos] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<string>();
  const alternar = (lista: string[], x: string) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);
  const resultado = resueltas.length === fallas.length ? "resuelto" : resueltas.length ? "parcial" : "sin_resolver";

  return (
    <Hoja titulo="Cerrar visita" cerrar={cerrar}>
      <p className="mt-5 text-sm font-medium text-slate-300">¿Qué quedó funcionando?</p>
      <div className="mt-2 space-y-2">
        {fallas.map((f) => (
          <label key={f.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
            <input type="checkbox" className="h-5 w-5 accent-lima" checked={resueltas.includes(f.id)} onChange={() => setResueltas(alternar(resueltas, f.id))} />
            <span className="text-sm">{f.producto ? nombreProducto(f.producto) : "Equipo"} · <span className="text-slate-400">{f.tipo}</span></span>
          </label>
        ))}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-300">¿Qué hiciste?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {TRABAJOS.map((t) => <Chip key={t} activo={trabajos.includes(t)} onClick={() => setTrabajos(alternar(trabajos, t))}>{t}</Chip>)}
      </div>
      <textarea className="mt-5 h-20 w-full rounded-2xl bg-white/5 p-4 text-sm outline-none placeholder:text-slate-500" placeholder="Comentario (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <label className="mt-3 flex h-14 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/20 text-sm text-slate-300">
        {foto ? "Foto agregada ✓ · tocar para cambiar" : "Agregar foto (opcional)"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => e.target.files?.[0] && setFoto(await comprimir(e.target.files[0]))} />
      </label>
      <BotonGrande className="mt-6" onClick={() => confirmar({ fallasResueltas: resueltas, fallasPendientes: fallas.map((f) => f.id).filter((id) => !resueltas.includes(id)), resultado, trabajos, nota: nota || undefined, foto })}>
        {resultado === "resuelto" ? "Confirmar: todo resuelto" : resultado === "parcial" ? "Confirmar: resuelto en parte" : "Confirmar: sin resolver"}
      </BotonGrande>
    </Hoja>
  );
}

function HojaSaltear({ nombre, cerrar, confirmar }: { nombre: string; cerrar: () => void; confirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  return (
    <Hoja titulo={`Saltear ${nombre}`} cerrar={cerrar}>
      <p className="mt-2 text-sm text-slate-400">Las fallas quedan pendientes y te damos el próximo destino. Lo podés deshacer.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {MOTIVOS_SALTEO.map((m) => <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
      </div>
      {motivo === "Otro" && <input className="mt-4 h-12 w-full rounded-2xl bg-white/5 px-4 text-sm outline-none" placeholder="Contanos qué pasó" value={otro} onChange={(e) => setOtro(e.target.value)} />}
      <BotonGrande className="mt-6" disabled={!motivo || (motivo === "Otro" && !otro)} onClick={() => confirmar(motivo === "Otro" ? otro : motivo)}>
        Saltear y seguir
      </BotonGrande>
    </Hoja>
  );
}
