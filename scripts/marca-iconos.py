# NOTA: esto NO es parte del ciclo. Se corrio una sola vez, el 2026-08-24,
# para pasar el kit de marca de azul/violeta al rojo del sitio. Queda en el
# repo para poder repetirlo si la paleta vuelve a cambiar.
# Necesita Python con Pillow y numpy -- que es la unica cosa del proyecto que
# no es JavaScript, y por eso vive aca en scripts/ y no en el pipeline.

# Regenera los iconos de la marca en la paleta ROJA del sitio.
#
# El kit de assets/ venia en azul/violeta (#2563eb -> #7c3aed), de una version
# anterior del panel. El sitio de hoy es rojo (#FF2638 -> #8F1220). Esto
# vuelve a dibujar los iconos -- no los retinta -- para que salgan limpios:
# baldosa con degradado a 135 grados, rayo blanco centrado, todo dibujado a 4x
# y reducido, que es lo que da el borde suave.
#
#   python kit_rojo.py
#
# El rayo es el mismo glifo del kit (viewBox de 24), asi que la marca no
# cambia de forma: cambia de color.

import numpy as np
from PIL import Image, ImageDraw
from pathlib import Path

DESTINO = Path(r"D:\monitor-dota2\assets")
SS = 4  # supermuestreo

ROJO = (0xFF, 0x26, 0x38)
VINO = (0x8F, 0x12, 0x20)
BLANCO = (255, 255, 255)

# Glifo del rayo en su caja de 24, tal cual el path del kit:
# M13 2 L4 14 h6 l-1 8 l9 -12 h-6 l1 -8 z
RAYO = [(13, 2), (4, 14), (10, 14), (9, 22), (18, 10), (12, 10), (13, 2)]


def degradado(lado):
    """Degradado lineal a 135 grados, de esquina a esquina."""
    ejes = np.add.outer(np.arange(lado), np.arange(lado)) / (2 * (lado - 1))
    t = ejes[..., None]
    a = np.array(ROJO, dtype=float)
    b = np.array(VINO, dtype=float)
    return Image.fromarray((a + (b - a) * t).round().astype(np.uint8), "RGB")


def baldosa(lado, radio_rel=118 / 512, rayo_rel=268.8 / 512):
    """Icono completo. radio_rel=0 sale a sangre (iOS le pone su mascara)."""
    g = lado * SS
    fondo = degradado(g)

    mascara = Image.new("L", (g, g), 0)
    d = ImageDraw.Draw(mascara)
    if radio_rel > 0:
        d.rounded_rectangle([0, 0, g - 1, g - 1], radius=radio_rel * g, fill=255)
    else:
        d.rectangle([0, 0, g - 1, g - 1], fill=255)

    icono = Image.new("RGBA", (g, g), (0, 0, 0, 0))
    icono.paste(fondo, (0, 0), mascara)

    # El rayo, centrado, ocupando rayo_rel del lado.
    escala = rayo_rel * g / 24
    desfase = (g - 24 * escala) / 2
    puntos = [(x * escala + desfase, y * escala + desfase) for x, y in RAYO]
    ImageDraw.Draw(icono).polygon(puntos, fill=BLANCO + (255,))

    return icono.resize((lado, lado), Image.LANCZOS)


def guardar(img, nombre):
    ruta = DESTINO / nombre
    img.save(ruta)
    print(f"{nombre}: {img.size[0]}x{img.size[1]} · {ruta.stat().st_size // 1024 or 1} KB")


if __name__ == "__main__":
    guardar(baldosa(512), "icon-512.png")
    guardar(baldosa(192), "icon-192.png")
    guardar(baldosa(32), "favicon-32.png")
    guardar(baldosa(16), "favicon-16.png")
    # iOS aplica su propia mascara: el icono va a sangre.
    guardar(baldosa(180, radio_rel=0), "apple-touch-icon.png")
    # Maskable: a sangre y con el rayo dentro de la zona segura del 80%.
    guardar(baldosa(512, radio_rel=0, rayo_rel=0.52), "icon-maskable-512.png")

    ico = baldosa(48)
    ico.save(DESTINO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"favicon.ico: 16/32/48 · {(DESTINO / 'favicon.ico').stat().st_size // 1024 or 1} KB")
