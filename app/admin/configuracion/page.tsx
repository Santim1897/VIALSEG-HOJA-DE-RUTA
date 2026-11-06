"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import { Boton, campo, Campo, Modal, Tarjeta, td, th } from "@/components/ui";
import { NOMBRE_GRAVEDAD, nombreProducto, PRODUCTOS } from "@/lib/catalogo";
import type { Parametros as P, TipoFalla } from "@/lib/types";

const CAMPOS_COMBINADA: [keyof P, string, string, number][] = [
  ["factorFacturacion", "Peso de facturación del country", "Porcentaje de facturación relativa al mayor country disponible.", 0.05],
  ["factorHoras", "Peso del tiempo sin funcionar", "Promedio de días de falla sobre 7, con tope de 100%.", 0.05],
  ["factorRotos", "Peso de cantidad de equipos rotos", "Porcentaje respecto del country con más equipos rotos.", 0.05],
  ["factorGravedad", "Peso de gravedad de fallas", "Porcentaje de gravedad acumulada respecto del máximo disponible.", 0.05],
];

function ayudaPonderador(k: keyof P, ayuda: string, p: P) {
  const formato = (valor: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor);
  if (k === "factorHoras") return `${ayuda} (peso: ${formato(p.factorHoras)}).`;
  if (k === "factorFacturacion") return `${ayuda} (peso: ${formato(p.factorFacturacion)}).`;
  if (k === "factorRotos") return `${ayuda} (peso: ${formato(p.factorRotos)}).`;
  if (k === "factorGravedad") return `${ayuda} (peso: ${formato(p.factorGravedad)}).`;
  return ayuda;
}

const CAMPOS_PLANIFICACION: [keyof P, string, string, number][] = [
  ["minutosPorFalla", "Tiempo por equipo (min)", "Por cada equipo con falla: reparación y manejo dentro del barrio.", 1],
  ["recalculoMin", "Actualizar rutas cada (min)", "Con la jornada en curso, para tener en cuenta el tráfico.", 1],
  ["umbralCambioMin", "Sugerir otro destino si ahorra (min)", "Evita cambiarle el destino al conductor por poco.", 1],
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
  const [guardando, setGuardando] = useState(false);
  const [aplicandoGravedad, setAplicandoGravedad] = useState(false);

  const guardar = async () => {
    if (guardando || aplicandoGravedad) return;
    setGuardando(true);
    try {
      await accion({ accion: "parametros", parametros: p, tipos }, "Configuración guardada");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    } finally {
      setGuardando(false);
    }
  };

  const guardarCriterios = async () => {
    if (guardando || aplicandoGravedad) return;
    setGuardando(true);
    try {
      const parametrosCombinada = Object.fromEntries(CAMPOS_COMBINADA.map(([k]) => [k, p[k]]));
      await accion({ accion: "parametros", parametros: parametrosCombinada }, "Criterios combinados guardados");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    } finally {
      setGuardando(false);
    }
  };

  const guardarPlanificacion = async () => {
    if (guardando || aplicandoGravedad) return;
    setGuardando(true);
    try {
      const parametrosPlanificacion = Object.fromEntries([
        ...CAMPOS_PLANIFICACION.map(([k]) => [k, p[k]]),
        ["navegador", p.navegador],
      ]);
      await accion({ accion: "parametros", parametros: parametrosPlanificacion }, "Parámetros de ruteo y planificación guardados");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    } finally {
      setGuardando(false);
    }
  };

  const aplicarGravedad = async () => {
    if (guardando || aplicandoGravedad) return;
    setAplicandoGravedad(true);
    try {
      await accion({ accion: "aplicar_gravedad", tipos }, "Gravedad actualizada en las fallas abiertas");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    } finally {
      setAplicandoGravedad(false);
    }
  };

  return (
    <>
      <Encabezado titulo="Configuración" acciones={<Boton onClick={guardar} disabled={guardando || aplicandoGravedad}>
        {guardando && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
        {guardando ? "Guardando…" : "Guardar cambios"}
      </Boton>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Parámetros para la optimización combinada">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {CAMPOS_COMBINADA.map(([k, titulo, ayuda, paso]) => (
              <Campo key={k} etiqueta={titulo} ayuda={ayudaPonderador(k, ayuda, p)}>
                <input type="number" step={paso} min={0} className={`${campo} tabular`} value={p[k] as number} onChange={(ev) => setP({ ...p, [k]: Number(ev.target.value) })} />
              </Campo>
            ))}
          </div>
          <div className="flex justify-end border-t border-linea p-5">
            <Boton variante="secundario" onClick={guardarCriterios} disabled={guardando || aplicandoGravedad}>
              {guardando && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
              {guardando ? "Guardando…" : "Guardar criterios"}
            </Boton>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Parámetros de ruteo y planificación">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {CAMPOS_PLANIFICACION.map(([k, titulo, ayuda, paso]) => (
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
          <div className="flex justify-end border-t border-linea p-5">
            <Boton variante="secundario" onClick={guardarPlanificacion} disabled={guardando || aplicandoGravedad}>
              {guardando && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
              {guardando ? "Guardando…" : "Guardar parámetros"}
            </Boton>
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
                          {[1, 3, 5].map((g) => <option key={g} value={g}>{NOMBRE_GRAVEDAD[g]}</option>)}
                        </select>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-linea p-5">
            <p className="max-w-2xl text-sm text-gris">
              Al aplicar, las fallas abiertas tomarán la gravedad configurada para su tipo. Esto reemplaza cualquier gravedad ajustada individualmente en esas fallas; las fallas resueltas no cambian.
            </p>
            <Boton variante="secundario" onClick={aplicarGravedad} disabled={guardando || aplicandoGravedad}>
              {aplicandoGravedad && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
              {aplicandoGravedad ? "Aplicando…" : "Aplicar gravedad a fallas abiertas"}
            </Boton>
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
