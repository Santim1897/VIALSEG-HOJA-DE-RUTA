"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/datos";
import { FormCamioneta } from "@/components/admin/Formularios";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, Confirmar, Etiqueta, Tarjeta, td, th, Vacio } from "@/components/ui";
import type { Camioneta } from "@/lib/types";

export default function Flota() {
  const { estado, accion, avisar } = useAdmin();
  const e = estado!;
  const [form, setForm] = useState<Camioneta | "nueva" | null>(null);
  const [baja, setBaja] = useState<Camioneta | null>(null);
  const conductorHoy = (id: string) => e.usuarios.find((u) => u.id === e.jornadas.find((j) => j.camionetaId === id)?.conductorId)?.nombre;

  return (
    <>
      <Encabezado titulo="Flota" descripcion="Camionetas, bases de salida y horario de jornada." acciones={<Boton onClick={() => setForm("nueva")}>Nueva camioneta</Boton>} />
      <Tarjeta>
        {e.todasLasCamionetas.length === 0 ? <Vacio titulo="No hay camionetas" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Camioneta</th><th className={th}>Base</th><th className={th}>Jornada</th><th className={th}>Conductor hoy</th><th className={th}>Estado</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-linea">
                {e.todasLasCamionetas.map((c) => (
                  <tr key={c.id} className={c.activa ? "" : "opacity-50"}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-1.5 rounded-full" style={{ background: c.color }} />
                        <div><p className="font-medium">{c.nombre}</p><p className="text-xs text-gris">{c.patente || "Sin patente cargada"}</p></div>
                      </div>
                    </td>
                    <td className={td}>{c.base.nombre}</td>
                    <td className={`${td} tabular`}>{c.inicio} a {c.fin}</td>
                    <td className={td}>{conductorHoy(c.id) ?? <span className="text-gris">—</span>}</td>
                    <td className={td}>{c.activa ? <Etiqueta tono="verde">Activa</Etiqueta> : <Etiqueta>Fuera de servicio</Etiqueta>}</td>
                    <td className={`${td} whitespace-nowrap text-right text-xs`}>
                      <button className="mr-3 font-medium text-cielo hover:underline" onClick={() => setForm(c)}>Editar</button>
                      <button className="font-medium text-gris hover:text-tinta" onClick={() => setBaja(c)}>{c.activa ? "Sacar de servicio" : "Reactivar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {form && <FormCamioneta camioneta={form === "nueva" ? undefined : form} cerrar={() => setForm(null)} />}
      <Confirmar
        abierto={!!baja}
        peligro={baja?.activa}
        titulo={baja?.activa ? `Sacar de servicio ${baja?.nombre}` : `Reactivar ${baja?.nombre}`}
        mensaje={baja?.activa ? "Deja de aparecer en la planificación y en el mapa. Se puede reactivar cuando vuelva del taller." : "Vuelve a estar disponible para planificar."}
        textoAccion="Confirmar"
        cerrar={() => setBaja(null)}
        confirmar={async () => {
          try {
            await accion({ accion: "baja_camioneta", id: baja!.id }, "Listo");
          } catch (err) {
            avisar(err instanceof Error ? err.message : "Error");
          }
          setBaja(null);
        }}
      />
    </>
  );
}
