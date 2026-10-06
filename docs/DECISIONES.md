# Registro de decisiones

Qué se decidió, por qué y qué queda pendiente. Agregar una entrada por cada decisión nueva (la más reciente arriba).

## 2026-10-04 · Datos operativos reales y simplificación

| # | Decisión | Motivo |
|---|---|---|
| 27 | ~~Las 3 camionetas salen de la sede~~ (reemplazada por la #33) | — |
| 28 | Tiempo por equipo con falla: 20 min en total, incluido el manejo dentro del barrio (antes 11 min); se mantiene el ingreso por guardia por country | Dato del equipo |
| 29 | Se quita el modelo de centro de gravedad (ubicación óptima de la base) | La sede es fija: el análisis no aporta a la operación |
| 30 | Cuadro "Cómo se decide el recorrido" en Configuración, con los valores vigentes | Que los criterios no queden solo en el código |
| 34 | Gravedad visible en 3 niveles (Leve, Media, Crítica; el modelo sigue usando 1 a 5), tráfico en vivo con HERE (clave en variables de Vercel) y colores de camioneta celeste, violeta y negro (PRs #24 a #26 de Santi) | Más simple de leer; tráfico real |
| 33 | Sin bases por camioneta: cada una sale desde su GPS (o desde la sede si todavía no informó ubicación) y el recorrido termina en la última visita. La sede (Martín Lezica 3093, San Isidro) es la única ubicación fija y se muestra siempre en los mapas | Acercarse a la realidad: no inventar bases; las camionetas pueden empezar y terminar en cualquier lado |
| 32 | Producción: Vercel (`vialseg-hoja-de-ruta.vercel.app`) + Supabase en São Paulo; contraseña inicial de admin y secreto de sesión como variables de entorno de Vercel | Datos persistentes y compartidos entre todos los usuarios |
| 31 | Si un día no está planificado, cada camioneta arranca con el conductor del último día planificado y los countries que siguen con fallas abiertas; administración lo puede cambiar | Que nadie empiece el día sin recorrido. Pedido del equipo |

## 2026-10-04 · Orientación a producción

Revisión del equipo: la v2 parecía una demo. Se rehízo la interfaz y se agregaron accesos y gestión.

| # | Decisión | Motivo |
|---|---|---|
| 17 | Login con roles: administración con usuario y contraseña; conductores con nombre + PIN de 4 números | Elegido por el equipo: rápido en la calle y suficiente para uso interno. Bloqueo de 10 min tras 5 intentos fallidos |
| 18 | Sesión en cookie firmada (HMAC, `SESSION_SECRET`) con versión del usuario; `proxy.ts` + validación en cada API | Un conductor no puede entrar al panel. Resetear el acceso o desactivar a alguien cierra sus sesiones |
| 19 | Administrador inicial `admin` con cambio de contraseña obligatorio | No dejar una clave por defecto en uso |
| 20 | Nada fijo en el código: conductores, camionetas, countries y equipos se administran desde el panel | Pedido del equipo |
| 21 | El conductor se asigna por día y camioneta en Planificación (también días próximos) | Cada día puede manejar otra persona y hacer otros countries |
| 22 | Planificación con modo edición, resumen de cambios y confirmación; validaciones en el servidor | Elegido por el equipo, para evitar errores de administración |
| 23 | El conductor puede deshacer (30 min), cancelar una llegada y reabrir la jornada el mismo día | Elegido por el equipo; corrige toques por error |
| 24 | Arranca con datos de ejemplo y un botón para borrarlos | Elegido por el equipo, hasta tener los datos reales |
| 25 | Interfaz sin textos académicos; la marca solo en el login y el panel | Lo usa personal de la empresa, no es una presentación |
| 26 | Bajas lógicas (countries, equipos, camionetas, usuarios) | Conservar historial y auditoría |

## 2026-10-03 · Reescritura v2 (rama `v2/base-nueva`)

| # | Decisión | Motivo |
|---|---|---|
| 1 | Reescribir desde cero; el prototipo queda en `legacy/` | El prototipo cubría una sola camioneta, una sola pantalla y guardaba los cierres en el navegador. Se conservan sus reglas: 15 min de ingreso, 11 min por equipo, identidad visual y logo |
| 2 | Next.js 16 + Python (FastAPI) en el mismo proyecto de Vercel | Next.js para las dos vistas; Python para mostrar los modelos con las herramientas de la cátedra (OR-Tools) |
| 3 | Dos vistas: `/admin` (escritorio) y `/conductor/[id]` (celular, PWA) | Son dos usuarios con necesidades distintas; el conductor ve lo mínimo |
| 4 | El admin asigna los countries de cada camioneta cada día; el modelo de asignación solo **sugiere** | Pedido del equipo: arrancar manual, después automatizar |
| 5 | Ruteo con programación dinámica exacta, PLE como formulación de referencia | La PLE con SCIP tardaba más de 10 s con 10 countries; la PD da el mismo óptimo en milisegundos (verificado con una prueba) |
| 6 | Recálculo: al iniciar, al terminar, al saltear, con falla nueva, por cambio del admin y cada 10 min | El celular del conductor dispara el control periódico solo con la jornada activa (Vercel gratis no ejecuta tareas cada 10 min y así no corre de noche) |
| 7 | El destino en curso queda fijo; un cambio por tráfico solo se sugiere si ahorra ≥ 10 min | No cambiarle el destino al conductor a mitad de camino |
| 8 | Siempre se calcula desde la posición actual (GPS, o el country donde terminó); base configurable por camioneta | Pedido del equipo: no suponer que todos salen de Martínez |
| 9 | Gravedad por catálogo producto × tipo de falla (1 a 5), editable | Alta/Media/Baja dependía de quién cargaba. Productos según la matriz BCG del grupo: Tótem, Tableta, Radar fotográfico, SmartRed, Cinemómetro por espiras |
| 10 | Navegación por link a Waze o Google Maps | Waze ya tiene el tráfico; no tiene sentido construir un navegador propio |
| 11 | Tiempos: Google Routes (si hay clave) → OSRM → estimado | Google es dueño de Waze: mejor tráfico en AMBA. Para ahorrar costo, cada 10 min solo se consulta la fila "desde donde estoy" |
| 12 | Almacenamiento por documentos (`vialseg_docs`: colección, id, jsonb) en Supabase, o archivo local | Una sola interfaz (`lib/store.ts`) y una migración simple. Pendiente: normalizar tablas cuando se conecte Vialseg |
| 13 | Foto opcional en el cierre | Pedido del equipo |
| 14 | Saltear con motivo (no me dejan entrar, cerrado, no llego, otro) | El conductor puede negarse a un destino |
| 15 | Sin contraseñas (reemplazada por la #17) | — |
| 16 | Modo sin señal: último plan guardado + bandeja de salida | En los countries suele no haber señal |

### Fuera de alcance (por decisión del equipo)

Horarios y autorizaciones de proveedores en cada barrio; repuestos y habilidades por camioneta; almuerzos, pausas y feriados (el sistema solo funciona entre "Iniciar jornada" y "Finalizar").

### Pendiente para producción

- **Lista real de countries donde opera Vialseg**: todavía no la tenemos (llega en unos días). Los 24 countries de `lib/seed.ts` (nombres, coordenadas, facturación y equipos) son inventados, igual que los del prototipo v1. Al recibirla: Configuración → Borrar datos operativos, y cargar countries y equipos desde el panel (o pedir una importación desde Excel).
- Conectar la plataforma de Vialseg (importador de fallas, countries y equipos con `origen: "vialseg"`).
- Clave de Google Routes para tráfico en vivo.
- Supabase Storage para las fotos (hoy van comprimidas dentro del registro).
- GPS real de cada equipo y acceso; facturación real por cliente.
- Validar con Vialseg las gravedades del catálogo y los tiempos de servicio.
