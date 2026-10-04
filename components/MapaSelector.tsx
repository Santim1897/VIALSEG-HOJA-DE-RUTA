"use client";
// Mapa para elegir una ubicación con un clic (alta de countries y bases).
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { Punto } from "@/lib/types";

function Clic({ elegir }: { elegir: (p: Punto) => void }) {
  useMapEvents({ click: (e) => elegir({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) }) });
  return null;
}

export default function MapaSelector({ valor, elegir, referencias = [] }: { valor?: Punto | null; elegir: (p: Punto) => void; referencias?: (Punto & { nombre: string })[] }) {
  return (
    <MapContainer center={valor ? [valor.lat, valor.lon] : [-34.42, -58.74]} zoom={valor ? 14 : 10} style={{ height: 260, width: "100%", borderRadius: 12, cursor: "crosshair" }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Clic elegir={elegir} />
      {referencias.map((r) => (
        <CircleMarker key={r.nombre} center={[r.lat, r.lon]} radius={4} pathOptions={{ color: "#94a3b8", fillOpacity: 0.6 }}>
          <Tooltip>{r.nombre}</Tooltip>
        </CircleMarker>
      ))}
      {valor && <CircleMarker center={[valor.lat, valor.lon]} radius={9} pathOptions={{ color: "#0b1424", weight: 3, fillColor: "#83c735", fillOpacity: 1 }} />}
    </MapContainer>
  );
}
