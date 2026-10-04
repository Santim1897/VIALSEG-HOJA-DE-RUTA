"use client";
// Mapa operativo (Leaflet + OpenStreetMap). Se carga solo en el navegador (ver MapaDinamico).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import { COLOR_GRAVEDAD, NOMBRE_GRAVEDAD, nombreProducto } from "@/lib/catalogo";
import { duracion, hora, horasDesde } from "@/lib/tiempo";
import type { Camioneta, Country, Equipo, Falla, Plan, Posicion, TipoFalla } from "@/lib/types";

export interface DatosMapa {
  countries: Country[];
  fallas: Falla[];
  equipos: Equipo[];
  tipos: TipoFalla[];
  camionetas: Camioneta[];
  planes: Record<string, Plan>;
  posiciones: Record<string, Posicion | undefined>;
  asignado: Record<string, string>; // countryId → camionetaId
  visibles: Record<string, boolean>;
  conductores?: Record<string, string>; // camionetaId → nombre del conductor del día
}

const icono = (html: string, tam: number) => L.divIcon({ className: "pin", html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
const iconoParada = (n: number, color: string) =>
  icono(`<div style="width:22px;height:22px;border-radius:50%;background:${color};color:#0b1424;font:700 11px/22px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px #0004">${n}</div>`, 22);
const iconoCamioneta = (color: string) =>
  icono(`<div style="width:34px;height:34px;border-radius:12px;background:#0b1424;border:3px solid ${color};display:grid;place-items:center;box-shadow:0 4px 12px #0006"><svg width="18" height="18" viewBox="0 0 24 24" fill="${color}"><path d="M3 6h11v9h1.5V9h3.2L22 12.5V17h-2a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0H3z"/></svg></div>`, 34);
const iconoBase = icono(`<div style="width:16px;height:16px;transform:rotate(45deg);background:#0b1424;border:2px solid #fff;box-shadow:0 2px 6px #0005"></div>`, 16);

export default function Mapa({ datos, alto = 520 }: { datos: DatosMapa; alto?: number | string }) {
  const { countries, fallas, equipos, tipos, camionetas, planes, posiciones, asignado, visibles, conductores = {} } = datos;
  const abiertas = (id: string) => fallas.filter((f) => f.countryId === id && f.estado === "abierta");
  const bases = [...new Map(camionetas.map((c) => [`${c.base.lat},${c.base.lon}`, c.base])).values()];

  return (
    <MapContainer center={[-34.42, -58.74]} zoom={11} scrollWheelZoom style={{ height: alto, minHeight: 560, width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {camionetas.filter((c) => visibles[c.id] !== false).map((c) => {
        const plan = planes[c.id];
        return plan?.geometria?.length ? (
          <Polyline key={`r-${c.id}-${plan.id}`} positions={plan.geometria} pathOptions={{ color: c.color, weight: 5, opacity: 0.85 }} />
        ) : null;
      })}

      {countries.filter((c) => c.activo !== false).map((c) => {
        const fs = abiertas(c.id);
        const g = Math.max(0, ...fs.map((f) => f.gravedad));
        const cam = camionetas.find((k) => k.id === asignado[c.id]);
        return (
          <CircleMarker
            key={c.id}
            center={[c.lat, c.lon]}
            radius={fs.length ? 8 + fs.length * 2.5 : 6}
            pathOptions={{ color: cam?.color ?? "#ffffff", weight: cam ? 3 : 2, fillColor: COLOR_GRAVEDAD[g], fillOpacity: fs.length ? 0.9 : 0.55 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>{c.nombre}</Tooltip>
            <Popup minWidth={260}>
              <div className="text-[13px] text-tinta">
                <p className="text-sm font-semibold">{c.nombre}</p>
                <p className="text-xs text-gris">
                  {c.zona} · {cam ? <span style={{ color: cam.color }} className="font-semibold">{cam.nombre}</span> : "Sin asignar hoy"}
                </p>
                {fs.length === 0 ? (
                  <p className="mt-2 text-xs text-gris">Sin fallas abiertas.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {fs.map((f) => {
                      const e = equipos.find((x) => x.id === f.equipoId);
                      return (
                        <li key={f.id} className="flex gap-2">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_GRAVEDAD[f.gravedad] }} />
                          <span>
                            <b className="font-medium">{e ? nombreProducto(e.producto) : "Equipo"}</b> · {tipos.find((t) => t.id === f.tipoId)?.nombre}
                            <span className="block text-[11px] text-gris">{e?.ubicacion} · caído hace {duracion(horasDesde(f.abiertaAt))} · {NOMBRE_GRAVEDAD[f.gravedad]}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {camionetas.filter((c) => visibles[c.id] !== false).flatMap((c) =>
        (planes[c.id]?.paradas ?? []).map((p, i) => {
          const ct = countries.find((x) => x.id === p.countryId);
          return ct ? (
            <Marker key={`p-${c.id}-${p.countryId}`} position={[ct.lat, ct.lon]} icon={iconoParada(i + 1, c.color)} zIndexOffset={500}>
              <Tooltip direction="right" offset={[10, 0]}>{`${c.nombre} · parada ${i + 1} · ${ct.nombre} · ${hora(p.eta)}`}</Tooltip>
            </Marker>
          ) : null;
        }),
      )}

      {bases.map((b) => (
        <Marker key={b.nombre} position={[b.lat, b.lon]} icon={iconoBase}>
          <Tooltip direction="top">{b.nombre}</Tooltip>
        </Marker>
      ))}

      {camionetas.map((c) => {
        const pos = posiciones[c.id];
        return pos ? (
          <Marker key={`cam-${c.id}`} position={[pos.lat, pos.lon]} icon={iconoCamioneta(c.color)} zIndexOffset={1000}>
            <Tooltip direction="top" offset={[0, -14]}>{`${c.nombre}${conductores[c.id] ? ` · ${conductores[c.id]}` : ""} · ${hora(pos.at)}`}</Tooltip>
          </Marker>
        ) : null;
      })}


    </MapContainer>
  );
}
