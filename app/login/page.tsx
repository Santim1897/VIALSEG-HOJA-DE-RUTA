"use client";
import { useEffect, useState } from "react";
import { InputClave } from "@/components/ui";

type Conductor = { id: string; nombre: string };
const ULTIMO = "vialseg-ultimo-conductor";

async function ingresar(cuerpo: Record<string, string>) {
  const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? "No se pudo ingresar");
  window.location.href = data.destino;
}

export default function Login() {
  const [modo, setModo] = useState<"conductor" | "admin">("conductor");
  return (
    <main className="flex min-h-dvh flex-col bg-noche text-white">
      <div className="h-[3px] bg-gradient-to-r from-cielo to-lima" />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 pb-10 pt-14">
        <img src="/logo-vialseg.png" alt="Vialseg" className="h-8 w-auto self-center" />
        <div className="mt-10 grid grid-cols-2 rounded-xl bg-white/5 p-1 text-sm font-medium">
          {(["conductor", "admin"] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} className={`rounded-lg py-2.5 transition ${modo === m ? "bg-white text-noche" : "text-slate-300"}`}>
              {m === "conductor" ? "Conductor" : "Administración"}
            </button>
          ))}
        </div>
        <div className="mt-8 flex-1">{modo === "conductor" ? <IngresoConductor /> : <IngresoAdmin />}</div>
      </div>
    </main>
  );
}

function IngresoConductor() {
  const [conductores, setConductores] = useState<Conductor[] | null>(null);
  const [elegido, setElegido] = useState<Conductor | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      setConductores(d.conductores ?? []);
      const ultimo = localStorage.getItem(ULTIMO);
      const previo = d.conductores?.find((c: Conductor) => c.id === ultimo);
      if (previo) setElegido(previo);
    }).catch(() => setConductores([]));
  }, []);

  const tecla = async (t: string) => {
    if (ocupado) return;
    setError("");
    if (t === "borrar") return setPin(pin.slice(0, -1));
    const nuevo = (pin + t).slice(0, 4);
    setPin(nuevo);
    if (nuevo.length === 4 && elegido) {
      setOcupado(true);
      try {
        localStorage.setItem(ULTIMO, elegido.id);
        await ingresar({ accion: "conductor", id: elegido.id, pin: nuevo });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
        setPin("");
        setOcupado(false);
      }
    }
  };

  if (!conductores) return <p className="text-center text-sm text-slate-400">Cargando…</p>;
  if (!elegido) {
    return (
      <>
        <p className="mb-3 text-sm text-slate-400">¿Quién sos?</p>
        <div className="space-y-2">
          {conductores.length === 0 && <p className="text-sm text-slate-400">No hay conductores cargados. Pedile a administración que te dé de alta.</p>}
          {conductores.map((c) => (
            <button key={c.id} onClick={() => setElegido(c)} className="flex h-14 w-full items-center justify-between rounded-xl bg-white/5 px-4 text-left font-medium transition hover:bg-white/10">
              {c.nombre}<span className="text-slate-500">›</span>
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <div className="text-center">
      <p className="text-lg font-semibold">{elegido.nombre}</p>
      <button onClick={() => { setElegido(null); setPin(""); setError(""); }} className="mt-1 text-sm text-slate-400 underline">No soy yo</button>
      <p className="mt-8 text-sm text-slate-400">Ingresá tu PIN</p>
      <div className="mt-4 flex justify-center gap-4">
        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-lima" : "bg-white/15"}`} />)}
      </div>
      <p className="mt-4 h-5 text-sm text-red-300">{error}</p>
      <div className="mx-auto mt-4 grid max-w-[280px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "borrar"].map((t, i) =>
          t === "" ? <span key={i} /> : (
            <button key={i} onClick={() => tecla(t)} disabled={ocupado} aria-label={t === "borrar" ? "Borrar" : t}
              className="h-16 rounded-2xl bg-white/5 text-2xl font-medium transition active:scale-95 active:bg-white/15 disabled:opacity-50">
              {t === "borrar" ? "⌫" : t}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function IngresoAdmin() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const entrada = "h-12 w-full rounded-xl bg-white/5 px-4 text-base text-white outline-none ring-1 ring-white/10 placeholder:text-slate-500 focus:ring-cielo";
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setOcupado(true);
        setError("");
        try {
          await ingresar({ accion: "admin", usuario, clave });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Error");
          setOcupado(false);
        }
      }}
    >
      <input className={entrada} placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" />
      <InputClave oscuro className={entrada} placeholder="Contraseña" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button disabled={ocupado || !usuario || !clave} className="h-12 w-full rounded-xl bg-lima font-semibold text-noche transition disabled:opacity-50">
        {ocupado ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
