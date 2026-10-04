// Control de acceso antes de renderizar: cada rol solo entra a su sección.
// Las rutas de API verifican además la sesión contra la base (usuario activo y versión).
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, leerSesion } from "@/lib/sesion";

export function proxy(req: NextRequest) {
  const sesion = leerSesion(req.cookies.get(COOKIE)?.value);
  const { pathname } = req.nextUrl;
  const inicio = sesion?.rol === "admin" ? "/admin" : sesion?.rol === "conductor" ? "/conductor" : "/login";
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, req.url));

  if (pathname === "/" || pathname === "/login") return sesion ? ir(inicio) : pathname === "/" ? ir("/login") : NextResponse.next();
  if (pathname.startsWith("/admin") && sesion?.rol !== "admin") return ir(inicio);
  if (pathname.startsWith("/conductor") && sesion?.rol !== "conductor") return ir(inicio);
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/admin/:path*", "/conductor/:path*"] };
