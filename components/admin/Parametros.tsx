"use client";
import { useState } from "react";
import { nombreProducto, PRODUCTOS } from "@/lib/catalogo";
import type { Parametros as P, TipoFalla } from "@/lib/types";
import { Boton, campo, Tarjeta, type EstadoAdmin } from "./comun";

type Accion = (etiqueta: string, cuerpo: Record<string, unknown>) => Promise<unknown>;

const CAMPOS: [keyof P, string, string, number][] = [
  ["pesoUrgencia", "Peso de la urgencia", "0 = da igual cuándo se atiende · 1 = lo urgente primero sí o sí", 0.05],
  ["costoMinuto", "Costo por minuto de manejo", "En puntos de premio. Más alto = rutas más cortas", 0.01],
  ["minutosPorFalla", "Minutos por equipo reparado", "Tiempo de trabajo en sitio por falla", 1],
  ["factorHoras", "Peso del tiempo caído", "Cuánto sube el premio por cada 24 h sin funcionar", 0.05],
  ["factorFacturacion", "Peso del tamaño del cliente", "Premio extra para el cliente que más factura", 0.05],
  ["factorRotos", "Peso de % de equipos rotos", "Premio extra si el barrio tiene todo roto", 0.05],
  ["recalculoMin", "Recalcular cada (min)", "Control de tráfico durante la jornada", 1],
  ["umbralCambioMin", "Sugerir cambio de destino si ahorra (min)", "Para no cambiarle el destino al conductor por poco", 1],
  ["costoFijoCamioneta", "Costo fijo por camioneta (asignación)", "0 = salen todas las camionetas", 1],
];

export default function Parametros({ estado, accion, ocupado }: { estado: EstadoAdmin; accion: Accion; ocupado: string | null }) {
  const [p, setP] = useState<P>(estado.parametros);
  const [tipos, setTipos] = useState<TipoFalla[]>(estado.tipos);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="Pesos del modelo" accion={<Boton onClick={() => accion("parametros", { accion: "parametros", parametros: p, tipos })} disabled={!!ocupado}>Guardar</Boton>}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {CAMPOS.map(([k, titulo, ayuda, paso]) => (
            <label key={k} className="block text-xs font-semibold text-gris">
              {titulo}
              <input type="number" step={paso} min={0} className={`${campo} tabular mt-1 text-tinta`} value={p[k] as number}
                onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} />
              <span className="mt-1 block font-normal">{ayuda}</span>
            </label>
          ))}
          <label className="block text-xs font-semibold text-gris">
            Navegación del conductor
            <select className={`${campo} mt-1 text-tinta`} value={p.navegador} onChange={(e) => setP({ ...p, navegador: e.target.value as P["navegador"] })}>
              <option value="waze">Waze</option>
              <option value="google">Google Maps</option>
            </select>
          </label>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Catálogo de fallas: gravedad (1 a 5)">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-linea">
              {[...PRODUCTOS.map((x) => x.id), "todos" as const].map((prod) => (
                tipos.filter((t) => t.producto === prod).map((t, i) => (
                  <tr key={t.id}>
                    <td className="px-5 py-2 text-xs text-gris">{i === 0 ? (prod === "todos" ? "Todos" : nombreProducto(prod)) : ""}</td>
                    <td className="px-3 py-2">{t.nombre}</td>
                    <td className="px-3 py-2">
                      <input type="number" min={1} max={5} className="h-8 w-16 rounded-lg border border-linea px-2 text-sm" value={t.gravedad}
                        onChange={(e) => setTipos(tipos.map((x) => (x.id === t.id ? { ...x, gravedad: Number(e.target.value) } : x)))} />
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-linea px-5 py-3">
          <p className="text-xs text-gris">Borrador a validar con Vialseg. Las fallas nuevas toman la gravedad del catálogo.</p>
          <Boton variante="secundario" onClick={() => confirm("¿Reiniciar todos los datos de demo? Se pierden los cambios.") && accion("reset", { accion: "reiniciar_demo" })}>
            Reiniciar demo
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}
