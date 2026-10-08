import "server-only";
import { NextResponse } from "next/server";
import { COOKIE } from "./sesion";

/** Respuesta de error uniforme: 400 para errores del usuario, 401 sin sesión, 500 el resto. */
export function respuestaError(e: unknown) {
  const status = (e as { status?: number })?.status ?? 500;
  if (status === 500) console.error(e);
  const mensaje = status === 500 ? "Ocurrió un error. Probá de nuevo." : e instanceof Error ? e.message : String(e);
  const res = NextResponse.json({ error: mensaje }, { status });
  if (status === 401) {
    res.cookies.delete(COOKIE);
  }
  return res;
}
