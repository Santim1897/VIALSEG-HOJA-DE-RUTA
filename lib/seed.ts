// Datos de ejemplo hasta cargar los reales de Vialseg. Coordenadas aproximadas de accesos.
import { PARAMETROS_INICIALES, TIPOS_FALLA } from "./catalogo";
import { hashear } from "./clave";
import { hoy } from "./tiempo";
import type { Camioneta, Country, DB, Equipo, Falla, Jornada, ProductoId, Usuario } from "./types";

const COUNTRIES: [string, string, number, number][] = [
  // nombre, zona (partido), lat, lon
  ["Ayres del Pilar", "Pilar", -34.4372, -58.7849],
  ["Highland Park CC", "Pilar", -34.4207, -58.7834],
  ["Estancias del Pilar", "Pilar", -34.422, -58.85],
  ["Pilar del Este", "Pilar", -34.443, -58.804],
  ["La Lomada de Pilar", "Pilar", -34.447, -58.838],
  ["Martindale CC", "Pilar", -34.463, -58.805],
  ["Mayling Club de Campo", "Pilar", -34.435, -58.828],
  ["Tortugas CC", "Pilar", -34.457, -58.735],
  ["Campo Chico CC", "Pilar", -34.426, -58.72],
  ["Haras Santa María", "Escobar", -34.379, -58.785],
  ["Puertos del Lago", "Escobar", -34.354, -58.744],
  ["El Cantón", "Escobar", -34.361, -58.733],
  ["San Sebastián", "Escobar", -34.333, -58.863],
  ["Los Cardales CC", "Exaltación de la Cruz", -34.3297, -58.993],
  ["Nordelta", "Tigre", -34.4025, -58.648],
  ["Los Alisos", "Tigre", -34.396, -58.639],
  ["Santa María de Tigre", "Tigre", -34.421, -58.622],
  ["Santa Bárbara", "Tigre", -34.43, -58.652],
  ["El Encuentro", "Benavídez", -34.407, -58.673],
  ["Villanueva", "Tigre", -34.373, -58.682],
  ["San Isidro Labrador", "Tigre", -34.3675, -58.69],
  ["Talar del Lago", "General Pacheco", -34.4469, -58.6577],
  ["Olivos Golf Club", "Malvinas Argentinas", -34.504, -58.696],
  ["Boulogne Golf", "San Isidro", -34.497, -58.573],
  // Resto del conurbano (zona norte, oeste y sur) hasta completar los ~122 barrios de la cartera.
  ["La Isla (Nordelta)", "Tigre", -34.395, -58.66],
  ["Los Castores (Nordelta)", "Tigre", -34.4, -58.63],
  ["El Golf (Nordelta)", "Tigre", -34.41, -58.65],
  ["Los Lagos (Nordelta)", "Tigre", -34.414, -58.64],
  ["La Alameda (Nordelta)", "Tigre", -34.392, -58.668],
  ["Cabos del Lago (Nordelta)", "Tigre", -34.385, -58.655],
  ["El Yacht (Nordelta)", "Tigre", -34.388, -58.64],
  ["Portezuelo (Nordelta)", "Tigre", -34.38, -58.648],
  ["Castaños (Nordelta)", "Tigre", -34.405, -58.672],
  ["Los Sauces (Nordelta)", "Tigre", -34.412, -58.662],
  ["Las Glorietas (Nordelta)", "Tigre", -34.418, -58.655],
  ["La Bahía (Nordelta)", "Tigre", -34.398, -58.645],
  ["Las Caletas (Nordelta)", "Tigre", -34.393, -58.652],
  ["Los Tilos (Nordelta)", "Tigre", -34.402, -58.668],
  ["Los Puentes (Nordelta)", "Tigre", -34.395, -58.635],
  ["Barrancas del Lago (Nordelta)", "Tigre", -34.408, -58.63],
  ["Santa Catalina (Villanueva)", "Tigre", -34.365, -58.7],
  ["San Gabriel (Villanueva)", "Tigre", -34.37, -58.69],
  ["San Agustín (Villanueva)", "Tigre", -34.375, -58.672],
  ["San Francisco (Villanueva)", "Tigre", -34.381, -58.69],
  ["San Juan (Villanueva)", "Tigre", -34.384, -58.678],
  ["San Marco (Villanueva)", "Tigre", -34.379, -58.665],
  ["Santa Teresa (Villanueva)", "Tigre", -34.358, -58.694],
  ["San Rafael (Villanueva)", "Tigre", -34.362, -58.682],
  ["San Benito (Villanueva)", "Tigre", -34.368, -58.676],
  ["Rincón de Milberg", "Tigre", -34.408, -58.6],
  ["Altamira", "Tigre", -34.413, -58.595],
  ["Albanueva", "Tigre", -34.42, -58.595],
  ["Barrancas de Santa María", "Tigre", -34.425, -58.615],
  ["La Comarca", "Tigre", -34.4, -58.62],
  ["Santa Clara (Villanueva)", "Tigre", -34.373, -58.705],
  ["Vila Marina (Villanueva)", "Tigre", -34.36, -58.688],
  ["Talar del Lago II", "General Pacheco", -34.442, -58.665],
  ["Puertos Ceibos", "Escobar", -34.35, -58.756],
  ["Puertos Araucarias", "Escobar", -34.352, -58.748],
  ["Puertos Acacias", "Escobar", -34.356, -58.752],
  ["Puertos Vistas", "Escobar", -34.349, -58.74],
  ["Puertos Riberas", "Escobar", -34.346, -58.746],
  ["Puertos Costas", "Escobar", -34.344, -58.752],
  ["El Cantón Golf", "Escobar", -34.364, -58.728],
  ["El Cantón Islas", "Escobar", -34.357, -58.738],
  ["El Cazal", "Escobar", -34.36, -58.775],
  ["Maschwitz Club", "Escobar", -34.379, -58.735],
  ["El Aromo", "Escobar", -34.383, -58.745],
  ["Fincas de Maschwitz", "Escobar", -34.39, -58.745],
  ["Septiembre", "Escobar", -34.372, -58.795],
  ["San Matías", "Escobar", -34.335, -58.825],
  ["San Jorge Village", "Escobar", -34.41, -58.81],
  ["El Cantón Puerto", "Escobar", -34.359, -58.728],
  ["Mapuche CC", "Pilar", -34.42, -58.765],
  ["Los Lagartos CC", "Pilar", -34.43, -58.8],
  ["Golfers CC", "Pilar", -34.425, -58.81],
  ["Ayres Vila", "Pilar", -34.433, -58.79],
  ["Pilar Golf", "Pilar", -34.441, -58.874],
  ["Carmel CC", "Pilar", -34.44, -58.865],
  ["La Cañada de Pilar", "Pilar", -34.448, -58.875],
  ["Las Caléndulas", "Pilar", -34.445, -58.88],
  ["Los Fresnos", "Pilar", -34.455, -58.865],
  ["Los Pilares", "Pilar", -34.45, -58.86],
  ["Pilar del Lago", "Pilar", -34.462, -58.86],
  ["Club de Campo Armenia", "Pilar", -34.465, -58.84],
  ["Haras del Pilar", "Pilar", -34.46, -58.88],
  ["La Delfina", "Pilar", -34.475, -58.89],
  ["Pilará", "Pilar", -34.468, -58.932],
  ["Chacras de la Reserva", "Pilar", -34.42, -58.88],
  ["La Escondida de Manzanares", "Pilar", -34.45, -59.0],
  ["Santa Guadalupe (Pilar del Este)", "Pilar", -34.446, -58.808],
  ["San Ramiro (Pilar del Este)", "Pilar", -34.44, -58.8],
  ["San Eduardo (Pilar del Este)", "Pilar", -34.438, -58.809],
  ["Santa Lucía (Pilar del Este)", "Pilar", -34.447, -58.799],
  ["San Lucas (Pilar del Este)", "Pilar", -34.442, -58.813],
  ["Santa Ana (Pilar del Este)", "Pilar", -34.449, -58.804],
  ["Terravista", "General Rodríguez", -34.538, -58.91],
  ["San Diego CC", "Moreno", -34.585, -58.77],
  ["Saint Thomas", "Esteban Echeverría", -34.86, -58.52],
  ["Las Toscas CC", "Esteban Echeverría", -34.88, -58.497],
  ["El Lauquen", "Esteban Echeverría", -34.875, -58.535],
  ["Venado I", "Esteban Echeverría", -34.905, -58.5],
  ["Venado II", "Esteban Echeverría", -34.91, -58.495],
  ["Lagos de Canning", "Esteban Echeverría", -34.865, -58.515],
  ["Echeverría del Lago", "Esteban Echeverría", -34.87, -58.51],
  ["Malibú CC", "Esteban Echeverría", -34.882, -58.52],
  ["Santa Juana", "Esteban Echeverría", -34.895, -58.505],
  ["Campos de Echeverría", "Esteban Echeverría", -34.875, -58.49],
  ["Los Rosales", "Esteban Echeverría", -34.87, -58.54],
  ["El Centauro", "Esteban Echeverría", -34.865, -58.548],
  ["La Horqueta de Echeverría", "Esteban Echeverría", -34.86, -58.53],
  ["Estancia Villa María", "Ezeiza", -34.885, -58.475],
  ["San Eliseo", "San Vicente", -34.9, -58.46],
  ["Lagos de San Eliseo", "San Vicente", -34.905, -58.45],
  ["Fincas de San Vicente", "San Vicente", -34.98, -58.42],
  ["Altos de Hudson", "Berazategui", -34.8, -58.165],
  ["Fincas de Hudson", "Berazategui", -34.792, -58.152],
  ["Abril CC", "Berazategui", -34.805, -58.18],
  ["Hudson Park", "Berazategui", -34.79, -58.14],
  ["Greenville", "Berazategui", -34.798, -58.172],
  ["Fincas de Iraola", "Berazategui", -34.81, -58.145],
  ["Nuevo Quilmes", "Quilmes", -34.715, -58.27],
];


export const CAMIONETAS: Camioneta[] = [
  { id: "c1", nombre: "Camioneta 1", patente: "", color: "#0ea5e9", inicio: "08:00", fin: "17:00", activa: true }, // Celeste
  { id: "c2", nombre: "Camioneta 2", patente: "", color: "#8b5cf6", inicio: "08:00", fin: "17:00", activa: true }, // Violeta
  { id: "c3", nombre: "Camioneta 3", patente: "", color: "#18181b", inicio: "08:00", fin: "17:00", activa: true }, // Negro
];

function usuario(id: string, nombre: string, rol: Usuario["rol"], secreto: string, extra: Partial<Usuario> = {}): Usuario {
  return { id, nombre, rol, ...hashear(secreto), version: 1, activo: true, creadoAt: new Date().toISOString(), ...extra };
}

/** Administrador inicial: usuario "admin", clave ADMIN_CLAVE_INICIAL (se pide cambiarla al entrar). */
export const adminInicial = () =>
  usuario("u-admin", "Administrador", "admin", process.env.ADMIN_CLAVE_INICIAL ?? "vialseg2026", { usuario: "admin", debeCambiarClave: false });

const UBICACIONES = ["Acceso principal", "Avenida central", "Rotonda norte", "Calle del club house", "Salida secundaria", "Zona escuela", "Calle del lago", "Ingreso de servicio"];
// Cada módulo de abono son 2 radares y 1 indicador de velocidad, a $500.000 por mes.
const ABONO_MODULO = 500_000;
const INDICADORES: ProductoId[] = ["tableta", "totem"];

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

  // Entre 2 y 4 módulos por barrio (3 en promedio, unos 9 equipos): la facturación es módulos × abono.
  const modulos = COUNTRIES.map(() => 2 + Math.floor(azar() * 3));
  const countries: Country[] = COUNTRIES.map(([nombre, zona, lat, lon], i) => ({
    id: `b${String(i + 1).padStart(3, "0")}`, nombre, zona, lat, lon, facturacion: modulos[i] * ABONO_MODULO, ingresoMin: 15, activo: true, origen: "ejemplo",
  }));

  const equipos: Equipo[] = [];
  countries.forEach((c, i) => {
    const productos = Array.from({ length: modulos[i] }, (): ProductoId[] => ["radar", "radar", elegir(INDICADORES)]).flat();
    productos.forEach((producto, k) => {
      equipos.push({
        id: `${c.id}-e${k + 1}`, countryId: c.id, producto, ubicacion: UBICACIONES[k % UBICACIONES.length],
        numeroSerie: `VS-${String(10000 + Math.floor(azar() * 89999))}`, instaladoAt: new Date(ahora - (100 + azar() * 1500) * 86400_000).toISOString().slice(0, 10), activo: true,
      });
    });
  });

  // ~1 de cada 5 barrios con fallas abiertas (unos 25 de 122), entre 1 y 3 equipos rotos cada uno.
  const fallas: Falla[] = [];
  for (const c of countries) {
    if (azar() < 0.8) continue;
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
  const zonaDe = (c: Country) => (c.lat < -34.6 ? "c3" : c.lon > -58.72 ? "c1" : "c2"); // sur · Tigre/Escobar · Pilar y oeste
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
