// Puntaje combinado: suma de cuatro porcentajes normalizados, cada uno por su factor configurable.
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
  facturacion: number;
  equiposRotos: number;
  esperaHoras: number;
  gravedadTotal: number;
  detalle: { pctFacturacion: number; pctEspera: number; pctRotos: number; pctGravedad: number };
}

export function valorar(db: DB, p: Parametros, ahora = Date.now()): Map<string, Valoracion> {
  const abiertas = db.fallas.filter((f) => f.estado === "abierta");
  const res = new Map<string, Valoracion>();
  const countries = db.countries.filter((c) => c.activo !== false);
  const maxFact = Math.max(1, ...countries.map((c) => c.facturacion));
  const fallasPorCountry = new Map(countries.map((c) => [c.id, abiertas.filter((f) => f.countryId === c.id)]));
  const gravedadPorCountry = new Map(countries.map((c) => [c.id, (fallasPorCountry.get(c.id) ?? []).reduce((s, f) => s + f.gravedad, 0)]));
  const equiposPorCountry = new Map(countries.map((c) => [c.id, db.equipos.filter((e) => e.countryId === c.id && e.activo !== false).length]));
  const rotosPorCountry = new Map(countries.map((c) => [c.id, new Set((fallasPorCountry.get(c.id) ?? []).map((f) => f.equipoId)).size]));
  const maxGravedad = Math.max(1, ...gravedadPorCountry.values());
  const maxRotos = Math.max(1, ...rotosPorCountry.values());

  for (const c of db.countries) {
    const fallas = fallasPorCountry.get(c.id) ?? [];
    const equipos = equiposPorCountry.get(c.id) ?? 0;
    const rotos = rotosPorCountry.get(c.id) ?? 0;
    const gravedadTotal = gravedadPorCountry.get(c.id) ?? 0;
    const edades = fallas.map((f) => Math.max(0, horasDesde(f.abiertaAt, ahora)) / 24);
    const pctEspera = edades.length ? edades.reduce((s, dias) => s + Math.min(dias / 7, 1), 0) / edades.length : 0;
    const pctFacturacion = c.facturacion / maxFact;
    const pctRotura = rotos / maxRotos;
    const pctGravedad = gravedadTotal / maxGravedad;
    const premio = pctFacturacion * p.factorFacturacion
      + pctEspera * p.factorHoras
      + pctRotura * p.factorRotos
      + pctGravedad * p.factorGravedad;
    res.set(c.id, {
      countryId: c.id, premio: Math.round(premio * 10000) / 10000,
      servicioMin: fallas.length ? c.ingresoMin + p.minutosPorFalla * fallas.length : 0,
      fallas, gravedadMax: Math.max(0, ...fallas.map((f) => f.gravedad)),
      equipos, pctRotos: equipos ? rotos / equipos : 0, horasMax: Math.max(0, ...edades) * 24,
      facturacion: c.facturacion, equiposRotos: rotos,
      esperaHoras: edades.reduce((s, dias) => s + dias * 24, 0), gravedadTotal,
      detalle: { pctFacturacion, pctEspera, pctRotos: pctRotura, pctGravedad },
    });
  }
  return res;
}
