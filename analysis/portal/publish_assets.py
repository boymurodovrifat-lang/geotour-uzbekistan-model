"""Publishing step after the models have run (no model values change).

1. Lossless WebP copies of the Web Mercator data images (index layers and climate comfort). The pixel
   values are identical to the PNGs (checked here); the files are about 40 % smaller. layers.json and
   climate.json are pointed at the WebP files; the PNGs stay as the archival format.
2. public/science/story-probes.json: index values at the fixed probe points of the story map, read
   from the same images, so that the story page does not have to download all four index images.
Run: python analysis/portal/publish_assets.py
"""
from pathlib import Path
import json, math, re
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SCI = ROOT / 'public/science'


def webp(png):
    out = png.with_suffix('.webp')
    im = Image.open(png).convert('RGBA')
    im.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    a, b = np.array(im), np.array(Image.open(out).convert('RGBA'))
    m = a[..., 3] > 0
    assert (a[m] == b[m]).all() and (b[~m][..., 3] == 0).all(), png
    return out, png.stat().st_size, out.stat().st_size


def to_pixel(f, lng, lat):
    my = lambda v: math.log(math.tan(math.pi / 4 + math.radians(v) / 2))
    x = (lng - f['west']) / (f['east'] - f['west']) * f['width']
    y = (my(f['north']) - my(lat)) / (my(f['north']) - my(f['south'])) * f['height']
    return int(math.floor(x)), int(math.floor(y))


def main():
    sizes = {}
    layers_path = SCI / 'model-v0.4/layers.json'
    cat = json.loads(layers_path.read_text(encoding='utf-8'))
    images = {}
    for layer in cat['layers']:
        png = SCI / 'model-v0.4' / (layer['id'] + '.png')
        out, a, b = webp(png)
        sizes[png.name] = [a, b]
        layer['imageUrl'] = '/science/model-v0.4/' + out.name
        layer['imageFallbackUrl'] = '/science/model-v0.4/' + png.name
        images[layer['id']] = (np.array(Image.open(png).convert('RGBA')), layer)
    layers_path.write_text(json.dumps(cat, ensure_ascii=False), encoding='utf-8')

    clim_path = SCI / 'climate/climate.json'
    clim = json.loads(clim_path.read_text())
    out, a, b = webp(SCI / 'climate/comfort.png')
    sizes['comfort.png'] = [a, b]
    clim['image'] = '/science/climate/comfort.webp'
    clim['imageFallback'] = '/science/climate/comfort.png'
    clim_path.write_text(json.dumps(clim, indent=1))

    src = (ROOT / 'app/story-content.ts').read_text(encoding='utf-8')
    probes = {}
    for m in re.finditer(r"id: '([\w-]+)'(?:(?!\n  \{\n    id:).)*?probe: \{ lat: ([\d.]+), lng: ([\d.]+)", src, re.S):
        cid, lat, lng = m.group(1), float(m.group(2)), float(m.group(3))
        row = {}
        for idx, (arr, layer) in images.items():
            x, y = to_pixel(layer, lng, lat)
            r, g, b_, al = arr[y, x]
            if al >= 128:
                row[idx] = {'score': round(r / 2, 1), 'stability': int(g), 'range': round(b_ / 2, 1)}
        probes[cid] = {'lat': lat, 'lng': lng, 'values': row}
    (SCI / 'story-probes.json').write_text(json.dumps({'source': 'model-v0.4 data images', 'probes': probes}, indent=1))
    print(json.dumps({'sizes_bytes_png_webp': sizes, 'probes': {k: {i: v['score'] for i, v in p['values'].items()} for k, p in probes.items()}}, indent=1))


if __name__ == '__main__':
    main()
