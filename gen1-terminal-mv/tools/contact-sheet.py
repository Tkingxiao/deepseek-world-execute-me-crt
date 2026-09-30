
from PIL import Image, ImageDraw
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p
src = p("build", "preview")
out = p("build", "preview_sheet.png")
files = sorted(f for f in os.listdir(src) if f.endswith(".png"))
cols, tw, th = 4, 480, 270
rows = max(1, (len(files) + cols - 1) // cols)
sheet = Image.new("RGB", (cols * tw, rows * th), (8, 10, 9))
d = ImageDraw.Draw(sheet)
for i, fn in enumerate(files[:24]):
    im = Image.open(os.path.join(src, fn)).convert("RGB").resize((tw, th), Image.LANCZOS)
    x = (i % cols) * tw; y = (i // cols) * th
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + tw - 1, y + th - 1], outline=(20, 40, 28))
    d.text((x + 6, y + 4), fn, fill=(120, 255, 170))
sheet.save(out)
print(out, sheet.size, len(files), "frames")
