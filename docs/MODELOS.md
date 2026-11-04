# Modelos de optimización

Los modelos viven en `api/_modelos/` y se exponen en `/api/py/*` (FastAPI). Usan la misma herramienta que la cátedra (Google OR-Tools, `pywraplp` con el solver SCIP, como en el repo [mfsanchez2020/Localizacion](https://github.com/mfsanchez2020/Localizacion)), salvo el ruteo en vivo, que se resuelve con programación dinámica por velocidad.

## 1. Premio de cada country (`lib/premio.ts`)

Es el "precio pⱼ" del modelo de alocación: cuánto vale para Vialseg resolver hoy las fallas del country *j*.

```
pⱼ = Σ_fallas [ gravedad_f × (1 + α · min(horas_f / 24, 4)) ] × (1 + β · facturaciónⱼ / facturación_máx) × (1 + γ · %rotosⱼ)
```

| Símbolo | Significado | Valor inicial |
|---|---|---|
| gravedad | 1 (leve) a 5 (crítica), del catálogo producto × tipo de falla | ver `lib/catalogo.ts` |
| α | peso del tiempo caído | 0,25 por día (máx. ×2) |
| β | peso del tamaño del cliente | 0,3 |
| γ | peso de la proporción de equipos rotos | 0,5 |

Tiempo en el country: sⱼ = ingreso por guardia (15 min, editable por country) + 20 min × cantidad de equipos con falla (incluye la reparación y el manejo dentro del barrio).

Dónde está cada cosa: la fórmula del premio en `lib/premio.ts`; los pesos en Configuración (se guardan en la base, colección `parametros`); la gravedad por tipo de falla en Configuración (colección `tipos_falla`, valores iniciales en `lib/catalogo.ts`); el modelo de ruteo en `api/_modelos/ruteo.py`. En el panel, **Configuración → Cómo se decide el recorrido** muestra el cuadro con los valores vigentes.

## Criterio del recorrido por jornada

En **Planificación**, el administrador puede elegir el objetivo de cada camioneta para la fecha seleccionada. El criterio queda guardado en esa jornada; si cambia de conductor, el objetivo sigue perteneciendo a la jornada y a la camioneta. Al iniciar, quedan bloqueados tanto el criterio como los countries asignados hasta la próxima jornada.

- **Combinado (actual):** conserva el puntaje y los pesos configurables descritos arriba.
- **Facturación por barrio:** maximiza la suma de la facturación mensual de los barrios visitados.
- **Cantidad de equipos rotos:** maximiza la cantidad absoluta de equipos distintos con fallas abiertas atendidos; cada tipo de equipo cuenta como una unidad.
- **Fallas más antiguas:** prioriza los barrios cuya suma de antigüedad de fallas abiertas es mayor (horas desde su apertura, sin aplicar el tope de cuatro días del puntaje combinado).
- **Gravedad de las fallas:** maximiza la suma de gravedad (escala 1 a 5) de las fallas abiertas atendidas.
- **Cobertura y combustible:** primero maximiza la cantidad de barrios atendidos dentro del horario y con regreso a la base; entre las soluciones con esa cantidad máxima, minimiza los kilómetros totales, incluido el regreso.

Los criterios individuales no suman facturación, antigüedad, cantidad y gravedad en un puntaje conjunto. Todos respetan la duración de servicio y el regreso al domicilio del conductor asignado dentro de la jornada; al iniciar la ruta parte del domicilio configurado, y los recálculos posteriores usan la posición actual conocida. Si el domicilio no está configurado, no se puede iniciar la jornada. En combustible, la prioridad de cobertura se implementa con una cota derivada de la máxima distancia posible, para asegurar que un kilómetro no pueda compensar la pérdida de un barrio.


## 2. Ruteo de una camioneta (`ruteo.py`)

Nodos: 0 = domicilio del conductor al iniciar o posición actual conocida al recalcular, 1..n = countries asignados con fallas, n+1 = domicilio del conductor. dᵢⱼ = minutos de manejo (con tráfico en vivo), T = minutos que quedan de jornada laboral (el conductor debe regresar a su domicilio dentro de ese horario).

**Variables:** xᵢⱼ ∈ {0,1} (de i va a j), vⱼ ∈ {0,1} (se visita j), tⱼ ≥ 0 (minuto de llegada a j).

**Objetivo:**

```
max  Σⱼ pⱼ·vⱼ  −  u · Σⱼ (pⱼ / T)·tⱼ  −  c · Σᵢⱼ dᵢⱼ·xᵢⱼ
```

premio de lo atendido − castigo por atender tarde lo urgente (u = 0,5) − costo del manejo (c = 0,05 por minuto).

**Restricciones:**

```
Σⱼ x₀ⱼ = 1                              sale una vez de donde está
Σᵢ xᵢ,ₙ₊₁ = 1                            termina en el domicilio del conductor
Σᵢ xᵢⱼ = vⱼ = Σₖ xⱼₖ                     entra y sale de cada country visitado
tⱼ ≥ tᵢ + sᵢ + dᵢⱼ − Mᵢⱼ(1 − xᵢⱼ)        tiempos encadenados (MTZ, sin subrecorridos)
tⱼ ≤ T·vⱼ ,  tₙ₊₁ ≤ T                     regreso al domicilio dentro de la jornada
x₀f = 1                                 destino fijado (el conductor ya va en camino / lo forzó el admin)
```

**Resolución:** `resolver_pd` recorre todas las secuencias con programación dinámica (estado = conjunto visitado + último country; se guardan solo las etiquetas tiempo/valor no dominadas). Da el **óptimo exacto** en milisegundos para hasta ~14 countries. `resolver_pli` resuelve la misma formulación con OR-Tools + SCIP; la prueba `test_programacion_dinamica_igual_a_programacion_lineal_entera` verifica que ambos coincidan. Con más de 14 countries se usa la PLE con límite de tiempo.

Medición (10 countries): PD 0,05 s vs. PLE > 10 s. El término de urgencia (premio × hora de llegada) hace débil la relajación lineal de la PLE.

## 3. Asignación automática por criterio y prioridad fija (`asignacion.py`)

**Sugerir distribución** considera todos los countries activos con fallas abiertas y los criterios elegidos en el borrador para esa fecha. Procesa las camionetas en el orden mostrado en Planificación (camioneta 1, luego 2 y 3). Cada una elige sus countries maximizando su propio criterio entre los que siguen libres; después, la siguiente optimiza el suyo entre los restantes. Así no se suman ni comparan facturación, horas, cantidad de equipos y gravedad en una escala común. Cada country se asigna como máximo una vez. Las visitas ya iniciadas quedan fijas.

La asignación de cada camioneta es un modelo binario de selección con límite de jornada aproximado: cada country consume el tiempo de servicio más el viaje de ida; la capacidad conserva el 15% de holgura para traslados entre barrios. Para **combinado, facturación, equipos rotos, espera y gravedad**, primero se maximiza la suma del criterio elegido; si hay empate, se priorizan más barrios y luego menos tiempo de viaje de ida. Para **combustible**, primero se maximiza la cantidad de barrios y luego se minimizan los kilómetros de viaje de ida. La ruta concreta se calcula después e incluye el regreso a la base dentro de la jornada.



## 4. Conexión con la teoría (para el informe)

- **Valor generado vs. costo** (diapositivas 3-5): el objetivo del ruteo es literalmente premio (valor para el cliente) − costo de transporte.
- **Tiempo de respuesta**: KPI "tiempo caído promedio" y "tiempo de respuesta" en el panel.
- **Visibilidad de la orden**: estado de cada falla y posición de cada camioneta en tiempo real.
- **Integración de decisiones ya tomadas** (diapositiva 51): destino fijado por el conductor, destino forzado por el admin y countries ya atendidos no se cambian.
- **Arquetipo de red**: servicio con "última milla" propia (diapositivas 26-29); las camionetas operan desde donde están y la sede es el punto fijo de referencia.
