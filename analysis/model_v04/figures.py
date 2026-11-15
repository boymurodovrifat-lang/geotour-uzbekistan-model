"""Figures for the manuscript, drawn from the v0.4 arrays written by compute.py."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public/science/model-v0.4'
OUT = ROOT / 'paper/figures'
OUT.mkdir(parents=True, exist_ok=True)
INDICES = ['ESI', 'TSI', 'TPI', 'TRSI']
TITLES = {'ESI': 'ESI — ecotourism suitability', 'TSI': 'TSI — tourism suitability', 'TPI': 'TPI — tourism potential', 'TRSI': 'TRSI — recreation suitability'}
RAMPS = {'ESI': ['#f4f7ec', '#cfe6b0', '#8fca83', '#3f9f61', '#12733f', '#07452a'], 'TSI': ['#f1f5fb', '#c3daf0', '#85b4e0', '#3f82c6', '#17539a', '#0b2f66'],
         'TPI': ['#fbf4e6', '#f7d9a0', '#f0ac55', '#d67a22', '#a04c10', '#662b08'], 'TRSI': ['#f5f1fa', '#dccdee', '#b79ada', '#8663bd', '#59339a', '#351a66']}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.titlesize': 10, 'axes.titleweight': 'bold'})
arr = np.load(SRC / '_arrays.npz')
res = json.loads((SRC / 'results.json').read_text())
layers = json.loads((SRC / 'layers.json').read_text())
valid = arr['valid']
rows = np.where(valid.any(axis=1))[0]; cols = np.where(valid.any(axis=0))[0]
win = (slice(max(rows[0] - 8, 0), rows[-1] + 9), slice(max(cols[0] - 8, 0), cols[-1] + 9))
# EPSG:6933 is equal-area with true scale at 30 deg: at the country's mid-latitude (41.5 deg N) one grid unit
# is cos(41.5)/cos(30) = 0.865 km east-west and 1.156 km north-south. Draw cells with that shape and a true scale bar.
import math
KX = math.cos(math.radians(41.5)) / math.cos(math.radians(30)); ASPECT = 1 / KX ** 2; BAR = 200 / KX


def panel(ax, data, cmap, vmin, vmax, title):
    ax.imshow(np.where(valid, 0.93, np.nan)[win], cmap='gray', vmin=0, vmax=1, interpolation='nearest', aspect=ASPECT)
    im = ax.imshow(np.where(valid, data, np.nan)[win], cmap=cmap, vmin=vmin, vmax=vmax, interpolation='nearest', aspect=ASPECT)
    ax.set_title(title, loc='left'); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_visible(False)
    ax.plot([40, 40 + BAR], [valid[win].shape[0] - 30] * 2, color='#222', lw=2); ax.text(40 + BAR / 2, valid[win].shape[0] - 42, '200 km', ha='center', fontsize=7)
    return im

fig, axes = plt.subplots(2, 2, figsize=(11, 6.4), constrained_layout=True)
for ax, idx in zip(axes.flat, INDICES):
    im = panel(ax, arr[idx], LinearSegmentedColormap.from_list(idx, RAMPS[idx]), 0, 100, TITLES[idx])
    cb = fig.colorbar(im, ax=ax, shrink=.7, pad=.01, ticks=[0, 20, 40, 60, 80, 100]); cb.outline.set_visible(False); cb.ax.tick_params(labelsize=7)
fig.savefig(OUT / 'fig3_index_maps.png', dpi=220); plt.close(fig)

fig, axes = plt.subplots(2, 2, figsize=(11, 6.4), constrained_layout=True)
stab = LinearSegmentedColormap.from_list('stab', ['#8e2f2b', '#e0843f', '#f3dd8c', '#9fc9a0', '#2f7f69'])
for ax, idx in zip(axes.flat, INDICES):
    im = panel(ax, arr[idx + '_stab'], stab, 0, 100, TITLES[idx].split(' — ')[0] + ' — share of Monte Carlo runs keeping the baseline class (%)')
    cb = fig.colorbar(im, ax=ax, shrink=.7, pad=.01, ticks=[0, 25, 50, 75, 100]); cb.outline.set_visible(False); cb.ax.tick_params(labelsize=7)
fig.savefig(OUT / 'fig5_class_stability.png', dpi=220); plt.close(fig)

fig, axes = plt.subplots(1, 2, figsize=(11, 3.6), constrained_layout=True)
names = ['Very low', 'Low', 'Moderate', 'High', 'Very high']
x = np.arange(5); wd = .2
for i, idx in enumerate(INDICES):
    axes[0].bar(x + (i - 1.5) * wd, [res['statistics'][idx]['class_share_pct'][str(k)] for k in range(1, 6)], wd, label=idx, color=RAMPS[idx][3])
    axes[1].bar(x + (i - 1.5) * wd, [res['monte_carlo'][idx]['stability_by_class_pct'][str(k)] for k in range(1, 6)], wd, label=idx, color=RAMPS[idx][3])
axes[0].set_yscale('log'); axes[0].set_ylabel('Share of assessed land (%), log scale'); axes[0].set_title('(a) Area by class', loc='left')
axes[1].set_ylabel('Mean class stability (%)'); axes[1].set_ylim(0, 100); axes[1].set_title('(b) Monte Carlo stability by baseline class', loc='left')
for ax in axes:
    ax.set_xticks(x, names); ax.spines[['top', 'right']].set_visible(False); ax.grid(axis='y', color='#ddd', lw=.6); ax.set_axisbelow(True)
axes[0].legend(frameon=False, ncol=4, loc='upper right')
fig.savefig(OUT / 'fig4_class_area_and_stability.png', dpi=220); plt.close(fig)

regs = sorted(layers['regions'], key=lambda r: -r['TPI']['mean'])
fig, ax = plt.subplots(figsize=(7.2, 4.6), constrained_layout=True)
m = np.array([[r[i]['mean'] for i in INDICES] for r in regs])
im = ax.imshow(m, cmap=LinearSegmentedColormap.from_list('g', ['#f6f8f3', '#9fd0a8', '#1d7a56']), vmin=0, vmax=80, aspect='auto')
EN = {'Toshkent shahri': 'Tashkent city', 'Toshkent viloyati': 'Tashkent region', 'Andijon': 'Andijan', 'Farg‘ona': 'Fergana', 'Xorazm': 'Khorezm', 'Jizzax': 'Jizzakh',
      'Sirdaryo': 'Syrdarya', 'Samarqand': 'Samarkand', 'Qashqadaryo': 'Kashkadarya', 'Buxoro': 'Bukhara', 'Qoraqalpog‘iston': 'Karakalpakstan', 'Navoiy': 'Navoi'}
ax.set_xticks(range(4), INDICES); ax.set_yticks(range(len(regs)), [EN.get(r['name'], r['name']) for r in regs])
for i in range(m.shape[0]):
    for j in range(4):
        ax.text(j, i, f'{m[i, j]:.1f}', ha='center', va='center', fontsize=8, color='white' if m[i, j] > 48 else '#15302a')
ax.set_title('Area-mean index by region (0–100), 1 km cells', loc='left')
for s in ax.spines.values(): s.set_visible(False)
fig.savefig(OUT / 'fig6_regional_means.png', dpi=220); plt.close(fig)
print(sorted(p.name for p in OUT.glob('*.png')))
