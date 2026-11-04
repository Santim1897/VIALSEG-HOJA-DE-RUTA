# Instrucciones compartidas del proyecto Vialseg

Estas reglas aplican a cualquier persona o agente que modifique este repositorio, incluidos Codex, Claude Code y Google Antigravity.

## Objetivo

Sistema de ruteo de las camionetas de mantenimiento de Vialseg en barrios privados de Pilar y Zona Norte: vista de administración, vista de conductor y modelos de optimización. Ver `README.md`, `docs/MODELOS.md` y `docs/DECISIONES.md`.

## Reglas de colaboración

1. GitHub es la fuente de verdad. No trabajar directamente sobre `main`.
2. Trabajar en una copia local propia y con la cuenta GitHub de cada colaborador. Antes de empezar, preservar cambios pendientes, ejecutar `git checkout main` y `git pull --ff-only origin main`. Si no hay clon local, obtenerlo del repositorio oficial; no inicializar una historia independiente.
3. Crear una rama por cambio: `tipo/descripcion-corta`, por ejemplo `feat/ponderacion-sla` o `fix/mapa-ruta`.
4. No hacer `git push --force`, no borrar ramas ajenas y no sobrescribir cambios de terceros.
5. Publicar la rama y abrir un Pull Request hacia `main`, compartir el enlace y esperar la aprobación de @Santim1897. Solo el responsable integra los cambios desde GitHub; los agentes no deben aprobar, integrar ni habilitar auto-merge por iniciativa propia.
6. Mantener los commits pequeños, explicativos y vinculados a una única intención.

## Reglas técnicas (v2)

1. Stack: Next.js 16 (App Router, TypeScript, Tailwind 4) + optimizador en Python (`api/`, FastAPI + OR-Tools). Next.js 16 tiene cambios incompatibles: antes de usar una API de Next, leer la guía en `node_modules/next/dist/docs/` (por ejemplo, `params` y `cookies` son asíncronos y `middleware` pasó a llamarse `proxy`).
2. Toda lectura/escritura de datos pasa por `lib/store.ts`. No acceder a Supabase desde el navegador; la `service_role` es solo de servidor.
3. El sistema se trata como producto en uso: textos de la interfaz sin referencias académicas ni de prototipo (eso va en `docs/`). Hasta recibir los datos reales, los countries, equipos y conductores son de ejemplo.
4. La ruta de cada camioneta sale de su posición actual (GPS, o la sede si no hay) y regresa a la base (SEDE) dentro del horario de la jornada; 15 min de ingreso por country y 11 min por falla (editables en Parámetros).
5. No cambiar pesos, gravedades o restricciones sin actualizar `README.md`, `docs/MODELOS.md` y `docs/DECISIONES.md`.
6. Cada decisión nueva va como entrada en `docs/DECISIONES.md`. Mantener `README.md` y este archivo al día con cada cambio.
7. Evitar dependencias nuevas sin justificarlas en el Pull Request. Nunca subir `.env.local`, `.data/`, `.venv/` ni claves.
8. Seguridad: toda ruta de API usa `usuarioActual(rol)`; `proxy.ts` protege `/admin` y `/conductor`. Contraseñas y PIN con scrypt (`lib/clave.ts`). Nunca devolver `hash`/`sal` al navegador (usar `publico()`). Las validaciones de negocio van en `lib/acciones.ts`, no solo en la interfaz.

## Validación mínima antes de proponer un Pull Request

1. `.venv\Scripts\python -m unittest discover tests` sin errores.
2. `npx tsc --noEmit` y `npm run lint` sin errores.
3. Con el optimizador (`uvicorn api.index:app --port 8000`) y `npm run dev` corriendo, en http://localhost:3000:
   - `/login` como administración (`admin`) → `/admin` muestra el mapa, los countries por gravedad y los recorridos por color.
   - `/login` como conductor (Conductor 1, PIN 1111) → Iniciar jornada → Llegué → Terminé recalcula desde ese country; Deshacer funciona.
   - Un conductor no puede abrir `/admin` ni llamar a `/api/admin` (401).
   - Planificación → Editar plan → Sugerir distribución → Revisar y guardar.

## Forma de trabajar de los agentes

- Explicar brevemente qué se modificará antes de editar.
- Respetar cambios existentes de otros colaboradores.
- Informar archivos modificados y validaciones realizadas al terminar.
- Si falta una decisión de negocio —por ejemplo, cambiar pesos o criterios— pedir definición antes de inventar una política nueva.

La sugerencia automática considera todos los countries con fallas abiertas, optimiza por turno el criterio elegido para cada camioneta en el orden mostrado en Planificación y asigna cada country como máximo una vez. Documentar cambios a esta política en README.md, docs/MODELOS.md y docs/DECISIONES.md.

## Revisión obligatoria en GitHub

`.github/CODEOWNERS` designa a @Santim1897 como responsable de todos los archivos. Para que su revisión sea obligatoria, ese archivo debe estar incorporado a `main` y GitHub debe tener activa una regla de protección que exija Pull Request y revisión de Code Owners. La documentación por sí sola no activa esa protección.

Los cambios exclusivamente documentales o de metadatos de revisión pueden validarse revisando el diff, enlaces y sintaxis; las validaciones de ejecución anteriores son obligatorias cuando se modifica la aplicación, sus dependencias o su arranque. Informar siempre qué se ejecutó y qué quedó pendiente.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
