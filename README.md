# Vialseg · Hoja de ruta v2

Sistema que le indica a cada conductor de Vialseg **a qué country ir después**, por cálculo y no por experiencia, y le da a la administración de Martínez una vista de todas las camionetas. Proyecto de consultoría de la materia Supply Chain (ITBA), unidad *Redes de Distribución*.

> Rama `v2/base-nueva`: reescritura completa. El prototipo anterior (un solo `app.py`) quedó en [`legacy/`](legacy/) como referencia. Datos **ficticios**: countries, coordenadas, equipos y fallas son simulados.

## Qué hace

| Vista | Para quién | Qué ve |
|---|---|---|
| `/admin` | Administración (Martínez) | Mapa con todos los countries coloreados por gravedad, recorrido de cada camioneta en su color, KPIs, asignación del día, carga de fallas, análisis de red, auditoría y parámetros |
| `/conductor/c1` … `c3` | Conductor (celular) | Solo su próximo destino, botón **Ir con Waze**, **Llegué**, **Terminé** (cierre con foto opcional) y **No puedo ir** |
| `/` | Todos | Elección de perfil |

Flujo de un día:

1. El administrador asigna a cada camioneta los countries del día (a mano, o con **Sugerir con el modelo**).
2. El conductor toca **Iniciar jornada**: se toma su ubicación GPS y se calcula su recorrido óptimo.
3. **Ir con Waze** abre Waze con el destino cargado (sin API, por link). Ese destino queda fijo.
4. **Llegué** → ve las fallas del country → **Terminé** (qué quedó resuelto, trabajos, foto opcional). Se recalcula **desde ese country**.
5. Mientras la jornada está activa, cada 10 minutos el celular pide recalcular con el tráfico. Si por tráfico conviene otro destino y ahorra más que el umbral (10 min), se le **sugiere**; no se le cambia solo.
6. Si no puede entrar a un country, **No puedo ir** + motivo: la falla queda pendiente y se recalcula.
7. Si se carga una falla nueva en un country asignado a una camioneta en ruta, esa ruta se recalcula sola.
8. Sin señal: la app muestra el último plan, guarda las acciones en una bandeja de salida y las envía al volver la conexión.

## Arquitectura

```
Navegador (Next.js / React)            Servidor (Next.js, rutas /api)                 Servicios
 ├─ /admin  (mapa Leaflet + OSM)  ──►  /api/admin      lee/escribe ─────────────►  Supabase (Postgres)  o  .data/db.json
 └─ /conductor/[id] (PWA)         ──►  /api/conductor  arma el problema ──────────►  Optimizador Python (/api/py, OR-Tools)
                                       /api/analisis   pide tiempos de viaje ─────►  Google Routes (tráfico) → OSRM → estimado
                                                                                   Waze / Google Maps (links)
```

| Carpeta | Contenido |
|---|---|
| `app/` | Páginas (`/`, `/admin`, `/conductor/[id]`), rutas de API, manifest PWA |
| `components/` | `admin/*` (panel), `conductor/ConductorApp.tsx`, `Mapa.tsx` |
| `lib/` | Dominio: `types.ts`, `catalogo.ts` (productos y gravedades), `seed.ts` (datos ficticios), `premio.ts` (valoración), `motor.ts` (orquestación), `rutas.ts` (tiempos de viaje), `store.ts` (almacenamiento), `acciones.ts` |
| `api/` | Optimizador en Python: `index.py` (FastAPI) y `_modelos/` (`ruteo.py`, `asignacion.py`, `gravedad.py`) |
| `supabase/migrations/` | Esquema de la base |
| `tests/` | Pruebas de los modelos |
| `docs/` | [MODELOS.md](docs/MODELOS.md) (matemática), [DECISIONES.md](docs/DECISIONES.md) (qué se decidió y por qué) |

## Modelos de optimización (detalle en [docs/MODELOS.md](docs/MODELOS.md))

| Modelo | Pregunta | Técnica | Tema de la materia |
|---|---|---|---|
| Ruteo | ¿En qué orden visito mis countries? | Programación dinámica exacta; misma formulación como PLE con OR-Tools + SCIP | Redes, programación lineal entera |
| Asignación | ¿Qué countries hace cada camioneta? | PLE con OR-Tools + SCIP | Alocación de demanda por maximización de beneficios |
| Centro de gravedad | ¿Dónde conviene la base? | Weiszfeld, comparación de bases | Modelo de centro de gravedad |

**Premio de un country** = Σ gravedad × (1 + 0,25 por cada 24 h caído, hasta 4 días) × (1 + 0,3 × facturación relativa) × (1 + 0,5 × % de equipos rotos). Todos los pesos se editan en **Parámetros**.

## Datos variables (lo que después viene de la plataforma de Vialseg)

| Dato | Hoy | Producción |
|---|---|---|
| Fallas abiertas | `seed.ts` + carga manual en `/admin` | API de Vialseg (`origen: "vialseg"`, `idExterno`) |
| Countries y equipos | `seed.ts` (coordenadas aproximadas) | Plataforma de Vialseg + GPS real de cada equipo |
| Gravedad por tipo de falla | `catalogo.ts`, editable | Validar con Vialseg |
| Facturación por cliente | ficticia | Vialseg |
| Camionetas, bases, horarios | `seed.ts` | Carga en administración |
| Tiempos de viaje | OSRM (sin tráfico) | Google Routes con `GOOGLE_MAPS_API_KEY` |

Todo pasa por `lib/store.ts`: para conectar Vialseg se agrega un importador que escriba fallas con `origen: "vialseg"`; el resto del sistema no cambia.

## Ejecutar localmente

Requisitos: Node 20+ y Python 3.12+.

```bash
npm install
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows (en Mac/Linux: .venv/bin/pip)
cp .env.example .env.local                      # completar si hay Supabase / Google

# terminal 1: optimizador
.venv\Scripts\python -m uvicorn api.index:app --port 8000 --reload --reload-dir api
# terminal 2: web
npm run dev
```

Abrir **http://localhost:3000** (usar `localhost`, no `127.0.0.1`, por las protecciones de Next en desarrollo).

Sin Supabase, los datos se guardan en `.data/db.json`. **Parámetros → Reiniciar demo** vuelve a los datos iniciales.

Pruebas:

```bash
.venv\Scripts\python -m unittest discover tests   # modelos (incluye PD = PLE)
npx tsc --noEmit && npm run lint                  # tipos y estilo
```

## Supabase

1. Crear el proyecto (región São Paulo) en supabase.com.
2. SQL Editor → ejecutar [`supabase/migrations/0001_inicial.sql`](supabase/migrations/0001_inicial.sql).
3. Poner `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (y en Vercel). La primera lectura carga los datos ficticios.

La tabla tiene RLS activado sin políticas: solo el servidor (con la `service_role`) accede. Nunca usar esa clave en el navegador.

## Deploy en Vercel

El proyecto se sube desde la carpeta local con la CLI (no depende de permisos en el repo de GitHub):

```bash
npx vercel login
npx vercel            # primera vez: crea el proyecto (preview)
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add GOOGLE_MAPS_API_KEY production   # opcional
npx vercel --prod
```

Vercel construye Next.js y publica `api/index.py` como función de Python (`requirements.txt`). En producción `/api/py/*` se redirige a esa función (`next.config.ts`). Sin Supabase, en Vercel los datos viven en `/tmp` y se pierden: usar Supabase para mostrarlo.

## Limitaciones conocidas

- Sin contraseñas: se elige el perfil en `/`. Pendiente: Supabase Auth con roles.
- GPS solo cuando la app está abierta (una web no puede seguir la ubicación en segundo plano).
- Sin tráfico mientras no haya clave de Google; OSRM público no garantiza disponibilidad.
- Fuera del horario de jornada (por ejemplo, en una demo de noche) se planifica una jornada completa desde ahora.
- Fotos guardadas dentro del registro (comprimidas, ~150 KB); pendiente: Supabase Storage.
- Fuera de alcance por ahora: horarios de acceso de cada barrio, repuestos y habilidades por camioneta.

## Colaboración

Igual que antes: ramas + Pull Request hacia `main` con aprobación de @Santim1897 (ver [CONTRIBUTING.md](CONTRIBUTING.md) y [AGENTS.md](AGENTS.md)).
