import { NextResponse, type NextRequest } from "next/server";
import { accionAdmin, estadoAdmin } from "@/lib/acciones";
import { publico, usuarioActual } from "@/lib/auth";
import { respuestaError } from "@/lib/http";
import { analisisRed, sugerirAsignacion } from "@/lib/motor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const yo = await usuarioActual("admin");
    if (req.nextUrl.searchParams.get("vista") === "analisis") {
      const criterio = req.nextUrl.searchParams.get("criterio") === "fallas" ? "fallas" : "equipos";
      return NextResponse.json(await analisisRed(req.nextUrl.origin, criterio));
    }
    return NextResponse.json({ ...(await estadoAdmin(req.nextUrl.searchParams.get("fecha") ?? undefined)), yo: publico(yo) });
  } catch (e) {
    return respuestaError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const yo = await usuarioActual("admin");
    const cuerpo = await req.json();
    if (cuerpo.accion === "sugerir_asignacion") return NextResponse.json(await sugerirAsignacion(req.nextUrl.origin));
    return NextResponse.json((await accionAdmin(req.nextUrl.origin, yo, cuerpo)) ?? { ok: true });
  } catch (e) {
    return respuestaError(e);
  }
}
