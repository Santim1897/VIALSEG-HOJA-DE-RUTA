import { NextResponse, type NextRequest } from "next/server";
import { accionAdmin, estadoAdmin } from "@/lib/acciones";
import { sugerirAsignacion } from "@/lib/motor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const error = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

export async function GET() {
  try {
    return NextResponse.json(await estadoAdmin());
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cuerpo = await req.json();
    if (cuerpo.accion === "sugerir_asignacion") return NextResponse.json(await sugerirAsignacion(req.nextUrl.origin));
    return NextResponse.json(await accionAdmin(req.nextUrl.origin, cuerpo));
  } catch (e) {
    return error(e);
  }
}
