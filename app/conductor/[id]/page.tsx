import type { Metadata } from "next";
import ConductorApp from "@/components/conductor/ConductorApp";

export const metadata: Metadata = { title: "Mi ruta · Vialseg", manifest: "/manifest.webmanifest" };

export default async function Conductor(props: PageProps<"/conductor/[id]">) {
  const { id } = await props.params;
  return <ConductorApp camionetaId={id} />;
}
