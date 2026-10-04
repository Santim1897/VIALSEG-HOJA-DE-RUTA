import { NextResponse, type NextRequest } from "next/server";
import { fotoCierre } from "@/lib/acciones";
import { usuarioActual } from "@/lib/auth";
import { respuestaError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await usuarioActual("admin");
    const foto = await fotoCierre(req.nextUrl.searchParams.get("id") ?? "");
    if (!foto) return NextResponse.json({ error: "Sin foto" }, { status: 404 });
    const [meta, datos] = foto.split(",");
    return new NextResponse(Buffer.from(datos, "base64"), { headers: { "Content-Type": meta.slice(5, meta.indexOf(";")), "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return respuestaError(e);
  }
}
