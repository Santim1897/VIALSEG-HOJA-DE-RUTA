// Datos ficticios para la demo. Coordenadas aproximadas de accesos: NO son ubicaciones operativas.
import { PARAMETROS_INICIALES, TIPOS_FALLA } from "./catalogo";
import { hoy } from "./tiempo";
import type { Camioneta, Country, DB, Equipo, Falla, Jornada, ProductoId } from "./types";

const COUNTRIES: [string, string, number, number, number][] = [
  // nombre, zona, lat, lon, facturación mensual (ARS)
  ["Ayres del Pilar", "Pilar", -34.4372, -58.7849, 980000],
  ["Highland Park CC", "Pilar", -34.4207, -58.7834, 610000],
  ["Estancias del Pilar", "Pilar", -34.422, -58.85, 540000],
  ["Pilar del Este", "Pilar", -34.443, -58.804, 1100000],
  ["La Lomada de Pilar", "Pilar", -34.447, -58.838, 220000],
  ["Martindale CC", "Pilar", -34.463, -58.805, 390000],
  ["Mayling Club de Campo", "Pilar", -34.435, -58.828, 250000],
  ["Tortugas CC", "Pilar", -34.457, -58.735, 690000],
  ["Campo Chico CC", "Pilar", -34.426, -58.72, 150000],
  ["Haras Santa María", "Escobar", -34.379, -58.785, 760000],
  ["Puertos del Lago", "Escobar", -34.354, -58.744, 1250000],
  ["El Cantón", "Escobar", -34.361, -58.733, 830000],
  ["San Sebastián", "Escobar", -34.333, -58.863, 1050000],
  ["Los Cardales CC", "Exaltación de la Cruz", -34.3297, -58.993, 470000],
  ["Nordelta", "Tigre", -34.4025, -58.648, 1400000],
  ["Los Alisos", "Tigre", -34.396, -58.639, 420000],
  ["Santa María de Tigre", "Tigre", -34.421, -58.622, 1200000],
  ["Santa Bárbara", "Tigre", -34.43, -58.652, 875000],
  ["El Encuentro", "Benavídez", -34.407, -58.673, 180000],
  ["Villanueva", "Tigre", -34.373, -58.682, 990000],
  ["San Isidro Labrador", "Tigre", -34.3675, -58.69, 560000],
  ["Talar del Lago", "General Pacheco", -34.4469, -58.6577, 330000],
  ["Olivos Golf Club", "Malvinas Argentinas", -34.504, -58.696, 640000],
  ["Boulogne Golf", "San Isidro", -34.497, -58.573, 280000],
];

export const BASES_CANDIDATAS = [
  { id: "martinez", nombre: "Martínez (base actual)", lat: -34.4904, lon: -58.5039 },
  { id: "pilar", nombre: "Pilar centro", lat: -34.4587, lon: -58.9142 },
  { id: "escobar", nombre: "Belén de Escobar", lat: -34.3487, lon: -58.7953 },
  { id: "benavidez", nombre: "Benavídez", lat: -34.411, lon: -58.688 },
  { id: "del_viso", nombre: "Del Viso", lat: -34.452, lon: -58.799 },
  { id: "tigre", nombre: "Tigre centro", lat: -34.426, lon: -58.5797 },
];

const BASE_MARTINEZ = { nombre: "Base Martínez", lat: -34.4904, lon: -58.5039 };

export const CAMIONETAS: Camioneta[] = [
  { id: "c1", nombre: "Camioneta 1", patente: "AE 123 KD", conductor: "Juan Pérez", color: "#00a5d5", base: BASE_MARTINEZ, inicio: "08:00", fin: "17:00" },
  { id: "c2", nombre: "Camioneta 2", patente: "AF 456 LM", conductor: "Lucas Gómez", color: "#83c735", base: BASE_MARTINEZ, inicio: "08:00", fin: "17:00" },
  { id: "c3", nombre: "Camioneta 3", patente: "AD 789 PQ", conductor: "Martín Díaz", color: "#f59e0b", base: { nombre: "Base Pilar", lat: -34.4587, lon: -58.9142 }, inicio: "08:00", fin: "17:00" },
];

const UBICACIONES = ["Acceso principal", "Avenida central", "Rotonda norte", "Calle del club house", "Salida secundaria", "Zona escuela", "Calle del lago", "Ingreso de servicio"];
const MEZCLA: ProductoId[] = ["tableta", "tableta", "tableta", "totem", "totem", "radar", "radar", "smartred", "espiras"];

function generador(semilla: number) {
  return () => {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function datosIniciales(): DB {
  const azar = generador(20261003);
  const elegir = <T,>(lista: T[]) => lista[Math.floor(azar() * lista.length)];
  const ahora = Date.now();

  const countries: Country[] = COUNTRIES.map(([nombre, zona, lat, lon, facturacion], i) => ({
    id: `b${String(i + 1).padStart(2, "0")}`, nombre, zona, lat, lon, facturacion, ingresoMin: 15, origen: "ficticio",
  }));

  const equipos: Equipo[] = [];
  for (const c of countries) {
    const cantidad = 3 + Math.floor(azar() * 6);
    for (let k = 0; k < cantidad; k++) {
      equipos.push({ id: `${c.id}-e${k + 1}`, countryId: c.id, producto: elegir(MEZCLA), ubicacion: UBICACIONES[k % UBICACIONES.length] });
    }
  }

  // ~2 de cada 3 countries con fallas abiertas, entre 1 y 3 equipos rotos cada uno.
  const fallas: Falla[] = [];
  for (const c of countries) {
    if (azar() < 0.32) continue;
    const propios = equipos.filter((e) => e.countryId === c.id);
    const rotos = 1 + Math.floor(azar() * Math.min(3, propios.length));
    for (const e of propios.slice(0, rotos)) {
      const tipos = TIPOS_FALLA.filter((t) => t.producto === e.producto || (t.producto === "todos" && azar() < 0.1));
      const tipo = elegir(tipos);
      fallas.push({
        id: `f${String(fallas.length + 1).padStart(3, "0")}`, equipoId: e.id, countryId: c.id, tipoId: tipo.id, gravedad: tipo.gravedad,
        abiertaAt: new Date(ahora - (2 + azar() * 70) * 3600_000).toISOString(), estado: "abierta", origen: "ficticio",
      });
    }
  }

  // Asignación inicial del día por zona (el administrador la puede cambiar o pedir la sugerencia del modelo).
  const conFallas = new Set(fallas.map((f) => f.countryId));
  const zonaDe = (c: Country) => (c.lon > -58.7 ? "c1" : c.lat > -34.4 ? "c2" : "c3");
  const fecha = hoy();
  const jornadas: Jornada[] = CAMIONETAS.map((cam) => ({
    id: `${fecha}_${cam.id}`, fecha, camionetaId: cam.id, estado: "pendiente", salteados: [], visitados: [],
    countries: countries.filter((c) => conFallas.has(c.id) && zonaDe(c) === cam.id).map((c) => c.id),
  }));

  return {
    parametros: [PARAMETROS_INICIALES], tipos_falla: TIPOS_FALLA, countries, equipos, fallas,
    camionetas: CAMIONETAS, jornadas, planes: [], eventos: [], cierres: [],
  };
}
