import { NextResponse, type NextRequest } from "next/server";
import { accionConductor, estadoConductor } from "@/lib/acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const error = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await estadoConductor(req.nextUrl.searchParams.get("c") ?? "c1"));
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cuerpo = await req.json();
    await accionConductor(req.nextUrl.origin, cuerpo);
    return NextResponse.json(await estadoConductor(String(cuerpo.camionetaId)));
  } catch (e) {
    return error(e);
  }
}
