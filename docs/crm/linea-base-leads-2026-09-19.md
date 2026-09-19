# Línea base — calidad de leads por canal (19-sep-2026)

Foto del cruce **origen × tamaño** tomada el día en que el sitio empezó a mostrar
los precios "desde" antes del formulario en los landings de Lookbook y Banco.
La hipótesis del cambio: van a entrar menos leads, pero de mejor tamaño.

Sirve para comparar. **No se edita**: si el criterio cambia, se toma otra foto.

## Los números

Todos los prospectos del CRM a la fecha (88 considerados; 3 fichas dudosas
—bots y capturas basura— excluidas).

| Canal | Total | Chica | Mediana | Grande | Sin tamaño | % chica | % mediana + grande | Confirmados | Descartados |
|---|---|---|---|---|---|---|---|---|---|
| **Entrante** (landing, lectura, web, brief, feria, referido) | 42 | 21 | 6 | 4 | 11 | **68%** | 32% | 1 | 14 |
| **Frío** (correo, linkedin, instagram, otro) | 41 | 5 | 14 | 22 | 0 | **12%** | 88% | 2 | 5 |
| Sin clasificar (sin origen) | 5 | 0 | 2 | 3 | 0 | 0% | 100% | 0 | 0 |

Los porcentajes se calculan sobre los prospectos **que tienen tamaño**: uno sin
clasificar no es chico ni grande.

## Cómo leerlo

- El canal entrante trae mayoritariamente marcas chicas; el saliente,
  medianas y grandes. Con 42 y 41 casos esa diferencia no es ruido.
- **Sobre cierre no se puede concluir nada**: son 3 confirmados en total (1
  entrante —Somos MODO, origen `web`— y 2 fríos). El brief original decía "0
  entrantes confirmados" porque contaba solo `landing` y `lectura`.
- 11 entrantes siguen sin tamaño: el % chica del canal puede moverse un poco
  cuando se clasifiquen.
- Un tercio de los entrantes ya está descartado (14 de 42), contra 5 de 41 fríos.

## Ojo: no entra un lead del sitio desde el 2-sep-2026

Al tomar esta foto, el último prospecto entrante es del **2 de septiembre** — 17
días sin ninguno, después de 37 en agosto. Puede ser simplemente que la campaña
terminó. Pero en julio ya se perdieron leads porque al sitio le faltaba el token
del webhook, y el síntoma fue exactamente este: silencio. Antes de sacar
conclusiones sobre el efecto de los precios "desde", confirmar con el chat de
Web que el formulario sigue entregando (una prueba real desde un landing).

## Diferencia con el brief del chat de Web

El brief daba 75% chica sobre 28 entrantes. Acá son 68% sobre 42 porque este
cruce usa la definición de "entrante" del CRM (`lib/crm-temperatura.ts`), que
incluye `web`, `feria` y `referido`, no solo `landing` y `lectura`. La tendencia
es la misma; lo que importa es comparar siempre con la misma regla.

## Cómo repetirlo

`hilvan_metricas_crm` con `desde: "2026-09-19"` devuelve el mismo cruce solo con
los prospectos creados desde el cambio (`/api/agent/crm/metricas?desde=2026-09-19`).

Qué mirar, con cautela hasta tener al menos ~15 entrantes nuevos con tamaño:

1. **% chica de los entrantes nuevos** contra el 68% de esta foto.
2. **Cuántos entrantes llegan por mes.** El ritmo previo NO es parejo: 4 en
   julio, **37 en agosto** (campaña) y 1 en septiembre. Comparar contra agosto
   es comparar contra una campaña; que baje es lo esperado.
3. Que los nuevos **tengan tamaño asignado**: sin eso no hay comparación.
