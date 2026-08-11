"""
Trombón triste ("waah-waah") sintetizado.

El intento anterior falló por tratarlo como suma de cinco senos con un lowpass
fijo en 2.6 kHz: eso da una onda apagada, no un metal. Dos cosas lo arreglan:

1. El metal es BRILLANTE — muchos armónicos con caída lenta, no cinco. Y su
   brillo crece con la intensidad, que es la pista perceptual más fuerte de
   "esto es un bronce soplado".

2. El "waah" NO es la altura bajando, es un barrido de FORMANTE: la sordina de
   émbolo cerrándose sobre la campana. Se sintetiza como un pico resonante que
   se desplaza por el espectro mientras la nota suena.

Se hace aditivo con formante móvil en vez de filtro variable en el tiempo: es
estable por construcción, sin riesgo de que el filtro se dispare.
"""
import sys, pathlib
import numpy as np
from pedalboard import Pedalboard, Distortion, PeakFilter, HighpassFilter, Reverb
from pedalboard.io import AudioFile

SR = 44100
N_ARM = 18          # el metal vive en los armónicos altos


def nota(f0: float, f1: float, dur: float,
         formante0: float, formante1: float,
         vibrato: float = 0.0) -> np.ndarray:
    """Una nota de metal con glissando y barrido de sordina."""
    t = np.arange(int(SR * dur)) / SR

    # Altura: glissando lineal. La fase es la integral de la frecuencia.
    f = f0 + (f1 - f0) * (t / dur)
    if vibrato:
        f = f * (1 + vibrato * np.sin(2 * np.pi * 5.5 * t))
    fase = 2 * np.pi * np.cumsum(f) / SR

    # Envolvente: ataque de labio (rápido pero no instantáneo) y caída.
    env = np.minimum(1.0, t / 0.035) * np.exp(-1.35 * t)

    # El formante barre de agudo a grave: es el émbolo cerrándose.
    fc = formante0 + (formante1 - formante0) * (t / dur)

    y = np.zeros_like(t)
    for n in range(1, N_ARM + 1):
        # Caída suave (1/n^0.85), no abrupta: por eso suena a bronce y no a flauta.
        base = 1.0 / (n ** 0.85)
        # Pico resonante alrededor del formante móvil.
        ancho = 780.0
        realce = 1.0 + 2.6 * np.exp(-((n * f - fc) / ancho) ** 2)
        # El brillo sigue a la envolvente: fuerte = más armónicos.
        brillo = np.exp(-(n - 1) * (0.10 + 0.30 * (1 - env)))
        y += base * realce * brillo * np.sin(n * fase)

    # Soplo en el ataque: sin esto suena a sintetizador, no a alguien soplando.
    soplo = np.random.RandomState(7).normal(0, 1, len(t)) * np.exp(-38 * t) * 0.055
    return (y / N_ARM + soplo) * env


def construir(notas, salida: pathlib.Path, silencio=0.045):
    partes = []
    for i, n in enumerate(notas):
        partes.append(nota(**n))
        if i < len(notas) - 1:
            partes.append(np.zeros(int(SR * silencio)))
    y = np.concatenate(partes)[None, :]

    y = Pedalboard([
        # Distorsión suave: el bronce tiene armónicos que ningún oscilador limpio
        # produce. Es lo que separa "metal" de "onda con filtro".
        Distortion(drive_db=9),
        PeakFilter(cutoff_frequency_hz=1150, gain_db=5.0, q=0.9),   # campana
        PeakFilter(cutoff_frequency_hz=380, gain_db=2.5, q=1.1),    # cuerpo
        HighpassFilter(cutoff_frequency_hz=120),
        Reverb(room_size=0.22, damping=0.6, wet_level=0.13, dry_level=1.0, width=0.0),
    ])(y, SR, reset=True)

    y = y / max(float(np.max(np.abs(y))), 1e-9) * 0.89
    n = y.shape[1]
    fade = min(int(SR * 0.05), n)
    y[:, n - fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    with AudioFile(str(salida), 'w', SR, 1) as f:
        f.write(y)
    return f"{salida.name:<26} {n/SR:.2f}s"


if __name__ == '__main__':
    d = pathlib.Path(sys.argv[1]); d.mkdir(parents=True, exist_ok=True)

    # A — tres notas, el waah-waah-waaah clásico de derrota
    print(construir([
        dict(f0=233, f1=220, dur=0.30, formante0=1900, formante1=1150),
        dict(f0=207, f1=196, dur=0.30, formante0=1750, formante1=1000),
        dict(f0=185, f1=138, dur=0.75, formante0=1600, formante1=560, vibrato=0.006),
    ], d / 'trombon-a.mp3'))

    # B — dos notas, más seco. Para uso diario, donde 1.4s se hace largo.
    print(construir([
        dict(f0=220, f1=207, dur=0.26, formante0=1850, formante1=1100),
        dict(f0=175, f1=131, dur=0.62, formante0=1600, formante1=520, vibrato=0.007),
    ], d / 'trombon-b.mp3'))

    # C — una sola nota larga que se desinfla. El más sobrio.
    print(construir([
        dict(f0=196, f1=123, dur=0.95, formante0=1950, formante1=470, vibrato=0.008),
    ], d / 'trombon-c.mp3'))
