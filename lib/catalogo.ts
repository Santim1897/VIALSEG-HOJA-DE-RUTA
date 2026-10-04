import type { Parametros, Producto, ProductoId, TipoFalla } from "./types";

// Productos que Vialseg instala en barrios privados (matriz BCG de la presentación del grupo).
export const PRODUCTOS: Producto[] = [
  { id: "totem", nombre: "Tótem indicador de velocidad", familia: "Indicadores de velocidad" },
  { id: "tableta", nombre: "Tableta indicadora", familia: "Indicadores de velocidad" },
  { id: "radar", nombre: "Radar fotográfico", familia: "Fiscalización" },
  { id: "smartred", nombre: "SmartRed", familia: "Fiscalización" },
  { id: "espiras", nombre: "Cinemómetro por espiras", familia: "Fiscalización" },
];

export const nombreProducto = (id: ProductoId) => PRODUCTOS.find((p) => p.id === id)?.nombre ?? id;

// Gravedad 1 (leve) a 5 (crítica). Borrador para validar con Vialseg; editable desde Parámetros.
export const TIPOS_FALLA: TipoFalla[] = [
  { id: "radar_no_registra", producto: "radar", nombre: "No registra / fuera de servicio", gravedad: 5 },
  { id: "radar_camara", producto: "radar", nombre: "Cámara o imagen defectuosa", gravedad: 4 },
  { id: "radar_calibracion", producto: "radar", nombre: "Error de calibración", gravedad: 4 },
  { id: "radar_comunicacion", producto: "radar", nombre: "Sin comunicación", gravedad: 3 },
  { id: "espiras_no_detecta", producto: "espiras", nombre: "Espira dañada / no detecta", gravedad: 5 },
  { id: "espiras_medicion", producto: "espiras", nombre: "Error de medición", gravedad: 4 },
  { id: "espiras_registro", producto: "espiras", nombre: "Falla del registro fotográfico", gravedad: 4 },
  { id: "espiras_comunicacion", producto: "espiras", nombre: "Sin comunicación", gravedad: 3 },
  { id: "smartred_fuera", producto: "smartred", nombre: "Fuera de servicio", gravedad: 5 },
  { id: "smartred_camara", producto: "smartred", nombre: "Cámara caída", gravedad: 4 },
  { id: "smartred_comunicacion", producto: "smartred", nombre: "Sin comunicación", gravedad: 3 },
  { id: "totem_apagado", producto: "totem", nombre: "Apagado", gravedad: 3 },
  { id: "totem_medicion", producto: "totem", nombre: "Mide mal / falla de radar", gravedad: 3 },
  { id: "totem_display", producto: "totem", nombre: "Display o LEDs dañados", gravedad: 2 },
  { id: "totem_comunicacion", producto: "totem", nombre: "Sin comunicación", gravedad: 1 },
  { id: "tableta_apagada", producto: "tableta", nombre: "Apagada", gravedad: 3 },
  { id: "tableta_medicion", producto: "tableta", nombre: "Mide mal / falla de radar", gravedad: 3 },
  { id: "tableta_display", producto: "tableta", nombre: "Display o LEDs dañados", gravedad: 2 },
  { id: "tableta_comunicacion", producto: "tableta", nombre: "Sin comunicación", gravedad: 1 },
  { id: "dano_fisico", producto: "todos", nombre: "Daño físico con riesgo (poste caído, cables expuestos)", gravedad: 5 },
];

export const PARAMETROS_INICIALES: Parametros = {
  id: "general",
  pesoUrgencia: 0.5,
  costoMinuto: 0.05,
  costoFijoCamioneta: 0,
  minutosPorFalla: 20,
  recalculoMin: 10,
  umbralCambioMin: 10,
  factorHoras: 0.25,
  factorFacturacion: 0.3,
  factorRotos: 0.5,
  navegador: "waze",
};

export const COLOR_GRAVEDAD = ["#94a3b8", "#facc15", "#facc15", "#fb923c", "#ef4444", "#dc2626"];
export const NOMBRE_GRAVEDAD = ["Sin fallas", "Leve", "Baja", "Media", "Alta", "Crítica"];

export const MOTIVOS_SALTEO = ["No me dejan entrar", "Barrio cerrado", "No llego a tiempo", "Otro"];
export const TRABAJOS = ["Reinicio", "Calibración", "Cambio de pieza", "Limpieza", "Conexión / cableado", "Configuración", "Otro"];
