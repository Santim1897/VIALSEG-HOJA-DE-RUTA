"use client";
import { useState } from "react";
import { useAdmin, useAsignadoHoy } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import MapaDinamico from "@/components/MapaDinamico";
import { Boton, Tarjeta, td, th } from "@/components/ui";
import { PRODUCTOS } from "@/lib/catalogo";

interface Resultado {
  centro: { lat: number; lon: number; tc: number; country_mas_cercano: string };
  candidatas: { id: string; nombre: string; lat: number; lon: number; tc: number; sobrecosto_pct: number }[];
}

export default function Analisis() {
  const { estado } = useAdmin();
  const asignado = useAsignadoHoy();
  const e = estado!;
  const [criterio, setCriterio] = useState<"equipos" | "fallas">("equipos");
  const [r, setR] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function calcular(c = criterio) {
    setCargando(true);
    setError("");
    try {
      const data = await (await fetch(`/api/admin?vista=analisis&criterio=${c}`)).json();
      if (data.error) throw new Error(data.error);
      setR(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  // Fallas por producto (abiertas y últimos 30 días)
  const porProducto = PRODUCTOS.map((p) => {
    const eqs = new Set(e.equipos.filter((x) => x.producto === p.id && x.activo).map((x) => x.id));
    const fs = e.fallas.filter((f) => eqs.has(f.equipoId));
    return { p, instalados: eqs.size, abiertas: fs.filter((f) => f.estado === "abierta").length, total: fs.length };
  });
  const maxTc = r?.candidatas.at(-1)?.tc ?? 1;

  return (
    <>
      <Encabezado titulo="Análisis" descripcion="Indicadores del parque instalado y ubicación de las bases." />

      <Tarjeta titulo="Fallas por producto" className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-fondo"><tr><th className={th}>Producto</th><th className={th}>Instalados</th><th className={th}>Con falla abierta</th><th className={th}>Tasa de falla</th><th className={th}>Fallas (30 días)</th></tr></thead>
            <tbody className="divide-y divide-linea">
              {porProducto.map(({ p, instalados, abiertas, total }) => (
                <tr key={p.id}>
                  <td className={td}><p className="font-medium">{p.nombre}</p><p className="text-xs text-gris">{p.familia}</p></td>
                  <td className={`${td} tabular`}>{instalados}</td>
                  <td className={`${td} tabular`}>{abiertas}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cielo" style={{ width: `${instalados ? (abiertas / instalados) * 100 : 0}%` }} /></div>
                      <span className="tabular text-xs text-gris">{instalados ? Math.round((abiertas / instalados) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className={`${td} tabular`}>{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Tarjeta titulo="Ubicación óptima de la base" subtitulo="Punto que minimiza la distancia total recorrida hacia los countries, ponderada por su demanda." className="overflow-hidden"
          accion={
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-fondo p-1 text-xs font-medium">
                {(["equipos", "fallas"] as const).map((c) => (
                  <button key={c} onClick={() => { setCriterio(c); if (r) calcular(c); }} className={`rounded-md px-3 py-1.5 ${criterio === c ? "bg-white shadow-sm" : "text-gris"}`}>
                    Según {c === "equipos" ? "equipos instalados" : "fallas"}
                  </button>
                ))}
              </div>
              <Boton onClick={() => calcular()} disabled={cargando}>{cargando ? "Calculando…" : "Calcular"}</Boton>
            </div>
          }
        >
          <div className="h-[460px]">
            <MapaDinamico alto="100%" datos={{
              countries: e.countries, fallas: e.fallas, equipos: e.equipos, tipos: e.tipos, camionetas: [], planes: {}, posiciones: {}, asignado, visibles: {},
              centro: r?.centro, extras: r?.candidatas.map((c) => ({ lat: c.lat, lon: c.lon, nombre: c.nombre })) ?? [],
            }} />
          </div>
        </Tarjeta>
        <Tarjeta titulo="Comparación de bases">
          {error && <p className="px-5 pt-4 text-sm text-red-600">{error}</p>}
          {!r ? <p className="p-5 text-sm text-gris">Tocá Calcular para comparar las bases posibles.</p> : (
            <div className="space-y-3 p-5">
              <p className="rounded-lg bg-fondo px-3 py-2.5 text-sm">El punto óptimo queda cerca de <b>{r.centro.country_mas_cercano}</b>.</p>
              {r.candidatas.map((c, i) => (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className={i === 0 ? "font-semibold" : ""}>{c.nombre}</span>
                    <span className="tabular text-xs text-gris">{c.sobrecosto_pct > 0 ? `+${c.sobrecosto_pct}% de recorrido` : "Óptimo"}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(c.tc / maxTc) * 100}%`, background: i === 0 ? "#83c735" : "#00a5d5" }} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs text-gris">Recorrido relativo al punto óptimo. No incluye costos del inmueble ni tráfico.</p>
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
