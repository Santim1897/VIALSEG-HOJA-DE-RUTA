import "server-only";
import { NextResponse } from "next/server";
import { COOKIE } from "./sesion";

export function respuestaError(e: unknown) {
  const status = (e as { status?: number })?.status ?? 500;
  console.error("API Error:", e);
  const mensaje = e instanceof Error ? e.message : String(e);
  const res = NextResponse.json({ error: mensaje }, { status });
  if (status === 401) {
    res.cookies.delete(COOKIE);
  }
  return res;
}
