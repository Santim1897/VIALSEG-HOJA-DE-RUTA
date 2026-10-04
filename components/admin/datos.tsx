"use client";
// Estado compartido del panel: se carga una vez, se refresca cada 20 s y después de cada acción.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { estadoAdmin } from "@/lib/acciones";
import type { UsuarioPublico } from "@/lib/types";

export type EstadoAdmin = Awaited<ReturnType<typeof estadoAdmin>> & { yo: UsuarioPublico };

interface Ctx {
  estado: EstadoAdmin | null;
  error: string;
  aviso: string;
  fechaPlan: string | null;
  setFechaPlan: (f: string | null) => void;
  cargar: () => Promise<void>;
  /** Ejecuta una acción del panel. Devuelve la respuesta o lanza el error (con mensaje para mostrar). */
  accion: <T = { ok: boolean }>(cuerpo: Record<string, unknown>, avisoOk?: string) => Promise<T>;
  avisar: (m: string) => void;
}

const Contexto = createContext<Ctx | null>(null);
export const useAdmin = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error("useAdmin fuera de DatosAdmin");
  return c;
};

export async function postJson<T>(url: string, cuerpo: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok || data?.error) throw new Error(data?.error ?? `Error ${res.status}`);
  return data;
}

export function DatosAdmin({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoAdmin | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [fechaPlan, setFechaPlan] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin${fechaPlan ? `?fecha=${fechaPlan}` : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEstado(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, [fechaPlan]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial + actualización periódica
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  const avisar = useCallback((m: string) => {
    setAviso(m);
    setTimeout(() => setAviso((a) => (a === m ? "" : a)), 4000);
  }, []);

  const accion = useCallback(async <T,>(cuerpo: Record<string, unknown>, avisoOk?: string) => {
    const r = await postJson<T>("/api/admin", cuerpo);
    await cargar();
    if (avisoOk) avisar(avisoOk);
    return r;
  }, [cargar, avisar]);

  const valor = useMemo(() => ({ estado, error, aviso, fechaPlan, setFechaPlan, cargar, accion, avisar }), [estado, error, aviso, fechaPlan, cargar, accion, avisar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** countryId → camionetaId para el día de hoy. */
export function useAsignadoHoy() {
  const { estado } = useAdmin();
  return useMemo(() => {
    const m: Record<string, string> = {};
    estado?.jornadas.forEach((j) => j.countries.forEach((c) => (m[c] = j.camionetaId)));
    return m;
  }, [estado]);
}
