# Vialseg · Optimizador de Hojas de Ruta Técnica

Prototipo para planificar recorridos de técnicos que realizan mantenimiento de cinemómetros en barrios privados de Pilar y Zona Norte. La aplicación prioriza incidentes por severidad, tiempo caído, valor comercial y cercanía, respetando una jornada de 8 horas con salida y regreso a la base de Martínez.

## Estado del prototipo

- Los radares, barrios y coordenadas son datos simulados.
- Las coordenadas representan accesos aproximados; deben reemplazarse por el GPS real de cada equipo antes de operar.
- Las distancias, tiempos y línea del mapa se consultan en OSRM sobre la red vial de OpenStreetMap. No se usa distancia en línea recta ni velocidad fija de 30 km/h.
- Los tiempos son estimaciones del perfil de conducción, **sin tráfico en vivo ni predicción por fecha/hora**. Cambiar la hora de inicio desplaza el itinerario, no cambia los tiempos de viaje.

## Ponderación actual

```text
beneficio = severidad × factor_SLA × factor_comercial
puntaje_de_ruta = beneficio × factor_cercanía
utilidad_del_recorrido = suma(puntaje_de_ruta × (minutos_jornada − minuto_fin_atención) / minutos_jornada)
```

| Criterio | Casos |
|---|---|
| Severidad | Leve = 1 · Medio = 3 · Alto = 7 |
| SLA / horas caído | 0–8 h = ×1,00 · 9–16 h = ×1,10 · 17–24 h = ×1,25 · >24 h = ×1,40 |
| Valor comercial | ≤$300k = ×1,00 · $300–600k = ×1,05 · $600–900k = ×1,12 · >$900k = ×1,20 |
| Cercanía | 0–5 km = ×1,20 · 5–15 km = ×1,00 · 15–30 km = ×0,80 · >30 km = ×0,60 |
| Ingreso al barrio | 15 min por entrada, antes del trabajo |
| Jornada | Traslado + ingreso + 11 min por radar + regreso a base ≤ 480 min |

La cercanía se mide en kilómetros por calles desde la parada anterior. Los factores existentes se mantienen; el orden de prioridad no es una secuencia obligatoria. La utilidad favorece resolver tickets importantes temprano y evita consumir la jornada en desvíos. Por ejemplo, permite 1 → 3 → 2 cuando 1 y 3 están juntos y 2 está lejos. Con los mismos tiempos y distancias, se atiende primero el mayor puntaje.

Se comparan secuencias localmente, conservando hasta 128 candidatas por cantidad de paradas (búsqueda aproximada, sin garantía de óptimo global). A igual utilidad se elige menor duración total y luego menor distancia. Cada extensión debe permitir regresar a base. Los tramos se redondean hacia arriba a minutos, se suman 15 minutos de ingreso y 11 minutos por atención.

## Ingreso y programación de días siguientes

La llegada corresponde al acceso del barrio. El inicio del trabajo es 15 minutos después y la salida ocurre luego de otros 11 minutos. Se computa el ingreso tanto al elegir la secuencia como al construir los horarios definitivos. Si varios equipos comparten un `neighborhood_id`, solo se cobra un ingreso durante visitas consecutivas a ese barrio; salir y volver implica otro ingreso. Sin ese identificador, cada equipo representa un barrio independiente, como en los datos actuales.

Elegir fecha y hora y pulsar **Optimizar ruta** crea y guarda un plan. Lo que no cabe se vuelve a optimizar para el día siguiente, siempre saliendo y regresando a la base dentro de 480 minutos. Se usan días calendario consecutivos, incluidos fines de semana, sin calendario de feriados. Los factores de prioridad se conservan y el SLA suma 24 horas por día de espera. La búsqueda es aproximada: un plan de varios días no demuestra que sea matemáticamente imposible otro plan de un día.

El aviso muestra las visitas diferidas y el selector permite ver fecha, mapa e itinerario de cada jornada. Si un equipo no tiene camino viable o no cabe en una jornada, queda **sin fecha viable**, sin prometer una visita imposible. La programación se guarda en `.local/plan.json`, excluido de Git; persiste al reiniciar y actualizar el código. Optimizar otra vez reemplaza el plan local anterior solo si el cálculo completo termina correctamente. Recargar la página recupera el plan guardado, sin reprogramarlo. No se envían citas a calendarios externos ni avisos a proveedores; la planificación es interna y el checklist permite completar inspecciones en este navegador.

API: `POST /api/route` acepta `start_date` (AAAA-MM-DD), `start_time`, `max_minutes` y `selected_ids`; ahora devuelve un plan con `days`, `deferred_count` y `unscheduled` en lugar de una ruta única. Cada elemento de `days` conserva los campos de itinerario anteriores y agrega `date`, `entry_minutes` y `service_start` en las paradas. `GET /api/plan` recupera el último plan o devuelve `null` si no existe.

## Servicio de caminos

Por defecto se usa `https://router.project-osrm.org`, servidor público de demostración sin clave. Requiere internet; no ofrece disponibilidad garantizada ni es infraestructura de producción. Se realizan una consulta de tiempos/distancias entre puntos y otra del recorrido elegido, con caché en memoria de hasta aproximadamente 10 minutos y solicitudes espaciadas. Comparar alternativas localmente no genera una consulta por combinación.

Para operar regularmente, configurar un servidor OSRM propio o contratado mediante la variable de entorno `OSRM_URL` antes de iniciar. El software OSRM es abierto; alojarlo puede tener costos. La consulta envía las coordenadas al proveedor configurado. No se activa ninguna suscripción ni facturación.

No se inventan tiempos si falla el servicio: se muestra el error. Los pares sin camino se excluyen; si el recorrido final excede la jornada, se rechaza. La línea dibujada sigue la geometría del proveedor, incluyendo regreso a base. Los accesos simulados deben verificarse antes de uso operativo.

Documentación: [OSRM API](https://project-osrm.org/docs/v5.24.0/api/).

Pruebas sin red: `python -m unittest -v test_routing`. Incluyen el caso 1 → 3 → 2, prioridad con traslados iguales, retorno, caminos inexistentes y fallos del proveedor.

## Ejecutar localmente

En Windows, hacer doble clic en `iniciar_local.cmd` y abrir:

```text
http://127.0.0.1:8000/
```

También puede ejecutarse con FastAPI cuando las dependencias estén disponibles:

```powershell
py -m pip install -r requirements.txt
py -m uvicorn app:app --reload
```

## Colaboración: GitHub como fuente única

El repositorio **privado** oficial es [Santim1897/VIALSEG-HOJA-DE-RUTA](https://github.com/Santim1897/VIALSEG-HOJA-DE-RUTA). Cada integrante trabaja en su propia computadora, clona el mismo repositorio y usa su propia cuenta de GitHub y de su herramienta de IA (Codex, Claude Code o Google Antigravity).

```powershell
git clone https://github.com/Santim1897/VIALSEG-HOJA-DE-RUTA.git
cd VIALSEG-HOJA-DE-RUTA
```

### Flujo obligatorio

1. Actualizar la rama principal: `git checkout main` y `git pull --ff-only origin main`.
2. Crear una rama descriptiva: `git checkout -b feat/mejora-ponderacion`.
3. Hacer cambios y probarlos localmente.
4. Confirmar solo los archivos necesarios: `git add app.py README.md`.
5. Crear un commit claro: `git commit -m "Ajusta ponderación SLA"`.
6. Publicar la rama: `git push -u origin feat/mejora-ponderacion`.
7. Abrir un Pull Request hacia `main` con la cuenta del colaborador y compartir su enlace para revisión de @Santim1897. El responsable autoriza e incorpora los cambios desde GitHub.
8. Después de la integración, cada persona actualiza su copia local con `git checkout main` y `git pull --ff-only origin main`, preservando antes cualquier trabajo pendiente.

La guía completa está en [CONTRIBUTING.md](CONTRIBUTING.md). `.github/CODEOWNERS` identifica al responsable de todos los archivos; su aprobación solo queda impuesta técnicamente cuando ese archivo está en `main` y la protección de GitHub exige revisión de Code Owners.

## Archivos de colaboración

- `AGENTS.md`: reglas comunes para Codex, Claude Code y cualquier agente.
- `CLAUDE.md`: punto de entrada para Claude Code; remite a las reglas compartidas.
- `CONTRIBUTING.md`: proceso de ramas, commits y Pull Requests.
- [ANTIGRAVITY.md](ANTIGRAVITY.md): preparación de Google Antigravity, autenticación GitHub sin GitHub Desktop, pruebas locales y creación de PR.
- `.agents/rules/vialseg.md`: regla de workspace para Antigravity; activar Always On según la guía.

Antes de solicitar cambios a un agente, indicar siempre el objetivo, el alcance y cómo validar el resultado. Por ejemplo: “Actualizá la ponderación SLA y verificá que la ruta siga regresando dentro de 480 minutos”.

## Integración de inspecciones y jornadas

Al abrir se recupera el plan guardado. Si no existe, se calcula uno con los
equipos simulados pendientes. Cada jornada muestra Pendientes y Terminados;
el tercer control de la checklist completa la visita automáticamente. El
historial es global a las jornadas e incluye fecha de finalización y duración.
Las casillas y el cronómetro son independientes por equipo. Se reutiliza la
clave localStorage anterior para conservar el historial del prototipo.

Al optimizar nuevamente se excluyen los equipos terminados. Completar una
visita no altera la geometría ni los horarios del plan original. Los datos de
inspección persisten en el mismo navegador, no se sincronizan entre dispositivos
y las casillas no suben fotografías. No hay todavía reapertura de órdenes.

La API exige minutos enteros de 60 a 480 antes de consultar el proveedor vial.
Pruebas de inspecciones: `node tests/test_inspections.cjs`.

## Inicio, fin y fechas

La pantalla permite indicar inicio y fin de jornada y calcula su diferencia
en minutos. Ambos horarios son del mismo día; se admite de 1 a 8 horas. Ese
tiempo limita cada jornada incluyendo traslados, ingreso, atención y regreso.
La API acepta `end_time`; cuando está presente, determina la duración a partir
de `start_time`. Sin `end_time` conserva compatibilidad con `max_minutes`.
Los planes guardan el fin y recuperan los horarios al recargar.

Todas las fechas visibles usan DD/MM/AAAA, incluido el selector de jornadas
y el historial. La API y el almacenamiento conservan AAAA-MM-DD para evitar
ambigüedades. La entrada de fecha valida el formato y el día real del calendario.
