import type { Metadata } from "next";
import { DatosAdmin } from "@/components/admin/datos";
import Shell from "@/components/admin/Shell";

export const metadata: Metadata = { title: { default: "Vialseg · Operaciones", template: "%s · Vialseg" } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <DatosAdmin>
      <Shell>{children}</Shell>
    </DatosAdmin>
  );
}
