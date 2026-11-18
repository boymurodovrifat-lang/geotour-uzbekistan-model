"""Figures of the inventory-gap analysis (manuscript Figures 9 and 10).

Reads public/science/model-v0.4/inventory-gap.json, analysis/inventory/site_visibility.csv and
analysis/inventory/augmented_1km.npz, all written by inventory_gap.py.
Run: python analysis/inventory/figures_inventory.py
Writes paper/figures/fig_inventory_visibility.png and paper/figures/fig_inventory_effect.png.
"""
from pathlib import Path
import csv, json, math
import numpy as np
import tifffile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'paper/figures'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.titlesize': 10, 'axes.titleweight': 'bold'})
gap = json.loads((ROOT / 'public/science/model-v0.4/inventory-gap.json').read_text(encoding='utf-8'))
rows = list(csv.DictReader((ROOT / 'analysis/inventory/site_visibility.csv').open(encoding='utf-8-sig')))
z = np.load(ROOT / 'analysis/inventory/augmented_1km.npz')
valid = z['valid']
grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
gt = grid['transform']
regions = tifffile.imread(ROOT / 'public/science/model-v0.2/inputs/regions.tif')
to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
EN = {"Andijon viloyati": 'Andijan', "Buxoro viloyati": 'Bukhara', "Farg'ona viloyati": 'Fergana', "Namangan viloyati": 'Namangan', "Navoiy viloyati": 'Navoi',
      "Qashqadaryo viloyati": 'Kashkadarya', "Qoraqalpog'iston Respublikasi": 'Karakalpakstan', "Samarqand viloyati": 'Samarkand', "Sirdaryo viloyati": 'Syrdarya',
      "Surxondaryo viloyati": 'Surxondaryo', "Toshkent shahri": 'Tashkent city', "Toshkent viloyati": 'Tashkent region', "Xorazm viloyati": 'Khorezm'}

rr = np.where(valid.any(axis=1))[0]; cc = np.where(valid.any(axis=0))[0]
win = (slice(max(rr[0] - 8, 0), rr[-1] + 9), slice(max(cc[0] - 8, 0), cc[-1] + 9))
KX = math.cos(math.radians(41.5)) / math.cos(math.radians(30)); ASPECT = 1 / KX ** 2; BAR = 200 / KX
edge = np.zeros_like(valid)
edge[:-1] |= (regions[:-1] != regions[1:]) & (regions[:-1] > 0) & (regions[1:] > 0)
edge[:, :-1] |= (regions[:, :-1] != regions[:, 1:]) & (regions[:, :-1] > 0) & (regions[:, 1:] > 0)
lon = np.array([float(r['lng']) for r in rows]); lat = np.array([float(r['lat']) for r in rows])
xs, ys = to_grid.transform(lon, lat)
pr = (np.asarray(ys) - gt[5]) / gt[4] - win[0].start
pc = (np.asarray(xs) - gt[2]) / gt[0] - win[1].start
d_model = np.array([float(r['d_model_km']) for r in rows])
d_osm = np.minimum([float(r['d_osm_worship_km']) for r in rows], [float(r['d_osm_heritage_km']) for r in rows])
d_ph = np.array([float(r['d_commons_km']) for r in rows])
vis_model = d_model <= 0.5
vis_osm = d_osm <= 0.25


def base(ax, title):
    ax.imshow(np.where(valid, 0.94, np.nan)[win], cmap='gray', vmin=0, vmax=1, interpolation='nearest', aspect=ASPECT)
    ax.imshow(np.where(edge, 1.0, np.nan)[win], cmap=LinearSegmentedColormap.from_list('e', ['#9a9a9a', '#9a9a9a']), interpolation='nearest', aspect=ASPECT)
    ax.set_title(title, loc='left'); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    h = valid[win].shape[0]
    ax.plot([40, 40 + BAR], [h - 30] * 2, color='#222', lw=2); ax.text(40 + BAR / 2, h - 42, '200 km', ha='center', fontsize=7)


# ---------------- Figure 9: visibility -------------------------------------------------------------
fig = plt.figure(figsize=(11, 4.6), constrained_layout=True)
gs = fig.add_gridspec(1, 2, width_ratios=[1.55, 1])
ax = fig.add_subplot(gs[0])
base(ax, '(a) Official register: what open data see')
groups = [(~vis_model & ~vis_osm, '#c0392b', f'In neither ({(~vis_model & ~vis_osm).sum()})', 'x'),
          (vis_osm & ~vis_model, '#e6a23c', f'In OSM only ({(vis_osm & ~vis_model).sum()})', 'o'),
          (vis_model, '#1f5fa8', f'Model input record ≤ 500 m ({vis_model.sum()})', 'o')]
for m, col, lab, mk in groups:
    ax.scatter(pc[m], pr[m], s=11 if mk == 'o' else 13, c=col, marker=mk, linewidths=0.9 if mk == 'x' else 0.3, edgecolors='white' if mk == 'o' else None, label=lab, zorder=3)
ax.legend(loc='lower left', bbox_to_anchor=(0.0, 0.08), fontsize=7.5, frameon=True, framealpha=0.9, title='505 mapped sites', title_fontsize=7.5)
ax2 = fig.add_subplot(gs[1])
reg = [r for r in gap['by_region'] if r['sites'] >= 5]
reg.sort(key=lambda r: r['sites'])
y = np.arange(len(reg))
hgt = 0.26
ax2.barh(y + hgt, [r['model_record_500m'] for r in reg], hgt, color='#1f5fa8', label='Model input record ≤ 500 m')
ax2.barh(y, [r['osm_worship_or_heritage_250m'] for r in reg], hgt, color='#e6a23c', label='OSM worship/heritage ≤ 250 m')
ax2.barh(y - hgt, [r['commons_photo_150m'] for r in reg], hgt, color='#7d7d7d', label='Commons photo ≤ 150 m')
ax2.set_yticks(y, [f"{EN[r['region']]} ({r['sites']})" for r in reg], fontsize=8)
ax2.set_xlim(0, 100); ax2.set_xlabel('Share of official sites, %')
ax2.set_title('(b) Visibility by region (number of sites)', loc='left')
ax2.legend(fontsize=7, loc='lower right', frameon=True, framealpha=0.9)
for s in ('top', 'right'):
    ax2.spines[s].set_visible(False)
fig.savefig(OUT / 'fig_inventory_visibility.png', dpi=200)
plt.close(fig)

# ---------------- Figure 10: effect -------------------------------------------------------------------
fig = plt.figure(figsize=(11, 4.4), constrained_layout=True)
gs = fig.add_gridspec(1, 3, width_ratios=[1.55, 0.62, 0.62])
ax = fig.add_subplot(gs[0])
base(ax, '(a) TPI change when the register is added')
dz = (z['TPI_all'] - z['TPI_base'])
dz = np.where(valid & (dz > 0.5), dz, np.nan)
cm = LinearSegmentedColormap.from_list('d', ['#fde9c8', '#f0ac55', '#c0601a', '#5c2304'])
im = ax.imshow(dz[win], cmap=cm, vmin=0, vmax=40, interpolation='nearest', aspect=ASPECT)
fig.colorbar(im, ax=ax, shrink=0.55, label='TPI points', location='left', pad=0.01)
c = gap['counterfactual']['all']['TPI']
ax.text(0.01, 0.02, f"Class changed: {c['cells_class_changed']:,} km² ({c['cells_class_changed_pct']}%)\nRaised to high/very high: {c['cells_raised_to_high_class_ge4']:,} km²",
        transform=ax.transAxes, fontsize=7.5, va='bottom', bbox=dict(fc='white', ec='#bbb', lw=0.5))
ax3 = fig.add_subplot(gs[1])
cls = lambda v: np.searchsorted([20, 40, 60, 80], v, side='left') + 1
tb = np.array([float(r['TPI']) for r in rows]); ta = np.array([float(r['TPI_with_inventory']) for r in rows])
lab = ['Very low', 'Low', 'Moderate', 'High', 'Very high']
cols5 = ['#fbf4e6', '#f7d9a0', '#f0ac55', '#d67a22', '#8a3d0c']
for x, v, name in [(0, tb, 'Published'), (1, ta, 'With register')]:
    k = cls(v); bottom = 0
    for j in range(1, 6):
        share = 100 * np.mean(k == j)
        ax3.bar(x, share, 0.62, bottom=bottom, color=cols5[j - 1], edgecolor='white', lw=0.5, label=lab[j - 1] if x == 0 else None)
        if share >= 6:
            ax3.text(x, bottom + share / 2, f'{share:.0f}', ha='center', va='center', fontsize=7, color='white' if j >= 4 else '#333')
        bottom += share
ax3.set_xticks([0, 1], ['Published', 'With\nregister'])
ax3.set_ylabel('Share of the 505 sites, %'); ax3.set_ylim(0, 100)
ax3.set_title('(b) TPI class at sites', loc='left')
ax3.legend(fontsize=6.5, loc='upper center', bbox_to_anchor=(0.5, -0.17), ncol=2, frameon=False)
for s in ('top', 'right'):
    ax3.spines[s].set_visible(False)
ax4 = fig.add_subplot(gs[2])
p_vis = 100 * np.mean(d_ph[vis_model] <= 0.15); p_inv = 100 * np.mean(d_ph[~vis_model] <= 0.15)
ax4.bar([0, 1], [p_vis, p_inv], 0.62, color=['#1f5fa8', '#c0392b'])
for x, v, n in [(0, p_vis, vis_model.sum()), (1, p_inv, (~vis_model).sum())]:
    ax4.text(x, v + 1.5, f'{v:.0f}%', ha='center', fontsize=8)
ax4.set_xticks([0, 1], [f'Visible to\nmodel (n={vis_model.sum()})', f'Not visible\n(n={(~vis_model).sum()})'])
ax4.set_ylim(0, 100); ax4.set_ylabel('Sites with a Commons photo ≤ 150 m, %')
ax4.set_title('(c) Photo validation', loc='left')
for s in ('top', 'right'):
    ax4.spines[s].set_visible(False)
fig.savefig(OUT / 'fig_inventory_effect.png', dpi=200)
plt.close(fig)
print('ok', p_vis, p_inv)

# ---------------- Figure 11: discrimination by scale (drivers_and_scale.py) --------------------------
ds = json.loads((ROOT / 'public/science/model-v0.4/inventory-drivers-scale.json').read_text(encoding='utf-8'))
SC = [('national', 'National'), ('regional', 'Same region'), ('local_2_10km', 'Local, 2–10 km'), ('local_same_settlement_status', 'Local, same\nsettlement status')]
SUB = [('visible_to_model', 'Visible to the model (n=157)', '#1f5fa8', 'o'), ('all', 'All sites (n=505)', '#333333', 's'), ('not_visible_to_model', 'Not visible (n=348)', '#c0392b', 'D')]
fig, axes = plt.subplots(1, 2, figsize=(10, 3.6), constrained_layout=True, sharey=True)
for ax, k in zip(axes, ('TSI', 'TPI')):
    for j, (sub, lab, col, mk) in enumerate(SUB):
        x = np.arange(len(SC)) + (j - 1) * 0.18
        y = [ds['discrimination'][k][sub][s]['auc'] for s, _ in SC]
        lo = [ds['discrimination'][k][sub][s]['ci95'][0] for s, _ in SC]
        hi = [ds['discrimination'][k][sub][s]['ci95'][1] for s, _ in SC]
        ax.errorbar(x, y, yerr=[np.subtract(y, lo), np.subtract(hi, y)], fmt=mk, color=col, ms=5, capsize=2, lw=1, label=lab)
    ax.axhline(0.5, color='#999', ls='--', lw=0.8)
    ax.set_xticks(np.arange(len(SC)), [l for _, l in SC], fontsize=8)
    ax.set_title(f'({"ab"[k == "TPI"]}) {k}: register sites vs. background', loc='left')
    ax.set_ylim(0.45, 1.0)
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
axes[0].set_ylabel('P(site cell scores higher)')
axes[1].legend(fontsize=7.5, loc='lower left', frameon=False)
fig.savefig(OUT / 'fig_inventory_scale.png', dpi=200)
plt.close(fig)
print('scale figure ok')
