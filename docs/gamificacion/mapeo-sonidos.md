# Mapeo de sonidos — de dónde salió cada archivo

> Procedencia de los 34 archivos en `public/sounds/`. Permite reconstruir el
> set sin volver a elegir, y deja la licencia trazable.
> Elección hecha de oído por Tomás, ago 2026.

## Fuentes

| Origen | Licencia | Cómo se obtuvo |
|---|---|---|
| **SND** (`snd.dev`) | Libre, comercial, sin atribución obligatoria | `npm pack snd-lib` → sprites cortados con ffmpeg según `audioSprite.json` |
| **Kenney UI Audio** | **CC0** | `kenney.nl/assets/ui-audio` |
| **Sonniss GDC 2026** | Royalty-free, sin atribución | 5 zips en `~/Downloads/` (6,4 GB); extracción selectiva con `unzip -j` |
| **Freesound** | **CC0** (verificado ficha por ficha) | IDs 484323 y 520684 |

## Tabla

| Token | Origen | Archivo fuente |
|---|---|---|
| `ui-tap` | SND kit01 | `tap_03` |
| `ui-toggle-on` | SND kit01 | `toggle_on` |
| `ui-toggle-off` | SND kit01 | `toggle_off` |
| `ui-panel-open` | SND kit01 | `swipe_04` |
| `ui-panel-close` | SND kit03 | `swipe_05` |
| `ui-nav` | SND kit01 | `tap_04` |
| `ok-guardar` | SND kit02 | `tap_04` |
| `ok-registrar` | Kenney | `click1` |
| `ok-crear` | Sonniss | CB_Sounddesign · `UIMisc_Kalimba 3 Up` |
| `ok-enviar` | Sonniss | Cinematic SD · `Encyclopedia Glossy Page Turn Muted` |
| `ok-eliminar` | SND kit03 | `transition_down` |
| `ok-upload` | Sonniss | Epic Stock Media · `GAMEBoard_Game Play Piece Action Organic Connect Dots` |
| `ok-copiar` | SND kit01 | `tap_01` |
| `prog-avance` | SND kit02 | `swipe_02` |
| `prog-retroceso` | SND kit03 | `swipe_02` |
| `prog-check` | Sonniss | CB_Sounddesign · `UIMisc_Kalimba 3 Up` |
| `prog-barra-llena` | SND kit02 | `celebration` recortado a 850 ms con fade |
| `conciliar-match` | SND kit01 | `toggle_on` |
| `parse-reconocido` | SND kit01 | `progress_loop` |
| `win-cierre` | Sonniss | Cinematic SD · `Interface Plucks Happy` |
| `win-pago` | Sonniss | Cinematic SD · `Cofetti Whoosh Pluck Spill` |
| `win-factura` | Sonniss | Epic Stock Media · `MECHLtch_Click Deep Mechanism Latch Button` |
| `win-hito` | Sonniss | Cinematic SD · `Cofetti Whoosh Pluck Spill` |
| `win-meta-dia` | Sonniss | Cinematic SD · `Interface Plucks Happy` |
| `win-rodaje-cerrado` | Sonniss | Cinematic SD · `Button Arp Twinkle` |
| `alert-error` | SND kit02 | `disabled` |
| `alert-atencion` | SND kit02 | `disabled` |
| `alert-lead` | SND kit01 | `notification` |
| `ch-inicio` | SND kit02 | `celebration` |
| `ch-salida` | Sonniss | CB_Sounddesign · `UIMisc_Xylophone Ringtone 2`, corte 0,95–1,90 s con fade |
| `ch-claqueta` | Freesound **484323** | `JM_MOVIE_Clapperboard` (Julien_Matthey), recorte 0,125–0,405 s |
| `ch-obturador` | Freesound **520684** | `Contarex camera shutter` (Tonik1105), recorte 0,805–1,025 s |
| `ch-scan-qr` | Sonniss | InMotionAudio · `BEEPMed_Thermometer_Beep11` |
| `ch-cinta` | Sonniss | 344 Audio · `METLMvmt_ Antique Measuring Tape` |

## Procesamiento aplicado

Todos: mono, 44,1 kHz, mp3 128 kbps, sin carátula incrustada (`-vn` — ocho
archivos traían la portada del wav original, hasta 750 KB de imagen por sonido).

**Normalización**: RMS objetivo −20 dBFS con techo de pico en −1,5 dBFS. 61 de
los transitorios quedan bajo el objetivo porque el techo los frena antes; es
inherente a los sonidos secos y se compensa con la ganancia por familia de
`lib/sfx.ts`, no en el archivo.

**Ecualización** (solo las 6 grabaciones reales — `ch-claqueta`,
`ch-obturador`, `ch-cinta`, `ok-enviar`, `ok-upload`, `win-factura`): realce de
+2 dB con Q ancho en el grado de Do mayor más cercano a su centroide, más un
shelf de −2 dB sobre 6,5 kHz en las brillantes. Modula el timbre hacia la
tonalidad del set sin transponerlas, que las volvería falsas.

**Afinación a Do mayor: NO aplicada.** Ver la nota abajo.

> ### Por qué no se afinó el set
> El plan era transponer los sonidos tonales al grado más cercano de Do mayor.
> Se construyó el detector (FFT + espectro de producto armónico + interpolación
> parabólica, precisión nominal ~2 cents) y se aplicó con `rubberband`, pero
> **la verificación posterior falló en 11 de 15 archivos**: al re-medir, el
> detector aterrizaba en parciales distintos y arrojaba desvíos de hasta 98
> cents.
>
> La causa es la naturaleza del material: la mayoría son **frases de varias
> notas** (kalimba, xilófono, plucks) o transitorios, donde "la fundamental" no
> es una cantidad estable ni bien definida. No se puede corregir sub-semitono
> lo que no se puede medir de forma reproducible.
>
> Se revirtió al set elegido de oído. Retomarlo requeriría análisis de croma
> para detectar la **tonalidad de una frase** en vez de una nota única.

*Casa Hiedra · Hilván · mapeo de sonidos · ago 2026*
