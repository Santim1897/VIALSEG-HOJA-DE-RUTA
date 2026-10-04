import { NextResponse, type NextRequest } from "next/server";
import { publico, usuarioActual } from "@/lib/auth";
import { cambiarMiClave, conductoresActivos, ingresarAdmin, ingresarConductor } from "@/lib/cuentas";
import { respuestaError } from "@/lib/http";
import { COOKIE, firmarSesion } from "@/lib/sesion";
import { store } from "@/lib/store";
import type { Usuario } from "@/lib/types";

export const dynamic = "force-dynamic";

function conSesion(u: Usuario) {
  const { valor, maxAge } = firmarSesion(u.id, u.rol, u.version);
  const res = NextResponse.json({ usuario: publico(u), destino: u.rol === "admin" ? "/admin" : "/conductor" });
  res.cookies.set(COOKIE, valor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
  return res;
}

// Lista de conductores para la pantalla de ingreso con PIN.
export async function GET() {
  try {
    return NextResponse.json({ conductores: await conductoresActivos() });
  } catch (e) {
    return respuestaError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    switch (b.accion) {
      case "admin":
        return conSesion(await ingresarAdmin(String(b.usuario ?? ""), String(b.clave ?? "")));
      case "conductor":
        return conSesion(await ingresarConductor(String(b.id ?? ""), String(b.pin ?? "")));
      case "cambiar_clave": {
        const u = await usuarioActual();
        await cambiarMiClave(u, String(b.actual ?? ""), String(b.nueva ?? ""));
        const actualizado = (await store().leer()).usuarios.find((x) => x.id === u.id)!;
        return conSesion(actualizado);
      }
      case "salir": {
        const res = NextResponse.json({ ok: true });
        res.cookies.delete(COOKIE);
        return res;
      }
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    return respuestaError(e);
  }
}
