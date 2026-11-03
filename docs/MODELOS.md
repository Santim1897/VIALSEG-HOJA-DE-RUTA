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

## 2. Ruteo de una camioneta (`ruteo.py`)

Nodos: 0 = posición actual (GPS), 1..n = countries asignados con fallas, n+1 = regreso a base (SEDE). dᵢⱼ = minutos de manejo (con tráfico en vivo), T = minutos que quedan de jornada laboral (el conductor debe regresar a la base dentro de ese horario).

**Variables:** xᵢⱼ ∈ {0,1} (de i va a j), vⱼ ∈ {0,1} (se visita j), tⱼ ≥ 0 (minuto de llegada a j).

**Objetivo:**

```
max  Σⱼ pⱼ·vⱼ  −  u · Σⱼ (pⱼ / T)·tⱼ  −  c · Σᵢⱼ dᵢⱼ·xᵢⱼ
```

premio de lo atendido − castigo por atender tarde lo urgente (u = 0,5) − costo del manejo (c = 0,05 por minuto).

**Restricciones:**

```
Σⱼ x₀ⱼ = 1                              sale una vez de donde está
Σᵢ xᵢ,ₙ₊₁ = 1                            termina en la base (SEDE)
Σᵢ xᵢⱼ = vⱼ = Σₖ xⱼₖ                     entra y sale de cada country visitado
tⱼ ≥ tᵢ + sᵢ + dᵢⱼ − Mᵢⱼ(1 − xᵢⱼ)        tiempos encadenados (MTZ, sin subrecorridos)
tⱼ ≤ T·vⱼ ,  tₙ₊₁ ≤ T                     regreso a base dentro de la jornada
x₀f = 1                                 destino fijado (el conductor ya va en camino / lo forzó el admin)
```

**Resolución:** `resolver_pd` recorre todas las secuencias con programación dinámica (estado = conjunto visitado + último country; se guardan solo las etiquetas tiempo/valor no dominadas). Da el **óptimo exacto** en milisegundos para hasta ~14 countries. `resolver_pli` resuelve la misma formulación con OR-Tools + SCIP; la prueba `test_programacion_dinamica_igual_a_programacion_lineal_entera` verifica que ambos coincidan. Con más de 14 countries se usa la PLE con límite de tiempo.

Medición (10 countries): PD 0,05 s vs. PLE > 10 s. El término de urgencia (premio × hora de llegada) hace débil la relajación lineal de la PLE.

## 3. Asignación de countries a camionetas (`asignacion.py`)

Adaptación del modelo de **alocación de demanda por maximización de beneficios** (Chopra & Meindl, cap. 5; diapositiva 53):

| Materia | Vialseg |
|---|---|
| Planta i, capacidad Kᵢ | Camioneta i, minutos de jornada × 0,85 (holgura para traslados entre countries) |
| Costo fijo fᵢ | Costo de sacar la camioneta (0 por defecto: salen todas) |
| Mercado j, precio pⱼ | Country con fallas, premio |
| Costo cᵢⱼ | Minutos desde la ubicación de la camioneta i (o la sede) hasta j × costo por minuto |

```
max  Σᵢⱼ pⱼ·xᵢⱼ − Σᵢ fᵢ·yᵢ − c·Σᵢⱼ dᵢⱼ·xᵢⱼ
s.a. Σᵢ xᵢⱼ ≤ 1                       cada country, una sola camioneta
     Σⱼ (sⱼ + dᵢⱼ)·xᵢⱼ ≤ Kᵢ·yᵢ        no superar la jornada
     xᵢⱼ = 1 para decisiones ya tomadas (countries ya atendidos por una camioneta en ruta)
```

Es un esquema "primero agrupar, después rutear": la asignación aproxima el manejo con la ida desde la base y el ruteo calcula la secuencia real. Con costo fijo > 0 el modelo consolida camionetas (economías de escala, como en el TP de TelecomOptic).

## 4. Conexión con la teoría (para el informe)

- **Valor generado vs. costo** (diapositivas 3-5): el objetivo del ruteo es literalmente premio (valor para el cliente) − costo de transporte.
- **Tiempo de respuesta**: KPI "tiempo caído promedio" y "tiempo de respuesta" en el panel.
- **Visibilidad de la orden**: estado de cada falla y posición de cada camioneta en tiempo real.
- **Integración de decisiones ya tomadas** (diapositiva 51): destino fijado por el conductor, destino forzado por el admin y countries ya atendidos no se cambian.
- **Arquetipo de red**: servicio con "última milla" propia (diapositivas 26-29); las camionetas operan desde donde están y la sede es el punto fijo de referencia.
