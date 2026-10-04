"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { estadoConductor } from "@/lib/acciones";
import { COLOR_GRAVEDAD, MOTIVOS_SALTEO, nombreProducto, TRABAJOS } from "@/lib/catalogo";
import { linkGoogleMaps, linkWaze } from "@/lib/geo";
import { hora } from "@/lib/tiempo";
import type { Posicion } from "@/lib/types";

type Estado = Awaited<ReturnType<typeof estadoConductor>>;
type Cuerpo = Record<string, unknown> & { accion: string };

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
    /* sin espacio: la app sigue funcionando sin guardar */
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
  const escala = Math.min(1, 1024 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// Actualización local cuando no hay señal (se sincroniza después).
function optimista(e: Estado, c: Cuerpo): Estado {
  const j = { ...e.jornada };
  const plan = e.plan ? { ...e.plan, paradas: [...e.plan.paradas] } : null;
  const id = (c.countryId ?? (c.cierre as { countryId?: string })?.countryId) as string | undefined;
  const quitar = () => plan && (plan.paradas = plan.paradas.filter((p) => p.countryId !== id));
  if (c.accion === "iniciar") j.estado = "activa";
  if (c.accion === "ir") j.destinoFijo = id;
  if (c.accion === "llegue") j.enSitio = id;
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
export default function ConductorApp({ camionetaId }: { camionetaId: string }) {
  const kEstado = `vialseg-conductor-${camionetaId}`;
  const kCola = `vialseg-cola-${camionetaId}`;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [online, setOnline] = useState(true);
  const [cola, setCola] = useState<Cuerpo[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hoja, setHoja] = useState<null | "cierre" | "saltear">(null);
  const [verDespues, setVerDespues] = useState(false);
  const estadoRef = useRef<Estado | null>(null);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  const guardarEstado = useCallback((e: Estado) => {
    estadoRef.current = e;
    setEstado(e);
    escribir(kEstado, e);
  }, [kEstado]);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/conductor?c=${camionetaId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      guardarEstado(data);
    } catch {
      /* sin señal: queda lo guardado */
    }
  }, [camionetaId, guardarEstado]);

  const enviarCola = useCallback(async () => {
    const pendientes = leer<Cuerpo[]>(kCola, []);
    if (!pendientes.length || !navigator.onLine) return;
    for (let i = 0; i < pendientes.length; i++) {
      try {
        const res = await fetch("/api/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pendientes[i]) });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.error) guardarEstado(data);
      } catch {
        const resto = pendientes.slice(i);
        escribir(kCola, resto);
        setCola(resto);
        return;
      }
    }
    escribir(kCola, []);
    setCola([]);
  }, [kCola, guardarEstado]);

  const ejecutar = useCallback(async (cuerpo: Cuerpo, etiqueta = cuerpo.accion) => {
    const completo = { ...cuerpo, camionetaId };
    setOcupado(etiqueta);
    setError("");
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const res = await fetch("/api/conductor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completo) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      guardarEstado(data);
    } catch (e) {
      if (e instanceof TypeError) {
        // Sin señal: se guarda en la bandeja de salida y se aplica en pantalla.
        const nueva = [...leer<Cuerpo[]>(kCola, []), completo];
        escribir(kCola, nueva);
        setCola(nueva);
        if (estadoRef.current) guardarEstado(optimista(estadoRef.current, completo));
      } else {
        setError(e instanceof Error ? e.message : "Error");
      }
    } finally {
      setOcupado(null);
    }
  }, [camionetaId, guardarEstado, kCola]);

  // Arranque: lo guardado primero (funciona sin señal), después lo del servidor.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza con localStorage y la red al montar */
    const guardado = leer<Estado | null>(kEstado, null);
    if (guardado) setEstado(guardado);
    setCola(leer<Cuerpo[]>(kCola, []));
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
  }, [kEstado, kCola, cargar, enviarCola]);

  // Control de tráfico: cada N minutos mientras la jornada está activa (y al volver a abrir la app).
  useEffect(() => {
    const revisar = async () => {
      const e = estadoRef.current;
      if (!e || e.jornada.estado !== "activa" || !navigator.onLine || document.hidden) return;
      const ultimo = e.jornada.ultimoCalculo ? new Date(e.jornada.ultimoCalculo).getTime() : 0;
      if (Date.now() - ultimo < e.parametros.recalculoMin * 60_000) return;
      await ejecutar({ accion: "recalcular", motivo: "periodico", pos: await ubicacion() }, "auto");
    };
    const t = setInterval(revisar, 60_000);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [ejecutar]);

  if (!estado) {
    return <Pantalla><p className="mt-32 text-center text-slate-400">Cargando tu jornada…</p></Pantalla>;
  }

  const { camioneta, jornada, plan, countries, parametros } = estado;
  const country = (id?: string | null) => countries.find((c) => c.id === id);
  const actualId = jornada.enSitio ?? plan?.paradas[0]?.countryId;
  const actual = country(actualId);
  const parada = plan?.paradas.find((p) => p.countryId === actualId);
  const despues = (plan?.paradas ?? []).filter((p) => p.countryId !== actualId);
  const sugerido = plan?.sugerencia ? country(plan.sugerencia.countryId) ?? null : null;
  const navegar = (p: { lat: number; lon: number }) => (parametros.navegador === "google" ? linkGoogleMaps(p) : linkWaze(p));

  return (
    <Pantalla camioneta={camioneta} online={online} pendientes={cola.length}>
      {error && <div className="mb-4 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</div>}

      {jornada.estado === "pendiente" && (
        <section className="mt-6">
          <p className="text-slate-400">Hola, {camioneta.conductor.split(" ")[0]}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Hoy tenés {jornada.countries.length} countries</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">Al iniciar usamos tu ubicación para calcular el mejor recorrido desde donde estás.</p>
          <BotonGrande className="mt-10" onClick={async () => ejecutar({ accion: "iniciar", pos: await ubicacion() })} disabled={!!ocupado}>
            {ocupado === "iniciar" ? "Calculando tu ruta…" : "Iniciar jornada"}
          </BotonGrande>
        </section>
      )}

      {jornada.estado === "activa" && (
        <>
          {sugerido && !jornada.enSitio && (
            <div className="mb-4 rounded-2xl bg-amber-400/15 p-4 text-sm text-amber-100">
              <p>{plan?.sugerencia?.mensaje}</p>
              <button className="mt-2 font-semibold text-amber-300" disabled={!!ocupado}
                onClick={async () => { await ejecutar({ accion: "ir", countryId: sugerido.id }); await ejecutar({ accion: "recalcular", motivo: "manual" }); }}>
                Cambiar destino
              </button>
            </div>
          )}

          {actual ? (
            <section className="rounded-3xl bg-noche-2 p-6 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">{jornada.enSitio ? "Estás en" : "Próximo destino"}</p>
              <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-tight">{actual.nombre}</h1>
              <p className="text-slate-400">{actual.zona}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {!jornada.enSitio && parada && <Dato>Llegás {hora(parada.eta)}</Dato>}
                {!jornada.enSitio && parada && <Dato>{parada.minDesdeAnterior} min · {parada.kmDesdeAnterior} km</Dato>}
                <Dato>{actual.fallas.length} {actual.fallas.length === 1 ? "equipo" : "equipos"}</Dato>
              </div>

              {jornada.enSitio ? (
                <>
                  <ul className="mt-6 space-y-2">
                    {actual.fallas.map((f) => (
                      <li key={f.id} className="flex gap-3 rounded-2xl bg-white/5 px-4 py-3">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_GRAVEDAD[f.gravedad] }} />
                        <span>
                          <span className="font-medium">{f.producto ? nombreProducto(f.producto) : "Equipo"}</span>
                          <span className="block text-sm text-slate-400">{f.tipo} · {f.ubicacion}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <BotonGrande className="mt-6" onClick={() => setHoja("cierre")}>Terminé</BotonGrande>
                  <button className="mt-4 w-full py-2 text-sm text-slate-400" onClick={() => setHoja("saltear")}>No pude hacerlo</button>
                </>
              ) : (
                <>
                  <a href={navegar(actual)} target="_blank" rel="noreferrer"
                    onClick={() => jornada.destinoFijo !== actual.id && ejecutar({ accion: "ir", countryId: actual.id })}
                    className="mt-6 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-lima text-lg font-semibold text-noche transition active:scale-[0.98]">
                    Ir con {parametros.navegador === "google" ? "Google Maps" : "Waze"}
                  </a>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button onClick={() => ejecutar({ accion: "llegue", countryId: actual.id })} disabled={!!ocupado}
                      className="h-14 rounded-2xl bg-white/10 font-semibold transition active:scale-[0.98]">Llegué</button>
                    <a href={parametros.navegador === "google" ? linkWaze(actual) : linkGoogleMaps(actual)} target="_blank" rel="noreferrer"
                      className="grid h-14 place-items-center rounded-2xl bg-white/5 text-sm text-slate-300">
                      Abrir en {parametros.navegador === "google" ? "Waze" : "Google Maps"}
                    </a>
                  </div>
                  <button className="mt-4 w-full py-2 text-sm text-slate-400" onClick={() => setHoja("saltear")}>No puedo ir a este country</button>
                </>
              )}
            </section>
          ) : (
            <section className="mt-6 rounded-3xl bg-noche-2 p-6 text-center ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">{plan ? "Listo por hoy" : "Sin ruta todavía"}</p>
              <h1 className="mt-2 text-2xl font-semibold">{plan ? "No te quedan visitas" : "Se calcula cuando haya señal"}</h1>
              {plan && (
                <a href={navegar(camioneta.base)} target="_blank" rel="noreferrer" className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-white/10 font-semibold">
                  Volver a {camioneta.base.nombre}
                </a>
              )}
            </section>
          )}

          {despues.length > 0 && (
            <section className="mt-6">
              <button className="flex w-full items-center justify-between py-2 text-sm font-medium text-slate-300" onClick={() => setVerDespues(!verDespues)}>
                Después · {despues.length} {despues.length === 1 ? "parada" : "paradas"}
                <span className="text-slate-500">{verDespues ? "Ocultar" : "Ver"}</span>
              </button>
              {verDespues && (
                <ol className="mt-2 space-y-1">
                  {despues.map((p, i) => (
                    <li key={p.countryId} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm">
                      <span><span className="mr-3 text-slate-500">{i + 2}</span>{country(p.countryId)?.nombre}</span>
                      <span className="tabular text-slate-400">{hora(p.eta)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <footer className="mt-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500">
            <button onClick={async () => ejecutar({ accion: "recalcular", motivo: "manual", pos: await ubicacion() })} disabled={!!ocupado}>
              {ocupado === "recalcular" || ocupado === "auto" ? "Recalculando…" : `Ruta de las ${jornada.ultimoCalculo ? hora(jornada.ultimoCalculo) : "—"} · Recalcular`}
            </button>
            <button onClick={() => confirm("¿Finalizar la jornada?") && ejecutar({ accion: "finalizar" })}>Finalizar jornada</button>
          </footer>
        </>
      )}

      {jornada.estado === "finalizada" && (
        <section className="mt-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lima">Jornada finalizada</p>
          <h1 className="mt-3 text-3xl font-semibold">{jornada.visitados.length} countries atendidos</h1>
          <p className="mt-2 text-slate-400">Buen trabajo. ¡Hasta mañana!</p>
        </section>
      )}

      {hoja === "cierre" && actual && (
        <HojaCierre
          fallas={actual.fallas}
          cerrar={() => setHoja(null)}
          confirmar={async (datos) => {
            setHoja(null);
            await ejecutar({ accion: "terminar", cierre: { countryId: actual.id, ...datos }, pos: await ubicacion() });
          }}
        />
      )}
      {hoja === "saltear" && actual && (
        <HojaSaltear
          nombre={actual.nombre}
          cerrar={() => setHoja(null)}
          confirmar={async (motivo) => {
            setHoja(null);
            await ejecutar({ accion: "saltear", countryId: actual.id, motivo, pos: await ubicacion() });
          }}
        />
      )}
    </Pantalla>
  );
}

// ---------------------------------------------------------------- piezas
function Pantalla({ children, camioneta, online = true, pendientes = 0 }: { children: React.ReactNode; camioneta?: Estado["camioneta"]; online?: boolean; pendientes?: number }) {
  return (
    <main className="min-h-dvh bg-noche text-white">
      <header className="sticky top-0 z-10 bg-noche/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <img src="/logo-vialseg.png" alt="Vialseg" className="h-6 w-auto" />
          {camioneta && (
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-lima pulso" : "bg-amber-400"}`} />
              {camioneta.nombre}
            </span>
          )}
        </div>
        {(!online || pendientes > 0) && (
          <p className="bg-amber-400/15 px-5 py-2 text-center text-xs text-amber-200">
            {!online ? "Sin señal. Seguí trabajando: se envía todo cuando vuelva." : ""} {pendientes > 0 && `${pendientes} ${pendientes === 1 ? "acción pendiente" : "acciones pendientes"} de envío.`}
          </p>
        )}
      </header>
      <div className="mx-auto max-w-md px-5 pb-10 pt-2" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>{children}</div>
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

function Hoja({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={cerrar}>
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

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-4 py-2.5 text-sm transition ${activo ? "bg-lima font-semibold text-noche" : "bg-white/10 text-slate-200"}`}>
      {children}
    </button>
  );
}

function HojaCierre({ fallas, cerrar, confirmar }: {
  fallas: Estado["countries"][number]["fallas"];
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
        {foto ? "Foto lista ✓ (tocar para cambiar)" : "Agregar foto (opcional)"}
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
      <p className="mt-2 text-sm text-slate-400">Las fallas quedan pendientes y el sistema te da el próximo destino.</p>
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
