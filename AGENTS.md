# Instrucciones compartidas del proyecto Vialseg

Estas reglas aplican a cualquier persona o agente que modifique este repositorio, incluidos Codex, Claude Code y Google Antigravity.

## Objetivo

Mantener y mejorar el prototipo de optimización de hojas de ruta para mantenimiento de cinemómetros de Vialseg en barrios privados de Pilar y Zona Norte.

## Reglas de colaboración

1. GitHub es la fuente de verdad. No trabajar directamente sobre `main`.
2. Trabajar en una copia local propia y con la cuenta GitHub de cada colaborador. Antes de empezar, preservar cambios pendientes, ejecutar `git checkout main` y `git pull --ff-only origin main`. Si no hay clon local, obtenerlo del repositorio oficial; no inicializar una historia independiente.
3. Crear una rama por cambio: `tipo/descripcion-corta`, por ejemplo `feat/ponderacion-sla` o `fix/mapa-ruta`.
4. No hacer `git push --force`, no borrar ramas ajenas y no sobrescribir cambios de terceros.
5. Publicar la rama y abrir un Pull Request hacia `main`, compartir el enlace y esperar la aprobación de @Santim1897. Solo el responsable integra los cambios desde GitHub; los agentes no deben aprobar, integrar ni habilitar auto-merge por iniciativa propia.
6. Mantener los commits pequeños, explicativos y vinculados a una única intención.

## Reglas técnicas

1. `app.py` contiene backend, algoritmo y visualización. Mantener el proyecto ejecutable localmente.
2. La ruta debe salir y regresar a la base de Martínez en un máximo de 480 minutos.
3. Cada radar atendido consume 11 minutos de servicio, además del viaje y 15 minutos de ingreso por entrada al barrio. Programar los pendientes en jornadas sucesivas; no asignar fecha a una visita sin jornada viable.
4. No modificar factores de ponderación, datos de prueba o restricciones sin actualizar `README.md`.
5. Los datos de barrios y coordenadas son simulados: no presentarlos como ubicaciones operativas exactas.
6. Evitar agregar dependencias de producción sin justificarlo en el Pull Request.
7. Nunca incluir credenciales, tokens, archivos `.env`, paquetes locales o datos privados en Git.

## Validación mínima antes de proponer un Pull Request

1. Iniciar la aplicación localmente con `iniciar_local.cmd` o `uvicorn app:app --reload`.
2. Confirmar que `GET /api/radars` responde correctamente.
3. Confirmar que `POST /api/route` devuelve un plan con jornadas válidas que no superan 480 minutos y que `GET /api/plan` conserva la programación.
4. Confirmar que el mapa muestra los marcadores, la línea de ruta y el itinerario.

## Forma de trabajar de los agentes

- Explicar brevemente qué se modificará antes de editar.
- Respetar cambios existentes de otros colaboradores.
- Informar archivos modificados y validaciones realizadas al terminar.
- Si falta una decisión de negocio —por ejemplo, cambiar pesos o criterios— pedir definición antes de inventar una política nueva.

## Revisión obligatoria en GitHub

`.github/CODEOWNERS` designa a @Santim1897 como responsable de todos los archivos. Para que su revisión sea obligatoria, ese archivo debe estar incorporado a `main` y GitHub debe tener activa una regla de protección que exija Pull Request y revisión de Code Owners. La documentación por sí sola no activa esa protección.

Los cambios exclusivamente documentales o de metadatos de revisión pueden validarse revisando el diff, enlaces y sintaxis; las validaciones de ejecución anteriores son obligatorias cuando se modifica la aplicación, sus dependencias o su arranque. Informar siempre qué se ejecutó y qué quedó pendiente.
