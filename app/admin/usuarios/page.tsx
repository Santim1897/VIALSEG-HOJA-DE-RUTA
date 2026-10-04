"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/datos";
import { FormUsuario, ResetearAcceso } from "@/components/admin/Formularios";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, Confirmar, Etiqueta, Tarjeta, td, th, Vacio } from "@/components/ui";
import type { UsuarioPublico } from "@/lib/types";

export default function Usuarios() {
  const { estado, accion, avisar } = useAdmin();
  const e = estado!;
  const [form, setForm] = useState<{ rol: "admin" | "conductor"; usuario?: UsuarioPublico } | null>(null);
  const [reset, setReset] = useState<UsuarioPublico | null>(null);
  const [baja, setBaja] = useState<UsuarioPublico | null>(null);
  const camionetaHoy = (id: string) => e.camionetas.find((c) => c.id === e.jornadas.find((j) => j.conductorId === id)?.camionetaId);

  const tabla = (rol: "admin" | "conductor") => {
    const lista = e.usuarios.filter((u) => u.rol === rol).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
    return lista.length === 0 ? <Vacio titulo="Sin usuarios cargados" /> : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-fondo">
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>{rol === "admin" ? "Usuario" : "Teléfono"}</th>
              <th className={th}>{rol === "conductor" ? "Camioneta hoy" : "Alta"}</th>
              <th className={th}>Estado</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {lista.map((u) => {
              const cam = camionetaHoy(u.id);
              return (
                <tr key={u.id} className={u.activo ? "" : "opacity-50"}>
                  <td className={td}><p className="font-medium">{u.nombre}{u.id === e.yo.id && <span className="text-xs font-normal text-gris"> (vos)</span>}</p></td>
                  <td className={`${td} text-gris`}>{rol === "admin" ? u.usuario : u.telefono ?? "—"}</td>
                  <td className={td}>{rol === "conductor" ? (cam ? <span className="font-medium" style={{ color: cam.color }}>{cam.nombre}</span> : <span className="text-gris">—</span>) : <span className="text-gris">{new Date(u.creadoAt).toLocaleDateString("es-AR")}</span>}</td>
                  <td className={td}>{u.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>}</td>
                  <td className={`${td} whitespace-nowrap text-right text-xs`}>
                    <button className="mr-3 font-medium text-cielo hover:underline" onClick={() => setForm({ rol, usuario: u })}>Editar</button>
                    {u.activo && <button className="mr-3 font-medium text-gris hover:text-tinta" onClick={() => setReset(u)}>{rol === "admin" ? "Nueva contraseña" : "Nuevo PIN"}</button>}
                    {u.id !== e.yo.id && <button className="font-medium text-gris hover:text-tinta" onClick={() => setBaja(u)}>{u.activo ? "Desactivar" : "Reactivar"}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion="Conductores (entran con PIN desde el celular) y personal de administración." />
      <div className="space-y-5">
        <Tarjeta titulo="Conductores" accion={<Boton onClick={() => setForm({ rol: "conductor" })}>Nuevo conductor</Boton>}>{tabla("conductor")}</Tarjeta>
        <Tarjeta titulo="Administración" accion={<Boton variante="secundario" onClick={() => setForm({ rol: "admin" })}>Nuevo administrador</Boton>}>{tabla("admin")}</Tarjeta>
      </div>
      {form && <FormUsuario rol={form.rol} usuario={form.usuario} cerrar={() => setForm(null)} />}
      {reset && <ResetearAcceso usuario={reset} cerrar={() => setReset(null)} />}
      <Confirmar
        abierto={!!baja}
        peligro={baja?.activo}
        titulo={baja?.activo ? `Desactivar a ${baja?.nombre}` : `Reactivar a ${baja?.nombre}`}
        mensaje={baja?.activo ? "No va a poder ingresar y se cierra su sesión. El historial de sus jornadas se conserva." : "Va a poder volver a ingresar con su acceso actual."}
        textoAccion="Confirmar"
        cerrar={() => setBaja(null)}
        confirmar={async () => {
          try {
            await accion({ accion: "baja_usuario", id: baja!.id }, "Listo");
          } catch (err) {
            avisar(err instanceof Error ? err.message : "Error");
          }
          setBaja(null);
        }}
      />
    </>
  );
}
