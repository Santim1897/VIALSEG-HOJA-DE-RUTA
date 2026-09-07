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

El código no debe vivir únicamente en una carpeta local. Crear un repositorio **privado** en GitHub y subir estos archivos. Cada integrante trabaja en su propia computadora, clona el mismo repositorio y usa su propia cuenta de GitHub y de Codex o Claude Code.

```powershell
git clone https://github.com/ORGANIZACION/vialseg-optimizador-rutas.git
cd vialseg-optimizador-rutas
```

### Flujo obligatorio

1. Actualizar la rama principal: `git checkout main` y `git pull origin main`.
2. Crear una rama descriptiva: `git checkout -b mejora-ponderacion`.
3. Hacer cambios y probarlos localmente.
4. Confirmar solo los archivos necesarios: `git add app.py README.md`.
5. Crear un commit claro: `git commit -m "Ajusta ponderación SLA"`.
6. Publicar la rama: `git push -u origin mejora-ponderacion`.
7. Abrir un Pull Request hacia `main`. No hacer cambios directos en `main`.

## Archivos de colaboración

- `AGENTS.md`: reglas comunes para Codex, Claude Code y cualquier agente.
- `CLAUDE.md`: punto de entrada para Claude Code; remite a las reglas compartidas.
- `CONTRIBUTING.md`: proceso de ramas, commits y Pull Requests.

Antes de solicitar cambios a un agente, indicar siempre el objetivo, el alcance y cómo validar el resultado. Por ejemplo: “Actualizá la ponderación SLA y verificá que la ruta siga regresando dentro de 480 minutos”.
