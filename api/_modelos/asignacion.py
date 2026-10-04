"""Asignación de countries a camionetas (programación lineal entera, OR-Tools + SCIP).

Es el modelo de "Alocación de demanda por maximización de beneficios" de la unidad
Redes de Distribución (Chopra & Meindl, cap. 5), adaptado:

    planta i      → camioneta i          capacidad K_i → minutos de jornada
    mercado j     → country con fallas   precio p_j    → premio de reparar ese country
    costo fijo f_i → costo de sacar la camioneta ese día
    costo c_ij    → minutos de manejo desde donde está la camioneta (o la sede) al country × costo por minuto

Variables
    y[i]   ∈ {0,1}  1 si la camioneta i sale hoy
    x[i,j] ∈ {0,1}  1 si la camioneta i atiende el country j

Objetivo (maximizar)
    Σ_ij p_j·x_ij − Σ_i f_i·y_i − c · Σ_ij d_ij·x_ij

Restricciones
    Σ_i x_ij ≤ 1                          cada country lo atiende como máximo una camioneta
    Σ_j (s_j + d_ij)·x_ij ≤ K_i·y_i       no superar la jornada (aproximación: ida desde la camioneta)
    x_ij = 1  para las decisiones ya tomadas por el administrador (no se cambian)

La secuencia real de cada camioneta la resuelve después el modelo de ruteo
("primero agrupar, después rutear").
"""
from __future__ import annotations

from time import perf_counter

from ortools.linear_solver import pywraplp


def resolver_asignacion(datos: dict) -> dict:
    camionetas = datos["camionetas"]  # [{id, capacidad, costo_fijo}]
    countries = datos["countries"]  # [{id, premio, servicio}]
    d = datos["tiempos"]  # d[i][j] minutos desde la camioneta i → country j
    c = float(datos.get("costo_minuto", 0.05))
    fijos = datos.get("fijos", [])  # [{camioneta, country}]

    solver = pywraplp.Solver.CreateSolver("SCIP") or pywraplp.Solver.CreateSolver("CBC")
    solver.SetTimeLimit(int(datos.get("limite_ms", 8000)))
    inicio = perf_counter()
    I, J = range(len(camionetas)), range(len(countries))

    y = {i: solver.BoolVar(f"y_{i}") for i in I}
    x = {(i, j): solver.BoolVar(f"x_{i}_{j}") for i in I for j in J}
    for j in J:
        solver.Add(sum(x[i, j] for i in I) <= 1)
    for i in I:
        carga = sum((float(countries[j]["servicio"]) + float(d[i][j])) * x[i, j] for j in J)
        solver.Add(carga <= float(camionetas[i]["capacidad"]) * y[i])

    ids_cam = [k["id"] for k in camionetas]
    ids_cty = [k["id"] for k in countries]
    for f in fijos:
        if f["camioneta"] in ids_cam and f["country"] in ids_cty:
            solver.Add(x[ids_cam.index(f["camioneta"]), ids_cty.index(f["country"])] == 1)

    solver.Maximize(
        sum(float(countries[j]["premio"]) * x[i, j] for i in I for j in J)
        - sum(float(camionetas[i].get("costo_fijo", 0)) * y[i] for i in I)
        - c * sum(float(d[i][j]) * x[i, j] for i in I for j in J)
    )
    estado = solver.Solve()
    segundos = round(perf_counter() - inicio, 3)
    if estado not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return {"estado": "SIN_SOLUCION", "asignacion": {}, "sin_asignar": ids_cty, "segundos": segundos}

    asignacion = {k["id"]: [] for k in camionetas}
    usados = set()
    for (i, j), var in x.items():
        if var.solution_value() > 0.5:
            asignacion[ids_cam[i]].append(ids_cty[j])
            usados.add(j)
    carga = {ids_cam[i]: round(sum((countries[j]["servicio"] + d[i][j]) * x[i, j].solution_value() for j in J), 1)
             for i in I}
    return {
        "estado": "OPTIMO" if estado == pywraplp.Solver.OPTIMAL else "FACTIBLE",
        "asignacion": asignacion,
        "sin_asignar": [ids_cty[j] for j in J if j not in usados],
        "carga_minutos": carga,
        "objetivo": round(solver.Objective().Value(), 3),
        "segundos": segundos,
    }
