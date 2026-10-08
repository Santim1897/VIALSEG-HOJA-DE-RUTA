// Almacenamiento con una sola interfaz y dos implementaciones:
//  - Supabase (Postgres) si están SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//  - Archivo JSON local (.data/db.json, o /tmp en Vercel) para desarrollar sin base.
// El resto del sistema no sabe cuál se usa: así se cambia de fuente sin reescribir nada.
import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminInicial, datosEjemplo } from "./seed";
import type { Coleccion, DB } from "./types";

export interface Store {
  tipo: "supabase" | "archivo";
  leer(): Promise<DB>;
  guardar<C extends Coleccion>(coleccion: C, docs: DB[C]): Promise<void>;
  borrar(coleccion: Coleccion, ids: string[]): Promise<void>;
  reiniciar(db: DB): Promise<void>;
}

const COLECCIONES: Coleccion[] = ["usuarios", "parametros", "tipos_falla", "countries", "equipos", "fallas", "camionetas", "jornadas", "planes", "eventos", "cierres"];
const vacia = (): DB => Object.fromEntries(COLECCIONES.map((c) => [c, []])) as unknown as DB;

// ---------------------------------------------------------------- Supabase
const TABLA = "vialseg_docs";

class StoreSupabase implements Store {
  tipo = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  async leer(): Promise<DB> {
    const db = vacia();
    let desde = 0;
    for (;;) {
      const { data, error } = await this.sb.from(TABLA).select("coleccion,data").order("coleccion").order("id").range(desde, desde + 999);
      if (error) throw new Error(`Supabase: ${error.message}`);
      for (const fila of data ?? []) (db[fila.coleccion as Coleccion] as unknown[])?.push(fila.data);
      if (!data || data.length < 1000) break;
      desde += 1000;
    }
    if (!db.usuarios.length && !db.countries.length) {
      const inicial = datosEjemplo();
      await this.reiniciar(inicial);
      return inicial;
    }
    if (!db.usuarios.some((u) => u.rol === "admin")) {
      db.usuarios.push(adminInicial());
      await this.guardar("usuarios", db.usuarios);
    }
    return db;
  }

  async guardar<C extends Coleccion>(coleccion: C, docs: DB[C]) {
    if (!docs.length) return;
    const filas = (docs as { id: string }[]).map((d) => ({ coleccion, id: d.id, data: d, updated_at: new Date().toISOString() }));
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await this.sb.from(TABLA).upsert(filas.slice(i, i + 500));
      if (error) throw new Error(`Supabase: ${error.message}`);
    }
  }

  async borrar(coleccion: Coleccion, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.sb.from(TABLA).delete().eq("coleccion", coleccion).in("id", ids);
    if (error) throw new Error(`Supabase: ${error.message}`);
  }

  async reiniciar(db: DB) {
    const { error } = await this.sb.from(TABLA).delete().neq("coleccion", "");
    if (error) throw new Error(`Supabase: ${error.message}`);
    for (const c of COLECCIONES) await this.guardar(c, db[c]);
  }
}

// ---------------------------------------------------------------- Archivo local
class StoreArchivo implements Store {
  tipo = "archivo" as const;
  private cola: Promise<unknown> = Promise.resolve();
  private archivo = process.env.VERCEL ? "/tmp/vialseg-db.json" : path.join(process.cwd(), ".data", "db.json");

  private enCola<T>(tarea: () => Promise<T>): Promise<T> {
    const r = this.cola.then(tarea, tarea);
    this.cola = r.catch(() => undefined);
    return r;
  }
  private async cargar(): Promise<DB> {
    try {
      const raw = await fs.readFile(this.archivo, "utf8");
      if (!raw || raw.trim().length === 0) {
        throw new Error("Archivo vacío");
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.usuarios)) {
        throw new Error("JSON con estructura inválida");
      }
      const db: DB = { ...vacia(), ...parsed };
      if (!db.usuarios.some((u) => u.rol === "admin")) {
        db.usuarios.push(adminInicial());
        await this.escribir(db);
      }
      return db;
    } catch {
      const db = datosEjemplo();
      await this.escribir(db);
      return db;
    }
  }
  private async escribir(db: DB) {
    await fs.mkdir(path.dirname(this.archivo), { recursive: true });
    const tmp = `${this.archivo}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db));
    await fs.rename(tmp, this.archivo);
  }
  leer() {
    return this.enCola(() => this.cargar());
  }
  guardar<C extends Coleccion>(coleccion: C, docs: DB[C]) {
    return this.enCola(async () => {
      const db = await this.cargar();
      const lista = db[coleccion] as { id: string }[];
      for (const doc of docs as { id: string }[]) {
        const i = lista.findIndex((d) => d.id === doc.id);
        if (i >= 0) lista[i] = doc;
        else lista.push(doc);
      }
      await this.escribir(db);
    });
  }
  borrar(coleccion: Coleccion, ids: string[]) {
    return this.enCola(async () => {
      const db = await this.cargar();
      (db[coleccion] as { id: string }[]) = (db[coleccion] as { id: string }[]).filter((d) => !ids.includes(d.id));
      await this.escribir(db);
    });
  }
  reiniciar(db: DB) {
    return this.enCola(() => this.escribir(db));
  }
}

let instancia: Store | null = null;
export function store(): Store {
  if (!instancia) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    instancia = url && clave ? new StoreSupabase(createClient(url, clave, { auth: { persistSession: false } })) : new StoreArchivo();
  }
  return instancia;
}
