// Control de acceso antes de renderizar: cada rol solo entra a su sección.
// Las rutas de API verifican además la sesión contra la base (usuario activo y versión).
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, leerSesion } from "@/lib/sesion";

export function proxy(req: NextRequest) {
  const sesion = leerSesion(req.cookies.get(COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, req.url));

  if (pathname === "/") {
    if (sesion?.rol === "admin") return ir("/admin");
    if (sesion?.rol === "conductor") return ir("/conductor");
    return ir("/login");
  }

  // En /login nunca forzamos redirección para evitar bucles infinitos con sesiones expiradas
  if (pathname === "/login") return NextResponse.next();

  if (pathname.startsWith("/admin") && sesion?.rol !== "admin") return ir("/login");
  if (pathname.startsWith("/conductor") && sesion?.rol !== "conductor") return ir("/login");
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/admin/:path*", "/conductor/:path*"] };
