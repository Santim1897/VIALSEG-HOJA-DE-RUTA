import type { Metadata } from "next";
import ConductorApp from "@/components/conductor/ConductorApp";

export const metadata: Metadata = { title: "Mi recorrido · Vialseg", manifest: "/manifest.webmanifest" };

export default function Conductor() {
  return <ConductorApp />;
}
