// Datos de ejemplo hasta cargar los reales de Vialseg. Coordenadas aproximadas de accesos.
import { PARAMETROS_INICIALES, TIPOS_FALLA } from "./catalogo";
import { hashear } from "./clave";
import { hoy } from "./tiempo";
import type { Camioneta, Country, DB, Equipo, Falla, Jornada, ProductoId, Usuario } from "./types";

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


export const CAMIONETAS: Camioneta[] = [
  { id: "c1", nombre: "Camioneta 1", patente: "", color: "#1d4ed8", inicio: "08:00", fin: "17:00", activa: true }, // Azul
  { id: "c2", nombre: "Camioneta 2", patente: "", color: "#16a34a", inicio: "08:00", fin: "17:00", activa: true }, // Verde
  { id: "c3", nombre: "Camioneta 3", patente: "", color: "#18181b", inicio: "08:00", fin: "17:00", activa: true }, // Negro
];

function usuario(id: string, nombre: string, rol: Usuario["rol"], secreto: string, extra: Partial<Usuario> = {}): Usuario {
  return { id, nombre, rol, ...hashear(secreto), version: 1, activo: true, creadoAt: new Date().toISOString(), ...extra };
}

/** Administrador inicial: usuario "admin", clave ADMIN_CLAVE_INICIAL (se pide cambiarla al entrar). */
export const adminInicial = () =>
  usuario("u-admin", "Administrador", "admin", process.env.ADMIN_CLAVE_INICIAL ?? "vialseg2026", { usuario: "admin", debeCambiarClave: true });

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

export function datosEjemplo(): DB {
  const azar = generador(20261003);
  const elegir = <T,>(lista: T[]) => lista[Math.floor(azar() * lista.length)];
  const ahora = Date.now();

  const countries: Country[] = COUNTRIES.map(([nombre, zona, lat, lon, facturacion], i) => ({
    id: `b${String(i + 1).padStart(2, "0")}`, nombre, zona, lat, lon, facturacion, ingresoMin: 15, activo: true, origen: "ejemplo",
  }));

  const equipos: Equipo[] = [];
  for (const c of countries) {
    const cantidad = 3 + Math.floor(azar() * 6);
    for (let k = 0; k < cantidad; k++) {
      equipos.push({
        id: `${c.id}-e${k + 1}`, countryId: c.id, producto: elegir(MEZCLA), ubicacion: UBICACIONES[k % UBICACIONES.length],
        numeroSerie: `VS-${String(10000 + Math.floor(azar() * 89999))}`, instaladoAt: new Date(ahora - (100 + azar() * 1500) * 86400_000).toISOString().slice(0, 10), activo: true,
      });
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
        abiertaAt: new Date(ahora - (2 + azar() * 70) * 3600_000).toISOString(), estado: "abierta", origen: "ejemplo",
      });
    }
  }

  // Asignación inicial del día por zona (el administrador la puede cambiar o pedir la sugerencia del modelo).
  const conFallas = new Set(fallas.map((f) => f.countryId));
  const zonaDe = (c: Country) => (c.lon > -58.7 ? "c1" : c.lat > -34.4 ? "c2" : "c3");
  const fecha = hoy();
  const conductores = CAMIONETAS.map((_, i) => usuario(`u-cond${i + 1}`, `Conductor ${i + 1}`, "conductor", `${i + 1}`.repeat(4)));
  const jornadas: Jornada[] = CAMIONETAS.map((cam, i) => ({
    id: `${fecha}_${cam.id}`, fecha, camionetaId: cam.id, conductorId: conductores[i].id, estado: "pendiente", salteados: [], visitados: [],
    countries: countries.filter((c) => conFallas.has(c.id) && zonaDe(c) === cam.id).map((c) => c.id),
  }));

  return {
    usuarios: [adminInicial(), ...conductores],
    parametros: [PARAMETROS_INICIALES], tipos_falla: TIPOS_FALLA, countries, equipos, fallas,
    camionetas: CAMIONETAS, jornadas, planes: [], eventos: [], cierres: [],
  };
}

/** Base sin datos operativos: conserva usuarios, flota, parámetros y catálogo. */
export function datosVacios(actual: DB): DB {
  return {
    usuarios: actual.usuarios.length ? actual.usuarios : [adminInicial()],
    parametros: actual.parametros, tipos_falla: actual.tipos_falla, camionetas: actual.camionetas,
    countries: [], equipos: [], fallas: [], jornadas: [], planes: [], eventos: [], cierres: [],
  };
}
