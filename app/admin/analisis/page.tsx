"use client";
import { useAdmin } from "@/components/admin/datos";
import { Encabezado } from "@/components/admin/Shell";
import { Tarjeta, td, th } from "@/components/ui";
import { PRODUCTOS } from "@/lib/catalogo";

export default function Analisis() {
  const { estado } = useAdmin();
  const e = estado!;
  // Fallas por producto (abiertas y últimos 30 días)
  const porProducto = PRODUCTOS.map((p) => {
    const eqs = new Set(e.equipos.filter((x) => x.producto === p.id && x.activo).map((x) => x.id));
    const fs = e.fallas.filter((f) => eqs.has(f.equipoId));
    return { p, instalados: eqs.size, abiertas: fs.filter((f) => f.estado === "abierta").length, total: fs.length };
  });

  return (
    <>
      <Encabezado titulo="Análisis" descripcion="Indicadores del parque instalado." />

      <Tarjeta titulo="Fallas por producto">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-fondo"><tr><th className={th}>Producto</th><th className={th}>Instalados</th><th className={th}>Con falla abierta</th><th className={th}>Tasa de falla</th><th className={th}>Fallas (30 días)</th></tr></thead>
            <tbody className="divide-y divide-linea">
              {porProducto.map(({ p, instalados, abiertas, total }) => (
                <tr key={p.id}>
                  <td className={td}><p className="font-medium">{p.nombre}</p><p className="text-xs text-gris">{p.familia}</p></td>
                  <td className={`${td} tabular`}>{instalados}</td>
                  <td className={`${td} tabular`}>{abiertas}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cielo" style={{ width: `${instalados ? (abiertas / instalados) * 100 : 0}%` }} /></div>
                      <span className="tabular text-xs text-gris">{instalados ? Math.round((abiertas / instalados) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className={`${td} tabular`}>{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

    </>
  );
}
