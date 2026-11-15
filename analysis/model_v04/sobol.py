"""Variance-based (Sobol) global sensitivity analysis of the v0.4 indices.

The Monte Carlo experiment in compute.py tells how much a cell's score changes under alternative
assumptions; this script tells which assumption causes the change. Seven input groups are varied
exactly as in compute.py:

  share       mixing share between equal (0) and entropy (1) weights, uniform
  resource    half-distance multiplier for natural, cultural and general resources
  service     half-distance multiplier for accommodation and information
  recreation  half-distance multiplier for recreation facilities
  kernel      half-distance multiplier of the resource-count kernel
  saturation  saturation constant of K, log-uniform 2.5-10
  jitter      +-10 % multiplicative jitter on each weight (three factors, one group)

The four distance multipliers take the five levels {0.5, 0.71, 1, 1.41, 2} with equal probability,
as in the Monte Carlo experiment. First-order indices use the Saltelli et al. (2010) estimator and total indices the
Jansen (1999) estimator, as recommended by Saltelli et al. (2010), on the A, B and A_B(i) sample matrices. Because the model returns one value
per cell, the indices are pooled over a random sample of cells: S_i = sum_c V_i(c) / sum_c V(c), i.e. the
share of the scenario variance, summed over cells, that each group explains. Confidence
intervals come from 300 bootstrap resamples of the base rows.

Run: python analysis/model_v04/sobol.py --inputs public/science/model-v0.2/inputs
"""
from pathlib import Path
import argparse, csv, json, math, sys
import numpy as np
import tifffile
from pyproj import Transformer
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compute import (ROOT, CRITERIA, FAMILIES, INDICES, MULT, PARAMS, sphere, chord_to_km,  # noqa: E402
                     merge_complexes, kernel_sum, geometric, entropy_weights)

GROUPS = ['share', 'resource', 'service', 'recreation', 'kernel', 'saturation', 'jitter']
LABELS = {'share': 'Weighting rule (equal ↔ entropy)', 'resource': 'Resource half-distance', 'service': 'Service half-distance',
          'recreation': 'Recreation half-distance', 'kernel': 'Count-kernel half-distance', 'saturation': 'Saturation constant of K',
          'jitter': 'Weight jitter (±10%)'}


def run(inputs, out, n_base=2048, n_cells=3000, seed=20261116):
    inputs, out = Path(inputs), Path(out)
    rng = np.random.default_rng(seed)
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']

    def read(name):
        a = tifffile.imread(inputs / (name + '.tif')).astype('float32')
        return np.where(a < -9000, np.nan, a)

    regions = tifffile.imread(inputs / 'regions.tif')
    Q, W, F = read('Q'), read('W'), read('F')
    valid = (regions > 0) & np.isfinite(Q) & np.isfinite(W) & np.isfinite(F)
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    X, Y = np.meshgrid(gt[2] + (np.arange(w) + .5) * gt[0], gt[5] + (np.arange(h) + .5) * gt[4])
    lon2d, lat2d = to_ll.transform(X, Y)
    idx_all = np.flatnonzero(valid.ravel())
    pick = np.sort(rng.choice(idx_all, size=min(n_cells, idx_all.size), replace=False))
    sel = np.zeros(h * w, bool); sel[pick] = True; sel = sel.reshape(h, w)
    centres = sphere(lon2d[sel], lat2d[sel])

    groups = {k: [] for k in FAMILIES + ['accommodation', 'information', 'recreation']}
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['excluded']:
                continue
            for g in filter(None, r['model_groups'].split('|')):
                groups[g].append((float(r['lng']), float(r['lat'])))
    groups = {k: np.array(v) for k, v in groups.items()}
    sites = {k: merge_complexes(groups[k], PARAMS['complex_merge_distance_m']) for k in FAMILIES}
    nearest = {k: chord_to_km(cKDTree(sphere(v[:, 0], v[:, 1])).query(centres, workers=-1)[0]) for k, v in groups.items()}
    ksum = {m: {k: kernel_sum(sites[k], lon2d, lat2d, gt, to_grid, PARAMS['count_kernel_half_distance_km'] * m)[sel] for k in FAMILIES} for m in MULT}
    Qs, Ws, Fs = Q[sel].astype('float64'), W[sel].astype('float64'), F[sel].astype('float64')

    def criteria(m_res, m_srv, m_rec, m_cnt, n_sat):
        dec = lambda k, hd: np.exp2(-nearest[k] / hd)
        N = dec('natural', 10 * m_res)
        A = np.maximum.reduce([N, dec('cultural', 10 * m_res), dec('general', 10 * m_res)])
        U = (dec('accommodation', 5 * m_srv) + dec('information', 5 * m_srv)) / 2
        P = dec('recreation', 3 * m_rec)
        s = np.column_stack([ksum[m_cnt][k] for k in FAMILIES])
        total = s.sum(axis=1)
        K = 1 - np.exp(-total / n_sat)
        with np.errstate(divide='ignore', invalid='ignore'):
            p = s / total[:, None]
            even = -np.where(p > 0, p * np.log(p), 0).sum(axis=1) / math.log(3)
        D = (1 + 2 * np.where(total > 1e-9, even, 0)) / 3
        return {'N': N, 'Q': Qs, 'A': A, 'U': U, 'K': K, 'D': D, 'W': Ws, 'F': Fs, 'P': P}

    # Equal and entropy weight sets from the baseline criteria on all assessed cells are what compute.py
    # uses; on the sample they differ by < 0.005, so the sample estimate is used here.
    base = criteria(1.0, 1.0, 1.0, 1.0, PARAMS['count_saturation_n'])
    w_eq = {i: np.full(len(c), 1 / len(c)) for i, c in CRITERIA.items()}
    w_en = {i: entropy_weights(np.column_stack([base[n] for n in c]))[0] for i, c in CRITERIA.items()}

    # unit hypercube columns: share, resource, service, recreation, kernel, saturation, j1, j2, j3
    cols = {'share': [0], 'resource': [1], 'service': [2], 'recreation': [3], 'kernel': [4], 'saturation': [5], 'jitter': [6, 7, 8]}
    D = 9
    A_, B_ = rng.random((n_base, D)), rng.random((n_base, D))

    def model(u):
        lvl = lambda x: MULT[min(int(x * len(MULT)), len(MULT) - 1)]
        n_sat = float(np.exp(np.log(2.5) + u[5] * (np.log(10) - np.log(2.5))))
        c = criteria(lvl(u[1]), lvl(u[2]), lvl(u[3]), lvl(u[4]), n_sat)
        res = {}
        for i, names in CRITERIA.items():
            wv = (u[0] * w_en[i] + (1 - u[0]) * w_eq[i]) * (0.9 + 0.2 * u[6:6 + len(names)])
            res[i] = geometric(np.column_stack([c[n] for n in names]), wv / wv.sum()).astype('float32')
        return res

    def evaluate(M):
        outp = {i: np.empty((len(M), len(pick)), 'float32') for i in INDICES}
        for r, u in enumerate(M):
            for i, v in model(u).items():
                outp[i][r] = v
        return outp

    YA, YB = evaluate(A_), evaluate(B_)
    YAB = {}
    for g in GROUPS:
        M = A_.copy(); M[:, cols[g]] = B_[:, cols[g]]
        YAB[g] = evaluate(M)

    def indices(rows):
        res = {}
        for i in INDICES:
            ya, yb = YA[i][rows].astype('float64'), YB[i][rows].astype('float64')
            var = np.var(np.concatenate([ya, yb]), axis=0)
            tot = var.sum()
            res[i] = {}
            for g in GROUPS:
                yab = YAB[g][i][rows].astype('float64')
                # Saltelli et al. (2010) first-order: V_i = E[Y_B (Y_ABi - Y_A)]; Jansen (1999) total
                first = np.mean(yb * (yab - ya), axis=0).sum() / tot
                total = 0.5 * np.mean((ya - yab) ** 2, axis=0).sum() / tot
                res[i][g] = (first, total)
        return res

    point = indices(np.arange(n_base))
    boot = [indices(rng.integers(0, n_base, n_base)) for _ in range(300)]
    result = {'method': 'Sobol first-order (Saltelli et al. 2010) and total (Jansen 1999) indices, pooled over cells',
              'base_samples': n_base, 'model_runs': n_base * (len(GROUPS) + 2), 'cells_sampled': int(len(pick)), 'seed': seed,
              'groups': {g: LABELS[g] for g in GROUPS}, 'indices': {}}
    for i in INDICES:
        result['indices'][i] = {}
        for g in GROUPS:
            f_b = np.array([b[i][g][0] for b in boot]); t_b = np.array([b[i][g][1] for b in boot])
            result['indices'][i][g] = {'first': round(float(point[i][g][0]), 3), 'total': round(float(point[i][g][1]), 3),
                                       'first_ci95': [round(float(x), 3) for x in np.percentile(f_b, [2.5, 97.5])],
                                       'total_ci95': [round(float(x), 3) for x in np.percentile(t_b, [2.5, 97.5])]}
        result['indices'][i]['sum_first'] = round(float(sum(point[i][g][0] for g in GROUPS)), 3)
    (out / 'sobol.json').write_text(json.dumps(result, indent=1, ensure_ascii=False))
    return result


def figure(result, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9})
    colors = ['#0f6b5c', '#3f82c6', '#d67a22', '#8663bd', '#b4a03a', '#c2410c', '#7a8a84']
    fig, axes = plt.subplots(1, 4, figsize=(11, 3.4), sharey=True, constrained_layout=True)
    for ax, i in zip(axes, INDICES):
        r = result['indices'][i]
        y = np.arange(len(GROUPS))[::-1]
        tot = [r[g]['total'] for g in GROUPS]; fst = [max(r[g]['first'], 0) for g in GROUPS]
        err = np.array([[r[g]['total'] - r[g]['total_ci95'][0], r[g]['total_ci95'][1] - r[g]['total']] for g in GROUPS]).T
        ax.barh(y, tot, color=colors, alpha=.35, label='Total effect')
        ax.barh(y, fst, color=colors, label='First-order effect')
        ax.errorbar(tot, y, xerr=err, fmt='none', ecolor='#333', elinewidth=.8, capsize=2)
        ax.set_title(i, loc='left', fontweight='bold'); ax.set_xlim(0, 1); ax.grid(axis='x', color='#ddd', lw=.6); ax.set_axisbelow(True)
        ax.spines[['top', 'right']].set_visible(False)
    axes[0].set_yticks(np.arange(len(GROUPS))[::-1], [LABELS[g] for g in GROUPS])
    axes[0].legend(frameon=False, loc='lower right', fontsize=7.5)
    fig.supxlabel('Share of the variance of the scenario scores (pooled over 3,000 sampled cells)')
    fig.savefig(path, dpi=220); plt.close(fig)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inputs', default=str(ROOT / 'public/science/model-v0.2/inputs'))
    ap.add_argument('--out', default=str(ROOT / 'public/science/model-v0.4'))
    ap.add_argument('--n', type=int, default=2048)
    ap.add_argument('--cells', type=int, default=3000)
    a = ap.parse_args()
    res = run(a.inputs, a.out, n_base=a.n, n_cells=a.cells)
    (ROOT / 'paper/figures').mkdir(parents=True, exist_ok=True)
    figure(res, ROOT / 'paper/figures/fig_sobol.png')
    print(json.dumps({i: {g: (v['first'], v['total']) for g, v in r.items() if isinstance(v, dict)} for i, r in res['indices'].items()}, indent=1))
