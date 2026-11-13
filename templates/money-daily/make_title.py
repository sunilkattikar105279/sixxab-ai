"""Transparent title overlay for the SIXXAB Money daily brief → out/title.png (1080x1920 RGBA).
Sits on top of the clone from frame 0 (it is also the reel cover): soft see-through shade at the top, no solid box.
usage: python3 make_title.py [title.json] [out.png]"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'title.json')))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'title.png')
W, H = 1080, 1920
F = lambda name, size: ImageFont.truetype(os.path.join(HERE, 'fonts', name), size)
ACC, YEL, TXT, SUB = (46, 229, 157, 255), (255, 210, 63, 255), (244, 247, 251, 255), (220, 228, 238, 255)

img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
# see-through shade: dark at the top, fading to fully clear by y≈760 (the clone stays visible through it)
shade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = shade.load()
for y in range(0, 760):
    a = int(150 * (1 - y / 760) ** 1.6)
    for x in range(W):
        px[x, y] = (5, 9, 14, a)
img = Image.alpha_composite(img, shade)


def line(text, y, font, fill, spacing=0):
    """centered text with a soft shadow for legibility on any background"""
    d = ImageDraw.Draw(img)
    w = d.textlength(text, font=font) + spacing * max(0, len(text) - 1)
    x = (W - w) / 2
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    cx = x
    for ch in text:
        sd.text((cx + 3, y + 4), ch, font=font, fill=(0, 0, 0, 200)); cx += sd.textlength(ch, font=font) + spacing
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    img.alpha_composite(sh)
    d = ImageDraw.Draw(img); cx = x
    for ch in text:
        d.text((cx, y), ch, font=font, fill=fill); cx += d.textlength(ch, font=font) + spacing
    return w


def fit(text, name, size, maxw):
    while size > 30 and ImageDraw.Draw(img).textlength(text, font=F(name, size)) > maxw:
        size -= 2
    return F(name, size)


line('SIXXAB MONEY · DAILY BRIEF', 150, F('IBMPlexMono-Medium.ttf', 34), ACC, spacing=5)
line(T['date'], 202, F('IBMPlexMono-Regular.ttf', 28), SUB, spacing=3)
line(T['l1'], 262, fit(T['l1'], 'Inter-Black.otf', 84, 960), TXT)
line(T['l2'], 372, fit(T['l2'], 'Inter-Black.otf', 64, 960), YEL)
# thin accent rule under the headline
d = ImageDraw.Draw(img); d.rounded_rectangle([W / 2 - 90, 470, W / 2 + 90, 478], radius=4, fill=ACC)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print('wrote', OUT)
