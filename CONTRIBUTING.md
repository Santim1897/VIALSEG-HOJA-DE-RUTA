# Cómo contribuir al optimizador Vialseg

## Preparar la copia local

1. El responsable invita a cada colaborador al repositorio privado con su cuenta personal de GitHub. Cada integrante acepta la invitación y usa sus propias credenciales; no se comparte la cuenta del propietario.
2. Clonar el repositorio en la computadora propia:

```powershell
git clone https://github.com/Santim1897/VIALSEG-HOJA-DE-RUTA.git
cd VIALSEG-HOJA-DE-RUTA
```

3. Abrir esa carpeta en la herramienta de desarrollo y leer `AGENTS.md`, `README.md` y, cuando corresponda, `CLAUDE.md`.
4. Instalar y ejecutar el sistema según el README. Las dependencias y datos locales de cada persona no se publican.
5. Antes de cada cambio, preservar trabajo pendiente y actualizar la versión aprobada:

```powershell
git checkout main
git pull --ff-only origin main
git checkout -b feat/nombre-del-cambio
```

Si falta `origin` o el historial local no corresponde al repositorio, clonar en una carpeta nueva y conservar la anterior. No forzar una unión de historias ni sobrescribir archivos ajenos.

## Probar y proponer cambios

Modificar y probar el sistema en la copia local. Cumplir las validaciones de `AGENTS.md` y describir sus resultados. Luego publicar únicamente los archivos necesarios:

```powershell
git add app.py README.md
git commit -m "Describe el cambio"
git push -u origin feat/nombre-del-cambio
```

La lista de `git add` es un ejemplo: adaptarla a los archivos realmente modificados. Abrir en GitHub un Pull Request desde esa rama hacia `main` y compartir su enlace con @Santim1897. Si todavía no está listo, abrirlo como borrador.

El Pull Request debe explicar el problema, la solución, los archivos afectados, las pruebas y sus resultados, y cualquier impacto en ponderación, minutos, kilómetros o SLA. No presentar validaciones pendientes como realizadas.

## Aprobación e incorporación

@Santim1897 revisa el Pull Request, solicita correcciones o autoriza su incorporación. Las correcciones se publican en la misma rama y aparecen en el mismo PR. Solo el responsable realiza la integración desde GitHub. Una revisión automática no sustituye su decisión.

Cada colaborador debe abrir PR con su propia cuenta. GitHub no permite aprobar un PR propio: si una herramienta publica usando la cuenta de @Santim1897, GitHub lo considera autor. No compartir esa cuenta entre colaboradores ni desactivar protecciones para evitar esta restricción.

Tras la integración, cada integrante actualiza su copia:

```powershell
git checkout main
git pull --ff-only origin main
```

Preservar antes cualquier cambio local pendiente. La actualización descarga el código aprobado; no actualiza automáticamente dependencias ni migra datos locales.

## Protección de main (configuración del responsable)

El archivo `.github/CODEOWNERS` debe existir en `main`. En GitHub, configurar una regla para `main` que exija:

- Pull Request antes de integrar.
- Al menos una aprobación y revisión de Code Owners.
- Invalidar aprobaciones anteriores cuando cambie el contenido del PR.
- Resolver conversaciones pendientes.
- Mantener bloqueados los force pushes y la eliminación de la rama.
- No conceder excepciones a colaboradores o aplicaciones.

La revisión de Code Owners exige la aprobación de @Santim1897 para los PR de otras cuentas, incluido cualquier cambio del propio CODEOWNERS. El archivo y esta guía no activan por sí solos la regla: verificar que GitHub la muestre activa y aplicada. La disponibilidad en repositorios privados depende del plan.

Los PR iniciales de configuración creados con la cuenta del propietario requieren que este los revise e incorpore antes de activar una política que le impida aprobarlos por ser su autor. No fusionarlos automáticamente.

Referencias: [Code Owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) y [protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Convenciones

- `feat/`: nueva funcionalidad.
- `fix/`: corrección de error.
- `docs/`: documentación.
- `refactor/`: mejora interna sin cambiar comportamiento.
- `test/`: pruebas.
- `chore/`: mantenimiento y configuración de colaboración.

No incluir en commits `.local-packages`, `work`, `__pycache__`, credenciales ni archivos personales del editor.
