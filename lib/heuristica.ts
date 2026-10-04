// Respaldo si el optimizador en Python no responde: elige en cada paso el country con mejor
// premio por minuto que todavía entre en la jornada. No garantiza el óptimo.
interface Entrada {
  countries: { id: string; premio: number; servicio: number }[];
  tiempos: number[][];
  disponible: number;
  fijo?: string | null;
}

export function premioFaltante({ countries, tiempos, disponible, fijo }: Entrada) {
  const base = countries.length + 1;
  const pendientes = new Set(countries.map((_, i) => i + 1));
  const orden: number[] = [];
  const llegadas: Record<string, number> = {};
  let actual = 0;
  let t = 0;
  for (;;) {
    let mejor = -1;
    let mejorRatio = -Infinity;
    for (const j of pendientes) {
      const llegada = t + tiempos[actual][j];
      if (llegada + countries[j - 1].servicio + tiempos[j][base] > disponible) continue;
      const ratio = countries[j - 1].id === fijo && orden.length === 0 ? Infinity : countries[j - 1].premio / (tiempos[actual][j] + countries[j - 1].servicio);
      if (ratio > mejorRatio) [mejor, mejorRatio] = [j, ratio];
    }
    if (mejor < 0) break;
    t += tiempos[actual][mejor];
    llegadas[countries[mejor - 1].id] = Math.round(t * 10) / 10;
    t += countries[mejor - 1].servicio;
    orden.push(mejor);
    pendientes.delete(mejor);
    actual = mejor;
  }
  return {
    estado: "HEURISTICA",
    orden: orden.map((k) => countries[k - 1].id),
    llegadas,
    no_visitados: [...pendientes].map((k) => countries[k - 1].id),
    objetivo: 0,
    minutos_totales: Math.round((t + tiempos[actual][base]) * 10) / 10,
    segundos: 0,
  };
}
