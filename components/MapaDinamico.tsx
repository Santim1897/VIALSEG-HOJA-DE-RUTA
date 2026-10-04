"use client";
import dynamic from "next/dynamic";

// Leaflet usa `window`: se carga solo del lado del navegador.
const MapaDinamico = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[420px] place-items-center bg-slate-100 text-sm text-gris">Cargando mapa…</div>,
});

export default MapaDinamico;
