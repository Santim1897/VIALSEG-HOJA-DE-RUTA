import { redirect } from "next/navigation";

// proxy.ts redirige según la sesión; esto cubre el caso sin proxy.
export default function Inicio() {
  redirect("/login");
}
