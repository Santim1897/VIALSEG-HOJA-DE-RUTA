"use client";
import type { estadoAdmin } from "@/lib/acciones";
import { COLOR_GRAVEDAD, NOMBRE_GRAVEDAD } from "@/lib/catalogo";

export type EstadoAdmin = Awaited<ReturnType<typeof estadoAdmin>>;

export async function enviar<T = unknown>(url: string, cuerpo: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error ?? `Error ${res.status}`);
  return data;
}

export function Gravedad({ valor }: { valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_GRAVEDAD[valor] }} />
      {valor ? `${valor} · ${NOMBRE_GRAVEDAD[valor]}` : "—"}
    </span>
  );
}

export function Tarjeta({ titulo, accion, children, className = "" }: { titulo?: string; accion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-linea bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`}>
      {(titulo || accion) && (
        <header className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3.5">
          {titulo && <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Boton({ children, variante = "primario", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "fantasma" }) {
  const estilos = {
    primario: "bg-noche text-white hover:bg-noche-3",
    secundario: "border border-linea bg-white text-tinta hover:border-slate-300 hover:bg-slate-50",
    fantasma: "text-gris hover:bg-slate-100 hover:text-tinta",
  }[variante];
  return (
    <button
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export const campo = "h-9 w-full rounded-lg border border-linea bg-white px-3 text-sm outline-none focus:border-cielo focus:ring-2 focus:ring-cielo/20";
