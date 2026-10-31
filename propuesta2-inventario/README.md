# Vialseg · Inventario

Aplicación web independiente para controlar existencias, registrar movimientos y anticipar reposiciones. Está aislada del código de planificación de recorridos.

## Qué incluye

- Resumen del inventario y alertas de stock.
- Catálogo de materiales con búsqueda, filtros y clasificación ABC.
- Registro auditable de ingresos, consumos y ajustes.
- Recomendaciones de reposición con stock de seguridad, consumo estimado, plazo de entrega y lote.
- Importación y exportación de materiales en CSV.
- Acceso compartido mediante Supabase Auth y Postgres.
- Modo demostración con datos ficticios guardados solo en el navegador.

## Cálculos iniciales

- Punto de reposición = stock de seguridad + consumo diario promedio × plazo de entrega en días. El consumo diario se estima como consumo mensual / 30.
- La cantidad sugerida busca llegar al punto de reposición más un lote, redondeando al múltiplo del lote configurado.
- ABC se calcula sobre el valor anual de consumo (consumo mensual × 12 × costo unitario): A hasta 80% acumulado, B hasta 95% y C el resto. Son parámetros iniciales que conviene validar con Vialseg.
- Un insumo marcado como “No se repone” se muestra en una lista de seguimiento y no genera sugerencia automática de compra.
- No hay órdenes de compra ni pronóstico de producción en esta primera versión.

Los registros de ejemplo no representan el inventario real de Vialseg. Las cantidades y costos deben reemplazarse por datos reales antes de tomar decisiones de compra.

## Publicar como un sitio distinto en Vercel

Este proyecto está pensado para desplegarse como un proyecto separado de Vercel aunque el código viva en una carpeta propia del repositorio.

1. Crear un proyecto Supabase para inventario, separado del proyecto de recorridos.
2. En Supabase, abrir SQL Editor y ejecutar el contenido de sql/schema.sql.
3. En Authentication, desactivar los registros públicos y crear en Users las cuentas autorizadas para administración y depósito.
4. En SQL Editor, habilitar cada cuenta en inventory_members. Ejemplo para administración: INSERT INTO public.inventory_members (user_id, rol) SELECT id, 'admin' FROM auth.users WHERE email = 'correo@empresa.com' ON CONFLICT (user_id) DO UPDATE SET rol = EXCLUDED.rol, activo = true; Repetir con rol 'deposito' para el equipo de almacén.
5. En Vercel, importar el repositorio Santim1897/VIALSEG-HOJA-DE-RUTA. En la configuración del proyecto, establecer Root Directory en propuesta2-inventario.
6. Framework Preset: Other. Build Command: npm run build. Output Directory: dist.
7. En Environment Variables de Vercel, agregar:
   - SUPABASE_URL = URL del proyecto Supabase de inventario.
   - SUPABASE_ANON_KEY = clave pública anon del proyecto.
8. Desplegar el proyecto. Si se agregan o cambian variables, volver a desplegar.

La clave anon queda visible para el navegador; el acceso se limita por autenticación, la lista inventory_members y las políticas RLS creadas por sql/schema.sql. Nunca cargar una clave service_role en este sitio.

## Modo de demostración

Si Supabase todavía no está configurado, se puede elegir “Explorar demostración”. Los cambios solo se guardan en ese navegador y no se comparten entre personas ni dispositivos. El modo demo se identifica permanentemente en pantalla.

## Formato CSV

Se acepta una fila de encabezados con estos nombres: codigo, nombre, categoria, unidad, stock, costo_unitario, consumo_mensual, stock_seguridad, plazo_dias, lote_reposicion, proveedor, ubicacion, se_repone.

Se recomienda exportar el Excel actual como CSV UTF-8. La importación registra el stock inicial como ajuste; para materiales existentes, debe conservarse la trazabilidad de los cambios.

## Desarrollo local

Requiere Node.js 20 o superior. Ejecutar npm run build y servir la carpeta dist con cualquier servidor web estático.
