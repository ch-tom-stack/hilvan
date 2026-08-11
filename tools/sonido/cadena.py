"""
Cadena común para el set de Hilván.

La idea: que los 34 suenen como si se hubieran grabado en el mismo lugar. Hoy
vienen de Sonniss, Freesound, síntesis y TTS — cada uno con su sala y su curva.
Lo que los va a hermanar no es subirles la calidad uno por uno, es pasarlos a
todos por la misma sala y la misma curva.

Referencia de carácter: la claqueta. Sala chica de madera, seca y cercana, sin
cola. Calza con el sistema visual — sin sombras, sin bordes redondeados, nada
brillante.
"""
import sys, pathlib
import numpy as np
from pedalboard import (
    Pedalboard, HighpassFilter, LowShelfFilter, HighShelfFilter,
    Reverb, Compressor, Limiter, Gain, PeakFilter,
)
from pedalboard.io import AudioFile

SR = 44100

# Cuánta sala según la familia. Todas comparten la MISMA sala; lo que cambia es
# cuánto se oye. Más cerca = más seco, igual que en una mezcla real. Un micro de
# 10 ms con cola de reverb deja de sentirse instantáneo, y lo instantáneo es
# justamente lo que lo hace sentirse causado por tu click.
WET = {'micro': 0.07, 'confirmacion': 0.15, 'celebracion': 0.24, 'alerta': 0.13}

# Volumen percibido objetivo (RMS dBFS). Es el cuarto pilar del carácter común:
# sin esto, dos sonidos de la misma familia se sienten de peso distinto.
# Medido con ponderación K, no con RMS plano (ver `loudness_k`).
RMS_OBJETIVO = {'micro': -26.0, 'confirmacion': -22.0, 'celebracion': -19.0, 'alerta': -21.0}

# Cuánta cola se le permite a cada familia, en segundos. Sin este tope el reverb
# alarga un tap de 10 ms a medio segundo.
COLA = {'micro': 0.10, 'confirmacion': 0.30, 'celebracion': 0.55, 'alerta': 0.32}

# Techo duro. Nadie lo pasa; quien no alcance su objetivo por culpa suya
# arrastra al resto hacia abajo, para que el conjunto quede parejo.
TECHO_PICO = -1.5


def cadena(familia: str, gain_db: float = 0.0) -> Pedalboard:
    return Pedalboard([
        # 1. Piso común: fuera el retumbe que cada librería trae distinto.
        HighpassFilter(cutoff_frequency_hz=85),
        # 2. Cuerpo de madera.
        LowShelfFilter(cutoff_frequency_hz=220, gain_db=2.5, q=0.7),
        # Hoyo suave donde el oído más pincha (3-4 kHz). Es lo que hacía que
        # los agudos se sintieran encima de los graves.
        PeakFilter(cutoff_frequency_hz=3400, gain_db=-2.5, q=1.1),
        # 3. Fuera el brillo digital. Es la palanca más fuerte del timbre común:
        #    lo que hace que dos fuentes distintas se lean como el mismo material.
        HighShelfFilter(cutoff_frequency_hz=5500, gain_db=-4.5, q=0.7),
        # 4. La sala. Chica y amortiguada; la cola se recorta después.
        Reverb(room_size=0.30, damping=0.55, wet_level=WET[familia], dry_level=1.0, width=0.0),
        # 5. Pegamento suave, no compresión de verdad.
        Compressor(threshold_db=-18, ratio=2.0, attack_ms=3, release_ms=80),
        # 6. La ganancia va ANTES del limitador, no después.
        #    Un sonido percusivo (la claqueta) tiene pico altísimo y RMS bajo:
        #    subirlo al volumen objetivo después del limitador dispara el techo
        #    de seguridad y lo baja entero, dejándolo 11 dB por debajo del resto.
        #    Acá el limitador se come los picos y el RMS se mantiene.
        Gain(gain_db=gain_db),
        # 7. Techo, para que nada clipee tras sumar sala y ganancia.
        Limiter(threshold_db=-1.5, release_ms=100),
    ])


# Pre-filtro de ponderación K (ITU-R BS.1770): realce de agudos + corte de
# graves que aproxima la sensibilidad del oído. SOLO para medir, nunca se
# escribe al archivo.
#
# Se usa la ponderación pero NO el gating de EBU R128, que descarta bloques
# bajo 400 ms y por eso devolvía -70 en los 34 sonidos del set.
_K = Pedalboard([
    HighShelfFilter(cutoff_frequency_hz=1681.97, gain_db=3.999, q=0.7071),
    HighpassFilter(cutoff_frequency_hz=38.13),
])


def loudness_k(x: np.ndarray, sr: int = SR) -> float:
    """Volumen percibido: RMS después de la ponderación K."""
    return rms_db(_K(x.copy(), sr, reset=True))


def rms_db(x: np.ndarray) -> float:
    r = float(np.sqrt(np.mean(np.square(x))))
    return 20 * np.log10(r) if r > 1e-9 else -120.0


def pico_db(x: np.ndarray) -> float:
    return 20 * np.log10(max(float(np.max(np.abs(x))), 1e-9))


def procesar(entrada: pathlib.Path, familia: str):
    """Procesa en limpio y devuelve el audio + cuánta ganancia pide."""
    with AudioFile(str(entrada)).resampled_to(SR) as f:
        audio = f.read(f.frames)
    if audio.shape[0] > 1:            # a mono: el set entero es mono
        audio = np.mean(audio, axis=0, keepdims=True)

    dur_orig = audio.shape[1] / SR
    audio = np.concatenate([audio, np.zeros((1, int(SR * COLA[familia])), dtype=audio.dtype)], axis=1)
    y = cadena(familia)(audio, SR, reset=True)

    # Fundido final: cortar la cola en seco produce un click.
    n = y.shape[1]
    fade = min(int(SR * 0.03), n)
    y[:, n - fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)

    pide = RMS_OBJETIVO[familia] - loudness_k(y)   # ganancia para llegar al objetivo
    permite = TECHO_PICO - pico_db(y)              # ganancia máxima antes de pasarse del techo
    return {
        'stem': entrada.stem, 'familia': familia, 'audio': y, 'dur_orig': dur_orig,
        'pide': pide, 'permite': permite, 'cresta': pico_db(y) - rms_db(y),
    }


def escribir(r: dict, ajuste: float, destino: pathlib.Path) -> str:
    """Aplica la ganancia (recortada por el techo) y guarda."""
    g = min(r['pide'] + ajuste, r['permite'])
    y = r['audio'] * (10 ** (g / 20))
    with AudioFile(str(destino / f"{r['stem']}.wav"), 'w', SR, y.shape[0]) as f:
        f.write(y)
    obj = RMS_OBJETIVO[r['familia']] + ajuste
    logrado = loudness_k(y)
    aviso = '' if abs(logrado - obj) < 0.6 else f"  ← {logrado - obj:+.1f} del objetivo"
    return (f"{r['stem']:<18} {r['familia']:<12} {r['dur_orig']:.2f}s → {y.shape[1]/SR:.2f}s   "
            f"cresta {r['cresta']:4.1f}   K {logrado:+.1f} (obj {obj:+.1f})   "
            f"pico {pico_db(y):+.1f}{aviso}")


if __name__ == '__main__':
    origen, destino = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    destino.mkdir(parents=True, exist_ok=True)
    rs = [procesar(origen / f'{a.split(":")[0]}.mp3', a.split(':')[1]) for a in sys.argv[3:]]

    # Un golpe con 30 dB de cresta no puede sonar tan fuerte como un acorde
    # sostenido sin clipear: es física, no un ajuste. Así que en vez de dejarlo
    # atrás, se baja el objetivo de TODOS lo que le falte al más restringido.
    # Se conservan las distancias entre familias y el conjunto queda parejo.
    ajuste = min(0.0, min(r['permite'] - r['pide'] for r in rs))
    if ajuste < 0:
        cuello = min(rs, key=lambda r: r['permite'] - r['pide'])
        print(f"· Objetivo bajado {ajuste:+.1f} dB para todos — lo limita '{cuello['stem']}' "
              f"(cresta {cuello['cresta']:.1f})\n")
    for r in rs:
        print(escribir(r, ajuste, destino))
