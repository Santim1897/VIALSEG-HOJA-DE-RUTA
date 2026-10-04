import "server-only";
import { CLAVE_VALIDA, hashear, PIN_VALIDO, publico, verificar } from "./auth";
import { store } from "./store";
import type { Usuario } from "./types";

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 10 * 60_000;

export class ErrorUsuario extends Error {
  status = 400;
}

async function intentar(u: Usuario | undefined, secreto: string): Promise<Usuario> {
  const generico = new ErrorUsuario("Datos de acceso incorrectos");
  if (!u || !u.activo) throw generico;
  if (u.bloqueadoHasta && new Date(u.bloqueadoHasta).getTime() > Date.now()) {
    throw new ErrorUsuario("Demasiados intentos. Probá de nuevo en unos minutos o pedí que te reseteen el acceso.");
  }
  if (!verificar(secreto, u)) {
    const intentos = (u.intentosFallidos ?? 0) + 1;
    await store().guardar("usuarios", [{
      ...u, intentosFallidos: intentos >= MAX_INTENTOS ? 0 : intentos,
      bloqueadoHasta: intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MS).toISOString() : undefined,
    }]);
    throw generico;
  }
  if (u.intentosFallidos || u.bloqueadoHasta) await store().guardar("usuarios", [{ ...u, intentosFallidos: 0, bloqueadoHasta: undefined }]);
  return u;
}

export async function ingresarAdmin(usuario: string, clave: string) {
  const db = await store().leer();
  const u = db.usuarios.find((x) => x.rol === "admin" && x.usuario?.toLowerCase() === usuario.trim().toLowerCase());
  return intentar(u, clave);
}

export async function ingresarConductor(id: string, pin: string) {
  const db = await store().leer();
  return intentar(db.usuarios.find((x) => x.rol === "conductor" && x.id === id), pin);
}

export async function conductoresActivos() {
  const db = await store().leer();
  return db.usuarios.filter((u) => u.rol === "conductor" && u.activo).map((u) => ({ id: u.id, nombre: u.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function cambiarMiClave(u: Usuario, actual: string, nueva: string) {
  if (!verificar(actual, u)) throw new ErrorUsuario("La contraseña actual no es correcta");
  if (u.rol === "admin" ? !CLAVE_VALIDA(nueva) : !PIN_VALIDO.test(nueva)) {
    throw new ErrorUsuario(u.rol === "admin" ? "La contraseña debe tener al menos 8 caracteres" : "El PIN debe tener 4 números");
  }
  const nuevo: Usuario = { ...u, ...hashear(nueva), version: u.version + 1, debeCambiarClave: false };
  await store().guardar("usuarios", [nuevo]);
  return publico(nuevo);
}
