# Vialseg · Hoja de ruta v2

Sistema que le indica a cada conductor de Vialseg **a qué country ir después**, por cálculo y no por experiencia, y le da a la administración una vista de todas las camionetas. Todas salen de la sede de Vialseg (Martín Lezica 3093, San Isidro). Proyecto de consultoría de la materia Supply Chain (ITBA), unidad *Redes de Distribución*.

> Rama `v2/base-nueva`: reescritura completa. El prototipo anterior (un solo `app.py`) quedó en [`legacy/`](legacy/) como referencia. Hasta recibir los datos reales de Vialseg, el sistema arranca con datos de ejemplo (countries, equipos, fallas y conductores).

## Qué hace

Ingreso único en `/login` con dos roles. Cada rol solo accede a su sección: lo controla `proxy.ts` antes de mostrar la página y, además, cada ruta de API valida la sesión contra la base.

| Rol | Cómo entra | Qué usa |
|---|---|---|
| Administración | Usuario y contraseña (mín. 8 caracteres) | Panel `/admin` |
| Conductor | Elige su nombre y pone su PIN de 4 números | App `/conductor` en el celular (instalable) |

**Panel de administración** (menú lateral):

| Sección | Para qué |
|---|---|
| En vivo | Mapa con los countries por gravedad, recorrido de cada camioneta en su color, posición, próximo destino, KPIs. Forzar el próximo destino (con confirmación) y recalcular |
| Planificación | Para hoy o días próximos: qué conductor maneja cada camioneta y qué countries atiende. Se edita con **Editar plan**, se revisa el resumen de cambios y se confirma. "Sugerir distribución" usa el modelo de asignación. No deja quitar countries ya atendidos ni poner un conductor o un country en dos camionetas |
| Fallas | Abiertas y resueltas, filtros, alta (country, equipo, tipo, gravedad), edición, resolver, reabrir, eliminar |
| Countries y equipos | Alta, edición y baja de countries (ubicación con clic en el mapa, contacto, indicaciones para el conductor) y de sus equipos (producto, ubicación, n.º de serie, instalación). Ficha con fallas y visitas |
| Flota | Camionetas: patente, color, base y horario de jornada; sacar de servicio |
| Usuarios | Conductores (PIN) y administradores (contraseña): alta, edición, resetear acceso, desactivar |
| Análisis | Tasa de falla por producto |
| Auditoría | Toda acción con usuario y hora, cada ruta calculada y cada visita (con foto) |
| Configuración | Cuadro de cómo se decide el recorrido, criterios de ruteo, gravedad por tipo de falla, app de navegación, carga y borrado de datos |

**App del conductor** (tres pestañas):

- **Ahora:** próximo destino, **Ir con Waze** (o Google Maps), **Llegué**, fallas del lugar y **Terminé** (qué quedó resuelto, trabajos, foto opcional) o **No pude**. Deshacer la última visita o salteo (30 min) y "Todavía no llegué".
- **Recorrido:** mapa y lista del día: atendidos, próximo, pendientes con hora estimada, salteados y los que no entran.
- **Mi día:** resumen y visitas cerradas; finalizar jornada. Una jornada finalizada se puede reabrir el mismo día; al día siguiente arranca la que planifique administración.

Recálculo: al iniciar, al terminar o saltear, ante una falla nueva en un country de su ruta, por cambios de administración y cada 10 minutos con la jornada activa (tráfico). Si por tráfico conviene otro destino que ahorra más del umbral, se le **sugiere**; no se le cambia solo. Sin señal: se ve el último recorrido y las acciones quedan en una bandeja de salida.

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
| `app/` | `login/`, `admin/*` (una carpeta por sección), `conductor/`, rutas de API (`api/auth`, `api/admin`, `api/conductor`), manifest PWA |
| `proxy.ts` | Control de acceso por rol antes de renderizar |
| `components/` | `admin/` (layout, datos compartidos, formularios), `conductor/ConductorApp.tsx`, `ui.tsx`, mapas (Leaflet) |
| `lib/` | Dominio: `types.ts`, `catalogo.ts` (productos y gravedades), `seed.ts` (datos ficticios), `premio.ts` (valoración), `motor.ts` (orquestación), `rutas.ts` (tiempos de viaje), `store.ts` (almacenamiento), `acciones.ts` (reglas de negocio y validaciones), `auth.ts` / `sesion.ts` / `clave.ts` / `cuentas.ts` (acceso) |
| `api/` | Optimizador en Python: `index.py` (FastAPI) y `_modelos/` (`ruteo.py`, `asignacion.py`) |
| `supabase/migrations/` | Esquema de la base |
| `tests/` | Pruebas de los modelos |
| `docs/` | [MODELOS.md](docs/MODELOS.md) (matemática), [DECISIONES.md](docs/DECISIONES.md) (qué se decidió y por qué) |

## Modelos de optimización (detalle en [docs/MODELOS.md](docs/MODELOS.md))

| Modelo | Pregunta | Técnica | Tema de la materia |
|---|---|---|---|
| Ruteo | ¿En qué orden visito mis countries? | Programación dinámica exacta; misma formulación como PLE con OR-Tools + SCIP | Redes, programación lineal entera |
| Asignación | ¿Qué countries hace cada camioneta? | PLE con OR-Tools + SCIP | Alocación de demanda por maximización de beneficios |

**Prioridad de un country** = Σ gravedad × (1 + 0,25 por día caído, hasta 4 días) × (1 + 0,3 × abono relativo) × (1 + 0,5 × % de equipos rotos). Tiempo en cada country: ingreso (15 min) + 35 min por equipo (15 de trabajo + 20 de manejo interno). Todos los valores se editan en **Configuración**, donde también hay un cuadro con el criterio completo.

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

Sin Supabase, los datos se guardan en `.data/db.json`. La primera vez se cargan datos de ejemplo y se crea el usuario **admin** con la contraseña `ADMIN_CLAVE_INICIAL` (por defecto `vialseg2026`; se pide cambiarla al entrar). Conductores de ejemplo: "Conductor 1/2/3" con PIN 1111/2222/3333. **Configuración → Datos** permite borrar todo para cargar los datos reales.

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
npx vercel env add SESSION_SECRET production
npx vercel env add ADMIN_CLAVE_INICIAL production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add GOOGLE_MAPS_API_KEY production   # opcional
npx vercel --prod
```

Vercel construye Next.js y publica `api/index.py` como función de Python (`requirements.txt`). En producción `/api/py/*` se redirige a esa función (`next.config.ts`). Sin Supabase, en Vercel los datos viven en `/tmp` y se pierden: usar Supabase para mostrarlo.

## Limitaciones conocidas

- GPS solo cuando la app está abierta (una web no puede seguir la ubicación en segundo plano).
- Sin tráfico mientras no haya clave de Google; OSRM público no garantiza disponibilidad.
- Fuera del horario de jornada (por ejemplo, en una demo de noche) se planifica una jornada completa desde ahora.
- Fotos guardadas dentro del registro (comprimidas, ~150 KB); pendiente: Supabase Storage.
- Fuera de alcance por ahora: horarios de acceso de cada barrio, repuestos y habilidades por camioneta.

## Colaboración

Igual que antes: ramas + Pull Request hacia `main` con aprobación de @Santim1897 (ver [CONTRIBUTING.md](CONTRIBUTING.md) y [AGENTS.md](AGENTS.md)).
