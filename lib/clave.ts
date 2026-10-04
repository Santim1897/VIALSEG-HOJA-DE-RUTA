// Hash de contraseñas y PIN (scrypt con sal). Sin dependencias del servidor web para poder usarse en los datos iniciales.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Usuario } from "./types";

export function hashear(secreto: string) {
  const sal = randomBytes(16).toString("hex");
  return { sal, hash: scryptSync(secreto, sal, 32).toString("hex") };
}

export function verificar(secreto: string, u: Pick<Usuario, "hash" | "sal">) {
  const a = Buffer.from(scryptSync(secreto, u.sal, 32).toString("hex"));
  const b = Buffer.from(u.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
