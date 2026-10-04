"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAdmin, useAsignadoHoy } from "@/components/admin/datos";
import { DetalleFalla, NuevaFalla } from "@/components/admin/FormFalla";
import { FormCountry, FormEquipo } from "@/components/admin/Formularios";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, Confirmar, Etiqueta, Gravedad, Tarjeta, td, th, Vacio } from "@/components/ui";
import { nombreProducto } from "@/lib/catalogo";
import { duracion, hora, horasDesde } from "@/lib/tiempo";
import type { Equipo, Falla } from "@/lib/types";

export default function DetalleCountry() {
  const { id } = useParams<{ id: string }>();
  const { estado, accion, avisar } = useAdmin();
  const asignado = useAsignadoHoy();
  const e = estado!;
  const c = e.countries.find((x) => x.id === id);
  const [editar, setEditar] = useState(false);
  const [equipo, setEquipo] = useState<Equipo | "nuevo" | null>(null);
  const [nuevaFalla, setNuevaFalla] = useState<string | null>(null);
  const [falla, setFalla] = useState<Falla | null>(null);
  const [baja, setBaja] = useState<{ tipo: "country" | "equipo"; id: string; activo: boolean } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);

  if (!c) return <Vacio titulo="Country no encontrado" accion={<Link href="/admin/countries" className="text-sm text-cielo underline">Volver al listado</Link>} />;

  const equipos = e.equipos.filter((x) => x.countryId === c.id && (verInactivos || x.activo));
  const abiertas = e.fallas.filter((f) => f.countryId === c.id && f.estado === "abierta");
  const historial = e.fallas.filter((f) => f.countryId === c.id && f.estado === "resuelta");
  const visitas = e.cierres.filter((x) => x.countryId === c.id);
  const cam = e.camionetas.find((k) => k.id === asignado[c.id]);

  return (
    <>
      <Link href="/admin/countries" className="mb-3 inline-block text-sm text-gris hover:text-tinta">← Countries</Link>
      <Encabezado
        titulo={c.nombre}
        descripcion={[c.zona, c.direccion, c.contacto].filter(Boolean).join(" · ")}
        acciones={
          <>
            <Boton variante="secundario" onClick={() => setBaja({ tipo: "country", id: c.id, activo: c.activo })}>{c.activo ? "Dar de baja" : "Reactivar"}</Boton>
            <Boton variante="secundario" onClick={() => setEditar(true)}>Editar datos</Boton>
            <Boton onClick={() => setNuevaFalla("")} disabled={!c.activo}>Registrar falla</Boton>
          </>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Equipos activos", e.equipos.filter((x) => x.countryId === c.id && x.activo).length],
          ["Fallas abiertas", abiertas.length],
          ["Visitas registradas", visitas.length],
          ["Ruta de hoy", cam ? cam.nombre : "Sin asignar"],
        ].map(([t, v]) => (
          <div key={t as string} className="rounded-xl border border-linea bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gris">{t}</p>
            <p className="tabular mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </section>
      {c.notas && <p className="mb-5 rounded-xl border border-linea bg-white px-4 py-3 text-sm"><span className="text-gris">Indicaciones para el conductor: </span>{c.notas}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Tarjeta
          titulo="Equipos instalados"
          accion={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gris"><input type="checkbox" checked={verInactivos} onChange={(ev) => setVerInactivos(ev.target.checked)} /> Ver retirados</label>
              <Boton variante="secundario" onClick={() => setEquipo("nuevo")} disabled={!c.activo}>Agregar equipo</Boton>
            </div>
          }
        >
          {equipos.length === 0 ? <Vacio titulo="Sin equipos cargados" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-fondo"><tr><th className={th}>Equipo</th><th className={th}>N.º de serie</th><th className={th}>Instalado</th><th className={th}>Estado</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-linea">
                  {equipos.map((x) => {
                    const fs = abiertas.filter((f) => f.equipoId === x.id);
                    return (
                      <tr key={x.id} className={x.activo ? "" : "opacity-50"}>
                        <td className={td}><p className="font-medium">{nombreProducto(x.producto)}</p><p className="text-xs text-gris">{x.ubicacion}</p></td>
                        <td className={`${td} tabular whitespace-nowrap text-gris`}>{x.numeroSerie ?? "—"}</td>
                        <td className={`${td} tabular text-gris`}>{x.instaladoAt ? new Date(`${x.instaladoAt}T12:00`).toLocaleDateString("es-AR") : "—"}</td>
                        <td className={td}>{!x.activo ? <Etiqueta>Retirado</Etiqueta> : fs.length ? <Gravedad valor={Math.max(...fs.map((f) => f.gravedad))} /> : <Etiqueta tono="verde">Funcionando</Etiqueta>}</td>
                        <td className={`${td} whitespace-nowrap text-right text-xs`}>
                          {x.activo && <button className="mr-3 font-medium text-cielo hover:underline" onClick={() => setNuevaFalla(x.id)}>Reportar falla</button>}
                          <button className="mr-3 font-medium text-gris hover:text-tinta" onClick={() => setEquipo(x)}>Editar</button>
                          <button className="font-medium text-gris hover:text-tinta" onClick={() => setBaja({ tipo: "equipo", id: x.id, activo: x.activo })}>{x.activo ? "Retirar" : "Reactivar"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <div className="space-y-5">
          <Tarjeta titulo={`Fallas abiertas (${abiertas.length})`}>
            {abiertas.length === 0 ? <p className="px-5 py-4 text-sm text-gris">Todo funcionando.</p> : (
              <ul className="divide-y divide-linea">
                {abiertas.map((f) => {
                  const eq = e.equipos.find((x) => x.id === f.equipoId);
                  return (
                    <li key={f.id} onClick={() => setFalla(f)} className="flex cursor-pointer items-start justify-between gap-3 px-5 py-3 text-sm hover:bg-fondo/70">
                      <span><b className="font-medium">{eq ? nombreProducto(eq.producto) : ""}</b> · {e.tipos.find((t) => t.id === f.tipoId)?.nombre}<span className="block text-xs text-gris">{eq?.ubicacion} · hace {duracion(horasDesde(f.abiertaAt))}</span></span>
                      <Gravedad valor={f.gravedad} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta titulo="Últimas visitas">
            {visitas.length === 0 ? <p className="px-5 py-4 text-sm text-gris">Sin visitas registradas.</p> : (
              <ul className="divide-y divide-linea text-sm">
                {visitas.slice(0, 8).map((v) => (
                  <li key={v.id} className="px-5 py-3">
                    <p>{new Date(v.at).toLocaleDateString("es-AR")} {hora(v.at)} · {e.usuarios.find((u) => u.id === v.conductorId)?.nombre ?? e.camionetas.find((k) => k.id === v.camionetaId)?.nombre}</p>
                    <p className="text-xs text-gris">{v.resultado === "resuelto" ? "Todo resuelto" : v.resultado === "parcial" ? "Resuelto en parte" : "Sin resolver"} · {v.trabajos.join(", ") || "sin detalle"}{v.nota ? ` · “${v.nota}”` : ""}
                      {v.conFoto && <> · <a href={`/api/admin/foto?id=${v.id}`} target="_blank" rel="noreferrer" className="text-cielo underline">ver foto</a></>}</p>
                  </li>
                ))}
              </ul>
            )}
            {historial.length > 0 && <p className="border-t border-linea px-5 py-2.5 text-xs text-gris">{historial.length} fallas resueltas en los últimos 30 días.</p>}
          </Tarjeta>
        </div>
      </div>

      {editar && <FormCountry country={c} cerrar={() => setEditar(false)} />}
      {equipo && <FormEquipo equipo={equipo === "nuevo" ? undefined : equipo} countryId={c.id} cerrar={() => setEquipo(null)} />}
      {nuevaFalla !== null && <NuevaFalla abierto countryId={c.id} equipoId={nuevaFalla} cerrar={() => setNuevaFalla(null)} />}
      {falla && <DetalleFalla key={falla.id} falla={falla} cerrar={() => setFalla(null)} />}
      <Confirmar
        abierto={!!baja}
        peligro={baja?.activo}
        titulo={baja?.tipo === "country" ? (baja.activo ? "Dar de baja el country" : "Reactivar el country") : baja?.activo ? "Retirar equipo" : "Reactivar equipo"}
        textoAccion={baja?.activo ? "Confirmar baja" : "Reactivar"}
        mensaje={baja?.activo ? "Deja de aparecer en el mapa y en la planificación. El historial se conserva y se puede reactivar." : "Vuelve a estar disponible."}
        cerrar={() => setBaja(null)}
        confirmar={async () => {
          try {
            await accion({ accion: baja!.tipo === "country" ? "baja_country" : "baja_equipo", id: baja!.id }, "Listo");
          } catch (err) {
            avisar(err instanceof Error ? err.message : "Error");
          }
          setBaja(null);
        }}
      />
    </>
  );
}
