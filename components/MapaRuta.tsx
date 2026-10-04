"use client";
// Mapa compacto del recorrido del conductor.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";

const pin = (texto: string, color: string, borde = "#fff") =>
  L.divIcon({ className: "pin", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#0b1424;font:700 12px/22px system-ui;text-align:center;border:2px solid ${borde};box-shadow:0 2px 6px #0006">${texto}</div>` });

export default function MapaRuta({ geometria, paradas, posicion, base, color }: {
  geometria: [number, number][];
  paradas: { lat: number; lon: number; orden: number; hecho?: boolean }[];
  posicion?: { lat: number; lon: number } | null;
  base: { lat: number; lon: number };
  color: string;
}) {
  const puntos: [number, number][] = [...paradas.map((p) => [p.lat, p.lon] as [number, number]), [base.lat, base.lon], ...(posicion ? [[posicion.lat, posicion.lon] as [number, number]] : [])];
  return (
    <MapContainer bounds={L.latLngBounds(puntos).pad(0.15)} style={{ height: "100%", width: "100%" }} zoomControl={false} attributionControl={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {geometria.length > 1 && <Polyline positions={geometria} pathOptions={{ color, weight: 5, opacity: 0.9 }} />}
      {paradas.map((p) => <Marker key={p.orden} position={[p.lat, p.lon]} icon={pin(p.hecho ? "✓" : String(p.orden), p.hecho ? "#94a3b8" : color)} />)}
      <Marker position={[base.lat, base.lon]} icon={pin("B", "#ffffff", "#0b1424")} />
      {posicion && <Marker position={[posicion.lat, posicion.lon]} icon={pin("•", "#00a5d5")} zIndexOffset={1000} />}
    </MapContainer>
  );
}
