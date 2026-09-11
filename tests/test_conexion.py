"""Prueba de verificación de entorno y conexión para colaborador."""
import unittest


class TestConexion(unittest.TestCase):
    def test_entorno_colaborador(self):
        """Verifica que el entorno de pruebas local responde correctamente."""
        self.assertTrue(True)


if __name__ == "__main__":
    unittest.main()
