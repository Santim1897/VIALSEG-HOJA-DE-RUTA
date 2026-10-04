"use client";
// Formularios de alta/edición: country, equipo, camioneta y usuario.
import { useState } from "react";
import { PRODUCTOS } from "@/lib/catalogo";
import type { Camioneta, Country, Equipo, Punto, UsuarioPublico } from "@/lib/types";
import { MapaSelectorDinamico } from "../MapaDinamico";
import { Boton, campo, Campo, InputClave, Modal } from "../ui";
import { useAdmin } from "./datos";

function useGuardar(cerrar: () => void) {
  const { accion } = useAdmin();
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const guardar = async (cuerpo: Record<string, unknown>, aviso: string) => {
    setOcupado(true);
    setError("");
    try {
      await accion(cuerpo, aviso);
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  };
  return { error, ocupado, guardar };
}

const Pie = ({ cerrar, guardar, ocupado, texto = "Guardar" }: { cerrar: () => void; guardar: () => void; ocupado: boolean; texto?: string }) => (
  <>
    <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
    <Boton onClick={guardar} disabled={ocupado}>{ocupado ? "Guardando…" : texto}</Boton>
  </>
);

export function FormCountry({ country, cerrar }: { country?: Country; cerrar: () => void }) {
  const { estado } = useAdmin();
  const { error, ocupado, guardar } = useGuardar(cerrar);
  const [f, setF] = useState({
    nombre: country?.nombre ?? "", zona: country?.zona ?? "", direccion: country?.direccion ?? "", contacto: country?.contacto ?? "",
    notas: country?.notas ?? "", facturacion: country?.facturacion ?? 0, ingresoMin: country?.ingresoMin ?? 15,
  });
  const [pos, setPos] = useState<Punto | null>(country ? { lat: country.lat, lon: country.lon } : null);
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });

  return (
    <Modal abierto titulo={country ? `Editar ${country.nombre}` : "Nuevo country"} cerrar={cerrar} ancho="max-w-2xl"
      pie={<Pie cerrar={cerrar} ocupado={ocupado} guardar={() => guardar({ accion: "guardar_country", datos: { ...f, id: country?.id, lat: pos?.lat, lon: pos?.lon } }, country ? "Country actualizado" : "Country creado")} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre"><input className={campo} value={f.nombre} onChange={set("nombre")} /></Campo>
        <Campo etiqueta="Localidad / zona"><input className={campo} value={f.zona} onChange={set("zona")} placeholder="Ej.: Pilar" /></Campo>
        <Campo etiqueta="Dirección del acceso" className="sm:col-span-2"><input className={campo} value={f.direccion} onChange={set("direccion")} /></Campo>
        <Campo etiqueta="Contacto (guardia / administración)"><input className={campo} value={f.contacto} onChange={set("contacto")} placeholder="Teléfono o nombre" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Abono mensual ($)"><input type="number" min={0} className={campo} value={f.facturacion} onChange={set("facturacion")} /></Campo>
          <Campo etiqueta="Ingreso (min)"><input type="number" min={0} className={campo} value={f.ingresoMin} onChange={set("ingresoMin")} /></Campo>
        </div>
        <Campo etiqueta="Indicaciones para el conductor" className="sm:col-span-2"><textarea className={`${campo} h-16 py-2`} value={f.notas} onChange={set("notas")} placeholder="Ej.: entrar por el acceso de proveedores, pedir por Carlos" /></Campo>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-semibold text-gris">Ubicación del acceso <span className="font-normal">— tocá el mapa {pos && `(${pos.lat}, ${pos.lon})`}</span></p>
          <MapaSelectorDinamico valor={pos} elegir={setPos} referencias={estado!.countries.filter((c) => c.activo && c.id !== country?.id)} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

export function FormEquipo({ equipo, countryId, cerrar }: { equipo?: Equipo; countryId: string; cerrar: () => void }) {
  const { error, ocupado, guardar } = useGuardar(cerrar);
  const [f, setF] = useState({ producto: equipo?.producto ?? "tableta", ubicacion: equipo?.ubicacion ?? "", numeroSerie: equipo?.numeroSerie ?? "", instaladoAt: equipo?.instaladoAt ?? "" });
  return (
    <Modal abierto titulo={equipo ? "Editar equipo" : "Agregar equipo"} cerrar={cerrar}
      pie={<Pie cerrar={cerrar} ocupado={ocupado} guardar={() => guardar({ accion: "guardar_equipo", datos: { ...f, id: equipo?.id, countryId } }, equipo ? "Equipo actualizado" : "Equipo agregado")} />}>
      <div className="space-y-3">
        <Campo etiqueta="Producto">
          <select className={campo} value={f.producto} onChange={(e) => setF({ ...f, producto: e.target.value as Equipo["producto"] })} disabled={!!equipo}>
            {PRODUCTOS.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ubicación dentro del barrio"><input className={campo} value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} placeholder="Ej.: Avenida central, frente al club house" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="N.º de serie"><input className={campo} value={f.numeroSerie} onChange={(e) => setF({ ...f, numeroSerie: e.target.value })} /></Campo>
          <Campo etiqueta="Fecha de instalación"><input type="date" className={campo} value={f.instaladoAt} onChange={(e) => setF({ ...f, instaladoAt: e.target.value })} /></Campo>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

const COLORES = ["#00a5d5", "#83c735", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#6366f1"];

export function FormCamioneta({ camioneta, cerrar }: { camioneta?: Camioneta; cerrar: () => void }) {
  const { error, ocupado, guardar } = useGuardar(cerrar);
  const [f, setF] = useState({ nombre: camioneta?.nombre ?? "", patente: camioneta?.patente ?? "", color: camioneta?.color ?? COLORES[0], inicio: camioneta?.inicio ?? "08:00", fin: camioneta?.fin ?? "17:00" });
  return (
    <Modal abierto titulo={camioneta ? `Editar ${camioneta.nombre}` : "Nueva camioneta"} cerrar={cerrar}
      pie={<Pie cerrar={cerrar} ocupado={ocupado} guardar={() => guardar({ accion: "guardar_camioneta", datos: { ...f, id: camioneta?.id } }, camioneta ? "Camioneta actualizada" : "Camioneta creada")} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre"><input className={campo} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Camioneta 4" /></Campo>
        <Campo etiqueta="Patente"><input className={campo} value={f.patente} onChange={(e) => setF({ ...f, patente: e.target.value })} placeholder="AB 123 CD" /></Campo>
        <Campo etiqueta="Inicio de jornada"><input type="time" className={campo} value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo etiqueta="Fin de jornada"><input type="time" className={campo} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Campo>
        <Campo etiqueta="Color en el mapa" className="sm:col-span-2">
          <div className="flex gap-2">
            {COLORES.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })} className={`h-8 w-8 rounded-full ring-offset-2 ${f.color === c ? "ring-2 ring-noche" : ""}`} style={{ background: c }} />)}
          </div>
        </Campo>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

export function FormUsuario({ usuario, rol, cerrar }: { usuario?: UsuarioPublico; rol: "admin" | "conductor"; cerrar: () => void }) {
  const { error, ocupado, guardar } = useGuardar(cerrar);
  const [f, setF] = useState({ nombre: usuario?.nombre ?? "", usuario: usuario?.usuario ?? "", telefono: usuario?.telefono ?? "", secreto: "" });
  const esAdmin = rol === "admin";
  return (
    <Modal abierto titulo={usuario ? `Editar ${usuario.nombre}` : esAdmin ? "Nuevo administrador" : "Nuevo conductor"} cerrar={cerrar}
      pie={<Pie cerrar={cerrar} ocupado={ocupado} guardar={() => guardar({ accion: "guardar_usuario", datos: { ...f, id: usuario?.id, rol } }, usuario ? "Usuario actualizado" : "Usuario creado")} />}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre y apellido"><input className={campo} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        {esAdmin && <Campo etiqueta="Usuario para ingresar"><input className={campo} value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} autoComplete="off" /></Campo>}
        <Campo etiqueta="Teléfono"><input className={campo} value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        {!usuario && (
          esAdmin
            ? <Campo etiqueta="Contraseña inicial" ayuda="Mínimo 8 caracteres. Se le pide cambiarla al entrar."><InputClave className={campo} value={f.secreto} onChange={(e) => setF({ ...f, secreto: e.target.value })} autoComplete="new-password" /></Campo>
            : <Campo etiqueta="PIN de 4 números" ayuda="Con este PIN entra desde el celular."><input inputMode="numeric" maxLength={4} className={`${campo} tracking-[0.5em]`} value={f.secreto} onChange={(e) => setF({ ...f, secreto: e.target.value.replace(/\D/g, "") })} /></Campo>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

export function ResetearAcceso({ usuario, cerrar }: { usuario: UsuarioPublico; cerrar: () => void }) {
  const { error, ocupado, guardar } = useGuardar(cerrar);
  const [secreto, setSecreto] = useState("");
  const esAdmin = usuario.rol === "admin";
  return (
    <Modal abierto titulo={`${esAdmin ? "Nueva contraseña" : "Nuevo PIN"} para ${usuario.nombre}`} cerrar={cerrar}
      pie={<Pie cerrar={cerrar} ocupado={ocupado} texto="Resetear" guardar={() => guardar({ accion: "resetear_acceso", id: usuario.id, secreto }, "Acceso reseteado")} />}>
      <p className="mb-3 text-sm text-gris">Se cierra la sesión abierta en sus dispositivos.{esAdmin && " Se le va a pedir que la cambie al entrar."}</p>
      {esAdmin
        ? <InputClave className={campo} value={secreto} onChange={(e) => setSecreto(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        : <input inputMode="numeric" maxLength={4} className={`${campo} tracking-[0.5em]`} value={secreto} onChange={(e) => setSecreto(e.target.value.replace(/\D/g, ""))} placeholder="4 números" />}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
