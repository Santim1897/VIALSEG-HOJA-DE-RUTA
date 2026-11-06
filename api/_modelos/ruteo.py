"""Modelo de ruteo de una camioneta.

Se resuelve de forma EXACTA con programación dinámica (resolver_pd) y la misma formulación
está escrita como programación lineal entera con OR-Tools + SCIP (resolver_pli), que sirve
para mostrar el modelo y verificar resultados. Ambas maximizan el mismo objetivo.

Decide qué countries visitar y en qué orden, desde la posición actual del conductor
y regresa a la base (SEDE), dentro del tiempo que le queda de jornada.

Índices: 0 = posición actual (GPS), 1..n = countries asignados, n+1 = regreso a base (SEDE)
(el recorrido finaliza en la base y debe llegar dentro del horario laboral de la camioneta).

Variables
    x[i,j] ∈ {0,1}  1 si después de i va directo a j
    v[j]   ∈ {0,1}  1 si el country j se visita hoy
    t[j]   ≥ 0      minuto (desde ahora) en que llega a j

Objetivo (maximizar)
    Σ p_j·v_j  −  u · Σ (p_j / T)·t_j  −  c · Σ d_ij·x_ij
    premio de lo atendido − castigo por atender tarde lo urgente − costo del manejo

Restricciones
    Σ_j x[0,j] = 1                    sale una vez de la posición actual
    Σ_i x[i,n+1] = 1                  termina una vez (en la base)
    Σ_i x[i,j] = v_j = Σ_k x[j,k]     entra y sale de cada country visitado
    t_j ≥ t_i + s_i + d_ij − M_ij(1 − x_ij) tiempos encadenados (elimina subrecorridos, MTZ)
    t_j ≤ T·v_j ,  t_{n+1} ≤ T          regreso a base dentro de la jornada
    x[0,f] = 1                        si hay un destino fijado (el conductor ya va en camino)
"""
from __future__ import annotations

from time import perf_counter

from ortools.linear_solver import pywraplp


def resolver_pli(datos: dict) -> dict:
    """Programación lineal entera (OR-Tools + SCIP)."""
    nodos = datos["countries"]  # [{id, premio, servicio}]
    d = datos["tiempos"]
    km = datos.get("distancias", d)
    T = float(datos["disponible"])
    u = float(datos.get("peso_urgencia", 0.5))
    c = float(datos.get("costo_minuto", 0.05))
    fijo = datos.get("fijo")
    criterio = datos.get("criterio", "combinado")

    n = len(nodos)
    fin = n + 1
    if n == 0:
        return {"estado": "OPTIMO", "orden": [], "llegadas": {}, "no_visitados": [], "objetivo": 0.0,
                "minutos_totales": round(d[0][fin], 1) if d else 0.0, "segundos": 0.0}

    s = [0.0] + [float(x["servicio"]) for x in nodos] + [0.0]
    if criterio == "combustible":
        max_arco_km = max((float(km[i][j]) for i in range(len(km)) for j in range(len(km[i]))), default=0.0)
        # Una visita adicional siempre gana a cualquier diferencia posible de km de una ruta.
        premio_barrio = (n + 1) * max_arco_km + 1.0
        p = [0.0] + [premio_barrio] * n + [0.0]
    else:
        p = [0.0] + [float(x["premio"]) for x in nodos] + [0.0]

    solver = pywraplp.Solver.CreateSolver("SCIP") or pywraplp.Solver.CreateSolver("CBC")
    solver.SetTimeLimit(int(datos.get("limite_ms", 5000)))
    inicio = perf_counter()

    T_fin = max(T, float(d[0][fin]))
    arcos = [(i, j) for i in range(0, n + 1) for j in range(1, n + 2) if i != j]
    x = {(i, j): solver.BoolVar(f"x_{i}_{j}") for i, j in arcos}
    v = {j: solver.BoolVar(f"v_{j}") for j in range(1, n + 1)}
    t = {j: solver.NumVar(0.0, T_fin if j == fin else T, f"t_{j}") for j in range(1, n + 2)}

    solver.Add(sum(x[0, j] for j in range(1, n + 2)) == 1)
    solver.Add(sum(x[i, fin] for i in range(0, n + 1)) == 1)
    for j in range(1, n + 1):
        solver.Add(sum(x[i, j] for i in range(0, n + 1) if i != j) == v[j])
        solver.Add(sum(x[j, k] for k in range(1, n + 2) if k != j) == v[j])
        solver.Add(t[j] <= T * v[j])
        solver.Add(t[j] >= d[0][j] * v[j])
    for i, j in arcos:
        ti = 0.0 if i == 0 else t[i]
        M = T_fin + s[i] + d[i][j]
        solver.Add(t[j] >= ti + s[i] + d[i][j] - M * (1 - x[i, j]))

    # Solo permite regreso fuera de turno cuando se vuelve directamente sin visitas.
    solver.Add(t[fin] <= T + (T_fin - T) * x[0, fin])

    if fijo:
        ids = [x["id"] for x in nodos]
        if fijo in ids:
            solver.Add(x[0, ids.index(fijo) + 1] == 1)

    recompensa = sum(p[j] * v[j] for j in v)
    if criterio == "combustible":
        solver.Maximize(recompensa - sum(float(km[i][j]) * x[i, j] for i, j in arcos))
    elif criterio == "combinado":
        # El puntaje combinado decide qué barrios se visitan; el tiempo solo
        # limita factibilidad de jornada y ya no resta puntos al objetivo.
        solver.Maximize(recompensa)
    else:
        # Los criterios individuales no mezclan facturación, cantidad, antigüedad o gravedad.
        solver.Maximize(recompensa)

    estado = solver.Solve()
    segundos = round(perf_counter() - inicio, 3)
    if estado not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return {"estado": "SIN_SOLUCION", "orden": [], "llegadas": {}, "segundos": segundos,
                "no_visitados": [x["id"] for x in nodos], "objetivo": 0.0, "minutos_totales": 0.0}

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
    """Programación dinámica exacta para el criterio seleccionado."""
    nodos = datos["countries"]
    d = datos["tiempos"]
    km = datos.get("distancias", d)
    T = float(datos["disponible"])
    u = float(datos.get("peso_urgencia", 0.5))
    c = float(datos.get("costo_minuto", 0.05))
    fijo = datos.get("fijo")
    criterio = datos.get("criterio", "combinado")
    inicio = perf_counter()
    n = len(nodos)
    fin = n + 1
    ids = [x["id"] for x in nodos]
    s = [0.0] + [float(x["servicio"]) for x in nodos] + [0.0]
    if criterio == "combustible":
        max_arco_km = max((float(km[i][j]) for i in range(len(km)) for j in range(len(km[i]))), default=0.0)
        # Esta cota hace que una visita más prevalezca sobre toda reducción de distancia.
        premio_barrio = (n + 1) * max_arco_km + 1.0
        p = [0.0] + [premio_barrio] * n
    else:
        p = [0.0] + [float(x["premio"]) for x in nodos]
    k_fijo = ids.index(fijo) + 1 if fijo in ids else None

    # etiqueta = (llegada al último, objetivo acumulado, último, máscara, etiqueta anterior)
    raiz = (0.0, 0.0, 0, 0, None)
    capas = {(0, 0): [raiz]}
    mejor, mejor_valor = None, -1e18

    def cerrar(et):
        tiempo, valor, ultimo, _, _ = et
        t_fin = tiempo + s[ultimo] + d[ultimo][fin]
        if criterio == "combustible":
            valor_final = valor - km[ultimo][fin]
        elif criterio == "combinado":
            valor_final = valor
        else:
            valor_final = valor
        return valor_final, t_fin

    while capas:
        siguientes: dict = {}
        for (mask, ult), etiquetas in capas.items():
            for et in etiquetas:
                valor, t_fin = cerrar(et)
                valido = (t_fin <= T + 1e-9) or (mask == 0 and not k_fijo)
                if valido and valor > mejor_valor and not (k_fijo and mask == 0):
                    mejor, mejor_valor = et, valor
                t_actual, valor_actual = et[0], et[1]
                candidatos = [k_fijo] if (k_fijo and mask == 0) else range(1, n + 1)
                for j in candidatos:
                    if mask & (1 << j):
                        continue
                    t_j = t_actual + s[ult] + d[ult][j]
                    if t_j + s[j] + d[j][fin] > T + 1e-9:
                        continue
                    if criterio == "combustible":
                        valor_j = valor_actual + p[j] - km[ult][j]
                    elif criterio == "combinado":
                        valor_j = valor_actual + p[j]
                    else:
                        valor_j = valor_actual + p[j]
                    lista = siguientes.setdefault((mask | (1 << j), j), [])
                    if any(o[0] <= t_j + 1e-9 and o[1] >= valor_j - 1e-9 for o in lista):
                        continue
                    lista[:] = [o for o in lista if not (t_j <= o[0] + 1e-9 and valor_j >= o[1] - 1e-9)]
                    lista.append((t_j, valor_j, j, mask | (1 << j), et))
        capas = siguientes

    orden, llegadas, et = [], {}, mejor
    while et is not None and et[2] != 0:
        orden.append(et[2])
        llegadas[ids[et[2] - 1]] = round(et[0], 1)
        et = et[4]
    orden.reverse()
    _, t_fin = cerrar(mejor) if mejor else (0, 0)
    objetivo = round(mejor_valor + 1e-4 * t_fin, 3) if mejor and criterio == "combinado" else round(mejor_valor, 3) if mejor else 0.0
    return {
        "estado": "OPTIMO" if mejor else "SIN_SOLUCION",
        "orden": [ids[k - 1] for k in orden],
        "llegadas": llegadas,
        "no_visitados": [ids[k - 1] for k in range(1, n + 1) if k not in orden],
        "objetivo": objetivo,
        "minutos_totales": round(t_fin, 1),
        "segundos": round(perf_counter() - inicio, 3),
        "metodo": "Programación dinámica exacta",
    }


def resolver_ruteo(datos: dict) -> dict:
    """Programación dinámica para tamaños normales (≤ 14 countries); PLE para más o si se pide."""
    if datos.get("metodo") == "pli" or len(datos["countries"]) > 14:
        return resolver_pli(datos)
    return resolver_pd(datos)
