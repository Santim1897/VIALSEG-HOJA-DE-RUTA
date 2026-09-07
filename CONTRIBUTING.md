# Cómo contribuir al optimizador Vialseg

## Antes de modificar

1. Tener acceso al repositorio privado de GitHub.
2. Clonar el repositorio en la computadora propia.
3. Leer `README.md`, `AGENTS.md` y, si se usa Claude Code, `CLAUDE.md`.
4. Actualizar la rama principal:

```powershell
git checkout main
git pull origin main
```

## Crear un cambio

```powershell
git checkout -b feat/nombre-del-cambio
# editar y validar
git add app.py README.md
git commit -m "Describe el cambio"
git push -u origin feat/nombre-del-cambio
```

Abrir un Pull Request desde esa rama hacia `main`.

## Revisión del Pull Request

El Pull Request debe indicar:

- Qué problema resuelve.
- Qué archivos modificó.
- Cómo se validó.
- Si cambia la ponderación, los valores anteriores y los nuevos.
- Qué impacto se espera en cantidad de incidentes resueltos, kilómetros y SLA.

Se recomienda que otro integrante revise y apruebe el Pull Request antes de integrarlo. Si el repositorio está conectado a Codex, se puede solicitar revisión escribiendo `@codex review` en el Pull Request.

## Convenciones

- `feat/`: nueva funcionalidad.
- `fix/`: corrección de error.
- `docs/`: documentación.
- `refactor/`: mejora interna sin cambiar comportamiento.
- `test/`: pruebas.

No incluir en commits `.local-packages`, `work`, `__pycache__`, credenciales, ni archivos personales del editor.
