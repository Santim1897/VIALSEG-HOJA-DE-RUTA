"use client";
import { useState } from "react";
import { Boton, Tarjeta } from "./comun";

export interface ResultadoAnalisis {
  centro: { lat: number; lon: number; tc: number; country_mas_cercano: string };
  candidatas: { id: string; nombre: string; lat: number; lon: number; tc: number; sobrecosto_pct: number }[];
}

export default function Analisis({ resultado, setResultado }: { resultado: ResultadoAnalisis | null; setResultado: (r: ResultadoAnalisis) => void }) {
  const [criterio, setCriterio] = useState<"equipos" | "fallas">("equipos");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function calcular(c = criterio) {
    setCargando(true);
    setError("");
    try {
      const data = await (await fetch(`/api/analisis?criterio=${c}`)).json();
      if (data.error) throw new Error(data.error);
      setResultado(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  const peor = resultado?.candidatas.at(-1)?.tc ?? 1;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Tarjeta titulo="¿Dónde conviene tener la base? · Modelo de centro de gravedad">
        <div className="space-y-4 p-5 text-sm leading-relaxed">
          <p>
            Busca el punto que minimiza el costo total de transporte hacia todos los countries,
            ponderando cada uno por su demanda de visitas (unidad Redes de Distribución).
          </p>
          <pre className="overflow-x-auto rounded-xl bg-noche px-4 py-3 font-mono text-[13px] text-slate-100">
{`min TC = Σₙ dₙ · Dₙ · Fₙ
dₙ = √((x − xₙ)² + (y − yₙ)²)   [km]
Dₙ = ${criterio === "equipos" ? "equipos instalados" : "fallas registradas"} del country n
Fₙ = costo por km (igual para todos)`}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-fondo p-1 text-xs font-medium">
              {(["equipos", "fallas"] as const).map((c) => (
                <button key={c} onClick={() => { setCriterio(c); if (resultado) calcular(c); }}
                  className={`rounded-md px-3 py-1.5 ${criterio === c ? "bg-white shadow-sm" : "text-gris"}`}>
                  Ponderar por {c}
                </button>
              ))}
            </div>
            <Boton onClick={() => calcular()} disabled={cargando}>{cargando ? "Calculando…" : resultado ? "Recalcular" : "Calcular"}</Boton>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          {resultado && (
            <p className="rounded-xl bg-lima/10 px-4 py-3">
              El centro de gravedad queda cerca de <b>{resultado.centro.country_mas_cercano}</b> ({resultado.centro.lat}, {resultado.centro.lon}). Está marcado en el mapa.
              Como dice la teoría, es un punto de partida: después se evalúan sitios reales.
            </p>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Bases candidatas: costo total de transporte">
        {!resultado ? (
          <p className="p-5 text-sm text-gris">Calculá el modelo para comparar las bases.</p>
        ) : (
          <div className="space-y-3 p-5">
            {resultado.candidatas.map((c, i) => (
              <div key={c.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className={i === 0 ? "font-semibold" : ""}>{c.nombre}</span>
                  <span className="tabular text-xs text-gris">TC {c.tc.toLocaleString("es-AR")} · {c.sobrecosto_pct > 0 ? `+${c.sobrecosto_pct}%` : "óptimo"} vs. centro</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.tc / peor) * 100}%`, background: i === 0 ? "#83c735" : c.id === "martinez" ? "#f59e0b" : "#00a5d5" }} />
                </div>
              </div>
            ))}
            <p className="pt-2 text-xs text-gris">
              TC en km ponderados (unidades relativas). El costo real suma tiempo de manejo, tráfico y costos del sitio (alquiler, seguridad).
            </p>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
