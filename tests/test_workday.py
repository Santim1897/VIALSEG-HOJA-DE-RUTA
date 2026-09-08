"""Regresiones de jornada, incluyendo ambos transportes HTTP."""
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import app


class WorkdayTests(unittest.TestCase):
    def test_invalid_limits(self):
        for value in (59, 481, 720, -1, 0, 480.5, 480.0, "480", True, None):
            with self.subTest(value=value), self.assertRaises(app.HTTPException) as caught:
                app.build_route(app.RADARS, "08:00", value)
            self.assertEqual(caught.exception.status_code, 422)

    def test_valid_limits_include_return(self):
        for limit in (60, 360, 480):
            with self.subTest(limit=limit):
                result = app.build_route(app.RADARS, "08:00", limit)
                self.assertLessEqual(result["total_minutes"], limit)
                stops = result["stops"]
                back = app.travel_minutes(app.distance_km(stops[-1], app.BASE)) if stops else 0
                self.assertEqual(result["total_minutes"], sum(s["travel_minutes"] + 11 for s in stops) + back)
                self.assertEqual(len(stops) + len(result["unassigned"]), len(app.RADARS))

    def test_exact_limit_and_one_minute_over(self):
        # Ida 234 + atención 11 + regreso 235 = 480; un minuto más excluye la visita.
        for back, expected in ((235, 1), (236, 0)):
            with self.subTest(back=back), patch.object(app, "travel_minutes", side_effect=[234, back, back]):
                result = app.build_route(app.RADARS[:1], "08:00", 480)
            self.assertEqual(len(result["stops"]), expected)
            self.assertEqual(len(result["unassigned"]), 1 - expected)
            self.assertEqual(result["total_minutes"], 480 if expected else 0)
            self.assertEqual(result["return_time"], "16:00" if expected else "08:00")


class LocalHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app.LocalHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, payload=None):
        request = Request(self.base_url + path, data=json.dumps(payload).encode() if payload is not None else None,
                          headers={"Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_radars(self):
        status, data = self.request("/api/radars")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["radars"]), 15)

    def test_limits(self):
        for limit in (59, 481, 720, -1, 0, 480.5, 480.0, "480", True, None):
            with self.subTest(limit=limit):
                status, data = self.request("/api/route", {"max_minutes": limit})
                self.assertEqual(status, 422)
                self.assertTrue(data["detail"])
        for payload in ({}, {"max_minutes": 60}, {"max_minutes": 360}, {"max_minutes": 480}):
            with self.subTest(payload=payload):
                status, data = self.request("/api/route", payload)
                self.assertEqual(status, 200)
                self.assertLessEqual(data["total_minutes"], payload.get("max_minutes", 480))

    def test_invalid_time_and_empty_selection(self):
        self.assertEqual(self.request("/api/route", {"start_time": "25:00"})[0], 422)
        self.assertEqual(self.request("/api/route", {"selected_ids": []})[0], 400)


@unittest.skipUnless(app.FASTAPI_AVAILABLE, "FastAPI no instalado")
class FastAPIHTTPTests(LocalHTTPTests):
    @classmethod
    def setUpClass(cls):
        import socket
        import time
        import uvicorn
        cls.socket = socket.socket()
        cls.socket.bind(("127.0.0.1", 0))
        cls.base_url = "http://127.0.0.1:" + str(cls.socket.getsockname()[1])
        cls.server = uvicorn.Server(uvicorn.Config(app.app, log_level="error"))
        cls.thread = threading.Thread(target=cls.server.run, kwargs={"sockets": [cls.socket]}, daemon=True)
        cls.thread.start()
        deadline = time.monotonic() + 10
        while not cls.server.started:
            if time.monotonic() > deadline:
                raise RuntimeError("Uvicorn no inició")
            time.sleep(0.01)

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=10)
        cls.socket.close()


if __name__ == "__main__":
    unittest.main()
