"use client";
import { useState } from "react";
import { NOMBRE_GRAVEDAD, nombreProducto } from "@/lib/catalogo";
import { duracion, horasDesde } from "@/lib/tiempo";
import { Boton, campo, Gravedad, Tarjeta, type EstadoAdmin } from "./comun";

type Accion = (etiqueta: string, cuerpo: Record<string, unknown>) => Promise<unknown>;

export default function Fallas({ estado, accion, ocupado, asignado }: { estado: EstadoAdmin; accion: Accion; ocupado: string | null; asignado: Record<string, string> }) {
  const { countries, equipos, tipos, fallas, camionetas } = estado;
  const [countryId, setCountryId] = useState("");
  const [equipoId, setEquipoId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [gravedad, setGravedad] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [filtro, setFiltro] = useState("");
  const [aviso, setAviso] = useState("");

  const equipo = equipos.find((e) => e.id === equipoId);
  const tiposEquipo = tipos.filter((t) => equipo && (t.producto === equipo.producto || t.producto === "todos"));
  const tipo = tipos.find((t) => t.id === tipoId);
  const abiertas = fallas
    .filter((f) => f.estado === "abierta" && (!filtro || f.countryId === filtro))
    .sort((a, b) => b.gravedad - a.gravedad || a.abiertaAt.localeCompare(b.abiertaAt));

  async function cargar(e: React.FormEvent) {
    e.preventDefault();
    const r = (await accion("crear_falla", { accion: "crear_falla", equipoId, tipoId, gravedad: gravedad ?? tipo?.gravedad, descripcion })) as { asignadaA?: string | null } | undefined;
    if (r) {
      const cam = camionetas.find((c) => c.id === r.asignadaA);
      setAviso(cam ? `Falla cargada. ${cam.nombre} tiene este country hoy: su ruta se recalculó.` : "Falla cargada. El country no está asignado hoy: asignalo en la pestaña Asignación.");
      setEquipoId("");
      setTipoId("");
      setGravedad(null);
      setDescripcion("");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Tarjeta titulo="Cargar una falla">
        <form onSubmit={cargar} className="space-y-3 p-5">
          <label className="block text-xs font-semibold text-gris">Country
            <select className={`${campo} mt-1`} value={countryId} onChange={(e) => { setCountryId(e.target.value); setEquipoId(""); setTipoId(""); }} required>
              <option value="">Elegí un country</option>
              {[...countries].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.zona}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-gris">Equipo
            <select className={`${campo} mt-1`} value={equipoId} onChange={(e) => { setEquipoId(e.target.value); setTipoId(""); }} required disabled={!countryId}>
              <option value="">Elegí el equipo</option>
              {equipos.filter((e) => e.countryId === countryId).map((e) => <option key={e.id} value={e.id}>{nombreProducto(e.producto)} · {e.ubicacion}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-gris">Tipo de falla
            <select className={`${campo} mt-1`} value={tipoId} onChange={(e) => { setTipoId(e.target.value); setGravedad(null); }} required disabled={!equipo}>
              <option value="">Elegí qué le pasa</option>
              {tiposEquipo.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          <div>
            <p className="text-xs font-semibold text-gris">Gravedad {tipo && <span className="font-normal">(sugerida por el catálogo: {tipo.gravedad})</span>}</p>
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((g) => {
                const activo = (gravedad ?? tipo?.gravedad) === g;
                return (
                  <button type="button" key={g} disabled={!tipo} onClick={() => setGravedad(g)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition disabled:opacity-40 ${activo ? "border-noche bg-noche text-white" : "border-linea bg-white hover:border-slate-300"}`}
                    title={NOMBRE_GRAVEDAD[g]}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-xs font-semibold text-gris">Detalle (opcional)
            <textarea className={`${campo} mt-1 h-20 py-2`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: avisó la guardia, display apagado desde anoche" />
          </label>
          <Boton type="submit" className="w-full" disabled={!tipo || !!ocupado}>{ocupado === "crear_falla" ? "Cargando…" : "Cargar falla"}</Boton>
          {aviso && <p className="rounded-lg bg-lima/10 px-3 py-2 text-xs text-green-800">{aviso}</p>}
        </form>
      </Tarjeta>

      <Tarjeta
        titulo={`Fallas abiertas (${abiertas.length})`}
        accion={
          <select className="h-8 rounded-lg border border-linea bg-white px-2 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos los countries</option>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        }
      >
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-fondo text-left text-[11px] uppercase tracking-wider text-gris">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Gravedad</th>
                <th className="px-3 py-2.5 font-semibold">Equipo y falla</th>
                <th className="px-3 py-2.5 font-semibold">Country</th>
                <th className="px-3 py-2.5 font-semibold">Caído hace</th>
                <th className="px-3 py-2.5 font-semibold">Origen</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {abiertas.map((f) => {
                const e = equipos.find((x) => x.id === f.equipoId);
                const c = countries.find((x) => x.id === f.countryId);
                const cam = camionetas.find((k) => k.id === asignado[f.countryId]);
                return (
                  <tr key={f.id} className="hover:bg-fondo/60">
                    <td className="px-5 py-2.5"><Gravedad valor={f.gravedad} /></td>
                    <td className="px-3">
                      <p className="font-medium">{e ? nombreProducto(e.producto) : "—"} · {tipos.find((t) => t.id === f.tipoId)?.nombre}</p>
                      <p className="text-xs text-gris">{e?.ubicacion}{f.descripcion ? ` · ${f.descripcion}` : ""}</p>
                    </td>
                    <td className="px-3">
                      <p>{c?.nombre}</p>
                      <p className="text-xs" style={{ color: cam?.color ?? "#64748b" }}>{cam?.nombre ?? "Sin asignar"}</p>
                    </td>
                    <td className="tabular px-3 text-gris">{duracion(horasDesde(f.abiertaAt))}</td>
                    <td className="px-3 text-xs capitalize text-gris">{f.origen}</td>
                    <td className="px-3 text-right">
                      <button className="text-xs font-medium text-cielo hover:underline" onClick={() => accion(`res-${f.id}`, { accion: "editar_falla", id: f.id, cambios: { estado: "resuelta" } })}>
                        Marcar resuelta
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
