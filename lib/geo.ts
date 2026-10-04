import type { Punto } from "./types";

export function distanciaKm(a: Punto, b: Punto) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Links que abren la app de navegación con el destino cargado (sin API ni costo).
export const linkWaze = (p: Punto) => `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`;
export const linkGoogleMaps = (p: Punto) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
