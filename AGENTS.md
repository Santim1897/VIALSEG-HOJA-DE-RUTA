# Instrucciones compartidas del proyecto Vialseg

Estas reglas aplican a cualquier persona o agente que modifique este repositorio, incluidos Codex y Claude Code.

## Objetivo

Mantener y mejorar el prototipo de optimización de hojas de ruta para mantenimiento de cinemómetros de Vialseg en barrios privados de Pilar y Zona Norte.

## Reglas de colaboración

1. GitHub es la fuente de verdad. No trabajar directamente sobre `main`.
2. Antes de empezar, ejecutar `git checkout main` y `git pull origin main`.
3. Crear una rama por cambio: `tipo/descripcion-corta`, por ejemplo `feat/ponderacion-sla` o `fix/mapa-ruta`.
4. No hacer `git push --force`, no borrar ramas ajenas y no sobrescribir cambios de terceros.
5. Abrir un Pull Request para integrar todo cambio a `main`.
6. Mantener los commits pequeños, explicativos y vinculados a una única intención.

## Reglas técnicas

1. `app.py` contiene backend, algoritmo y visualización. Mantener el proyecto ejecutable localmente.
2. La ruta debe salir y regresar a la base de Martínez en un máximo de 480 minutos.
3. Cada radar atendido consume 11 minutos de servicio, además del viaje.
4. No modificar factores de ponderación, datos de prueba o restricciones sin actualizar `README.md`.
5. Los datos de barrios y coordenadas son simulados: no presentarlos como ubicaciones operativas exactas.
6. Evitar agregar dependencias de producción sin justificarlo en el Pull Request.
7. Nunca incluir credenciales, tokens, archivos `.env`, paquetes locales o datos privados en Git.

## Validación mínima antes de proponer un Pull Request

1. Iniciar la aplicación localmente con `iniciar_local.cmd` o `uvicorn app:app --reload`.
2. Confirmar que `GET /api/radars` responde correctamente.
3. Confirmar que `POST /api/route` devuelve una ruta válida que no supera 480 minutos.
4. Confirmar que el mapa muestra los marcadores, la línea de ruta y el itinerario.

## Forma de trabajar de los agentes

- Explicar brevemente qué se modificará antes de editar.
- Respetar cambios existentes de otros colaboradores.
- Informar archivos modificados y validaciones realizadas al terminar.
- Si falta una decisión de negocio —por ejemplo, cambiar pesos o criterios— pedir definición antes de inventar una política nueva.
