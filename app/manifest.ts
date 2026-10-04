import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vialseg · Recorridos",
    short_name: "Vialseg",
    description: "Próximo destino óptimo para el conductor.",
    start_url: "/conductor",
    display: "standalone",
    background_color: "#0b1424",
    theme_color: "#0b1424",
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
