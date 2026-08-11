# Cadena común del set de sonido

`cadena.py` es lo que hace que los 38 archivos de `public/sounds/` suenen a
familia. Vienen de librerías distintas —Sonniss, Freesound, síntesis, TTS— y
cada uno traía su sala y su curva; esto los pasa a todos por el mismo lugar.

## Correrlo

```bash
python3 -m venv venv && ./venv/bin/pip install pedalboard
./venv/bin/python tools/sonido/cadena.py public/sounds /tmp/salida \
  ui-tap:micro ok-guardar:confirmacion win-cierre:celebracion
```

Cada argumento es `token:familia`. Las familias son las de `lib/sfx.ts`.
La salida es `.wav`; convertir a mp3 con ffmpeg antes de copiar a
`public/sounds/`.

**Pasar SIEMPRE el set completo.** El ajuste de volumen es global: se calcula
sobre todos los archivos de la corrida y se baja el objetivo hasta donde llegue
el más restringido. Procesar de a uno rompe la nivelación entre ellos.

Para armar la lista completa, la familia de cada archivo sale del mapa
`FAMILIA` de `lib/sfx.ts`.

## Tres decisiones que no son obvias

**El volumen se mide con ponderación K, no con RMS plano.** El oído es mucho
más sensible entre 2 y 5 kHz, así que dos sonidos con el mismo RMS pero distinto
contenido espectral se oyen a volúmenes distintos — era la causa de que los
agudos se sintieran encima de los graves.

Se usa la **ponderación** de ITU-R BS.1770 pero **no el gating** de EBU R128:
ese descarta bloques bajo 400 ms, y casi todo este set dura menos. Con gating,
`loudnorm` de ffmpeg devolvía −70 dB en los 38.

**La ganancia va antes del limitador.** Aplicarla después dispara el techo de
seguridad y baja el archivo entero — la claqueta quedaba 11 dB bajo el resto.

**El objetivo global lo fija el sonido de mayor cresta.** La claqueta tiene
30 dB entre pico y RMS: no puede sonar tan fuerte como un acorde sostenido sin
clipear, y eso es física. En vez de dejarla desalineada, se baja el objetivo de
todos (hoy −10.5 dB). Por eso los archivos quedan bajos: si el set suena débil,
se sube `GANANCIA` en `lib/sfx.ts`, nunca los archivos.

## Qué NO hacer

- No reprocesar un archivo ya procesado: la sala se acumula y el sonido se
  empantana. Los originales están en el historial de git.
- No usar `loudnorm` de ffmpeg en este set (ver el gating, arriba).
- No subir el reverb sin mirar la duración: la cola alarga los archivos, y un
  micro-sonido que deja de ser instantáneo deja de sentirse causado por el click.
