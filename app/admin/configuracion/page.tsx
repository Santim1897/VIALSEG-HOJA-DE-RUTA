"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, campo, Campo, Modal, Tarjeta, td, th } from "@/components/ui";
import { NOMBRE_GRAVEDAD, nombreProducto, PRODUCTOS } from "@/lib/catalogo";
import type { Parametros as P, TipoFalla } from "@/lib/types";

const CAMPOS: [keyof P, string, string, number][] = [
  ["minutosPorFalla", "Trabajo por equipo (min)", "Tiempo de reparación en cada equipo con falla.", 1],
  ["minutosTrasladoInterno", "Manejo dentro del barrio por equipo (min)", "Traslado desde la guardia hasta cada equipo.", 1],
  ["recalculoMin", "Actualizar rutas cada (min)", "Con la jornada en curso, para tener en cuenta el tráfico.", 1],
  ["umbralCambioMin", "Sugerir otro destino si ahorra (min)", "Evita cambiarle el destino al conductor por poco.", 1],
  ["pesoUrgencia", "Prioridad a lo urgente", "0 = solo importa la distancia · 1 = lo más grave primero.", 0.05],
  ["costoMinuto", "Peso del tiempo de manejo", "Más alto = recorridos más cortos.", 0.01],
  ["factorHoras", "Peso del tiempo sin funcionar", "Cuánto sube la prioridad por cada día caído.", 0.05],
  ["factorFacturacion", "Peso del tamaño del cliente", "Prioridad extra para los clientes de mayor abono.", 0.05],
  ["factorRotos", "Peso de equipos rotos en el barrio", "Prioridad extra si gran parte del parque está caído.", 0.05],
  ["costoFijoCamioneta", "Costo de sacar una camioneta", "Usado al sugerir la distribución. 0 = salen todas.", 1],
];

export default function Configuracion() {
  const { estado, accion, avisar } = useAdmin();
  const e = estado!;
  const [p, setP] = useState<P>(e.parametros);
  const [tipos, setTipos] = useState<TipoFalla[]>(e.tipos);
  const [datos, setDatos] = useState<"vaciar_datos" | "datos_ejemplo" | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");

  const guardar = async () => {
    try {
      await accion({ accion: "parametros", parametros: p, tipos }, "Configuración guardada");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <>
      <Encabezado titulo="Configuración" acciones={<Boton onClick={guardar}>Guardar cambios</Boton>} />
      <Tarjeta titulo="Cómo se decide el recorrido" subtitulo="Cada country recibe una prioridad; el sistema elige el orden que atiende más prioridad, antes y con menos manejo, dentro de la jornada." className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-fondo"><tr><th className={th}>Criterio</th><th className={th}>Cómo influye</th><th className={th}>Valor actual</th></tr></thead>
            <tbody className="divide-y divide-linea">
              {[
                ["Gravedad de cada falla", "Cada falla suma su gravedad (Leve 1 … Crítica 5), según el producto y lo que le pasa.", "Catálogo de abajo"],
                ["Tiempo sin funcionar", "Cada día que una falla lleva abierta aumenta su peso (tope: 4 días).", `+${Math.round(p.factorHoras * 100)}% por día (máx. +${Math.round(p.factorHoras * 400)}%)`],
                ["Tamaño del cliente", "Más prioridad cuanto mayor es el abono mensual del country (el de mayor abono recibe el máximo).", `hasta +${Math.round(p.factorFacturacion * 100)}%`],
                ["Equipos rotos en el barrio", "Más prioridad cuanto mayor es la proporción de equipos con falla sobre el total del country.", `hasta +${Math.round(p.factorRotos * 100)}% (todo roto)`],
                ["Urgencia", "Penaliza dejar para el final a los countries de mayor prioridad.", `${p.pesoUrgencia} (0 a 1)`],
                ["Tiempo de manejo entre countries", "Cada minuto de manejo resta. Con tráfico en vivo cuando está configurado el proveedor.", `${p.costoMinuto} puntos por minuto`],
                ["Tiempo en cada country", "Ingreso por guardia + por cada equipo: trabajo y manejo interno.", `ingreso del country + ${p.minutosPorFalla} + ${p.minutosTrasladoInterno} min por equipo`],
                ["Jornada", "El recorrido termina en la base dentro del horario de la camioneta; lo que no entra queda para otro día.", "Horario de cada camioneta (Flota)"],
              ].map(([c, d, v]) => (
                <tr key={c}><td className={`${td} font-medium`}>{c}</td><td className={`${td} text-gris`}>{d}</td><td className={`${td} tabular whitespace-nowrap`}>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Criterios de ruteo">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {CAMPOS.map(([k, titulo, ayuda, paso]) => (
              <Campo key={k} etiqueta={titulo} ayuda={ayuda}>
                <input type="number" step={paso} min={0} className={`${campo} tabular`} value={p[k] as number} onChange={(ev) => setP({ ...p, [k]: Number(ev.target.value) })} />
              </Campo>
            ))}
            <Campo etiqueta="App de navegación de los conductores">
              <select className={campo} value={p.navegador} onChange={(ev) => setP({ ...p, navegador: ev.target.value as P["navegador"] })}>
                <option value="waze">Waze</option>
                <option value="google">Google Maps</option>
              </select>
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Gravedad por tipo de falla" subtitulo="Las fallas nuevas toman este valor; se puede ajustar en cada una.">
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-linea">
                {[...PRODUCTOS.map((x) => x.id), "todos" as const].flatMap((prod) =>
                  tipos.filter((t) => t.producto === prod).map((t, i) => (
                    <tr key={t.id}>
                      <td className="w-44 px-5 py-2 text-xs font-medium text-gris">{i === 0 ? (prod === "todos" ? "Todos los equipos" : nombreProducto(prod)) : ""}</td>
                      <td className="px-3 py-2">{t.nombre}</td>
                      <td className="px-3 py-2">
                        <select className="h-8 rounded-lg border border-linea bg-white px-2 text-sm" value={t.gravedad} onChange={(ev) => setTipos(tipos.map((x) => (x.id === t.id ? { ...x, gravedad: Number(ev.target.value) } : x)))}>
                          {[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{NOMBRE_GRAVEDAD[g]}</option>)}
                        </select>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Datos" className="xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-2xl text-sm text-gris">
              Almacenamiento: <b className="text-tinta">{e.almacenamiento === "supabase" ? "base de datos en la nube (Supabase)" : "archivo local del servidor"}</b>.
              Para empezar a operar con los datos reales, borrá los datos actuales y cargá countries, equipos y conductores. Usuarios, flota y configuración se conservan.
            </p>
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => setDatos("datos_ejemplo")}>Cargar datos de ejemplo</Boton>
              <Boton variante="peligro" onClick={() => setDatos("vaciar_datos")}>Borrar datos operativos</Boton>
            </div>
          </div>
        </Tarjeta>
      </div>

      <Modal abierto={!!datos} titulo={datos === "vaciar_datos" ? "Borrar datos operativos" : "Cargar datos de ejemplo"} cerrar={() => { setDatos(null); setTexto(""); setError(""); }}
        pie={<Boton variante="peligro" disabled={texto !== "CONFIRMAR"} onClick={async () => {
          try {
            await accion({ accion: datos!, confirmacion: texto }, "Listo");
            setDatos(null);
            setTexto("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Error");
          }
        }}>Confirmar</Boton>}>
        <p className="text-sm">
          {datos === "vaciar_datos"
            ? "Se borran todos los countries, equipos, fallas, planificaciones, rutas, visitas y registros de actividad. No se puede deshacer."
            : "Se reemplazan todos los datos operativos y los conductores por los de ejemplo. Los administradores se conservan. No se puede deshacer."}
        </p>
        <p className="mt-3 text-sm">Escribí <b>CONFIRMAR</b> para continuar:</p>
        <input className={`${campo} mt-2`} value={texto} onChange={(ev) => setTexto(ev.target.value)} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
