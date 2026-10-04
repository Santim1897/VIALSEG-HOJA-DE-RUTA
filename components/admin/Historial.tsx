"use client";
import { hora } from "@/lib/tiempo";
import { Tarjeta, type EstadoAdmin } from "./comun";

const MOTIVO: Record<string, string> = {
  inicio: "Inicio de jornada", terminado: "Terminó un country", periodico: "Control de tráfico (10 min)",
  falla_nueva: "Falla nueva", admin: "Cambio del administrador", salteado: "Country salteado", manual: "Pedido del conductor",
};
const EVENTO: Record<string, string> = {
  inicio: "inició la jornada", ir: "salió hacia", llegue: "llegó a", terminado: "terminó en", salteado: "salteó",
  fin: "finalizó la jornada", falla_nueva: "Nueva falla en", asignacion: "Asignación actualizada",
};

export default function Historial({ estado }: { estado: EstadoAdmin }) {
  const { historial, eventos, cierres, camionetas, countries } = estado;
  const cam = (id?: string) => camionetas.find((c) => c.id === id);
  const nom = (id?: string) => countries.find((c) => c.id === id)?.nombre ?? "";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Tarjeta titulo="Planes calculados hoy (auditoría)">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-fondo text-left text-[11px] uppercase tracking-wider text-gris">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Hora</th>
                <th className="px-3 py-2.5 font-semibold">Camioneta</th>
                <th className="px-3 py-2.5 font-semibold">Motivo</th>
                <th className="px-3 py-2.5 font-semibold">Orden decidido</th>
                <th className="px-3 py-2.5 font-semibold">Total</th>
                <th className="px-3 py-2.5 font-semibold">Método</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {historial.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-gris">Todavía no se calculó ningún plan hoy.</td></tr>}
              {historial.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="tabular px-5 py-2.5">{hora(p.creadoAt)}</td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: cam(p.camionetaId)?.color }}>{cam(p.camionetaId)?.nombre}</td>
                  <td className="px-3 py-2.5">{MOTIVO[p.motivo] ?? p.motivo}</td>
                  <td className="px-3 py-2.5 text-xs">{p.paradas.map((x) => nom(x.countryId)).join(" → ") || "—"}{p.noVisitados.length > 0 && <span className="block text-amber-700">No entran: {p.noVisitados.map(nom).join(", ")}</span>}</td>
                  <td className="tabular px-3 py-2.5 text-xs text-gris">{Math.round(p.minutosTotales)} min · {p.kmTotales} km</td>
                  <td className="px-3 py-2.5 text-xs text-gris">{p.motor} · {p.estado.toLowerCase()} · {p.segundos}s<span className="block">{p.proveedor}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="space-y-5">
        <Tarjeta titulo="Actividad">
          <ul className="max-h-[260px] divide-y divide-linea overflow-auto text-sm">
            {eventos.length === 0 && <li className="px-5 py-4 text-gris">Sin actividad todavía.</li>}
            {eventos.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-2.5">
                <span className="tabular w-11 shrink-0 text-xs text-gris">{hora(e.at)}</span>
                <span>
                  {cam(e.camionetaId) && <b className="font-semibold" style={{ color: cam(e.camionetaId)?.color }}>{cam(e.camionetaId)?.nombre} </b>}
                  {EVENTO[e.tipo] ?? e.tipo} {nom(e.countryId)}
                  {e.detalle && <span className="text-gris"> · {e.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta titulo="Cierres de mantenimiento">
          <ul className="max-h-[240px] divide-y divide-linea overflow-auto text-sm">
            {cierres.length === 0 && <li className="px-5 py-4 text-gris">Sin cierres todavía.</li>}
            {cierres.map((c) => (
              <li key={c.id} className="px-5 py-2.5">
                <p><b className="font-semibold">{nom(c.countryId)}</b> <span className="text-gris">· {cam(c.camionetaId)?.nombre} · {hora(c.at)}</span></p>
                <p className="text-xs text-gris">
                  {c.resultado === "resuelto" ? "Todo resuelto" : c.resultado === "parcial" ? "Resuelto en parte" : "Sin resolver"} · {c.fallasResueltas.length} resueltas
                  {c.trabajos.length > 0 && ` · ${c.trabajos.join(", ")}`}{c.conFoto && " · con foto"}{c.nota && ` · “${c.nota}”`}
                </p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
