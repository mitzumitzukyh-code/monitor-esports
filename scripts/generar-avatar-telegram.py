from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path("/tmp/monitor-esports-avatar.jpg")
SIZE = 1024
img = Image.new("RGB", (SIZE, SIZE), "#090b0f")
d = ImageDraw.Draw(img)

# Aro rojo exterior, inspirado en el concepto aprobado.
d.ellipse((54, 54, 970, 970), outline="#ff2638", width=24)
d.ellipse((82, 82, 942, 942), outline="#551018", width=6)

# Destellos rojos discretos detrás del monograma.
for i, alpha in enumerate((80, 55, 35, 20)):
    x0 = 135 + i * 22
    d.polygon([(x0, 510), (430, 260 + i * 7), (430, 560), (x0, 650)],
              fill=(110 + i * 20, 12, 24))

# Monograma M angular.
white = "#f3f1eb"
gray = "#a8adb6"
red = "#f21f35"
d.polygon([(275, 440), (405, 240), (500, 240), (385, 440)], fill=white)
d.polygon([(385, 440), (505, 300), (570, 390), (495, 510)], fill=gray)
d.polygon([(495, 510), (650, 240), (748, 240), (748, 535), (640, 535), (640, 410), (560, 535)], fill=red)

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

title = "MONITOR"
sub = "eSPORTS"
ft = font(112, True)
fs = font(64, True)
tb = d.textbbox((0, 0), title, font=ft)
sb = d.textbbox((0, 0), sub, font=fs)
d.text(((SIZE-(tb[2]-tb[0]))/2, 635), title, font=ft, fill=white)
d.text(((SIZE-(sb[2]-sb[0]))/2, 755), sub, font=fs, fill=red)

img.save(OUT, "JPEG", quality=94, optimize=True, subsampling=0)
print(OUT)
