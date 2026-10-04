"use client";
import dynamic from "next/dynamic";

// Leaflet usa `window`: se carga solo del lado del navegador.
const cargando = () => <div className="grid h-full min-h-[260px] place-items-center rounded-xl bg-slate-100 text-sm text-gris">Cargando mapa…</div>;
const MapaDinamico = dynamic(() => import("./Mapa"), { ssr: false, loading: cargando });
export const MapaSelectorDinamico = dynamic(() => import("./MapaSelector"), { ssr: false, loading: cargando });
export const MapaRutaDinamico = dynamic(() => import("./MapaRuta"), { ssr: false, loading: cargando });

export default MapaDinamico;
