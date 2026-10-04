// Sesión firmada en una cookie (HMAC-SHA256). Se usa en proxy.ts y en las rutas de API.
import { createHmac, timingSafeEqual } from "crypto";
import type { Rol } from "./types";

export const COOKIE = "vialseg_sesion";
const DURACION_S = { admin: 12 * 3600, conductor: 30 * 24 * 3600 }; // el celular del conductor queda logueado

export interface Sesion {
  uid: string;
  rol: Rol;
  v: number; // versión del usuario (resetear la clave cierra las sesiones viejas)
  exp: number;
}

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("Falta SESSION_SECRET");
  return s ?? "desarrollo-local-no-usar-en-produccion";
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const firma = (datos: string) => b64(createHmac("sha256", secreto()).update(datos).digest());

export function firmarSesion(uid: string, rol: Rol, v: number) {
  const datos = b64(JSON.stringify({ uid, rol, v, exp: Math.floor(Date.now() / 1000) + DURACION_S[rol] } satisfies Sesion));
  return { valor: `${datos}.${firma(datos)}`, maxAge: DURACION_S[rol] };
}

export function leerSesion(token?: string | null): Sesion | null {
  if (!token) return null;
  const [datos, f] = token.split(".");
  if (!datos || !f) return null;
  const esperada = Buffer.from(firma(datos));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as Sesion;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}
