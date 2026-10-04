"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { fechaLarga } from "@/lib/tiempo";
import { Boton, campo, Campo, InputClave, Modal } from "../ui";
import { postJson, useAdmin } from "./datos";

const ICONOS: Record<string, string> = {
  operacion: "M3 12h4l3-8 4 16 3-8h4",
  planificacion: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  fallas: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  countries: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  flota: "M3 6h11v9h2V9h3.5L22 12.5V17h-2.2a2.5 2.5 0 0 1-4.6 0H8.8a2.5 2.5 0 0 1-4.6 0H3z",
  usuarios: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  analisis: "M3 3v18h18M7 15l4-4 3 3 5-6",
  auditoria: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4",
  configuracion: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
};

const SECCIONES: { grupo: string; items: [string, string, string][] }[] = [
  { grupo: "Operación", items: [["/admin", "En vivo", "operacion"], ["/admin/planificacion", "Planificación", "planificacion"], ["/admin/fallas", "Fallas", "fallas"]] },
  { grupo: "Red", items: [["/admin/countries", "Countries y equipos", "countries"], ["/admin/flota", "Flota", "flota"], ["/admin/usuarios", "Usuarios", "usuarios"]] },
  { grupo: "Gestión", items: [["/admin/analisis", "Análisis", "analisis"], ["/admin/auditoria", "Auditoría", "auditoria"], ["/admin/configuracion", "Configuración", "configuracion"]] },
];

export const Icono = ({ nombre, className = "h-[18px] w-[18px]" }: { nombre: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={ICONOS[nombre]} />
  </svg>
);

export default function Shell({ children }: { children: React.ReactNode }) {
  const { estado, error, aviso } = useAdmin();
  const ruta = usePathname();
  const [menu, setMenu] = useState(false);
  const [lateral, setLateral] = useState(false);
  const [cambiarClave, setCambiarClave] = useState(false);
  const activo = (href: string) => (href === "/admin" ? ruta === "/admin" : ruta.startsWith(href));

  const salir = async () => {
    await postJson("/api/auth", { accion: "salir" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-dvh bg-fondo lg:pl-60">
      <aside className={`fixed inset-y-0 left-0 z-[1500] w-60 bg-noche text-slate-300 transition-transform lg:translate-x-0 ${lateral ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center px-5">
          <img src="/logo-vialseg.png" alt="Vialseg" className="h-6 w-auto" />
        </div>
        <nav className="space-y-6 px-3 py-2">
          {SECCIONES.map((s) => (
            <div key={s.grupo}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{s.grupo}</p>
              {s.items.map(([href, nombre, icono]) => (
                <Link key={href} href={href} onClick={() => setLateral(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${activo(href) ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`}>
                  <Icono nombre={icono} />
                  {nombre}
                  {nombre === "Fallas" && estado && estado.kpis.criticas > 0 && (
                    <span className="ml-auto rounded-full bg-red-500/90 px-1.5 text-[10px] font-semibold text-white">{estado.kpis.criticas}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {lateral && <div className="fixed inset-0 z-[1400] bg-black/40 lg:hidden" onClick={() => setLateral(false)} />}

      <header className="sticky top-0 z-[1100] flex h-16 items-center gap-3 border-b border-linea bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 text-gris hover:bg-slate-100 lg:hidden" onClick={() => setLateral(true)} aria-label="Menú">☰</button>
        <p className="text-sm text-gris">{estado ? fechaLarga(estado.fecha).replace(/^./, (l) => l.toUpperCase()) : ""}</p>
        <div className="relative ml-auto">
          <button onClick={() => setMenu(!menu)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-noche text-xs font-semibold text-white">
              {estado?.yo.nombre.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{estado?.yo.nombre}</span>
              <span className="block text-xs text-gris">Administración</span>
            </span>
          </button>
          {menu && (
            <div className="absolute right-0 mt-1 w-52 overflow-hidden rounded-xl border border-linea bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
              <button className="block w-full px-4 py-2 text-left hover:bg-slate-50" onClick={() => { setCambiarClave(true); setMenu(false); }}>Cambiar contraseña</button>
              <button className="block w-full px-4 py-2 text-left text-red-700 hover:bg-red-50" onClick={salir}>Cerrar sesión</button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {estado ? children : <p className="py-24 text-center text-sm text-gris">Cargando…</p>}
      </main>

      {aviso && (
        <div className="fixed bottom-5 left-1/2 z-[2500] -translate-x-1/2 rounded-xl bg-noche px-4 py-3 text-sm text-white shadow-xl lg:left-[calc(50%+7.5rem)]">{aviso}</div>
      )}

      {estado && (cambiarClave || estado.yo.debeCambiarClave) && (
        <CambiarClave obligatorio={!!estado.yo.debeCambiarClave} cerrar={() => setCambiarClave(false)} />
      )}
    </div>
  );
}

function CambiarClave({ obligatorio, cerrar }: { obligatorio: boolean; cerrar: () => void }) {
  const { cargar, avisar } = useAdmin();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const guardar = async () => {
    if (nueva !== repetir) return setError("Las contraseñas no coinciden");
    try {
      await postJson("/api/auth", { accion: "cambiar_clave", actual, nueva });
      await cargar();
      avisar("Contraseña actualizada");
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };
  return (
    <Modal abierto titulo={obligatorio ? "Elegí una contraseña nueva" : "Cambiar contraseña"} cerrar={obligatorio ? () => undefined : cerrar}
      pie={<Boton onClick={guardar} disabled={!actual || !nueva}>Guardar</Boton>}>
      {obligatorio && <p className="mb-4 text-sm text-gris">Por seguridad, cambiá la contraseña inicial antes de continuar.</p>}
      <div className="space-y-3">
        <Campo etiqueta="Contraseña actual"><InputClave className={campo} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" /></Campo>
        <Campo etiqueta="Contraseña nueva" ayuda="Mínimo 8 caracteres."><InputClave className={campo} value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" /></Campo>
        <Campo etiqueta="Repetir contraseña nueva"><InputClave className={campo} value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" /></Campo>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-gris">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}
