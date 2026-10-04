import "server-only";
import { NextResponse } from "next/server";

/** Respuesta de error uniforme: 400 para errores del usuario, 401 sin sesión, 500 el resto. */
export function respuestaError(e: unknown) {
  const status = (e as { status?: number })?.status ?? 500;
  if (status === 500) console.error(e);
  const mensaje = status === 500 ? "Ocurrió un error. Probá de nuevo." : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: mensaje }, { status });
}
