"""Modelo de ruteo de una camioneta.

Se resuelve de forma EXACTA con programación dinámica (resolver_pd) y la misma formulación
está escrita como programación lineal entera con OR-Tools + SCIP (resolver_pli), que sirve
para mostrar el modelo y verificar resultados. Ambas maximizan el mismo objetivo.

Decide qué countries visitar y en qué orden, desde la posición actual del conductor
hasta volver a su base, dentro del tiempo que le queda de jornada.

Índices: 0 = posición actual, 1..n = countries asignados, n+1 = base (fin de jornada).

Variables
    x[i,j] ∈ {0,1}  1 si después de i va directo a j
    v[j]   ∈ {0,1}  1 si el country j se visita hoy
    t[j]   ≥ 0      minuto (desde ahora) en que llega a j

Objetivo (maximizar)
    Σ p_j·v_j  −  u · Σ (p_j / T)·t_j  −  c · Σ d_ij·x_ij
    premio de lo atendido − castigo por atender tarde lo urgente − costo del manejo

Restricciones
    Σ_j x[0,j] = 1                    sale una vez de la posición actual
    Σ_i x[i,n+1] = 1                  termina una vez en la base
    Σ_i x[i,j] = v_j = Σ_k x[j,k]     entra y sale de cada country visitado
    t_j ≥ t_i + s_i + d_ij − M_ij(1 − x_ij) tiempos encadenados (elimina subrecorridos, MTZ)
    t_j ≤ T·v_j ,  t_{n+1} ≤ T          no pasarse de la jornada
    x[0,f] = 1                        si hay un destino fijado (el conductor ya va en camino)
"""
from __future__ import annotations

from time import perf_counter

from ortools.linear_solver import pywraplp


def resolver_pli(datos: dict) -> dict:
    """Programación lineal entera (OR-Tools + SCIP)."""
    nodos = datos["countries"]  # [{id, premio, servicio}]
    d = datos["tiempos"]  # matriz (n+2)x(n+2) en minutos: 0=inicio, 1..n, n+1=base
    T = float(datos["disponible"])
    u = float(datos.get("peso_urgencia", 0.5))
    c = float(datos.get("costo_minuto", 0.05))
    fijo = datos.get("fijo")

    n = len(nodos)
    fin = n + 1
    if n == 0:
        return {"estado": "OPTIMO", "orden": [], "llegadas": {}, "no_visitados": [], "objetivo": 0.0,
                "minutos_totales": round(d[0][fin], 1) if d else 0.0, "segundos": 0.0}

    p = [0.0] + [float(x["premio"]) for x in nodos] + [0.0]
    s = [0.0] + [float(x["servicio"]) for x in nodos] + [0.0]

    solver = pywraplp.Solver.CreateSolver("SCIP") or pywraplp.Solver.CreateSolver("CBC")
    solver.SetTimeLimit(int(datos.get("limite_ms", 5000)))
    inicio = perf_counter()

    arcos = [(i, j) for i in range(0, n + 1) for j in range(1, n + 2) if i != j]
    x = {(i, j): solver.BoolVar(f"x_{i}_{j}") for i, j in arcos}
    v = {j: solver.BoolVar(f"v_{j}") for j in range(1, n + 1)}
    t = {j: solver.NumVar(0.0, T, f"t_{j}") for j in range(1, n + 2)}

    solver.Add(sum(x[0, j] for j in range(1, n + 2)) == 1)
    solver.Add(sum(x[i, fin] for i in range(0, n + 1)) == 1)
    for j in range(1, n + 1):
        solver.Add(sum(x[i, j] for i in range(0, n + 1) if i != j) == v[j])
        solver.Add(sum(x[j, k] for k in range(1, n + 2) if k != j) == v[j])
        solver.Add(t[j] <= T * v[j])
        solver.Add(t[j] >= d[0][j] * v[j])  # cota inferior: no se llega antes que yendo directo
    for i, j in arcos:
        ti = 0.0 if i == 0 else t[i]
        M = T + s[i] + d[i][j]  # "M grande" ajustada por arco: refuerza la relajación lineal
        solver.Add(t[j] >= ti + s[i] + d[i][j] - M * (1 - x[i, j]))

    if fijo:
        ids = [x["id"] for x in nodos]
        if fijo in ids:
            solver.Add(x[0, ids.index(fijo) + 1] == 1)

    solver.Maximize(
        sum(p[j] * v[j] for j in v)
        - u * sum((p[j] / T) * t[j] for j in v)
        - c * sum(d[i][j] * x[i, j] for i, j in arcos)
        - 1e-4 * t[fin]  # desempate: volver a la base lo antes posible
    )
    estado = solver.Solve()
    segundos = round(perf_counter() - inicio, 3)
    if estado not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return {"estado": "SIN_SOLUCION", "orden": [], "llegadas": {}, "segundos": segundos,
                "no_visitados": [x["id"] for x in nodos], "objetivo": 0.0, "minutos_totales": 0.0}

    # Reconstruir el recorrido siguiendo los arcos elegidos.
    siguiente = {i: j for (i, j), var in x.items() if var.solution_value() > 0.5}
    orden, actual = [], 0
    while actual in siguiente and siguiente[actual] != fin and len(orden) <= n:
        actual = siguiente[actual]
        orden.append(actual)
    visitados = set(orden)
    return {
        "estado": "OPTIMO" if estado == pywraplp.Solver.OPTIMAL else "FACTIBLE",
        "orden": [nodos[k - 1]["id"] for k in orden],
        "llegadas": {nodos[k - 1]["id"]: round(t[k].solution_value(), 1) for k in orden},
        "no_visitados": [nodos[k - 1]["id"] for k in range(1, n + 1) if k not in visitados],
        "objetivo": round(solver.Objective().Value(), 3),
        "minutos_totales": round(t[fin].solution_value(), 1),
        "segundos": segundos,
        "metodo": "PLE (OR-Tools + SCIP)",
    }


def resolver_pd(datos: dict) -> dict:
    """Programación dinámica exacta (Bellman / Held-Karp con etiquetas).

    Estado: (conjunto visitado, último country). En cada estado se guardan solo las etiquetas
    (tiempo, valor) no dominadas: una etiqueta domina a otra si llega antes y acumuló más valor,
    porque lo que queda por ganar solo puede empeorar con el reloj. Así se recorre todo el espacio
    de soluciones sin repetir trabajo y el resultado es el óptimo del mismo objetivo que resolver_pli.
    """
    nodos = datos["countries"]
    d = datos["tiempos"]
    T = float(datos["disponible"])
    u = float(datos.get("peso_urgencia", 0.5))
    c = float(datos.get("costo_minuto", 0.05))
    fijo = datos.get("fijo")
    inicio = perf_counter()
    n = len(nodos)
    fin = n + 1
    p = [0.0] + [float(x["premio"]) for x in nodos]
    s = [0.0] + [float(x["servicio"]) for x in nodos]
    ids = [x["id"] for x in nodos]
    k_fijo = ids.index(fijo) + 1 if fijo in ids else None

    # etiqueta = (tiempo de llegada al último, valor acumulado, último, máscara, etiqueta anterior)
    raiz = (0.0, 0.0, 0, 0, None)
    capas = {(0, 0): [raiz]}
    mejor, mejor_valor = None, -1e18

    def cerrar(et):
        t, val, ult, _, _ = et
        t_fin = t + s[ult] + d[ult][fin]
        return val - c * d[ult][fin] - 1e-4 * t_fin, t_fin

    while capas:
        siguientes: dict = {}
        for (mask, ult), etiquetas in capas.items():
            for et in etiquetas:
                valor, t_fin = cerrar(et)
                if t_fin <= T + 1e-9 and valor > mejor_valor and not (k_fijo and mask == 0):
                    mejor, mejor_valor = et, valor
                t, val = et[0], et[1]
                candidatos = [k_fijo] if (k_fijo and mask == 0) else range(1, n + 1)
                for j in candidatos:
                    if mask & (1 << j):
                        continue
                    tj = t + s[ult] + d[ult][j]
                    if tj + s[j] + d[j][fin] > T + 1e-9:
                        continue
                    vj = val + p[j] * (1 - u * tj / T) - c * d[ult][j]
                    lista = siguientes.setdefault((mask | (1 << j), j), [])
                    if any(o[0] <= tj + 1e-9 and o[1] >= vj - 1e-9 for o in lista):
                        continue
                    lista[:] = [o for o in lista if not (tj <= o[0] + 1e-9 and vj >= o[1] - 1e-9)]
                    lista.append((tj, vj, j, mask | (1 << j), et))
        capas = siguientes

    orden, llegadas, et = [], {}, mejor
    while et is not None and et[2] != 0:
        orden.append(et[2])
        llegadas[ids[et[2] - 1]] = round(et[0], 1)
        et = et[4]
    orden.reverse()
    _, t_fin = cerrar(mejor) if mejor else (0, 0)
    return {
        "estado": "OPTIMO" if mejor else "SIN_SOLUCION",
        "orden": [ids[k - 1] for k in orden],
        "llegadas": llegadas,
        "no_visitados": [ids[k - 1] for k in range(1, n + 1) if k not in orden],
        "objetivo": round(mejor_valor + 1e-4 * t_fin, 3) if mejor else 0.0,
        "minutos_totales": round(t_fin, 1),
        "segundos": round(perf_counter() - inicio, 3),
        "metodo": "Programación dinámica exacta",
    }


def resolver_ruteo(datos: dict) -> dict:
    """Programación dinámica para tamaños normales (≤ 14 countries); PLE para más o si se pide."""
    if datos.get("metodo") == "pli" or len(datos["countries"]) > 14:
        return resolver_pli(datos)
    return resolver_pd(datos)
