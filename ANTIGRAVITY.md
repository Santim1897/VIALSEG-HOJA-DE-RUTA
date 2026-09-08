# Trabajar con Google Antigravity

## Primera vez, sin GitHub Desktop

1. Crear una cuenta propia de GitHub, pedir acceso a [VIALSEG-HOJA-DE-RUTA](https://github.com/Santim1897/VIALSEG-HOJA-DE-RUTA) y aceptar la invitación.
2. Instalar Antigravity desde [su sitio oficial](https://antigravity.google/) e iniciar sesión. Abrir una carpeta local para guardar el proyecto.
3. Pedir al agente: “Verificá Git, GitHub CLI y Python. Ayudame a instalar lo que falte desde fuentes oficiales y autenticar mi cuenta de GitHub mediante el navegador. Cloná https://github.com/Santim1897/VIALSEG-HOJA-DE-RUTA aquí, sin sobrescribir carpetas existentes ni crear una historia Git independiente”.
4. Abrir la carpeta clonada VIALSEG-HOJA-DE-RUTA como raíz del proyecto en Antigravity.

El inicio de sesión de Antigravity y el de GitHub son independientes. No pegar contraseñas ni tokens en el chat. El agente puede comprobar la sesión con `gh auth status`, iniciar `gh auth login --web` y configurar Git con `gh auth setup-git`; el usuario completa el acceso en el navegador. No se necesita GitHub Desktop.

## Activar las instrucciones

En el panel del agente, abrir **… → Customizations → Rules**. Comprobar que aparece la regla de workspace `.agents/rules/vialseg.md` y elegir **Always On** como modo de activación. Si no aparece, verificar que se abrió la raíz del clon, recargar el proyecto y mencionar el archivo explícitamente al agente.

Pedir: “Leé .agents/rules/vialseg.md y los documentos que referencia. Resumí las reglas de ramas, aprobación y validación antes de empezar”.

La regla remite a [AGENTS.md](AGENTS.md), que sigue siendo la fuente común para todas las IA. [CLAUDE.md](CLAUDE.md) conserva la entrada de Claude Code. Esta guía no requiere modificar archivos globales de Antigravity.

## Abrir y probar el sistema

Pedir: “Leé README.md, prepará las dependencias e iniciá mi copia local. Mostrame la URL y la rama utilizadas. No publiques cambios”.

En Windows se puede ejecutar `iniciar_local.cmd`. La alternativa con Python está en [README.md](README.md). La URL habitual es http://127.0.0.1:8000/ y requiere que el servidor siga funcionando. Si el agente usa otra carpeta o puerto, debe informar la dirección real.

Antes de proponer cambios de aplicación, seguir las validaciones de [AGENTS.md](AGENTS.md): inicio local, GET /api/radars, POST /api/route y comprobación visual de marcadores, ruta e itinerario. Mantener la jornada máxima de 480 minutos, salida y regreso a Martínez y 11 minutos de servicio por radar. Los datos son simulados.

## Pedir un cambio y enviarlo

> Preservá mi trabajo pendiente, actualizá desde main y creá una rama propia. Implementá [cambio], probalo y abrí la versión local para revisarla. Todavía no publiques.

Cuando esté listo:

> Revisá el diff y los archivos que se publicarán. Creá un commit, publicá la rama y abrí un PR hacia main con mi cuenta. Explicá el cambio y las pruebas; dame el enlace para Santim1897. No integres ni actives auto-merge.

Usar Git y GitHub CLI o una integración GitHub ya autorizada. Verificar que el PR fue creado y devolver su enlace; si falta autenticación o permiso, informar el bloqueo sin afirmar que se publicó.

## Recibir las mejoras aprobadas

> Preservá mis cambios locales, actualizá main desde origin sin sobrescribir trabajo pendiente y reiniciá el sistema. Explicame qué novedades recibí.

Seguir [CONTRIBUTING.md](CONTRIBUTING.md). Las copias locales no se actualizan solas. La regla del agente tampoco activa una protección de GitHub: el equipo mantiene el acuerdo de revisión por PR en su plan gratuito.

Referencia de formato y activación: [reglas oficiales de Antigravity](https://antigravity.google/docs/ide/rules/). La documentación actual utiliza `.agents/rules` y mantiene compatibilidad con `.agent/rules`; este repositorio utiliza la ubicación actual, sin duplicar reglas.
