
from PIL import Image
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from paths import p
T = p("assets", "character", "tinted")
tiles = ["fishmaid_front_green.png","fishmaid_front_cyan.png","fishmaid_front_amber.png","fishmaid_front_white.png",
         "fishmaid_bust_green.png","fishmaid_bust_cyan.png","fishmaid_bust_amber.png","fishmaid_bust_white.png"]
tw, th = 300, 420
sheet = Image.new("RGB", (tw*4, th*2), (5,16,10))
for i, f in enumerate(tiles):
    im = Image.open(os.path.join(T, f)).convert("RGBA")
    im.thumbnail((tw-16, th-16), Image.LANCZOS)
    bg = Image.new("RGBA", (tw, th), (5,16,10,255)); bg.alpha_composite(im, ((tw-im.size[0])//2, (th-im.size[1])//2))
    sheet.paste(bg.convert("RGB"), ((i%4)*tw, (i//4)*th))
sheet.save(p("build", "tint_check.png"))
print("ok", sheet.size)
