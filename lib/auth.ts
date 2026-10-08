import "server-only";
import { cookies } from "next/headers";
import { COOKIE, leerSesion } from "./sesion";
import { store } from "./store";
import type { Rol, Usuario, UsuarioPublico } from "./types";

export { hashear, verificar } from "./clave";

export const publico = ({ hash: _h, sal: _s, intentosFallidos: _i, bloqueadoHasta: _b, ...u }: Usuario): UsuarioPublico => u;

export class NoAutorizado extends Error {
  status = 401;
}

export async function usuarioActual(rol?: Rol): Promise<Usuario> {
  const s = leerSesion((await cookies()).get(COOKIE)?.value);
  if (!s || (rol && s.rol !== rol)) throw new NoAutorizado("Sesión no válida");
  try {
    const db = await store().leer();
    const u = db.usuarios.find((x) => x.id === s.uid) ?? (s.rol === "admin" ? db.usuarios.find((x) => x.rol === "admin" && x.activo) : undefined);
    if (u && u.activo && (!rol || u.rol === rol)) return u;
  } catch (err) {
    console.error("Error al buscar usuario en base:", err);
  }

  // Fallback si la sesión es admin y la base se reinició
  if (s.rol === "admin" && (!rol || rol === "admin")) {
    const { adminInicial } = await import("./seed");
    return adminInicial();
  }

  throw new NoAutorizado("Sesión no válida");
}

export const PIN_VALIDO = /^\d{4}$/;
export const CLAVE_VALIDA = (c: string) => c.length >= 8;
