// Almacenamiento con una sola interfaz y dos implementaciones:
//  - Supabase (Postgres) si están SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//  - Archivo JSON local (.data/db.json, o /tmp en Vercel) para desarrollar sin base o si Supabase no responde.
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
  private fallback = new StoreArchivo();
  constructor(private sb: SupabaseClient) {}

  async leer(): Promise<DB> {
    const db = vacia();
    let desde = 0;
    try {
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
    } catch (e) {
      console.error("Supabase leer error, usando fallback local:", e);
      return this.fallback.leer();
    }
  }

  async guardar<C extends Coleccion>(coleccion: C, docs: DB[C]) {
    if (!docs.length) return;
    const filas = (docs as { id: string }[]).map((d) => ({ coleccion, id: d.id, data: d, updated_at: new Date().toISOString() }));
    try {
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await this.sb.from(TABLA).upsert(filas.slice(i, i + 500));
        if (error) throw new Error(`Supabase: ${error.message}`);
      }
    } catch (e) {
      console.error("Supabase guardar error:", e);
      await this.fallback.guardar(coleccion, docs);
    }
  }

  async borrar(coleccion: Coleccion, ids: string[]) {
    if (!ids.length) return;
    try {
      const { error } = await this.sb.from(TABLA).delete().eq("coleccion", coleccion).in("id", ids);
      if (error) throw new Error(`Supabase: ${error.message}`);
    } catch (e) {
      console.error("Supabase borrar error:", e);
      await this.fallback.borrar(coleccion, ids);
    }
  }

  async reiniciar(db: DB) {
    try {
      const { error } = await this.sb.from(TABLA).delete().neq("coleccion", "");
      if (error) throw new Error(`Supabase: ${error.message}`);
      for (const c of COLECCIONES) await this.guardar(c, db[c]);
    } catch (e) {
      console.error("Supabase reiniciar error:", e);
      await this.fallback.reiniciar(db);
    }
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
      const raw = await fs.readFile(this.archivo, "utf-8");
      if (!raw.trim()) throw new Error("vacío");
      const db = { ...vacia(), ...JSON.parse(raw) };
      if (!db.usuarios?.length && !db.countries?.length) throw new Error("sin datos");
      return db;
    } catch {
      const inicial = datosEjemplo();
      await this.escribir(inicial);
      return inicial;
    }
  }
  private async escribir(db: DB): Promise<void> {
    await fs.mkdir(path.dirname(this.archivo), { recursive: true });
    await fs.writeFile(this.archivo, JSON.stringify(db, null, 2), "utf-8");
  }

  async leer(): Promise<DB> {
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

// Configuración predeterminada de Supabase para Vialseg (Base de datos propia en la nube)
const DEFAULT_SUPABASE_URL = "https://xjgliotwjjsrduwfybya.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_secret_4DLwjx5QPsmKyjqncIEM5w_RnwnZ9cn";

let instancia: Store | null = null;
export function store(): Store {
  if (!instancia) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SUPABASE_KEY;
    instancia = url && clave ? new StoreSupabase(createClient(url, clave, { auth: { persistSession: false } })) : new StoreArchivo();
  }
  return instancia;
}
