"""Asignación secuencial de countries por criterio de cada camioneta (OR-Tools)."""
from __future__ import annotations
from time import perf_counter
from ortools.linear_solver import pywraplp

ESTADOS_FACTIBLES = (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE)


def resolver_asignacion(datos: dict) -> dict:
    camionetas, countries, tiempos = datos["camionetas"], datos["countries"], datos["tiempos"]
    distancias = datos.get("distancias", tiempos)
    criterios, fijos = datos.get("criterios", {}), datos.get("fijos", [])
    inicio = perf_counter()
    ids_cam = [c["id"] for c in camionetas]
    ids_country = [c["id"] for c in countries]
    indice = {country_id: j for j, country_id in enumerate(ids_country)}
    asignacion, cargas = {cam: [] for cam in ids_cam}, {cam: 0.0 for cam in ids_cam}
    usados: set[str] = set()
    fijados: dict[str, list[str]] = {cam: [] for cam in ids_cam}

    # Mantener las visitas ya iniciadas antes de optimizar los countries libres.
    for fijo in fijos:
        cam, country_id = fijo.get("camioneta"), fijo.get("country")
        if cam not in fijados or country_id not in indice:
            continue
        if country_id in usados:
            return {"estado": "SIN_SOLUCION", "asignacion": asignacion, "sin_asignar": ids_country,
                    "carga_minutos": cargas, "segundos": round(perf_counter() - inicio, 3)}
        fijados[cam].append(country_id)
        usados.add(country_id)

    objetivo_total, todo_optimo = 0.0, True
    # El orden recibido es la prioridad fija. Cada camioneta optimiza su criterio
    # entre los barrios libres; las siguientes trabajan con lo que quedó.
    for i, cam in enumerate(camionetas):
        cam_id = cam["id"]
        criterio = criterios.get(cam_id, cam.get("criterio", "combinado"))
        for country_id in fijados[cam_id]:
            asignacion[cam_id].append(country_id)
            j = indice[country_id]
            cargas[cam_id] += float(countries[j]["servicio"]) + float(tiempos[i][j])
            objetivo_total += _valor(countries[j], criterio)

        candidatos = [j for j, c in enumerate(countries) if c["id"] not in usados]
        capacidad = max(0.0, float(cam["capacidad"]) - cargas[cam_id])
        if not candidatos or capacidad <= 0:
            continue
        solver = pywraplp.Solver.CreateSolver("SCIP") or pywraplp.Solver.CreateSolver("CBC")
        if solver is None:
            return {"estado": "SIN_SOLUCION", "asignacion": asignacion,
                    "sin_asignar": [c for c in ids_country if c not in usados],
                    "carga_minutos": {k: round(v, 1) for k, v in cargas.items()},
                    "segundos": round(perf_counter() - inicio, 3)}
        solver.SetTimeLimit(int(datos.get("limite_ms", 8000)))
        x = {j: solver.BoolVar(f"x_{i}_{j}") for j in candidatos}
        carga = sum((float(countries[j]["servicio"]) + float(tiempos[i][j])) * x[j] for j in candidatos)
        solver.Add(carga <= capacidad)
        puntaje = sum(_valor(countries[j], criterio) * x[j] for j in candidatos)
        cantidad = sum(x.values())
        distancia = sum(float((distancias if criterio == "combustible" else tiempos)[i][j]) * x[j] for j in candidatos)

        # No se mezclan unidades: el criterio elegido manda y los demás solo desempatan.
        if criterio == "combustible":
            solver.Maximize(cantidad)
            estado = solver.Solve()
            if estado not in ESTADOS_FACTIBLES:
                continue
            todo_optimo &= estado == pywraplp.Solver.OPTIMAL
            solver.Add(cantidad == round(solver.Objective().Value()))
            solver.Minimize(distancia)
            estado = solver.Solve()
        else:
            solver.Maximize(puntaje)
            estado = solver.Solve()
            if estado not in ESTADOS_FACTIBLES:
                continue
            todo_optimo &= estado == pywraplp.Solver.OPTIMAL
            solver.Add(puntaje >= solver.Objective().Value() - 1e-6)
            solver.Maximize(cantidad)
            estado = solver.Solve()
            if estado not in ESTADOS_FACTIBLES:
                continue
            todo_optimo &= estado == pywraplp.Solver.OPTIMAL
            solver.Add(cantidad == round(solver.Objective().Value()))
            solver.Minimize(distancia)
            estado = solver.Solve()

        if estado not in ESTADOS_FACTIBLES:
            continue
        todo_optimo &= estado == pywraplp.Solver.OPTIMAL
        for j, variable in x.items():
            if variable.solution_value() > 0.5:
                country_id = countries[j]["id"]
                asignacion[cam_id].append(country_id)
                usados.add(country_id)
                cargas[cam_id] += float(countries[j]["servicio"]) + float(tiempos[i][j])
                objetivo_total += _valor(countries[j], criterio)

    return {"estado": "OPTIMO" if todo_optimo else "FACTIBLE",
            "asignacion": asignacion,
            "sin_asignar": [country for country in ids_country if country not in usados],
            "carga_minutos": {cam: round(carga, 1) for cam, carga in cargas.items()},
            "objetivo": round(objetivo_total, 3),
            "segundos": round(perf_counter() - inicio, 3)}


def _valor(country: dict, criterio: str) -> float:
    campos = {"combinado": "premio", "facturacion": "facturacion",
              "equipos_rotos": "equipos_rotos", "espera": "espera", "gravedad": "gravedad"}
    return float(country.get(campos.get(criterio, "premio"), 0))
