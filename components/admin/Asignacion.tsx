"use client";
import { useMemo, useState } from "react";
import { duracion } from "@/lib/tiempo";
import { Boton, enviar, Gravedad, Tarjeta, type EstadoAdmin } from "./comun";

interface Sugerencia {
  estado: string;
  asignacion: Record<string, string[]>;
  sin_asignar: string[];
  carga_minutos: Record<string, number>;
  objetivo: number;
  segundos: number;
  proveedor: string;
}

type Accion = (etiqueta: string, cuerpo: Record<string, unknown>) => Promise<unknown>;

export default function Asignacion({ estado, asignado, accion, ocupado }: { estado: EstadoAdmin; asignado: Record<string, string>; accion: Accion; ocupado: string | null }) {
  const { countries, camionetas, valoraciones } = estado;
  const [borrador, setBorrador] = useState<Record<string, string>>(asignado);
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");

  const sugerido = useMemo(() => {
    const m: Record<string, string> = {};
    if (sugerencia) Object.entries(sugerencia.asignacion).forEach(([cam, ids]) => ids.forEach((id) => (m[id] = cam)));
    return m;
  }, [sugerencia]);

  const filas = countries
    .filter((c) => valoraciones[c.id]?.fallas.length || borrador[c.id])
    .sort((a, b) => (valoraciones[b.id]?.premio ?? 0) - (valoraciones[a.id]?.premio ?? 0));

  const cambios = filas.some((c) => (borrador[c.id] ?? "") !== (asignado[c.id] ?? ""));

  async function sugerir() {
    setCalculando(true);
    setError("");
    try {
      setSugerencia(await enviar<Sugerencia>("/api/admin", { accion: "sugerir_asignacion" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCalculando(false);
    }
  }

  function guardar() {
    const porCamioneta = Object.fromEntries(camionetas.map((c) => [c.id, filas.filter((f) => borrador[f.id] === c.id).map((f) => f.id)]));
    accion("asignar", { accion: "asignar", asignacion: porCamioneta });
  }

  return (
    <Tarjeta
      titulo="Qué countries hace cada camioneta hoy"
      accion={
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={sugerir} disabled={calculando}>{calculando ? "Resolviendo modelo…" : "Sugerir con el modelo"}</Boton>
          {sugerencia && <Boton variante="secundario" onClick={() => setBorrador({ ...sugerido })}>Aplicar sugerencia</Boton>}
          <Boton onClick={guardar} disabled={!cambios || !!ocupado}>{ocupado === "asignar" ? "Guardando…" : "Guardar asignación"}</Boton>
        </div>
      }
    >
      <div className="grid gap-3 border-b border-linea px-5 py-4 sm:grid-cols-3">
        {camionetas.map((c) => {
          const ids = filas.filter((f) => borrador[f.id] === c.id);
          const minutos = ids.reduce((t, f) => t + (valoraciones[f.id]?.servicioMin ?? 0), 0);
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-fondo px-3 py-2.5">
              <span className="h-8 w-1.5 rounded-full" style={{ background: c.color }} />
              <div className="text-sm">
                <p className="font-semibold">{c.nombre}</p>
                <p className="tabular text-xs text-gris">{ids.length} countries · {minutos} min de trabajo en sitio{sugerencia ? ` · sugerido ${sugerencia.carga_minutos[c.id] ?? 0} min con manejo` : ""}</p>
              </div>
            </div>
          );
        })}
      </div>

      {sugerencia && (
        <p className="border-b border-linea bg-cielo/5 px-5 py-3 text-xs leading-relaxed text-tinta">
          <b>Modelo de asignación de demanda</b> (maximización de beneficios, OR-Tools + SCIP): {sugerencia.estado.toLowerCase()} en {sugerencia.segundos} s.
          Cada country va a una sola camioneta, sin superar la jornada, maximizando premio − costo de manejo. Tiempos: {sugerencia.proveedor}.
          {sugerencia.sin_asignar.length > 0 && ` Quedan ${sugerencia.sin_asignar.length} countries sin lugar en la jornada de hoy.`}
        </p>
      )}
      {error && <p className="border-b border-linea bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-fondo text-left text-[11px] uppercase tracking-wider text-gris">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Country</th>
              <th className="px-3 py-2.5 font-semibold">Fallas</th>
              <th className="px-3 py-2.5 font-semibold">Gravedad máx.</th>
              <th className="px-3 py-2.5 font-semibold">Caído hace</th>
              <th className="px-3 py-2.5 font-semibold">Premio</th>
              <th className="px-3 py-2.5 font-semibold">Camioneta</th>
              {sugerencia && <th className="px-3 py-2.5 font-semibold">Sugerida</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {filas.map((c) => {
              const v = valoraciones[c.id];
              const sug = camionetas.find((k) => k.id === sugerido[c.id]);
              return (
                <tr key={c.id} className="hover:bg-fondo/60">
                  <td className="px-5 py-2.5">
                    <p className="font-medium">{c.nombre}</p>
                    <p className="text-xs text-gris">{c.zona}</p>
                  </td>
                  <td className="tabular px-3">{v?.fallas.length ?? 0} <span className="text-xs text-gris">de {v?.equipos} equipos</span></td>
                  <td className="px-3"><Gravedad valor={v?.gravedadMax ?? 0} /></td>
                  <td className="tabular px-3 text-gris">{v?.horasMax ? duracion(v.horasMax) : "—"}</td>
                  <td className="tabular px-3 font-semibold">{v?.premio.toFixed(1)}</td>
                  <td className="px-3">
                    <select
                      value={borrador[c.id] ?? ""}
                      onChange={(e) => setBorrador({ ...borrador, [c.id]: e.target.value })}
                      className="h-8 rounded-lg border border-linea bg-white px-2 text-sm"
                      style={{ borderLeft: `4px solid ${camionetas.find((k) => k.id === borrador[c.id])?.color ?? "#e3e8ef"}` }}
                    >
                      <option value="">Sin asignar</option>
                      {camionetas.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                    </select>
                  </td>
                  {sugerencia && (
                    <td className="px-3 text-xs">
                      {sug ? <span className="font-semibold" style={{ color: sug.color }}>{sug.nombre}</span> : <span className="text-gris">No entra hoy</span>}
                      {(sugerido[c.id] ?? "") !== (borrador[c.id] ?? "") && <span className="ml-1 text-amber-600">≠</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-gris">
        Premio = Σ gravedad × (1 + {estado.parametros.factorHoras} por cada 24 h caído, hasta 4 días) × facturación relativa × proporción de equipos rotos. Al guardar, las camionetas en ruta se recalculan solas.
      </p>
    </Tarjeta>
  );
}
