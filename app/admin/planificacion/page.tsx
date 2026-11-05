"use client";
import { useMemo, useState } from "react";
import { postJson, useAdmin } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, campo, Confirmar, Etiqueta, Gravedad, Tarjeta, td, th } from "@/components/ui";
import { duracion, fechaLarga, hoy } from "@/lib/tiempo";
import type { CriterioRuteo } from "@/lib/types";

type Borrador = Record<string, { conductorId: string | null; countries: string[]; criterioRuteo: CriterioRuteo }>;
const criterios: { id: CriterioRuteo; nombre: string }[] = [
  { id: "combinado", nombre: "Combinada" },
  { id: "facturacion", nombre: "Facturación por barrio" },
  { id: "equipos_rotos", nombre: "Cantidad de equipos rotos" },
  { id: "espera", nombre: "Fallas más antiguas" },
  { id: "gravedad", nombre: "Gravedad de las fallas" },
  { id: "combustible", nombre: "Combustible: más barrios, menos km" },
];
interface Sugerencia { asignacion: Record<string, string[]>; sin_asignar: string[]; carga_minutos: Record<string, number> }

const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00-03:00`);
  d.setDate(d.getDate() + n);
  return hoy(d);
};

export default function Planificacion() {
  const { estado, accion, setFechaPlan, avisar } = useAdmin();
  const e = estado!;
  const fecha = e.fechaPlan;
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [soloConFallas, setSoloConFallas] = useState(true);
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState("");

  const conductores = e.usuarios.filter((u) => u.rol === "conductor" && u.activo);
  const nombreC = (id: string) => e.countries.find((c) => c.id === id)?.nombre ?? id;
  const nombreU = (id?: string | null) => e.usuarios.find((u) => u.id === id)?.nombre ?? "Sin conductor";
  const jornada = (cam: string) => e.jornadasPlan.find((j) => j.camionetaId === cam)!;
  const bloqueados = (cam: string) => {
    const j = jornada(cam);
    return j.estado === "activa" ? new Set([...j.visitados, ...(j.enSitio ? [j.enSitio] : [])]) : new Set<string>();
  };

  const actual: Borrador = useMemo(
    () => Object.fromEntries(e.camionetas.map((c) => {
      const j = e.jornadasPlan.find((x) => x.camionetaId === c.id)!;
      return [c.id, { conductorId: j.conductorId ?? null, countries: j.countries, criterioRuteo: j.criterioRuteo ?? "combinado" }];
    })),
    [e],
  );
  const vista = borrador ?? actual;
  const camionetaDe = (country: string) => Object.entries(vista).find(([, v]) => v.countries.includes(country))?.[0] ?? "";

  const filas = e.countries
    .filter((c) => c.activo && (!soloConFallas || e.valoraciones[c.id]?.fallas.length || camionetaDe(c.id)))
    .sort((a, b) => (e.valoraciones[b.id]?.premio ?? 0) - (e.valoraciones[a.id]?.premio ?? 0));
  const sinAsignar = e.countries.filter((c) => c.activo && e.valoraciones[c.id]?.fallas.length && !camionetaDe(c.id));

  const mover = (country: string, cam: string) => {
    const b: Borrador = structuredClone(vista);
    for (const k of Object.keys(b)) b[k].countries = b[k].countries.filter((x) => x !== country);
    if (cam) b[cam].countries.push(country);
    setBorrador(b);
  };

  const heredado = e.jornadasPlan.some((j) => j.heredado);
  const cambios = e.camionetas.map((c) => {
    const a = actual[c.id];
    const n = vista[c.id];
    return {
      c,
      conductor: a.conductorId !== n.conductorId ? n.conductorId : undefined,
      mas: n.countries.filter((x) => !a.countries.includes(x)),
      menos: a.countries.filter((x) => !n.countries.includes(x)),
      criterio: a.criterioRuteo !== n.criterioRuteo ? n.criterioRuteo : undefined,
    };
  }).filter((x) => x.conductor !== undefined || x.mas.length || x.menos.length || x.criterio !== undefined);
  const puedeGuardar = cambios.length > 0 || heredado;

  async function sugerir() {
    setSugiriendo(true);
    try {
      const s = await postJson<Sugerencia>("/api/admin", {
        accion: "sugerir_asignacion",
        fecha,
        criterios: Object.fromEntries(e.camionetas.map((c) => [c.id, jornada(c.id).estado === "activa" ? actual[c.id].criterioRuteo : vista[c.id].criterioRuteo])),
      });
      setSugerencia(s);
      const b: Borrador = structuredClone(vista);
      for (const c of e.camionetas) {
        const activa = jornada(c.id).estado === "activa";
        const fijos = activa ? actual[c.id].countries : [...bloqueados(c.id)];
        const asignadosActivos = new Set(e.camionetas.filter((x) => jornada(x.id).estado === "activa").flatMap((x) => actual[x.id].countries));
        const sugeridos = (s.asignacion[c.id] ?? []).filter((id) => activa || !asignadosActivos.has(id));
        b[c.id].countries = activa ? [...actual[c.id].countries] : [...new Set([...fijos, ...sugeridos])];
      }
      setBorrador(b);
      avisar("Distribución sugerida aplicada al borrador. Revisala y guardá.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSugiriendo(false);
    }
  }

  async function guardar() {
    setError("");
    const resumen = cambios.map((x) => `${x.c.nombre}: ${[
      x.conductor !== undefined && `conductor ${nombreU(x.conductor)}`,
      x.mas.length && `+${x.mas.map(nombreC).join(", ")}`,
      x.menos.length && `−${x.menos.map(nombreC).join(", ")}`,
      x.criterio && `criterio ${criterios.find((k) => k.id === x.criterio)?.nombre}`,
    ].filter(Boolean).join("; ")}`).join(" | ");
    try {
      await accion({ accion: "plan_dia", fecha, planes: e.camionetas.map((c) => ({ camionetaId: c.id, ...vista[c.id] })), resumen }, "Plan guardado");
      setBorrador(null);
      setSugerencia(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
    setConfirmar(false);
  }

  return (
    <>
      <Encabezado
        titulo="Planificación"
        descripcion="Asigná conductores, barrios y el objetivo del recorrido para cada jornada."
        acciones={
          <div className="flex items-center gap-2">
            <Boton variante="secundario" disabled={!!borrador || fecha === hoy()} onClick={() => setFechaPlan(sumarDias(fecha, -1) < hoy() ? hoy() : sumarDias(fecha, -1))} aria-label="Día anterior">←</Boton>
            <input type="date" className={`${campo} w-40`} min={hoy()} value={fecha} disabled={!!borrador} onChange={(ev) => ev.target.value && setFechaPlan(ev.target.value)} />
            <Boton variante="secundario" disabled={!!borrador} onClick={() => setFechaPlan(sumarDias(fecha, 1))} aria-label="Día siguiente">→</Boton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linea bg-white px-4 py-3">
        <p className="text-sm">
          <b className="font-semibold">{fechaLarga(fecha).replace(/^./, (l) => l.toUpperCase())}</b>
          {fecha === hoy() && <span className="text-gris"> · hoy</span>}
          {!borrador && e.jornadasPlan.some((j) => j.heredado) && <span className="ml-2"><Etiqueta tono="azul">Copiado del último día planificado · revisalo y guardalo</Etiqueta></span>}
          {borrador && <span className="ml-2"><Etiqueta tono="ambar">Editando · {cambios.length} {cambios.length === 1 ? "camioneta modificada" : "camionetas modificadas"}</Etiqueta></span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {!borrador ? (
            <Boton onClick={() => setBorrador(structuredClone(actual))}>Editar plan</Boton>
          ) : (
            <>
              <Boton variante="secundario" onClick={sugerir} disabled={sugiriendo}>{sugiriendo ? "Calculando…" : "Recalcular distribución"}</Boton>
              <Boton variante="fantasma" onClick={() => { setBorrador(null); setSugerencia(null); setError(""); }}>Descartar</Boton>
              <Boton onClick={() => setConfirmar(true)} disabled={!puedeGuardar}>Revisar y guardar</Boton>
            </>
          )}
        </div>
      </div>
      {borrador && (
        <div className="mb-4 rounded-lg border border-azul/20 bg-white px-4 py-3 text-sm text-gris">
          <p>La distribución automática procesa las camionetas en este orden: <b>{e.camionetas.map((c) => c.nombre).join(" → ")}</b>. Cada country se asigna como máximo a una camioneta. Las camionetas con jornada iniciada mantienen su distribución y objetivo.</p>
        </div>
      )}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {e.camionetas.map((c) => {
          const v = vista[c.id];
          const j = jornada(c.id);
          const minutos = v.countries.reduce((t, x) => t + (e.valoraciones[x]?.servicioMin ?? 0), 0);
          const ocupados = new Set(Object.entries(vista).filter(([k]) => k !== c.id).map(([, x]) => x.conductorId));
          return (
            <Tarjeta key={c.id}>
              <div className="flex items-center justify-between gap-3 border-b border-linea px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-6 w-1.5 rounded-full" style={{ background: c.color }} />
                  <span className="font-semibold">{c.nombre}</span>
                </div>
                {j.estado === "activa" ? <Etiqueta tono="verde">En ruta</Etiqueta> : j.estado === "finalizada" ? <Etiqueta>Finalizada</Etiqueta> : null}
              </div>
              <div className="space-y-3 p-4">
                {borrador ? (
                  <select className={campo} value={v.conductorId ?? ""} disabled={j.estado === "activa"}
                    onChange={(ev) => setBorrador({ ...vista, [c.id]: { ...v, conductorId: ev.target.value || null } })}>
                    <option value="">Sin conductor</option>
                    {conductores.map((u) => <option key={u.id} value={u.id} disabled={ocupados.has(u.id)}>{u.nombre}{ocupados.has(u.id) ? " (en otra camioneta)" : ""}</option>)}
                  </select>
                ) : (
                  <p className="text-sm"><span className="text-gris">Conductor: </span><b className={`font-medium ${v.conductorId ? "" : "text-amber-700"}`}>{nombreU(v.conductorId)}</b></p>
                )}
                {borrador ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-gris">Objetivo del recorrido para esta jornada</span>
                    <select className={campo} value={v.criterioRuteo} disabled={j.estado === "activa"} onChange={(ev) => { setSugerencia(null); setBorrador({ ...vista, [c.id]: { ...v, criterioRuteo: ev.target.value as CriterioRuteo } }); }}>
                      {criterios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm"><span className="text-gris">Objetivo: </span><b className="font-medium">{criterios.find((x) => x.id === v.criterioRuteo)?.nombre ?? criterios[0].nombre}</b></p>
                )}
                {v.criterioRuteo === "combinado" && (
                  <p className="text-xs leading-relaxed text-gris">
                    Combinación de criterios con los ponderadores: gravedad (escala 1 a 5); antigüedad (+{Math.round(e.parametros.factorHoras * 100)}% por día, hasta 4 días); facturación (hasta +{Math.round(e.parametros.factorFacturacion * 100)}% según la facturación relativa); equipos rotos (hasta +{Math.round(e.parametros.factorRotos * 100)}% según la proporción de equipos rotos). Al ordenar la ruta también se pondera la demora ({e.parametros.pesoUrgencia}) y el manejo ({e.parametros.costoMinuto} puntos por minuto).
                  </p>
                )}
                {v.criterioRuteo === "combustible" && <p className="text-xs text-gris">Primero busca incluir la mayor cantidad de barrios posible; luego minimiza los kilómetros, incluido el regreso a la base.</p>}
                <p className="tabular text-xs text-gris">{v.countries.length} countries · {minutos} min de trabajo en sitio{sugerencia?.carga_minutos[c.id] ? ` · ~${Math.round(sugerencia.carga_minutos[c.id] / 6) / 10} h con manejo` : ""}</p>
                <ul className="space-y-1">
                  {v.countries.length === 0 && <li className="text-sm text-gris">Sin countries asignados.</li>}
                  {v.countries.map((x) => (
                    <li key={x} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{nombreC(x)}</span>
                      <span className="flex items-center gap-2">
                        {bloqueados(c.id).has(x) && <Etiqueta tono="azul">Atendido</Etiqueta>}
                        <Gravedad valor={e.valoraciones[x]?.gravedadMax ?? 0} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Tarjeta>
          );
        })}
      </section>

      {!borrador && sinAsignar.length > 0 && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {sinAsignar.length} countries con fallas no están en ninguna camioneta: {sinAsignar.map((c) => c.nombre).join(", ")}. Tocá <b>Editar plan</b> para asignarlos.
        </p>
      )}

      {borrador && (
        <Tarjeta
          titulo="Asignar countries"
          subtitulo="Ordenados por prioridad. La distribución de las camionetas en ruta permanece bloqueada hasta la próxima jornada."
          accion={<label className="flex items-center gap-2 text-sm text-gris"><input type="checkbox" checked={soloConFallas} onChange={(ev) => setSoloConFallas(ev.target.checked)} /> Solo con fallas abiertas</label>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Country</th><th className={th}>Fallas</th><th className={th}>Gravedad</th><th className={th}>Caído hace</th><th className={th}>Prioridad</th><th className={th}>Camioneta</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {filas.map((c) => {
                  const val = e.valoraciones[c.id];
                  const cam = camionetaDe(c.id);
                  const fijo = cam ? bloqueados(cam).has(c.id) || jornada(cam).estado === "activa" : false;
                  return (
                    <tr key={c.id} className="hover:bg-fondo/60">
                      <td className={td}><p className="font-medium">{c.nombre}</p><p className="text-xs text-gris">{c.zona}</p></td>
                      <td className={`${td} tabular`}>{val?.fallas.length ?? 0}<span className="text-xs text-gris"> / {val?.equipos} equipos</span></td>
                      <td className={td}><Gravedad valor={val?.gravedadMax ?? 0} /></td>
                      <td className={`${td} tabular text-gris`}>{val?.horasMax ? duracion(val.horasMax) : "—"}</td>
                      <td className={`${td} tabular font-semibold`}>{val?.premio.toFixed(1)}</td>
                      <td className={td}>
                        <select className="h-9 rounded-lg border border-linea bg-white px-2 text-sm" value={cam} disabled={fijo} onChange={(ev) => mover(c.id, ev.target.value)}
                          style={{ borderLeft: `4px solid ${e.camionetas.find((k) => k.id === cam)?.color ?? "#e3e8ef"}` }}>
                          <option value="">Sin asignar</option>
                          {e.camionetas.map((k) => <option key={k.id} value={k.id} disabled={jornada(k.id).estado === "activa"}>{k.nombre}{jornada(k.id).estado === "activa" ? " (jornada iniciada)" : ""}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <Confirmar
        abierto={confirmar}
        titulo="Confirmar cambios del plan"
        textoAccion="Guardar plan"
        cerrar={() => setConfirmar(false)}
        confirmar={guardar}
        mensaje={
          <div className="space-y-3">
            {heredado && cambios.length === 0 && <p>Se confirma el plan copiado del último día planificado, sin cambios.</p>}
            {cambios.map((x) => (
              <div key={x.c.id}>
                <p className="font-semibold" style={{ color: x.c.color }}>{x.c.nombre}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {x.conductor !== undefined && <li>Conductor: {nombreU(actual[x.c.id].conductorId)} → <b>{nombreU(x.conductor)}</b></li>}
                  {x.criterio !== undefined && <li>Objetivo del recorrido: <b>{criterios.find((k) => k.id === x.criterio)?.nombre}</b></li>}
                  {x.mas.length > 0 && <li className="text-green-700">Agrega: {x.mas.map(nombreC).join(", ")}</li>}
                  {x.menos.length > 0 && <li className="text-red-700">Quita: {x.menos.map(nombreC).join(", ")}</li>}
                </ul>
              </div>
            ))}
            {fecha === hoy() && e.jornadasPlan.some((j) => j.estado === "activa") && <p className="text-xs text-gris">La distribución y el objetivo de cada jornada iniciada quedan bloqueados. Guardar cambios de otras camionetas no modifica sus recorridos.</p>}
          </div>
        }
      />
    </>
  );
}
