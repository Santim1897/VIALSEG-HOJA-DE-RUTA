"use client";
import { useState } from "react";
import { NOMBRE_GRAVEDAD, nombreProducto } from "@/lib/catalogo";
import { duracion, hora, horasDesde } from "@/lib/tiempo";
import type { Falla } from "@/lib/types";
import { Boton, campo, Campo, Confirmar, Modal } from "../ui";
import { useAdmin } from "./datos";

export function NuevaFalla({ abierto, cerrar, countryId: inicialCountry = "", equipoId: inicialEquipo = "" }: { abierto: boolean; cerrar: () => void; countryId?: string; equipoId?: string }) {
  const { estado, accion, avisar } = useAdmin();
  const e = estado!;
  const [countryId, setCountryId] = useState(inicialCountry);
  const [equipoId, setEquipoId] = useState(inicialEquipo);
  const [tipoId, setTipoId] = useState("");
  const [gravedad, setGravedad] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const equipo = e.equipos.find((x) => x.id === equipoId);
  const tipos = e.tipos.filter((t) => equipo && (t.producto === equipo.producto || t.producto === "todos"));
  const tipo = e.tipos.find((t) => t.id === tipoId);

  async function guardar() {
    setOcupado(true);
    setError("");
    try {
      const r = await accion<{ asignadaA: string | null }>({ accion: "crear_falla", datos: { equipoId, tipoId, gravedad: gravedad ?? tipo?.gravedad, descripcion } });
      const cam = e.camionetas.find((c) => c.id === r.asignadaA);
      cerrar();
      setTipoId("");
      setGravedad(null);
      setDescripcion("");
      avisar(cam ? `Falla registrada. ${cam.nombre} la tiene en su ruta de hoy.` : "Falla registrada. El country no está en ninguna ruta de hoy: asignalo en Planificación.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Modal abierto={abierto} cerrar={cerrar} titulo="Registrar falla" pie={<><Boton variante="secundario" onClick={cerrar}>Cancelar</Boton><Boton onClick={guardar} disabled={!tipo || ocupado}>{ocupado ? "Guardando…" : "Registrar"}</Boton></>}>
      <div className="space-y-3">
        <Campo etiqueta="Country">
          <select className={campo} value={countryId} onChange={(ev) => { setCountryId(ev.target.value); setEquipoId(""); setTipoId(""); }}>
            <option value="">Elegí un country</option>
            {e.countries.filter((c) => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.zona}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Equipo">
          <select className={campo} value={equipoId} disabled={!countryId} onChange={(ev) => { setEquipoId(ev.target.value); setTipoId(""); }}>
            <option value="">Elegí el equipo</option>
            {e.equipos.filter((x) => x.countryId === countryId && x.activo).map((x) => <option key={x.id} value={x.id}>{nombreProducto(x.producto)} · {x.ubicacion}{x.numeroSerie ? ` · ${x.numeroSerie}` : ""}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de falla">
          <select className={campo} value={tipoId} disabled={!equipo} onChange={(ev) => { setTipoId(ev.target.value); setGravedad(null); }}>
            <option value="">Elegí qué le pasa</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Gravedad" ayuda={tipo ? `Según el catálogo: ${NOMBRE_GRAVEDAD[tipo.gravedad]}. Podés ajustarla.` : undefined}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { g: 1, label: "Leve", color: "#eab308" },
              { g: 3, label: "Media", color: "#f97316" },
              { g: 5, label: "Crítica", color: "#dc2626" },
            ].map(({ g, label, color }) => {
              const valorActual = gravedad ?? tipo?.gravedad;
              const activo = valorActual === g || (g === 1 && valorActual === 2) || (g === 5 && valorActual === 4);
              return (
                <button key={g} type="button" disabled={!tipo} onClick={() => setGravedad(g)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:opacity-40 ${activo ? "border-noche bg-noche text-white shadow-sm" : "border-linea hover:border-slate-300"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </button>
              );
            })}
          </div>
        </Campo>
        <Campo etiqueta="Detalle (opcional)">
          <textarea className={`${campo} h-20 py-2`} value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} placeholder="Ej.: aviso de la guardia, display apagado desde anoche" />
        </Campo>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

export function DetalleFalla({ falla, cerrar }: { falla: Falla | null; cerrar: () => void }) {
  const { estado, accion, avisar } = useAdmin();
  const e = estado!;
  const [gravedad, setGravedad] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState(false);
  if (!falla) return null;
  const equipo = e.equipos.find((x) => x.id === falla.equipoId);
  const country = e.countries.find((x) => x.id === falla.countryId);
  const creador = e.usuarios.find((u) => u.id === falla.creadaPor)?.nombre;
  const ejecutar = async (datos: Record<string, unknown>, msj: string) => {
    try {
      await accion({ accion: "editar_falla", id: falla.id, datos }, msj);
      cerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <>
      <Modal abierto titulo="Detalle de la falla" cerrar={cerrar} ancho="max-w-xl" pie={
        <>
          <Boton variante="peligro" className="mr-auto" onClick={() => setEliminar(true)}>Eliminar</Boton>
          {falla.estado === "abierta"
            ? <Boton variante="secundario" onClick={() => ejecutar({ estado: "resuelta" }, "Falla marcada como resuelta")}>Marcar resuelta</Boton>
            : <Boton variante="secundario" onClick={() => ejecutar({ estado: "abierta" }, "Falla reabierta")}>Reabrir</Boton>}
          <Boton disabled={gravedad === null && descripcion === null} onClick={() => ejecutar({ gravedad: gravedad ?? undefined, descripcion: descripcion ?? undefined }, "Cambios guardados")}>Guardar</Boton>
        </>
      }>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-xs text-gris">Country</dt><dd className="font-medium">{country?.nombre}</dd></div>
          <div><dt className="text-xs text-gris">Equipo</dt><dd className="font-medium">{equipo ? nombreProducto(equipo.producto) : "—"}</dd><dd className="text-xs text-gris">{equipo?.ubicacion}{equipo?.numeroSerie ? ` · ${equipo.numeroSerie}` : ""}</dd></div>
          <div><dt className="text-xs text-gris">Falla</dt><dd className="font-medium">{e.tipos.find((t) => t.id === falla.tipoId)?.nombre}</dd></div>
          <div><dt className="text-xs text-gris">Estado</dt><dd className="font-medium">{falla.estado === "abierta" ? `Abierta hace ${duracion(horasDesde(falla.abiertaAt))}` : `Resuelta ${falla.cerradaAt ? `el ${new Date(falla.cerradaAt).toLocaleDateString("es-AR")} ${hora(falla.cerradaAt)}` : ""}`}</dd></div>
          <div><dt className="text-xs text-gris">Registrada</dt><dd>{new Date(falla.abiertaAt).toLocaleDateString("es-AR")} {hora(falla.abiertaAt)}{creador ? ` por ${creador}` : falla.origen === "vialseg" ? " (plataforma Vialseg)" : ""}</dd></div>
        </dl>
        <div className="mt-5 space-y-3">
          <Campo etiqueta="Gravedad">
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((g) => (
                <button key={g} type="button" onClick={() => setGravedad(g)}
                  className={`rounded-lg border px-1 py-2 text-xs font-semibold ${(gravedad ?? falla.gravedad) === g ? "border-noche bg-noche text-white" : "border-linea hover:border-slate-300"}`}>
                  {NOMBRE_GRAVEDAD[g]}
                </button>
              ))}
            </div>
          </Campo>
          <Campo etiqueta="Detalle">
            <textarea className={`${campo} h-20 py-2`} value={descripcion ?? falla.descripcion ?? ""} onChange={(ev) => setDescripcion(ev.target.value)} />
          </Campo>
        </div>
      </Modal>
      <Confirmar abierto={eliminar} peligro titulo="Eliminar falla" textoAccion="Eliminar"
        mensaje="Usalo solo si la falla se cargó por error. Si el equipo se reparó, marcala como resuelta para que quede en el historial."
        cerrar={() => setEliminar(false)}
        confirmar={async () => {
          try {
            await accion({ accion: "eliminar_falla", id: falla.id }, "Falla eliminada");
            setEliminar(false);
            cerrar();
          } catch (err) {
            avisar(err instanceof Error ? err.message : "Error");
          }
        }} />
    </>
  );
}

