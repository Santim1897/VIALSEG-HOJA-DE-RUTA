import Link from "next/link";
import { CAMIONETAS } from "@/lib/seed";

// Entrada por rol. En esta versión no hay contraseñas: se elige el perfil (ver docs/DECISIONES.md).
export default function Inicio() {
  return (
    <main className="min-h-dvh bg-noche text-white">
      <div className="h-1 bg-gradient-to-r from-cielo to-lima" />
      <div className="mx-auto flex min-h-[calc(100dvh-4px)] max-w-5xl flex-col px-5 py-10 sm:px-8">
        <img src="/logo-vialseg.png" alt="Vialseg" className="h-8 w-auto self-start" />
        <div className="mt-16 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lima">Hoja de ruta técnica</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Cada camioneta, al country que más lo necesita.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-300">
            El sistema prioriza las fallas por gravedad, tiempo caído y tamaño del cliente, y calcula el recorrido óptimo
            desde donde está cada conductor.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin"
            className="group rounded-2xl border border-white/10 bg-noche-2 p-6 transition hover:border-lima/60 hover:bg-noche-3"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-cielo">Centro de operaciones</p>
            <h2 className="mt-2 text-xl font-semibold">Administración · Martínez</h2>
            <p className="mt-2 text-sm text-slate-400">Mapa de countries y fallas, recorridos de las camionetas, asignación del día y análisis.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-lima">Entrar <span aria-hidden>→</span></span>
          </Link>
          <div className="rounded-2xl border border-white/10 bg-noche-2 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-cielo">En la calle</p>
            <h2 className="mt-2 text-xl font-semibold">Soy conductor</h2>
            <div className="mt-4 grid gap-2">
              {CAMIONETAS.map((c) => (
                <Link
                  key={c.id}
                  href={`/conductor/${c.id}`}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 transition hover:bg-white/10"
                >
                  <span className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-sm text-slate-400">{c.conductor}</span>
                  </span>
                  <span aria-hidden className="text-slate-500">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-auto pt-12 text-xs text-slate-500">ITBA · Supply Chain · Prototipo con datos ficticios</p>
      </div>
    </main>
  );
}
