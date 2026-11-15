"""Figure 1 (study area) and Figure 2 (workflow) for the manuscript."""
from pathlib import Path
import argparse, json, math
import numpy as np
import tifffile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, LightSource
from matplotlib.patches import FancyBboxPatch
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'paper/figures'
OUT.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9})
KX = math.cos(math.radians(41.5)) / math.cos(math.radians(30)); ASPECT = 1 / KX ** 2; BAR = 200 / KX
CITIES = [('Tashkent', 69.28, 41.31), ('Samarkand', 66.97, 39.65), ('Bukhara', 64.42, 39.77), ('Khiva', 60.36, 41.38), ('Nukus', 59.61, 42.46),
          ('Termez', 67.27, 37.22), ('Fergana', 71.78, 40.38), ('Navoi', 65.38, 40.10), ('Karshi', 65.79, 38.86)]


def study_area(inputs):
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text()); gt = grid['transform']
    elev = tifffile.imread(Path(inputs) / 'elevation_m.tif').astype('float32')
    reg = tifffile.imread(Path(inputs) / 'regions.tif')
    inside = reg > 0
    rows = np.where(inside.any(axis=1))[0]; cols = np.where(inside.any(axis=0))[0]
    win = (slice(max(rows[0] - 8, 0), rows[-1] + 9), slice(max(cols[0] - 8, 0), cols[-1] + 9))
    r0, c0 = win[0].start, win[1].start
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)

    def px(lon, lat):
        x, y = to_grid.transform(lon, lat)
        return (x - gt[2]) / gt[0] - c0, (y - gt[5]) / gt[4] - r0

    z = np.where(inside & (elev > -1000), elev, np.nan)[win]
    cmap = LinearSegmentedColormap.from_list('hyps', ['#dfe8c8', '#f1e7c0', '#e3c891', '#c79a63', '#a0714b', '#f4f1ee'])
    shade = LightSource(315, 45).hillshade(np.nan_to_num(z, nan=0.0), vert_exag=0.02, dx=1, dy=1)
    fig, ax = plt.subplots(figsize=(11, 6.6), constrained_layout=True)
    im = ax.imshow(z, cmap=cmap, vmin=0, vmax=4000, interpolation='nearest', aspect=ASPECT)
    ax.imshow(np.where(np.isfinite(z), shade, np.nan), cmap='gray', vmin=0, vmax=1, alpha=.22, interpolation='nearest', aspect=ASPECT)
    edge = np.zeros(reg.shape, bool)
    edge[:-1] |= reg[:-1] != reg[1:]; edge[:, :-1] |= reg[:, :-1] != reg[:, 1:]
    ax.imshow(np.where(edge, 1.0, np.nan)[win], cmap='gray_r', vmin=0, vmax=1.6, interpolation='nearest', aspect=ASPECT)
    whs = json.loads((ROOT / 'data/tpi-reviewed-resources.json').read_text())
    for cat, marker, color, label in [('culture', 'o', '#b3261e', 'Cultural World Heritage component (20)'), ('nature', '^', '#136f4a', 'Natural World Heritage component (7)')]:
        pts = np.array([px(p['lng'], p['lat']) for p in whs if p['category'] == cat])
        ax.scatter(pts[:, 0], pts[:, 1], s=46, marker=marker, facecolor=color, edgecolor='white', linewidth=.9, zorder=5, label=label)
    for name, lon, lat in CITIES:
        x, y = px(lon, lat)
        ax.plot(x, y, 's', ms=3.2, color='#111', zorder=6)
        ax.annotate(name, (x, y), xytext=(5, 4), textcoords='offset points', fontsize=8, color='#111', zorder=7,
                    bbox=dict(boxstyle='round,pad=0.12', fc='white', ec='none', alpha=.72))
    h = z.shape[0]
    ax.plot([40, 40 + BAR], [h - 30] * 2, color='#222', lw=2); ax.text(40 + BAR / 2, h - 42, '200 km', ha='center', fontsize=8)
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_visible(False)
    ax.legend(loc='upper right', frameon=True, framealpha=.9, edgecolor='#ccc', fontsize=8)
    cb = fig.colorbar(im, ax=ax, shrink=.55, pad=.01, ticks=[0, 1000, 2000, 3000, 4000]); cb.outline.set_visible(False); cb.set_label('Elevation (m), Copernicus DEM GLO-90')
    fig.savefig(OUT / 'fig1_study_area.png', dpi=220); plt.close(fig)


def workflow():
    fig, ax = plt.subplots(figsize=(11, 5.6)); ax.set_xlim(0, 110); ax.set_ylim(0, 56); ax.axis('off')

    def box(x, y, w, h, title, lines, fc):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.3,rounding_size=1.2', fc=fc, ec='#3b4a54', lw=.9))
        ax.text(x + w / 2, y + h - 2.2, title, ha='center', va='top', fontsize=9, fontweight='bold', color='#16242c')
        ax.text(x + w / 2, y + h - 6.0, '\n'.join(lines), ha='center', va='top', fontsize=7.6, color='#24343d', linespacing=1.35)

    def arrow(x0, y0, x1, y1):
        ax.annotate('', (x1, y1), (x0, y0), arrowprops=dict(arrowstyle='-|>', color='#3b4a54', lw=1.1, shrinkA=0, shrinkB=0))

    box(1, 36, 20, 18, 'Open inputs', ['OpenStreetMap points', '(8,465 records)', 'ESA WorldCover 2021', 'Copernicus DEM GLO-90', 'geoBoundaries ADM1'], '#eef3f6')
    box(27, 36, 22, 18, '1 km equal-area grid', ['EPSG:6933, 438,100 cells', 'point audit and grouping', 'merge of complexes (300 m)', 'half-distance kernels'], '#eef3f6')
    box(55, 36, 22, 18, 'Nine criteria (0–1)', ['N, A, U, P  proximity', 'Q, W  setting', 'F  slope', 'K, D  concentration, diversity'], '#e9f3ea')
    box(83, 36, 26, 18, 'Weights', ['equal · Shannon entropy · CRITIC', 'baseline = midpoint of', 'equal and entropy'], '#e9f3ea')
    box(83, 12, 26, 18, 'Four indices (0–100)', ['weighted geometric mean', 'ESI {N,Q} · TSI {A,U}', 'TPI {A,K,D} · TRSI {W,F,P}', 'five fixed classes'], '#fbf1dc')
    box(55, 12, 22, 18, 'Uncertainty', ['500 Monte Carlo scenarios', 'weights, distances, saturation', 'class stability per cell', 'P5–P95 range per cell'], '#f6e9ee')
    box(27, 12, 22, 18, 'External checks', ['UNESCO components (AUC)', 'accommodation blocks (ρ)', 'Moran’s I, scheme agreement'], '#f6e9ee')
    box(1, 12, 20, 18, 'Geoportal', ['score, class, stability', 'and range in one image', 'inspector, swipe, regions', 'routes with photographs'], '#e6eef9')
    for x in (21.6, 49.6, 77.6):
        arrow(x, 45, x + 4.8, 45)
    arrow(96, 35.4, 96, 30.6)
    for x in (82.4, 54.4, 26.4):
        arrow(x, 21, x - 4.8, 21)
    ax.text(55, 4.5, 'One script, fixed random seed, published inputs and hashes: every number in the paper can be recomputed.', ha='center', fontsize=8.2, color='#24343d', style='italic')
    fig.savefig(OUT / 'fig2_workflow.png', dpi=220, bbox_inches='tight'); plt.close(fig)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inputs', default=str(ROOT / 'public/science/model-v0.2/inputs'))
    a = ap.parse_args()
    study_area(a.inputs); workflow()
