# NOTA: esto NO es parte del ciclo. Se corrio una sola vez, el 2026-08-24,
# para pasar el kit de marca de azul/violeta al rojo del sitio. Queda en el
# repo para poder repetirlo si la paleta vuelve a cambiar.
# Necesita Python con Pillow y numpy -- que es la unica cosa del proyecto que
# no es JavaScript, y por eso vive aca en scripts/ y no en el pipeline.

# Pasa las tarjetas sociales de azul/violeta a la paleta roja del sitio.
#
# Acá NO se redibuja: la tarjeta ya está bien compuesta (tipografía, rejilla,
# barras, pastillas) y volver a dibujarla con las fuentes de Windows saldría
# peor. Lo único que cambia es el TONO de lo que es marca: el azul y el
# violeta se llevan al rojo del sitio, y todo lo demás -- el verde de "sin
# apuestas", los grises, el blanco, el fondo oscuro -- se queda igual.
#
#   python og_rojo.py [--stats]

import sys
import numpy as np
from PIL import Image
from pathlib import Path

DESTINO = Path(r"D:\monitor-dota2\assets")
TARJETAS = ["og-image.png", "og-image-dota.png"]

# Franja de tono que es "marca" en el original (azul 221° → violeta 262°).
# Arranca en 185 y no en 200 para que el turquesa de la última barra -- que
# era la transición azul→verde -- no quede como una esquirla celeste sola.
DESDE, HASTA = 185.0, 295.0
# A dónde va: el rojo del sitio, casi monocromático (#FF2638 es 355°).
ROJO_A, ROJO_B = 350.0, 361.0
# Un pixel oscuro y desaturado es fondo, no marca: no se toca.
MIN_S, MIN_V = 0.22, 0.28


def rgb_a_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    dif = mx - mn
    h = np.zeros_like(mx)
    sin_dif = dif == 0
    seguro = np.where(sin_dif, 1, dif)
    h = np.where(mx == r, ((g - b) / seguro) % 6, h)
    h = np.where(mx == g, (b - r) / seguro + 2, h)
    h = np.where(mx == b, (r - g) / seguro + 4, h)
    h = np.where(sin_dif, 0, h * 60)
    s = np.where(mx == 0, 0, dif / np.where(mx == 0, 1, mx))
    return h, s, mx


def hsv_a_rgb(h, s, v):
    h = h % 360
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    tramo = (h / 60).astype(int) % 6
    r = np.select([tramo == 0, tramo == 1, tramo == 2, tramo == 3, tramo == 4, tramo == 5], [c, x, z, z, x, c])
    g = np.select([tramo == 0, tramo == 1, tramo == 2, tramo == 3, tramo == 4, tramo == 5], [x, c, c, x, z, z])
    b = np.select([tramo == 0, tramo == 1, tramo == 2, tramo == 3, tramo == 4, tramo == 5], [z, z, x, c, c, x])
    return np.stack([r + m, g + m, b + m], axis=-1)


def convertir(nombre, solo_stats=False):
    im = Image.open(DESTINO / nombre).convert("RGB")
    rgb = np.asarray(im, dtype=float) / 255
    h, s, v = rgb_a_hsv(rgb)

    marca = (h >= DESDE) & (h <= HASTA) & (s >= MIN_S) & (v >= MIN_V)
    if solo_stats:
        print(f"{nombre}: {marca.mean() * 100:.1f}% de los pixeles son marca")
        for lo, hi in [(0, 60), (60, 150), (150, 200), (200, 250), (250, 295), (295, 360)]:
            cuantos = ((h >= lo) & (h < hi) & (s >= MIN_S) & (v >= MIN_V)).mean() * 100
            print(f"   tono {lo:3d}-{hi:3d}: {cuantos:5.2f}%")
        return

    # Mapeo lineal de la franja azul-violeta a la franja roja.
    t = (h - DESDE) / (HASTA - DESDE)
    h_nuevo = np.where(marca, ROJO_A + t * (ROJO_B - ROJO_A), h)
    # Sin esto el violeta terminaba en un rojo salmón: el tono queda bien
    # pero le falta el cuerpo del #FF2638 de la marca.
    s_nuevo = np.where(marca, np.clip(s * 1.15, 0, 1), s)
    fuera = hsv_a_rgb(h_nuevo, s_nuevo, v)
    salida = np.where(marca[..., None], fuera, rgb)
    Image.fromarray((salida.clip(0, 1) * 255).round().astype(np.uint8), "RGB").save(DESTINO / nombre)
    peso = (DESTINO / nombre).stat().st_size // 1024
    print(f"{nombre}: {marca.mean() * 100:.1f}% de los pixeles pasados a rojo · {peso} KB")


if __name__ == "__main__":
    solo = "--stats" in sys.argv
    for t in TARJETAS:
        convertir(t, solo)
