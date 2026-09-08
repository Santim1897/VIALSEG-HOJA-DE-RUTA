import unittest
from unittest.mock import patch
import app


def nodes():
    return [{**app.RADARS[0], 'id': str(i), 'priority': 'Alto', 'lead_hours': 1,
             'billing': billing} for i, billing in enumerate((950000, 650000, 350000), 1)]


class RoutingTests(unittest.TestCase):
    def setUp(self):
        # Base, 1 y 3 cercanos; 2 lejos. Tiempos dirigidos, en segundos.
        self.minutes = [[0, 5, 100, 6], [5, 0, 100, 1], [100, 100, 0, 100], [6, 1, 100, 0]]
        self.durations = [[v * 60 for v in row] for row in self.minutes]
        self.distances = [[v * 1000 for v in row] for row in self.minutes]

    def test_nearby_third_priority_before_remote_second(self):
        self.assertEqual(app.choose_order(nodes(), self.durations, self.distances, 480), [1, 3, 2])

    def test_equal_roads_preserve_priority(self):
        d = [[0 if i == j else 300 for j in range(4)] for i in range(4)]
        self.assertEqual(app.choose_order(nodes(), d, d, 480), [1, 2, 3])

    def test_return_and_unreachable_are_respected(self):
        order = app.choose_order(nodes(), self.durations, self.distances, 60)
        self.assertEqual(order, [1, 3])
        self.durations[3][0] = None
        order = app.choose_order(nodes(), self.durations, self.distances, 60)
        self.assertNotIn(3, order)

    def test_output_uses_provider_legs_and_service(self):
        def mapped(service, points, options):
            ids = [0 if p['id'] == app.BASE['id'] else int(p['id']) for p in points]
            return {'routes': [{'legs': [{'duration': self.durations[a][b], 'distance': self.distances[a][b]}
                                        for a, b in zip(ids, ids[1:])],
                                'geometry': {'coordinates': [[-58, -34], [-58.1, -34.1]]}}]}
        with patch.object(app, 'road_matrix', return_value=(self.durations, self.distances)), patch.object(app, 'road_data', side_effect=mapped):
            result = app.build_route(nodes(), '08:00', 480)
        self.assertEqual([s['id'] for s in result['stops']], ['1', '3', '2'])
        self.assertEqual(result['total_minutes'], 239)
        self.assertEqual(result['return_time'], '11:59')
        self.assertEqual(result['total_km'], 206)
        self.assertEqual(result['stops'][1]['arrival'], '08:17')
        self.assertFalse(result['live_traffic'])
        self.assertTrue(all(s['service_minutes'] == 11 for s in result['stops']))

    def test_no_straight_line_fallback_on_outage(self):
        with patch.object(app, 'road_matrix', side_effect=app.HTTPException(503, 'Sin proveedor')):
            with self.assertRaises(app.HTTPException) as err:
                app.build_route(nodes(), '08:00', 480)
        self.assertEqual(err.exception.status_code, 503)

    def test_invalid_workday(self):
        for value in (481, 720, 59, True, '480'):
            with self.assertRaises(app.HTTPException):
                app.build_route(nodes(), '08:00', value)

    def test_invalid_matrix(self):
        with patch.object(app, 'road_data', return_value={'durations': [[0]], 'distances': [[0]]}):
            with self.assertRaises(app.HTTPException):
                app.road_matrix([app.BASE, nodes()[0]])

    def test_final_route_overrun_is_not_published(self):
        mapped = {'routes': [{'legs': [{'duration': 10000, 'distance': 1000}] * 4,
                             'geometry': {'coordinates': [[0, 0], [1, 1]]}}]}
        with patch.object(app, 'road_matrix', return_value=(self.durations, self.distances)), patch.object(app, 'road_data', return_value=mapped):
            with self.assertRaises(app.HTTPException):
                app.build_route(nodes(), '08:00', 480)


if __name__ == '__main__':
    unittest.main()
