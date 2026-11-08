"""Pruebas de los modelos de optimización. Ejecutar: python -m unittest discover tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from _modelos.asignacion import resolver_asignacion  # noqa: E402
from _modelos.ruteo import resolver_pd, resolver_pli, resolver_ruteo  # noqa: E402
import itertools  # noqa: E402
import math  # noqa: E402
import random  # noqa: E402


def matriz(pos):
    """Tiempos en minutos = distancia en una recta (punto 0 = inicio, último = fin del recorrido)."""
    return [[abs(a - b) for b in pos] for a in pos]


def km_recorrido(datos, orden):
    ids = [c["id"] for c in datos["countries"]]
    nodos = [0] + [ids.index(c) + 1 for c in orden] + [len(ids) + 1]
    return sum(datos["tiempos"][a][b] for a, b in zip(nodos, nodos[1:]))


class Ruteo(unittest.TestCase):
    def test_orden_por_cercania_con_igual_premio(self):
        # Con igual puntaje, el desempate elige el recorrido de menos km: 60 km de manejo + 30 de servicio.
        cs = [{"id": c, "premio": 10, "servicio": 10} for c in "ABC"]
        r = resolver_ruteo({"countries": cs, "tiempos": matriz([0, 30, 10, 20, 0]), "disponible": 480})
        self.assertEqual(r["orden"][0], "B")
        self.assertAlmostEqual(r["minutos_totales"], 90)
        self.assertEqual(r["estado"], "OPTIMO")

    def test_desempate_elige_el_recorrido_de_menos_km(self):
        # Puntos en el plano, todos entran en la jornada y valen lo mismo: debe salir el recorrido más corto.
        random.seed(1)
        for _ in range(50):
            n = 5
            pts = [(random.uniform(0, 50), random.uniform(0, 50)) for _ in range(n + 1)]
            pts.append(pts[0])
            d = [[round(math.dist(a, b), 1) for b in pts] for a in pts]
            cs = [{"id": str(i), "premio": 1, "servicio": 10} for i in range(1, n + 1)]
            r = resolver_pd({"countries": cs, "tiempos": d, "disponible": 10000})
            minimo = min(sum(d[a][b] for a, b in zip((0,) + p, p + (n + 1,)))
                         for p in itertools.permutations(range(1, n + 1)))
            self.assertAlmostEqual(r["minutos_totales"], minimo + 10 * n, delta=0.05)
            self.assertEqual(r["objetivo"], n)

    def test_desempate_no_cambia_que_barrios_se_eligen(self):
        # Una diferencia mínima de puntaje (0,0001) le gana a muchos km más.
        cs = [{"id": "lejos", "premio": 1.0001, "servicio": 0}, {"id": "cerca", "premio": 1.0, "servicio": 0}]
        tiempos = [[0, 100, 1, 0], [100, 0, 101, 100], [1, 101, 0, 1], [0, 100, 1, 0]]
        r = resolver_pd({"countries": cs, "tiempos": tiempos, "disponible": 201})
        self.assertEqual(r["orden"], ["lejos"])

    def test_urgente_primero_aunque_quede_un_poco_mas_lejos(self):
        cs = [{"id": "lejos_urgente", "premio": 100, "servicio": 10}, {"id": "cerca_leve", "premio": 2, "servicio": 10}]
        r = resolver_ruteo({"countries": cs, "tiempos": matriz([0, 25, 5, 0]), "disponible": 480})
        self.assertEqual(r["orden"][0], "lejos_urgente")

    def test_respeta_jornada_y_deja_afuera_lo_que_no_entra(self):
        cs = [{"id": "A", "premio": 10, "servicio": 30}, {"id": "B", "premio": 1, "servicio": 30}]
        r = resolver_ruteo({"countries": cs, "tiempos": matriz([0, 10, 60, 0]), "disponible": 80})
        self.assertEqual(r["orden"], ["A"])
        self.assertEqual(r["no_visitados"], ["B"])
        self.assertLessEqual(r["minutos_totales"], 80)

    def test_destino_fijado(self):
        cs = [{"id": c, "premio": 10, "servicio": 10} for c in "AB"]
        r = resolver_ruteo({"countries": cs, "tiempos": matriz([0, 5, 40, 0]), "disponible": 480, "fijo": "B"})
        self.assertEqual(r["orden"][0], "B")


    def test_programacion_dinamica_igual_a_programacion_lineal_entera(self):
        random.seed(7)
        for _ in range(3):
            pts = [random.uniform(0, 40) for _ in range(7)]
            cs = [{"id": f"c{i}", "premio": random.uniform(3, 40), "servicio": 26} for i in range(5)]
            datos = {"countries": cs, "tiempos": matriz(pts), "disponible": 240}
            a, b = resolver_pd(datos), resolver_pli(datos)
            # Mismo óptimo: mismo puntaje y mismos km (en una recta puede haber órdenes distintos con igual km).
            self.assertEqual(sorted(a["orden"]), sorted(b["orden"]))
            self.assertAlmostEqual(a["objetivo"], b["objetivo"], delta=0.1)
            self.assertAlmostEqual(km_recorrido(datos, a["orden"]), km_recorrido(datos, b["orden"]), delta=0.01)


class Asignacion(unittest.TestCase):
    def test_cada_country_a_la_camioneta_mas_cercana_y_respeta_fijos(self):
        cams = [{"id": "c1", "capacidad": 480}, {"id": "c2", "capacidad": 480}]
        cts = [{"id": "X", "premio": 10, "servicio": 20}, {"id": "Y", "premio": 10, "servicio": 20}]
        d = [[5, 50], [50, 5]]
        r = resolver_asignacion({"camionetas": cams, "countries": cts, "tiempos": d})
        self.assertEqual(r["asignacion"], {"c1": ["X"], "c2": ["Y"]})
        r = resolver_asignacion({"camionetas": cams, "countries": cts, "tiempos": d,
                                 "fijos": [{"camioneta": "c2", "country": "X"}]})
        self.assertIn("X", r["asignacion"]["c2"])

    def test_capacidad(self):
        cams = [{"id": "c1", "capacidad": 60}]
        cts = [{"id": c, "premio": p, "servicio": 40} for c, p in (("A", 5), ("B", 9))]
        r = resolver_asignacion({"camionetas": cams, "countries": cts, "tiempos": [[5, 5]]})
        self.assertEqual(r["asignacion"]["c1"], ["B"])


if __name__ == "__main__":
    unittest.main()
