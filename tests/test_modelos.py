"""Pruebas de los modelos de optimización. Ejecutar: python -m unittest discover tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from _modelos.asignacion import resolver_asignacion  # noqa: E402
from _modelos.gravedad import resolver_gravedad  # noqa: E402
from _modelos.ruteo import resolver_pd, resolver_pli, resolver_ruteo  # noqa: E402
import random  # noqa: E402


def matriz(pos):
    """Tiempos en minutos = distancia en una recta (punto 0 = inicio, último = base)."""
    return [[abs(a - b) for b in pos] for a in pos]


class Ruteo(unittest.TestCase):
    def test_orden_por_cercania_con_igual_premio(self):
        cs = [{"id": c, "premio": 10, "servicio": 10} for c in "ABC"]
        r = resolver_ruteo({"countries": cs, "tiempos": matriz([0, 30, 10, 20, 0]), "disponible": 480})
        self.assertEqual(r["orden"], ["B", "C", "A"])
        self.assertEqual(r["estado"], "OPTIMO")

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
            self.assertEqual(a["orden"], b["orden"])
            self.assertAlmostEqual(a["objetivo"], b["objetivo"], delta=0.1)


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


class Gravedad(unittest.TestCase):
    def test_centro_entre_puntos(self):
        cs = [{"id": "a", "lat": -34.4, "lon": -58.8, "demanda": 1}, {"id": "b", "lat": -34.4, "lon": -58.6, "demanda": 1},
              {"id": "c", "lat": -34.5, "lon": -58.7, "demanda": 1}]
        r = resolver_gravedad({"countries": cs, "candidatas": [{"id": "lejos", "lat": -34.9, "lon": -58.0}]})
        self.assertAlmostEqual(r["centro"]["lon"], -58.7, delta=0.05)
        self.assertGreater(r["candidatas"][0]["sobrecosto_pct"], 0)


if __name__ == "__main__":
    unittest.main()
