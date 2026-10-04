# Registro de decisiones

Qué se decidió, por qué y qué queda pendiente. Agregar una entrada por cada decisión nueva (la más reciente arriba).

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
| 15 | Sin contraseñas por ahora (elección de perfil) | Prioridad: la demo. Pendiente: Supabase Auth con roles |
| 16 | Modo sin señal: último plan guardado + bandeja de salida | En los countries suele no haber señal |

### Fuera de alcance (por decisión del equipo)

Horarios y autorizaciones de proveedores en cada barrio; repuestos y habilidades por camioneta; almuerzos, pausas y feriados (el sistema solo funciona entre "Iniciar jornada" y "Finalizar").

### Pendiente para producción

- Conectar la plataforma de Vialseg (importador de fallas, countries y equipos con `origen: "vialseg"`).
- Clave de Google Routes para tráfico en vivo.
- Supabase Auth (roles admin / conductor) y Storage para las fotos.
- GPS real de cada equipo y acceso; facturación real por cliente.
- Validar con Vialseg las gravedades del catálogo y los tiempos de servicio.
