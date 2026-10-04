"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import MapaDinamico from "@/components/MapaDinamico";
import { COLOR_GRAVEDAD, NOMBRE_GRAVEDAD } from "@/lib/catalogo";
import { fechaLarga, hora } from "@/lib/tiempo";
import Analisis, { type ResultadoAnalisis } from "./Analisis";
import Asignacion from "./Asignacion";
import { Boton, enviar, Tarjeta, type EstadoAdmin } from "./comun";
import Fallas from "./Fallas";
import Historial from "./Historial";
import Parametros from "./Parametros";

const PESTANAS = ["Asignación del día", "Fallas", "Análisis de red", "Historial y auditoría", "Parámetros"] as const;

export default function AdminApp() {
  const [estado, setEstado] = useState<EstadoAdmin | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]>("Asignación del día");
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});
  const [analisis, setAnalisis] = useState<ResultadoAnalisis | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin", { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEstado(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + actualización periódica
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  const accion = useCallback(
    async (etiqueta: string, cuerpo: Record<string, unknown>) => {
      setOcupado(etiqueta);
      try {
        const r = await enviar("/api/admin", cuerpo);
        await cargar();
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setOcupado(null);
      }
    },
    [cargar],
  );

  const asignado = useMemo(() => {
    const m: Record<string, string> = {};
    estado?.jornadas.forEach((j) => j.countries.forEach((c) => (m[c] = j.camionetaId)));
    return m;
  }, [estado]);

  if (!estado) {
    return (
      <div className="grid min-h-dvh place-items-center bg-fondo text-sm text-gris">
        {error ? <p className="max-w-md text-center text-red-600">{error}</p> : "Cargando centro de operaciones…"}
      </div>
    );
  }

  const { kpis, camionetas, planes, jornadas, countries } = estado;
  const nombre = (id: string) => countries.find((c) => c.id === id)?.nombre ?? id;
  const proveedor = Object.values(planes)[0]?.proveedor;

  return (
    <div className="min-h-dvh bg-fondo">
      <nav className="sticky top-0 z-[1100] bg-noche/95 backdrop-blur">
        <div className="h-[3px] bg-gradient-to-r from-cielo to-lima" />
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/"><img src="/logo-vialseg.png" alt="Vialseg" className="h-7 w-auto" /></Link>
          <span className="hidden h-5 w-px bg-white/15 sm:block" />
          <div className="hidden text-white sm:block">
            <p className="text-sm font-semibold leading-tight">Centro de operaciones · Martínez</p>
            <p className="text-xs text-slate-400">{fechaLarga(estado.fecha).replace(/^./, (l) => l.toUpperCase())}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className={`hidden rounded-full px-2.5 py-1 font-medium md:inline ${estado.almacenamiento === "supabase" ? "bg-lima/15 text-lima" : "bg-amber-400/15 text-amber-300"}`}>
              {estado.almacenamiento === "supabase" ? "Base: Supabase" : "Base: archivo local (demo)"}
            </span>
            {proveedor && <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-slate-300 lg:inline">Tiempos: {proveedor}</span>}
            <button onClick={cargar} className="rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white">Actualizar</button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError("")} className="font-medium">Cerrar</button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Fallas abiertas", kpis.fallasAbiertas, `${kpis.criticas} altas o críticas`],
            ["Tiempo caído promedio", `${kpis.horasPromedioCaido} h`, "de las fallas abiertas"],
            ["Resueltas hoy", kpis.resueltasHoy, kpis.tiempoRespuestaHoras ? `respuesta prom. ${kpis.tiempoRespuestaHoras} h` : "tiempo de respuesta"],
            ["Km planificados", kpis.kmPlanificados, "entre las 3 camionetas"],
            ["Jornada en servicio", `${kpis.pctServicio}%`, "vs. tiempo manejando"],
            ["Sin asignar", kpis.countriesSinAsignar.length, "countries con fallas"],
          ].map(([t, v, s]) => (
            <div key={t as string} className="rounded-2xl border border-linea bg-white px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gris">{t}</p>
              <p className={`tabular mt-1 text-2xl font-semibold tracking-tight ${t === "Sin asignar" && Number(v) > 0 ? "text-amber-600" : ""}`}>{v}</p>
              <p className="text-xs text-gris">{s}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Tarjeta
            className="flex flex-col overflow-hidden"
            titulo="Mapa de la red"
            accion={
              <div className="flex flex-wrap items-center gap-3 text-xs text-gris">
                {[1, 3, 4, 5].map((g) => (
                  <span key={g} className="hidden items-center gap-1 sm:inline-flex">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_GRAVEDAD[g] }} />
                    {NOMBRE_GRAVEDAD[g]}
                  </span>
                ))}
                <span className="hidden h-4 w-px bg-linea sm:block" />
                {camionetas.map((c) => (
                  <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-tinta">
                    <input type="checkbox" className="accent-noche" checked={visibles[c.id] !== false} onChange={(e) => setVisibles({ ...visibles, [c.id]: e.target.checked })} />
                    <span className="h-1.5 w-4 rounded-full" style={{ background: c.color }} />
                    {c.nombre.replace("Camioneta ", "C")}
                  </label>
                ))}
              </div>
            }
          >
            <div className="min-h-[560px] flex-1">
              <MapaDinamico
                alto="100%"
                datos={{
                  countries, fallas: estado.fallas, equipos: estado.equipos, tipos: estado.tipos, camionetas, planes,
                  posiciones: Object.fromEntries(jornadas.map((j) => [j.camionetaId, j.posicion])),
                  asignado, visibles, centro: pestana === "Análisis de red" ? analisis?.centro : null,
                }}
              />
            </div>
          </Tarjeta>

          <div className="space-y-3">
            {camionetas.map((c) => {
              const j = jornadas.find((x) => x.camionetaId === c.id)!;
              const plan = planes[c.id];
              const proxima = plan?.paradas[0];
              const total = j.countries.length;
              const hechos = j.visitados.length;
              return (
                <Tarjeta key={c.id}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-noche" style={{ background: c.color }}>
                          {c.id.toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold leading-tight">{c.nombre}</p>
                          <p className="text-xs text-gris">{c.conductor} · sale de {c.base.nombre.replace("Base ", "")}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${j.estado === "activa" ? "bg-lima/15 text-green-700" : j.estado === "finalizada" ? "bg-slate-100 text-gris" : "bg-amber-100 text-amber-700"}`}>
                        {j.estado === "activa" ? "En ruta" : j.estado === "finalizada" ? "Finalizada" : "Sin iniciar"}
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${total ? (hechos / total) * 100 : 0}%`, background: c.color }} />
                    </div>
                    <p className="tabular mt-1.5 text-xs text-gris">{hechos} de {total} countries · {j.salteados.length} salteados</p>

                    <div className="mt-3 rounded-xl bg-fondo px-3 py-2.5 text-sm">
                      {j.enSitio ? (
                        <p><span className="text-gris">Trabajando en </span><b className="font-semibold">{nombre(j.enSitio)}</b></p>
                      ) : proxima ? (
                        <p>
                          <span className="text-gris">Próximo: </span><b className="font-semibold">{nombre(proxima.countryId)}</b>
                          <span className="tabular text-gris"> · {hora(proxima.eta)}</span>
                          {j.forzado === proxima.countryId && <span className="ml-1 text-xs font-semibold text-amber-700">(forzado)</span>}
                        </p>
                      ) : (
                        <p className="text-gris">{plan ? "Sin visitas pendientes" : "Todavía no hay plan calculado"}</p>
                      )}
                      {plan && (
                        <p className="tabular mt-0.5 text-xs text-gris">
                          {plan.paradas.length} paradas · {plan.kmTotales} km · {Math.round(plan.minutosTotales / 6) / 10} h de recorrido · calculado {hora(plan.creadoAt)}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Forzar próximo destino"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-sm"
                        value={j.forzado ?? ""}
                        onChange={(e) => accion(`forzar-${c.id}`, { accion: "forzar", camionetaId: c.id, countryId: e.target.value })}
                      >
                        <option value="">Próximo: automático</option>
                        {j.countries.filter((x) => !j.visitados.includes(x)).map((x) => (
                          <option key={x} value={x}>Forzar: {nombre(x)}</option>
                        ))}
                      </select>
                      <Boton variante="secundario" disabled={!!ocupado} onClick={() => accion(`plan-${c.id}`, { accion: "planificar", camionetaId: c.id })}>
                        {ocupado === `plan-${c.id}` ? "Calculando…" : "Recalcular"}
                      </Boton>
                      <Link href={`/conductor/${c.id}`} target="_blank" className="text-xs font-medium text-cielo hover:underline">Vista conductor ↗</Link>
                    </div>
                    {plan?.sugerencia && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{plan.sugerencia.mensaje}</p>}
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        </section>

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
          {PESTANAS.map((p) => (
            <button
              key={p}
              onClick={() => setPestana(p)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${pestana === p ? "bg-white text-tinta shadow-sm" : "text-gris hover:text-tinta"}`}
            >
              {p}
            </button>
          ))}
        </div>

        {pestana === "Asignación del día" && <Asignacion estado={estado} asignado={asignado} accion={accion} ocupado={ocupado} />}
        {pestana === "Fallas" && <Fallas estado={estado} accion={accion} ocupado={ocupado} asignado={asignado} />}
        {pestana === "Análisis de red" && <Analisis resultado={analisis} setResultado={setAnalisis} />}
        {pestana === "Historial y auditoría" && <Historial estado={estado} />}
        {pestana === "Parámetros" && <Parametros estado={estado} accion={accion} ocupado={ocupado} />}
      </main>
    </div>
  );
}
