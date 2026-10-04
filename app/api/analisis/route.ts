import { NextResponse, type NextRequest } from "next/server";
import { analisisRed } from "@/lib/motor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const criterio = req.nextUrl.searchParams.get("criterio") === "fallas" ? "fallas" : "equipos";
    return NextResponse.json(await analisisRed(req.nextUrl.origin, criterio));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
