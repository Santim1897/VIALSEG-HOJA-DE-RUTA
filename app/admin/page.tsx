import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = { title: "Centro de operaciones · Vialseg" };

export default function Admin() {
  return <AdminApp />;
}
