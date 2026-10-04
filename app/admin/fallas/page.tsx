"use client";
import Link from "next/link";
import { useState } from "react";
import { useAdmin, useAsignadoHoy } from "@/components/admin/datos";
import { DetalleFalla, NuevaFalla } from "@/components/admin/FormFalla";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, Buscador, campo, Gravedad, Tarjeta, td, th, Vacio } from "@/components/ui";
import { nombreProducto, PRODUCTOS } from "@/lib/catalogo";
import { duracion, horasDesde } from "@/lib/tiempo";
import type { Falla } from "@/lib/types";

export default function Fallas() {
  const { estado } = useAdmin();
  const asignado = useAsignadoHoy();
  const e = estado!;
  const [estadoF, setEstadoF] = useState<"abierta" | "resuelta">("abierta");
  const [gravedad, setGravedad] = useState(0);
  const [producto, setProducto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState(false);
  const [detalle, setDetalle] = useState<Falla | null>(null);

  const equipo = (id: string) => e.equipos.find((x) => x.id === id);
  const country = (id: string) => e.countries.find((x) => x.id === id);
  const lista = e.fallas
    .filter((f) => f.estado === estadoF && f.gravedad >= gravedad && (!producto || equipo(f.equipoId)?.producto === producto))
    .filter((f) => !busqueda || country(f.countryId)?.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => (estadoF === "abierta" ? b.gravedad - a.gravedad || a.abiertaAt.localeCompare(b.abiertaAt) : (b.cerradaAt ?? "").localeCompare(a.cerradaAt ?? "")));

  return (
    <>
      <Encabezado titulo="Fallas" descripcion="Equipos con problemas reportados en los countries." acciones={<Boton onClick={() => setNueva(true)}>Registrar falla</Boton>} />
      <Tarjeta>
        <div className="flex flex-wrap items-center gap-2 border-b border-linea px-4 py-3">
          <div className="flex rounded-lg bg-fondo p-1 text-sm">
            {(["abierta", "resuelta"] as const).map((x) => (
              <button key={x} onClick={() => setEstadoF(x)} className={`rounded-md px-3 py-1.5 font-medium ${estadoF === x ? "bg-white shadow-sm" : "text-gris"}`}>
                {x === "abierta" ? `Abiertas (${e.fallas.filter((f) => f.estado === "abierta").length})` : "Resueltas (30 días)"}
              </button>
            ))}
          </div>
          <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar country…" />
          <select className={`${campo} w-auto`} value={producto} onChange={(ev) => setProducto(ev.target.value)}>
            <option value="">Todos los productos</option>
            {PRODUCTOS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select className={`${campo} w-auto`} value={gravedad} onChange={(ev) => setGravedad(Number(ev.target.value))}>
            <option value={0}>Toda gravedad</option>
            <option value={3}>Media o más</option>
            <option value={4}>Alta o crítica</option>
            <option value={5}>Solo crítica</option>
          </select>
        </div>
        {lista.length === 0 ? (
          <Vacio titulo={estadoF === "abierta" ? "No hay fallas abiertas con esos filtros" : "No hay fallas resueltas con esos filtros"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-fondo"><tr><th className={th}>Gravedad</th><th className={th}>Equipo y falla</th><th className={th}>Country</th><th className={th}>{estadoF === "abierta" ? "Caído hace" : "Duración"}</th><th className={th}>Ruta de hoy</th></tr></thead>
              <tbody className="divide-y divide-linea">
                {lista.map((f) => {
                  const eq = equipo(f.equipoId);
                  const c = country(f.countryId);
                  const cam = e.camionetas.find((k) => k.id === asignado[f.countryId]);
                  return (
                    <tr key={f.id} onClick={() => setDetalle(f)} className="cursor-pointer hover:bg-fondo/70">
                      <td className={td}><Gravedad valor={f.gravedad} /></td>
                      <td className={td}>
                        <p className="font-medium">{eq ? nombreProducto(eq.producto) : "—"} · {e.tipos.find((t) => t.id === f.tipoId)?.nombre}</p>
                        <p className="text-xs text-gris">{eq?.ubicacion}{f.descripcion ? ` · ${f.descripcion}` : ""}</p>
                      </td>
                      <td className={td}>
                        <Link href={`/admin/countries/${f.countryId}`} onClick={(ev) => ev.stopPropagation()} className="hover:underline">{c?.nombre}</Link>
                        <p className="text-xs text-gris">{c?.zona}</p>
                      </td>
                      <td className={`${td} tabular text-gris`}>
                        {f.estado === "abierta" ? duracion(horasDesde(f.abiertaAt)) : duracion((new Date(f.cerradaAt!).getTime() - new Date(f.abiertaAt).getTime()) / 3600_000)}
                      </td>
                      <td className={td}>{f.estado === "abierta" ? (cam ? <span className="font-medium" style={{ color: cam.color }}>{cam.nombre}</span> : <span className="text-amber-700">Sin asignar</span>) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {nueva && <NuevaFalla abierto cerrar={() => setNueva(false)} />}
      {detalle && <DetalleFalla key={detalle.id} falla={detalle} cerrar={() => setDetalle(null)} />}
    </>
  );
}
