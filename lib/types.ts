export type ProductoId = "totem" | "tableta" | "radar" | "smartred" | "espiras";

export interface Producto {
  id: ProductoId;
  nombre: string;
  familia: "Indicadores de velocidad" | "Fiscalización";
}

export interface TipoFalla {
  id: string;
  producto: ProductoId | "todos";
  nombre: string;
  gravedad: number; // 1 (leve) a 5 (crítica)
}

export interface Punto {
  lat: number;
  lon: number;
}

export interface Country extends Punto {
  id: string;
  nombre: string;
  zona: string;
  direccion?: string;
  contacto?: string; // guardia / administración del barrio
  notas?: string;
  facturacion: number; // ARS por mes
  ingresoMin: number; // minutos de ingreso por guardia
  activo: boolean;
  origen: "ejemplo" | "manual" | "vialseg";
  idExterno?: string;
}

export interface Equipo {
  id: string;
  countryId: string;
  producto: ProductoId;
  ubicacion: string; // descripción del lugar dentro del barrio
  numeroSerie?: string;
  instaladoAt?: string;
  lat?: number;
  lon?: number;
  activo: boolean;
}

export type Rol = "admin" | "conductor";

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  usuario?: string; // login del administrador
  telefono?: string;
  hash: string; // contraseña (admin) o PIN (conductor), scrypt
  sal: string;
  version: number; // cambia al resetear la clave: invalida sesiones abiertas
  activo: boolean;
  debeCambiarClave?: boolean;
  intentosFallidos?: number;
  bloqueadoHasta?: string;
  creadoAt: string;
}

export type UsuarioPublico = Omit<Usuario, "hash" | "sal" | "intentosFallidos" | "bloqueadoHasta">;

export type EstadoFalla = "abierta" | "resuelta";

export interface Falla {
  id: string;
  equipoId: string;
  countryId: string;
  tipoId: string;
  gravedad: number;
  descripcion?: string;
  creadaPor?: string;
  abiertaAt: string;
  cerradaAt?: string;
  estado: EstadoFalla;
  origen: "ejemplo" | "admin" | "vialseg";
  idExterno?: string;
}

export interface Camioneta {
  id: string;
  nombre: string;
  patente: string;
  color: string;
  inicio: string; // "08:00"
  fin: string; // "17:00"
  activa: boolean;
}

export interface Posicion extends Punto {
  at: string;
  fuente: "gps" | "sede" | "country";
}

export interface CacheMatriz {
  ids: string[]; // ["inicio", ...countryIds, "base"]
  min: number[][];
  km: number[][];
  at: string;
  proveedor: string;
}

export interface Jornada {
  id: string; // `${fecha}_${camionetaId}`
  fecha: string;
  camionetaId: string;
  conductorId?: string | null;
  criterioRuteo?: CriterioRuteo; // objetivo elegido para esta camioneta y fecha
  countries: string[]; // asignados por el administrador
  heredado?: boolean; // todavía no guardado: copia del último día planificado
  estado: "pendiente" | "activa" | "finalizada";
  posicion?: Posicion;
  destinoFijo?: string | null; // el conductor tocó "Ir"
  forzado?: string | null; // el administrador obliga el próximo destino
  enSitio?: string | null; // el conductor tocó "Llegué"
  salteados: { countryId: string; motivo: string; at: string }[];
  visitados: string[];
  planId?: string;
  ultimoCalculo?: string;
  iniciadaAt?: string;
  finalizadaAt?: string;
  matriz?: CacheMatriz;
  // Última acción que el conductor puede deshacer (terminar o saltear).
  deshacer?: { tipo: "terminado" | "salteado"; countryId: string; fallas: string[]; cierreId?: string; at: string } | null;
}

export interface Parada {
  countryId: string;
  llegadaMin: number;
  eta: string;
  premio: number;
  servicioMin: number;
  fallas: string[];
  minDesdeAnterior: number;
  kmDesdeAnterior: number;
}

export interface RetornoBase {
  eta: string;
  minutos: number;
  km: number;
  llegadaMin: number;
}

export type CriterioRuteo = "combinado" | "facturacion" | "equipos_rotos" | "espera" | "gravedad" | "combustible";

export type MotivoPlan = "inicio" | "terminado" | "periodico" | "falla_nueva" | "admin" | "salteado" | "manual";

export interface Plan {
  id: string;
  jornadaId: string;
  camionetaId: string;
  fecha: string;
  creadoAt: string;
  motivo: MotivoPlan;
  desde: Posicion;
  paradas: Parada[];
  noVisitados: string[];
  minutosTotales: number;
  kmTotales: number;
  retornoBase?: RetornoBase;
  criterioRuteo?: CriterioRuteo;
  objetivo: number;
  estado: string;
  segundos: number;
  motor: string;
  proveedor: string;
  conTrafico: boolean;
  geometria: [number, number][];
  sugerencia?: { countryId: string; mensaje: string } | null;
}

export type TipoEvento =
  | "inicio" | "ir" | "llegue" | "cancelar_llegada" | "terminado" | "salteado" | "deshacer" | "fin" | "reabrir"
  | "falla_nueva" | "falla_editada" | "plan_dia" | "alta" | "edicion" | "baja" | "sesion" | "datos";

export interface Evento {
  id: string;
  at: string;
  usuarioId?: string;
  camionetaId?: string;
  tipo: TipoEvento;
  countryId?: string;
  detalle?: string;
}

export interface Cierre {
  id: string;
  at: string;
  camionetaId: string;
  conductorId?: string;
  countryId: string;
  fallasResueltas: string[];
  fallasPendientes: string[];
  resultado: "resuelto" | "parcial" | "sin_resolver";
  trabajos: string[];
  nota?: string;
  foto?: string;
}

export interface Parametros {
  id: "general";
  pesoUrgencia: number; // 0-1: cuánto castiga atender tarde lo urgente
  costoMinuto: number; // costo por minuto de manejo, en puntos de premio
  costoFijoCamioneta: number; // para el modelo de asignación
  minutosPorFalla: number; // por equipo con falla: trabajo + manejo dentro del barrio
  recalculoMin: number;
  umbralCambioMin: number;
  factorHoras: number; // +X por cada 24 h caído
  factorFacturacion: number;
  factorRotos: number;
  navegador: "waze" | "google";
}

export interface DB {
  usuarios: Usuario[];
  parametros: Parametros[];
  tipos_falla: TipoFalla[];
  countries: Country[];
  equipos: Equipo[];
  fallas: Falla[];
  camionetas: Camioneta[];
  jornadas: Jornada[];
  planes: Plan[];
  eventos: Evento[];
  cierres: Cierre[];
}

export type Coleccion = keyof DB;
