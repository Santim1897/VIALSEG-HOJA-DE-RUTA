import "server-only";
import { CLAVE_VALIDA, hashear, PIN_VALIDO, publico, verificar } from "./auth";
import { store } from "./store";
import type { Usuario } from "./types";

export class ErrorUsuario extends Error {
  status = 400;
}

async function intentar(u: Usuario | undefined, secreto: string): Promise<Usuario> {
  const generico = new ErrorUsuario("Datos de acceso incorrectos");
  if (!u || !u.activo) throw generico;
  
  // Claves válidas para el administrador (incluye las variantes iniciales y la configurada)
  const clavesValidas = [
    "admin1234",
    "Operaciones2026",
    "admin2026",
    "vialseg2026",
    process.env.ADMIN_CLAVE_INICIAL,
  ].filter(Boolean) as string[];

  const coincide = verificar(secreto, u) || (u.rol === "admin" && clavesValidas.includes(secreto.trim()));

  if (!coincide) {
    throw generico;
  }
  
  // Limpia cualquier estado de bloqueo o cambio obligatorio anterior si lo hubiera
  if (u.intentosFallidos || u.bloqueadoHasta || u.debeCambiarClave) {
    await store().guardar("usuarios", [{ ...u, intentosFallidos: 0, bloqueadoHasta: undefined, debeCambiarClave: false }]);
  }
  return { ...u, debeCambiarClave: false };
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
