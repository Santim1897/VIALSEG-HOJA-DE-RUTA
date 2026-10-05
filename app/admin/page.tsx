"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdmin, useAsignadoHoy } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import MapaDinamico from "@/components/MapaDinamico";
import { Boton, Confirmar, Etiqueta, Tarjeta } from "@/components/ui";
import { hora } from "@/lib/tiempo";

export default function EnVivo() {
  const { estado, accion, cargar, avisar } = useAdmin();
  const asignado = useAsignadoHoy();
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});
  const [forzar, setForzar] = useState<{ cam: string; country: string } | null>(null);
  const [calculando, setCalculando] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const e = estado!;
  const nombre = (id?: string | null) => e.countries.find((c) => c.id === id)?.nombre ?? "";
  const conductores = useMemo(
    () => Object.fromEntries(e.jornadas.map((j) => [j.camionetaId, e.usuarios.find((u) => u.id === j.conductorId)?.nombre ?? ""])),
    [e],
  );
  const proveedor = Object.values(e.planes)[0]?.proveedor;
  const k = e.kpis;

  const actualizarTodo = async () => {
    setCalculando("todas");
    try {
      const r = await accion<{ recalculadas: number }>({ accion: "recalcular_todas" });
      setAhora(Date.now());
      avisar(r.recalculadas ? `Recorridos actualizados (${r.recalculadas} ${r.recalculadas === 1 ? "camioneta" : "camionetas"} en ruta)` : "Datos actualizados. No hay camionetas en ruta.");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
      await cargar();
    } finally {
      setCalculando(null);
    }
  };

  const recalcular = async (cam: string) => {
    setCalculando(cam);
    try {
      await accion({ accion: "planificar", camionetaId: cam }, "Ruta recalculada");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    } finally {
      setCalculando(null);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Operación en vivo"
        descripcion={proveedor ? `Tiempos de viaje: ${proveedor}` : undefined}
        acciones={<Boton variante="secundario" onClick={actualizarTodo} disabled={!!calculando}>{calculando === "todas" ? "Actualizando…" : "Actualizar recorridos"}</Boton>}
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Fallas abiertas", k.fallasAbiertas, `${k.criticas} críticas`, k.criticas > 0],
          ["Barrios hoy", k.barriosPlanificadosHoy ?? 0, `${k.barriosVisitadosHoy ?? 0} ya atendidos`, false],
          ["Pendientes próximos días", k.barriosPendientesProximos ?? 0, `de ${k.totalBarriosConFallas ?? 0} con fallas`, (k.barriosPendientesProximos ?? 0) > 0],
          ["Tiempo caído promedio", `${k.horasPromedioCaido} h`, "fallas abiertas", false],
          ["Km planificados", k.kmPlanificados, "Rutas vigentes", false],
          ["Resueltas hoy", k.resueltasHoy, k.tiempoRespuestaHoras ? `Respuesta prom. ${k.tiempoRespuestaHoras} h` : "Sin cierres todavía", false],
        ].map(([t, v, s, alerta]) => (
          <div key={t as string} className="min-w-0 rounded-xl border border-linea bg-white px-3 py-2.5 sm:px-4 sm:py-3.5">
            <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-gris sm:text-[11px] sm:tracking-wider">{t}</p>
            <p className={`tabular mt-0.5 text-lg font-semibold tracking-tight sm:mt-1 sm:text-2xl ${alerta ? "text-amber-600" : ""}`}>{v}</p>
            <p className="hidden truncate text-xs text-gris sm:block">{s}</p>
          </div>
        ))}
      </section>

      {k.countriesSinAsignar.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Hay {k.countriesSinAsignar.length} countries con fallas que hoy no están en ninguna ruta: {k.countriesSinAsignar.map(nombre).join(", ")}.</span>
          <Link href="/admin/planificacion" className="font-semibold underline">Ir a planificación</Link>
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Tarjeta
          className="flex flex-col overflow-hidden"
          titulo="Mapa de la red"
          accion={
            <div className="flex flex-wrap items-center gap-3 text-xs text-gris">
              {[
                { label: "Leve", color: "#eab308" },
                { label: "Media", color: "#f97316" },
                { label: "Crítica", color: "#dc2626" },
              ].map((item) => (
                <span key={item.label} className="hidden items-center gap-1 sm:inline-flex">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
              <span className="hidden h-4 w-px bg-linea sm:block" />
              {e.camionetas.map((c) => (
                <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-tinta">
                  <input type="checkbox" className="accent-noche" checked={visibles[c.id] !== false} onChange={(ev) => setVisibles({ ...visibles, [c.id]: ev.target.checked })} />
                  <span className="h-2 w-4 rounded-full" style={{ background: c.color }} />
                  {c.nombre}
                </label>
              ))}
            </div>
          }
        >
          <p className="border-b border-linea px-5 py-2 text-xs text-gris sm:hidden">Usá dos dedos para mover el mapa.</p>
          <div className="relative h-[300px] sm:h-[460px] xl:h-auto xl:min-h-[560px] xl:flex-1">
            <div className="absolute inset-0">
            <MapaDinamico
              alto="100%"
              datos={{
                countries: e.countries, fallas: e.fallas, equipos: e.equipos, tipos: e.tipos, camionetas: e.camionetas, planes: e.planes,
                posiciones: Object.fromEntries(e.jornadas.map((j) => [j.camionetaId, j.posicion])), asignado, visibles, conductores,
              }}
            />
            </div>
          </div>
        </Tarjeta>

        <div className="order-first space-y-3 xl:order-none">
          {e.camionetas.length === 0 && <Tarjeta><p className="p-5 text-sm text-gris">No hay camionetas activas. Cargalas en Flota.</p></Tarjeta>}
          {e.camionetas.map((c) => {
            const j = e.jornadas.find((x) => x.camionetaId === c.id)!;
            const plan = e.planes[c.id];
            const proxima = plan?.paradas[0];
            const total = j.countries.length;
            const pendientes = j.countries.filter((x) => !j.visitados.includes(x));
            return (
              <Tarjeta key={c.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-1.5 rounded-full" style={{ background: c.color }} />
                      <div>
                        <p className="font-semibold leading-tight">{c.nombre} {c.patente && <span className="text-xs font-normal text-gris">· {c.patente}</span>}</p>
                        <p className="text-xs text-gris">{conductores[c.id] || <Link href="/admin/planificacion" className="text-amber-700 underline">Sin conductor asignado</Link>}</p>
                      </div>
                    </div>
                    {j.estado === "activa" ? <Etiqueta tono="verde">En ruta</Etiqueta> : j.estado === "finalizada" ? <Etiqueta>Finalizada</Etiqueta> : <Etiqueta tono="ambar">Sin iniciar</Etiqueta>}
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${total ? (j.visitados.length / total) * 100 : 0}%`, background: c.color }} />
                  </div>
                  <p className="tabular mt-1.5 text-xs text-gris">
                    {j.visitados.length} de {total} countries{j.salteados.length > 0 && ` · ${j.salteados.length} salteados`}
                  </p>

                  <div className="mt-3 rounded-lg bg-fondo px-3 py-2.5 text-sm">
                    {j.enSitio ? (
                      <p><span className="text-gris">Trabajando en </span><b className="font-semibold">{nombre(j.enSitio)}</b></p>
                    ) : proxima ? (
                      <p>
                        <span className="text-gris">Próximo: </span><b className="font-semibold">{nombre(proxima.countryId)}</b>
                        <span className="tabular text-gris"> · llega {hora(proxima.eta)}</span>
                        {j.forzado === proxima.countryId && <span className="ml-1 text-xs font-semibold text-amber-700">(forzado)</span>}
                      </p>
                    ) : (
                      <p className="text-gris">{j.estado === "pendiente" ? "Espera que el conductor inicie la jornada" : plan ? "Sin visitas pendientes" : "Sin ruta calculada"}</p>
                    )}
                    {plan && <p className="tabular mt-0.5 text-xs text-gris">{plan.paradas.length} paradas · {plan.kmTotales} km · {Math.round(plan.minutosTotales / 6) / 10} h · calculado {hora(plan.creadoAt)}</p>}
                    {plan && j.estado === "activa" && ahora - new Date(plan.creadoAt).getTime() > e.parametros.recalculoMin * 2 * 60_000 && (
                      <p className="mt-1.5 text-xs font-medium text-amber-700">Recorrido desactualizado: las horas pueden no ser reales. Tocá Recalcular.</p>
                    )}
                    {plan?.sugerencia && <p className="mt-1.5 text-xs text-amber-800">{plan.sugerencia.mensaje}</p>}
                  </div>

                  {j.estado === "activa" && (
                    <div className="mt-3 flex items-center gap-2">
                      <select
                        aria-label="Próximo destino"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 text-sm"
                        value={j.forzado ?? ""}
                        onChange={(ev) => setForzar({ cam: c.id, country: ev.target.value })}
                      >
                        <option value="">Próximo destino: automático</option>
                        {pendientes.map((x) => <option key={x} value={x}>Enviar primero a {nombre(x)}</option>)}
                      </select>
                      <Boton variante="secundario" disabled={!!calculando} onClick={() => recalcular(c.id)}>
                        {calculando === c.id ? "Calculando…" : "Recalcular"}
                      </Boton>
                    </div>
                  )}
                </div>
              </Tarjeta>
            );
          })}
        </div>
      </section>

      <Confirmar
        abierto={!!forzar}
        titulo="Cambiar el próximo destino"
        mensaje={forzar?.country
          ? <>La ruta de <b>{e.camionetas.find((c) => c.id === forzar.cam)?.nombre}</b> se va a recalcular para ir primero a <b>{nombre(forzar.country)}</b>, aunque no sea lo óptimo. El conductor lo ve al instante.</>
          : "La camioneta vuelve a seguir el orden óptimo calculado por el sistema."}
        cerrar={() => setForzar(null)}
        confirmar={async () => {
          try {
            await accion({ accion: "forzar", camionetaId: forzar!.cam, countryId: forzar!.country }, "Destino actualizado");
          } catch (err) {
            avisar(err instanceof Error ? err.message : "Error");
          }
          setForzar(null);
        }}
      />
    </>
  );
}
