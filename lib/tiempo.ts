// Fechas y horas siempre en la zona horaria de Buenos Aires (Vercel corre en UTC).
const ZONA = "America/Argentina/Buenos_Aires";

export const hoy = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

export function minutosDelDia(d = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(d)
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
}

export const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const hora = (iso: string | Date) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00-03:00`));

export function horasDesde(iso: string, ahora = Date.now()) {
  return Math.max(0, (ahora - new Date(iso).getTime()) / 3600_000);
}

export function duracion(horas: number) {
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} días`;
}
