# Vialseg · Optimizador de Hojas de Ruta Técnica

Prototipo para planificar recorridos de técnicos que realizan mantenimiento de cinemómetros en barrios privados de Pilar y Zona Norte. La aplicación prioriza incidentes por severidad, tiempo caído, valor comercial y cercanía, respetando una jornada de 8 horas con salida y regreso a la base de Martínez.

## Estado del prototipo

- Los radares, barrios y coordenadas son datos simulados.
- Las coordenadas representan accesos aproximados; deben reemplazarse por el GPS real de cada equipo antes de operar.
- La ruta usa una heurística de máxima ganancia. No sustituye una herramienta de navegación con tráfico real.

## Ponderación actual

```text
beneficio = severidad × factor_SLA × factor_comercial
puntaje_de_ruta = beneficio × factor_cercanía
```

| Criterio | Casos |
|---|---|
| Severidad | Leve = 1 · Medio = 3 · Alto = 7 |
| SLA / horas caído | 0–8 h = ×1,00 · 9–16 h = ×1,10 · 17–24 h = ×1,25 · >24 h = ×1,40 |
| Valor comercial | ≤$300k = ×1,00 · $300–600k = ×1,05 · $600–900k = ×1,12 · >$900k = ×1,20 |
| Cercanía | 0–5 km = ×1,20 · 5–15 km = ×1,00 · 15–30 km = ×0,80 · >30 km = ×0,60 |
| Jornada | Traslado + 11 min por radar + regreso a base ≤ 480 min |

`POST /api/route` acepta `max_minutes` como un entero JSON entre 60 y 480,
inclusive; si se omite, usa 480. Ambos servidores rechazan con HTTP 422 los
valores fuera de rango, decimales, cadenas, booleanos y `null`, sin redondearlos
ni recortarlos. El límite incluye todos los traslados, la atención y el regreso
a Martínez. Los errores de cálculo se muestran en pantalla.

Para ejecutar las pruebas de jornada y de ambos servidores, con las dependencias
instaladas: `py -m unittest discover -s tests -v`. Sin dependencias se prueban el
algoritmo y el servidor integrado; las pruebas de FastAPI se marcan omitidas.

## Inspecciones pendientes y terminadas

Elegir un equipo de la ruta en la checklist. Cada equipo conserva sus tres
controles y su cronómetro de forma independiente. El tercer control completa
la inspección automáticamente, detiene su tiempo y la mueve a **Terminados**,
con equipo, fecha de finalización, tiempo registrado y controles realizados.
Si no se inició el cronómetro, el historial indica «Sin cronómetro».

Las inspecciones y los avances se guardan en `localStorage` de este navegador
para esta dirección de la aplicación. Persisten al recargar, pero no se
sincronizan entre dispositivos ni son una base de datos central. Borrar los
datos del sitio elimina ese historial. Solo puede haber un cronómetro activo;
iniciar otro pausa el anterior. El activo continúa contando al recargar.

Completar una visita la retira del listado y selector de pendientes. El mapa
y los indicadores conservan la ruta planificada; al volver a optimizar, los
equipos terminados se excluyen. No hay todavía reapertura de inspecciones ni
creación de nuevas órdenes para un equipo terminado. La casilla de evidencia
registra una declaración: no carga fotografías.

Pruebas de estado de inspecciones (Node.js, sin paquetes adicionales):
`node tests/test_inspections.cjs`.

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
