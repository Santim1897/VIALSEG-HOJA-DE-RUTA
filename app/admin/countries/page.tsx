"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin, useAsignadoHoy } from "@/components/admin/datos";
import { FormCountry } from "@/components/admin/Formularios";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, Buscador, Etiqueta, Gravedad, Tarjeta, td, th, Vacio } from "@/components/ui";

export default function Countries() {
  const { estado } = useAdmin();
  const asignado = useAsignadoHoy();
  const router = useRouter();
  const e = estado!;
  const [busqueda, setBusqueda] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const lista = e.countries
    .filter((c) => (inactivos || c.activo) && `${c.nombre} ${c.zona}`.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const peso = (n: number) => `$ ${n.toLocaleString("es-AR")}`;

  return (
    <>
      <Encabezado
        titulo="Countries y equipos"
        descripcion={`${e.countries.filter((c) => c.activo).length} countries activos · ${e.equipos.filter((x) => x.activo).length} equipos instalados`}
        acciones={<Boton onClick={() => setNuevo(true)}>Nuevo country</Boton>}
      />
      <Tarjeta>
        <div className="flex flex-wrap items-center gap-3 border-b border-linea px-4 py-3">
          <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por nombre o zona…" />
          <label className="flex items-center gap-2 text-sm text-gris"><input type="checkbox" checked={inactivos} onChange={(ev) => setInactivos(ev.target.checked)} /> Mostrar dados de baja</label>
        </div>
        {lista.length === 0 ? (
          <Vacio titulo="No hay countries" texto="Cargá el primero con “Nuevo country”." />
        ) : (
          <>
          <ul className="divide-y divide-linea sm:hidden">
            {lista.map((c) => {
              const v = e.valoraciones[c.id];
              const cam = e.camionetas.find((k) => k.id === asignado[c.id]);
              return (
                <li key={c.id}>
                  <Link href={`/admin/countries/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-fondo">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.nombre}</span>
                      <span className="block text-xs text-gris">
                        {c.zona} · {e.equipos.filter((x) => x.countryId === c.id && x.activo).length} equipos · {v?.fallas.length ?? 0} con falla
                        {cam && <> · <span style={{ color: cam.color }}>{cam.nombre}</span></>}
                      </span>
                    </span>
                    {c.activo ? <Gravedad valor={v?.gravedadMax ?? 0} /> : <Etiqueta>Baja</Etiqueta>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Country</th><th className={th}>Equipos</th><th className={th}>Fallas abiertas</th><th className={th}>Estado</th><th className={th}>Abono mensual</th><th className={th}>Ruta de hoy</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {lista.map((c) => {
                  const v = e.valoraciones[c.id];
                  const cam = e.camionetas.find((k) => k.id === asignado[c.id]);
                  return (
                    <tr key={c.id} onClick={() => router.push(`/admin/countries/${c.id}`)} className="cursor-pointer hover:bg-fondo/70">
                      <td className={td}><Link href={`/admin/countries/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link><p className="text-xs text-gris">{c.zona}</p></td>
                      <td className={`${td} tabular`}>{e.equipos.filter((x) => x.countryId === c.id && x.activo).length}</td>
                      <td className={`${td} tabular`}>{v?.fallas.length ?? 0}{v?.pctRotos ? <span className="text-xs text-gris"> · {Math.round(v.pctRotos * 100)}% del parque</span> : null}</td>
                      <td className={td}>{c.activo ? <Gravedad valor={v?.gravedadMax ?? 0} /> : <Etiqueta>Dado de baja</Etiqueta>}</td>
                      <td className={`${td} tabular text-gris`}>{c.facturacion ? peso(c.facturacion) : "—"}</td>
                      <td className={td}>{cam ? <span className="font-medium" style={{ color: cam.color }}>{cam.nombre}</span> : <span className="text-gris">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Tarjeta>
      {nuevo && <FormCountry cerrar={() => setNuevo(false)} />}
    </>
  );
}
