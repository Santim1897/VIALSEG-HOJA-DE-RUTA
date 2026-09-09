import unittest
import tempfile
import json
from pathlib import Path
from unittest.mock import patch
import app


def nodes():
    return [{**app.RADARS[0], 'id': str(i), 'priority': 'Alto', 'lead_hours': 1,
             'billing': billing} for i, billing in enumerate((950000, 650000, 350000), 1)]


class RoutingTests(unittest.TestCase):
    def test_workday_from_start_and_end(self):
        self.assertEqual(app.workday_duration('08:00', '14:00', 480), 360)
        self.assertEqual(app.workday_duration('09:15', '16:45', 480), 450)
        self.assertEqual(app.workday_duration('08:00', None, 480), 480)
        for end in ('08:00', '07:00', '08:30', '17:00', '25:00'):
            with self.subTest(end=end), patch.object(app, 'road_matrix') as provider:
                with self.assertRaises(app.HTTPException):
                    app.build_plan(nodes(), '08:00', 480, '2026-09-09', end)
                provider.assert_not_called()

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
        order = app.choose_order(nodes(), self.durations, self.distances, 70)
        self.assertEqual(order, [1, 3])
        self.durations[3][0] = None
        order = app.choose_order(nodes(), self.durations, self.distances, 70)
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
        self.assertEqual(result['total_minutes'], 284)
        self.assertEqual(result['return_time'], '12:44')
        self.assertEqual(result['total_km'], 206)
        self.assertEqual(result['stops'][1]['arrival'], '08:32')
        self.assertEqual(result['stops'][1]['service_start'], '08:47')
        self.assertTrue(all(s['entry_minutes'] == 15 for s in result['stops']))
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

    def test_entry_once_for_continuous_neighborhood_visit(self):
        a, b, c = nodes()
        a['neighborhood_id'] = b['neighborhood_id'] = 'same'
        c['neighborhood_id'] = 'other'
        self.assertEqual(app.entry_minutes(app.BASE, a), 15)
        self.assertEqual(app.entry_minutes(a, b), 0)
        self.assertEqual(app.entry_minutes(b, c), 15)
        self.assertEqual(app.entry_minutes(c, a), 15)

    def test_deferred_visit_is_dated_and_saved(self):
        # 26 min en sitio + 5 min por tramo: con 60 min cabe solo un equipo.
        n = nodes()
        matrix = [[0 if i == j else 300 for j in range(4)] for i in range(4)]
        def mapped(service, points, options):
            return {'routes': [{'legs': [{'duration': 300, 'distance': 1000}] * (len(points)-1),
                                'geometry': {'coordinates': [[-58, -34], [-58.1, -34.1]]}}]}
        with patch.object(app, 'road_matrix', return_value=(matrix, matrix)), patch.object(app, 'road_data', side_effect=mapped):
            plan = app.build_plan(n, '08:00', 60, '2026-09-08')
        self.assertEqual([d['date'] for d in plan['days']], ['2026-09-08', '2026-09-09', '2026-09-10'])
        self.assertEqual(plan['deferred_count'], 2)
        self.assertEqual(plan['unscheduled'], [])
        visited = [s['id'] for d in plan['days'] for s in d['stops']]
        self.assertEqual(len(set(visited)), 3)
        self.assertTrue(all(d['total_minutes'] <= 60 for d in plan['days']))
        with tempfile.TemporaryDirectory() as temp, patch.object(app, 'PLAN_FILE', Path(temp)/'plan.json'):
            app.save_plan(plan)
            self.assertEqual(app.saved_plan(), json.loads(json.dumps(plan)))

    def test_impossible_visit_is_not_promised_tomorrow(self):
        matrix = [[0, 36000], [36000, 0]]
        with patch.object(app, 'road_matrix', return_value=(matrix, matrix)):
            plan = app.build_plan(nodes()[:1], '08:00', 480, '2026-09-08')
        self.assertEqual(plan['days'], [])
        self.assertEqual(len(plan['unscheduled']), 1)


if __name__ == '__main__':
    unittest.main()
