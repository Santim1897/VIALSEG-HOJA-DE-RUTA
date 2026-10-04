import { NextResponse, type NextRequest } from "next/server";
import { accionConductor, estadoConductor } from "@/lib/acciones";
import { usuarioActual } from "@/lib/auth";
import { respuestaError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await estadoConductor(await usuarioActual("conductor")));
  } catch (e) {
    return respuestaError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const yo = await usuarioActual("conductor");
    await accionConductor(req.nextUrl.origin, yo, await req.json());
    return NextResponse.json(await estadoConductor(yo));
  } catch (e) {
    return respuestaError(e);
  }
}
