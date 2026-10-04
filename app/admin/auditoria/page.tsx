"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import { Tarjeta, td, th, Vacio } from "@/components/ui";
import { hora } from "@/lib/tiempo";

const EVENTO: Record<string, string> = {
  inicio: "Inició la jornada", ir: "Salió hacia", llegue: "Llegó a", cancelar_llegada: "Canceló la llegada a", terminado: "Terminó en",
  salteado: "Salteó", deshacer: "Deshizo una acción en", fin: "Finalizó la jornada", reabrir: "Reabrió la jornada", falla_nueva: "Registró una falla en",
  falla_editada: "Editó una falla en", plan_dia: "Modificó la planificación", alta: "Alta", edicion: "Edición", baja: "Baja", sesion: "Sesión", datos: "Datos",
};
const MOTIVO: Record<string, string> = {
  inicio: "Inicio de jornada", terminado: "Visita terminada", periodico: "Actualización de tráfico", falla_nueva: "Falla nueva",
  admin: "Cambio de administración", salteado: "Country salteado", manual: "Pedido del conductor",
};

export default function Auditoria() {
  const { estado } = useAdmin();
  const e = estado!;
  const [pestana, setPestana] = useState<"actividad" | "rutas" | "visitas">("actividad");
  const cam = (id?: string) => e.todasLasCamionetas.find((c) => c.id === id);
  const usuario = (id?: string) => e.usuarios.find((u) => u.id === id)?.nombre;
  const country = (id?: string) => e.countries.find((c) => c.id === id)?.nombre ?? "";
  const fecha = (iso: string) => `${new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora(iso)}`;

  return (
    <>
      <Encabezado titulo="Auditoría" descripcion="Quién hizo qué, cada ruta calculada y cada visita registrada." />
      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-200/60 p-1 text-sm">
        {([["actividad", "Actividad"], ["rutas", "Rutas calculadas hoy"], ["visitas", "Visitas"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setPestana(k)} className={`rounded-md px-4 py-1.5 font-medium ${pestana === k ? "bg-white shadow-sm" : "text-gris"}`}>{t}</button>
        ))}
      </div>

      <Tarjeta>
        {pestana === "actividad" && (e.eventos.length === 0 ? <Vacio titulo="Sin actividad registrada" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Fecha</th><th className={th}>Usuario</th><th className={th}>Acción</th><th className={th}>Detalle</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {e.eventos.map((ev) => (
                  <tr key={ev.id}>
                    <td className={`${td} tabular whitespace-nowrap text-gris`}>{fecha(ev.at)}</td>
                    <td className={td}>{usuario(ev.usuarioId) ?? "Sistema"}{cam(ev.camionetaId) && <span className="block text-xs" style={{ color: cam(ev.camionetaId)?.color }}>{cam(ev.camionetaId)?.nombre}</span>}</td>
                    <td className={td}>{EVENTO[ev.tipo] ?? ev.tipo} <b className="font-medium">{country(ev.countryId)}</b></td>
                    <td className={`${td} text-gris`}>{ev.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {pestana === "rutas" && (e.historial.length === 0 ? <Vacio titulo="Todavía no se calculó ninguna ruta hoy" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Hora</th><th className={th}>Camioneta</th><th className={th}>Motivo</th><th className={th}>Orden</th><th className={th}>Total</th><th className={th}>Cálculo</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {e.historial.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className={`${td} tabular`}>{hora(p.creadoAt)}</td>
                    <td className={`${td} font-medium`} style={{ color: cam(p.camionetaId)?.color }}>{cam(p.camionetaId)?.nombre}</td>
                    <td className={td}>{MOTIVO[p.motivo] ?? p.motivo}</td>
                    <td className={`${td} text-xs`}>{p.paradas.map((x) => country(x.countryId)).join(" → ") || "—"}{p.noVisitados.length > 0 && <span className="block text-amber-700">No entran hoy: {p.noVisitados.map(country).join(", ")}</span>}</td>
                    <td className={`${td} tabular whitespace-nowrap text-xs text-gris`}>{Math.round(p.minutosTotales)} min · {p.kmTotales} km</td>
                    <td className={`${td} text-xs text-gris`}>{p.motor} · {p.segundos}s<span className="block">{p.proveedor}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {pestana === "visitas" && (e.cierres.length === 0 ? <Vacio titulo="Sin visitas registradas" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Fecha</th><th className={th}>Country</th><th className={th}>Conductor</th><th className={th}>Resultado</th><th className={th}>Trabajos</th><th className={th}>Comentario</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-linea">
                {e.cierres.map((c) => (
                  <tr key={c.id}>
                    <td className={`${td} tabular whitespace-nowrap text-gris`}>{fecha(c.at)}</td>
                    <td className={`${td} font-medium`}>{country(c.countryId)}</td>
                    <td className={td}>{usuario(c.conductorId) ?? cam(c.camionetaId)?.nombre}</td>
                    <td className={td}>{c.resultado === "resuelto" ? "Todo resuelto" : c.resultado === "parcial" ? "En parte" : "Sin resolver"}<span className="block text-xs text-gris">{c.fallasResueltas.length} resueltas · {c.fallasPendientes.length} pendientes</span></td>
                    <td className={`${td} text-gris`}>{c.trabajos.join(", ") || "—"}</td>
                    <td className={`${td} text-gris`}>{c.nota ?? "—"}</td>
                    <td className={td}>{c.conFoto && <a href={`/api/admin/foto?id=${c.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-cielo hover:underline">Ver foto</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Tarjeta>
    </>
  );
}
