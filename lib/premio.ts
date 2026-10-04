// "Premio" de atender un country hoy: lo que vale para Vialseg resolver sus fallas.
//   premio = Σ_fallas gravedad × f(horas caído)  ×  f(facturación)  ×  f(% equipos rotos)
// Funciones continuas (sin escalones) y con pesos editables en Parámetros.
import { horasDesde } from "./tiempo";
import type { DB, Falla, Parametros } from "./types";

export interface Valoracion {
  countryId: string;
  premio: number;
  servicioMin: number;
  fallas: Falla[];
  gravedadMax: number;
  equipos: number;
  pctRotos: number;
  horasMax: number;
  detalle: { gravedadPonderada: number; factorFacturacion: number; factorRotos: number };
}

export function valorar(db: DB, p: Parametros, ahora = Date.now()): Map<string, Valoracion> {
  const maxFact = Math.max(1, ...db.countries.map((c) => c.facturacion));
  const abiertas = db.fallas.filter((f) => f.estado === "abierta");
  const res = new Map<string, Valoracion>();
  for (const c of db.countries) {
    const fallas = abiertas.filter((f) => f.countryId === c.id);
    const equipos = db.equipos.filter((e) => e.countryId === c.id && e.activo !== false).length;
    const rotos = new Set(fallas.map((f) => f.equipoId)).size;
    const pctRotos = equipos ? rotos / equipos : 0;
    const gravedadPonderada = fallas.reduce(
      (s, f) => s + f.gravedad * (1 + Math.min(horasDesde(f.abiertaAt, ahora) / 24, 4) * p.factorHoras), 0);
    const factorFacturacion = 1 + p.factorFacturacion * (c.facturacion / maxFact);
    const factorRotos = 1 + p.factorRotos * pctRotos;
    res.set(c.id, {
      countryId: c.id,
      premio: Math.round(gravedadPonderada * factorFacturacion * factorRotos * 100) / 100,
      servicioMin: fallas.length ? c.ingresoMin + p.minutosPorFalla * fallas.length : 0,
      fallas,
      gravedadMax: Math.max(0, ...fallas.map((f) => f.gravedad)),
      equipos,
      pctRotos,
      horasMax: Math.max(0, ...fallas.map((f) => horasDesde(f.abiertaAt, ahora))),
      detalle: { gravedadPonderada: Math.round(gravedadPonderada * 100) / 100, factorFacturacion, factorRotos },
    });
  }
  return res;
}
