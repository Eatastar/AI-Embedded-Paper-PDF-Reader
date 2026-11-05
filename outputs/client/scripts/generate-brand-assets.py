"""Render the application's existing pencil mark in the warm brand palette."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

destination = Path(__file__).resolve().parents[1] / 'desktop'
scale = 4
image = Image.new('RGBA', (256 * scale, 256 * scale))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, 256 * scale - 1, 256 * scale - 1), radius=52 * scale, fill='#ead49d')

def line(points, width=9):
    draw.line([(x * scale, y * scale) for x, y in points], fill='#684719', width=width * scale, joint='curve')

line([(69, 177), (82, 142), (159, 65), (188, 94), (111, 171), (69, 177)])
line([(150, 77), (176, 103)], 8)
line([(82, 145), (108, 170)], 7)
line([(68, 199), (186, 199)], 8)
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(destination / 'icon.png')
image.save(destination / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

splash = Image.new('RGB', (520, 300), '#fff8e7')
splash.paste(image.resize((68, 68), Image.Resampling.LANCZOS), (226, 46), image.resize((68, 68), Image.Resampling.LANCZOS))
label = ImageDraw.Draw(splash)
font_root = Path('C:/Windows/Fonts')
font = ImageFont.truetype(str(font_root / 'segoeuib.ttf'), 29)
small = ImageFont.truetype(str(font_root / 'segoeui.ttf'), 13)
label.text((260, 153), 'learn something', font=font, fill='#403526', anchor='mm')
label.text((260, 197), 'Opening your reading space...', font=small, fill='#6c5a3f', anchor='mm')
splash.save(destination / 'splash.bmp')
