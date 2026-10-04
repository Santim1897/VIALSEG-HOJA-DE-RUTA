"use client";
// Componentes de interfaz compartidos por el panel de administración.
import { useEffect, useState } from "react";
import { COLOR_GRAVEDAD, NOMBRE_GRAVEDAD } from "@/lib/catalogo";

export const campo =
  "h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm text-tinta outline-none transition focus:border-cielo focus:ring-2 focus:ring-cielo/20 disabled:bg-slate-50 disabled:text-gris";

export function Boton({ children, variante = "primario", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "fantasma" | "peligro" }) {
  const estilos = {
    primario: "bg-noche text-white hover:bg-noche-3",
    secundario: "border border-linea bg-white text-tinta hover:border-slate-300 hover:bg-slate-50",
    fantasma: "text-gris hover:bg-slate-100 hover:text-tinta",
    peligro: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variante];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, children, className = "" }: { etiqueta: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-gris">{etiqueta}</span>
      <div className="mt-1">{children}</div>
      {ayuda && <span className="mt-1 block text-xs text-gris">{ayuda}</span>}
    </label>
  );
}

export function Tarjeta({ titulo, subtitulo, accion, children, className = "" }: { titulo?: React.ReactNode; subtitulo?: string; accion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-linea bg-white ${className}`}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-5 py-3.5">
          <div>
            {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
            {subtitulo && <p className="text-xs text-gris">{subtitulo}</p>}
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Gravedad({ valor }: { valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_GRAVEDAD[valor] }} />
      {valor ? NOMBRE_GRAVEDAD[valor] : "Sin fallas"}
    </span>
  );
}

export function Etiqueta({ children, tono = "gris" }: { children: React.ReactNode; tono?: "gris" | "verde" | "ambar" | "rojo" | "azul" }) {
  const t = { gris: "bg-slate-100 text-slate-600", verde: "bg-green-100 text-green-800", ambar: "bg-amber-100 text-amber-800", rojo: "bg-red-100 text-red-700", azul: "bg-sky-100 text-sky-800" }[tono];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function Modal({ titulo, abierto, cerrar, children, pie, ancho = "max-w-lg" }: { titulo: string; abierto: boolean; cerrar: () => void; children: React.ReactNode; pie?: React.ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-noche/50 p-4 sm:items-center" onMouseDown={cerrar}>
      <div role="dialog" aria-label={titulo} className={`my-8 w-full ${ancho} rounded-2xl bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-linea px-6 py-4">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={cerrar} aria-label="Cerrar" className="rounded-md p-1 text-gris hover:bg-slate-100">✕</button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {pie && <footer className="flex justify-end gap-2 border-t border-linea bg-fondo/60 px-6 py-3.5">{pie}</footer>}
      </div>
    </div>
  );
}

/** Diálogo de confirmación para acciones que no se deshacen fácilmente. */
export function Confirmar({ abierto, titulo, mensaje, textoAccion = "Confirmar", peligro, cerrar, confirmar }: { abierto: boolean; titulo: string; mensaje: React.ReactNode; textoAccion?: string; peligro?: boolean; cerrar: () => void; confirmar: () => void | Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal abierto={abierto} titulo={titulo} cerrar={cerrar} pie={
      <>
        <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
        <Boton variante={peligro ? "peligro" : "primario"} disabled={ocupado} onClick={async () => { setOcupado(true); try { await confirmar(); } finally { setOcupado(false); } }}>
          {ocupado ? "Procesando…" : textoAccion}
        </Boton>
      </>
    }>
      <div className="text-sm leading-relaxed text-tinta">{mensaje}</div>
    </Modal>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-semibold">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-sm text-sm text-gris">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Buscador({ valor, cambiar, placeholder = "Buscar…" }: { valor: string; cambiar: (v: string) => void; placeholder?: string }) {
  return <input type="search" value={valor} onChange={(e) => cambiar(e.target.value)} placeholder={placeholder} className={`${campo} max-w-xs`} />;
}

export const th = "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gris";
export const td = "px-4 py-3";

/** Campo de contraseña con botón para mostrar u ocultar lo escrito. */
export function InputClave({ className = "", oscuro = false, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { oscuro?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={ver ? "text" : "password"} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setVer(!ver)}
        aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        className={`absolute inset-y-0 right-0 grid w-11 place-items-center ${oscuro ? "text-slate-400 hover:text-white" : "text-gris hover:text-tinta"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          {ver ? (
            <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6" />
          ) : (
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          )}
        </svg>
      </button>
    </div>
  );
}
