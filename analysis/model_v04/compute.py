"""GeoTour v0.4: open-data screening indices on the 1 km equal-area grid.

What changes against v0.2/v0.3 (same criteria, same open inputs):
  * resource counts use a continuous exponential kernel instead of a hard 10 km radius;
  * records of one complex (same family, within 300 m) are merged before counting;
  * diversity is the Shannon evenness of the family kernel sums, not a hard-radius family count;
  * criteria are combined by a weighted geometric mean. Baseline weights are the midpoint between
    equal weights (no prior about importance) and Shannon entropy weights (information content);
    pure entropy, equal and CRITIC weights are reported as alternatives, because pure entropy
    weights reward sparse criteria and would almost switch off slope and landscape quality;
  * a Monte Carlo experiment draws the weights anywhere between the equal and the entropy set,
    perturbs half-distances and the saturation constant, and
    returns, per cell, how often the baseline class is kept and the P5-P95 score range;
  * two external consistency checks: UNESCO World Heritage components (not used as input) and
    mapped accommodation per 25 km block (not used by ESI, TPI, TRSI).

Nothing here is an expert calibration or a field validation. Run:
  python analysis/model_v04/compute.py --inputs public/science/model-v0.2/inputs --out public/science/model-v0.4
Needs numpy, scipy, tifffile, pyproj, Pillow.
"""
from pathlib import Path
import argparse, csv, hashlib, json, math
import numpy as np
import tifffile
from PIL import Image
from pyproj import Transformer
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates
from scipy.stats import rankdata

ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.4.0-open-screening-1km'
INDICES = ['ESI', 'TSI', 'TPI', 'TRSI']
CRITERIA = {'ESI': ['N', 'Q'], 'TSI': ['A', 'U'], 'TPI': ['A', 'K', 'D'], 'TRSI': ['W', 'F', 'P']}
FAMILIES = ['natural', 'cultural', 'general']
R_EARTH = 6371.0088
PARAMS = {
    'resource_half_distance_km': 10, 'service_half_distance_km': 5, 'recreation_half_distance_km': 3,
    'count_kernel_half_distance_km': 5, 'count_saturation_n': 5, 'complex_merge_distance_m': 300,
    'monte_carlo_runs': 500, 'baseline_entropy_share': 0.5, 'weight_jitter': 0.10, 'distance_multipliers': [0.5, 0.71, 1.0, 1.41, 2.0],
    'saturation_range': [2.5, 10.0], 'seed': 20261113, 'block_km': 25, 'bootstrap': 2000,
}
MULT = PARAMS['distance_multipliers']


def sphere(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.column_stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def chord_to_km(c):
    return 2 * np.arcsin(np.minimum(c / 2, 1)) * R_EARTH


def classes(score):
    """Fixed classes [0,20], (20,40], (40,60], (60,80], (80,100] -> 1..5."""
    return (np.searchsorted([20, 40, 60, 80], score, side='left') + 1).astype('uint8')


def entropy_weights(x):
    """Shannon entropy weights. x: cells x criteria, values in [0,1]."""
    p = x / x.sum(axis=0, keepdims=True)
    with np.errstate(divide='ignore', invalid='ignore'):
        e = -np.where(p > 0, p * np.log(p), 0).sum(axis=0) / math.log(len(x))
    d = 1 - e
    return d / d.sum(), e


def critic_weights(x):
    """CRITIC: contrast (standard deviation) times conflict (1 - correlation)."""
    sd = x.std(axis=0)
    r = np.corrcoef(x.T)
    c = sd * (1 - r).sum(axis=0)
    return c / c.sum()


def geometric(x, w):
    """Weighted geometric mean of criteria in [0,1]; a true zero stays zero."""
    with np.errstate(divide='ignore'):
        return 100 * np.exp((np.log(x) * w).sum(axis=1))


def merge_complexes(points, metres):
    """Single-linkage merge of records closer than `metres`; returns cluster centroids (lon, lat)."""
    if not len(points):
        return points
    xyz = sphere(points[:, 0], points[:, 1])
    pairs = cKDTree(xyz).query_pairs(2 * math.sin(metres / 1000 / (2 * R_EARTH)), output_type='ndarray')
    parent = np.arange(len(points))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
    roots = np.array([find(i) for i in range(len(points))])
    return np.array([points[roots == r].mean(axis=0) for r in np.unique(roots)])


def kernel_sum(sites, lon2d, lat2d, transform, to_grid, half_km):
    """Sum over sites of 2^(-d/h) with great-circle d, evaluated in a local window around each site."""
    h, w = lon2d.shape
    out = np.zeros((h, w), dtype='float64')
    reach = half_km * 14  # 2^-14 is below 1e-4
    half = int(math.ceil(reach * 1.25)) + 2  # grid cells are 1 km in x/y with <=25% anisotropy here
    xs, ys = to_grid.transform(sites[:, 0], sites[:, 1])
    cols = ((np.asarray(xs) - transform[2]) / transform[0]).astype(int)
    rows = ((np.asarray(ys) - transform[5]) / transform[4]).astype(int)
    for (lo, la), r, c in zip(sites, rows, cols):
        r0, r1, c0, c1 = max(r - half, 0), min(r + half + 1, h), max(c - half, 0), min(c + half + 1, w)
        if r0 >= r1 or c0 >= c1:
            continue
        la2, lo2 = np.radians(lat2d[r0:r1, c0:c1]), np.radians(lon2d[r0:r1, c0:c1])
        a = np.sin((la2 - math.radians(la)) / 2) ** 2 + np.cos(la2) * math.cos(math.radians(la)) * np.sin((lo2 - math.radians(lo)) / 2) ** 2
        d = 2 * R_EARTH * np.arcsin(np.sqrt(np.minimum(a, 1)))
        out[r0:r1, c0:c1] += np.where(d <= reach, np.exp2(-d / half_km), 0)
    return out


def auc(pos, neg_sorted):
    """Probability that a presence value exceeds a background value (ties count one half)."""
    lo = np.searchsorted(neg_sorted, pos, side='left')
    hi = np.searchsorted(neg_sorted, pos, side='right')
    return float(((lo + hi) / 2).mean() / len(neg_sorted))


def spearman(a, b):
    ra, rb = rankdata(a), rankdata(b)
    return float(np.corrcoef(ra, rb)[0, 1])


def morans_i(grid, mask):
    """Global Moran's I with rook contiguity on the 1 km grid."""
    z = np.where(mask, grid - grid[mask].mean(), 0.0)
    num = 0.0
    links = 0
    for dr, dc in [(0, 1), (1, 0)]:
        a, b = z[: z.shape[0] - dr, : z.shape[1] - dc], z[dr:, dc:]
        m = mask[: z.shape[0] - dr, : z.shape[1] - dc] & mask[dr:, dc:]
        num += 2 * float((a * b)[m].sum())
        links += 2 * int(m.sum())
    return float(mask.sum() / links * num / float((z[mask] ** 2).sum()))


def geotiff(path, array, transform, nodata):
    """Minimal GeoTIFF writer for the EPSG:6933 grid (pixel-is-area)."""
    keys = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 6933)
    extratags = [
        (33550, 'd', 3, (transform[0], -transform[4], 0.0), True),
        (33922, 'd', 6, (0.0, 0.0, 0.0, transform[2], transform[5], 0.0), True),
        (34735, 'H', len(keys), keys, True),
        (42113, 's', 0, str(nodata), True),
    ]
    tifffile.imwrite(path, array, compression='deflate', extratags=extratags, metadata=None)


def run(inputs, out):
    inputs, out = Path(inputs), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(PARAMS['seed'])
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt = grid['transform']
    h, w = grid['height'], grid['width']

    def read(name):
        a = tifffile.imread(inputs / (name + '.tif')).astype('float32')
        assert a.shape == (h, w), name
        return np.where(a < -9000, np.nan, a)

    regions = tifffile.imread(inputs / 'regions.tif')
    Q, W, F = read('Q'), read('W'), read('F')
    valid = (regions > 0) & np.isfinite(Q) & np.isfinite(W) & np.isfinite(F)
    rows, cols = np.where(valid)
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    X, Y = np.meshgrid(gt[2] + (np.arange(w) + .5) * gt[0], gt[5] + (np.arange(h) + .5) * gt[4])
    lon2d, lat2d = to_ll.transform(X, Y)
    centres = sphere(lon2d[valid], lat2d[valid])
    n_cells = len(rows)

    # --- inventory -----------------------------------------------------------------------
    groups = {k: [] for k in FAMILIES + ['accommodation', 'information', 'recreation']}
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['excluded']:
                continue
            for g in filter(None, r['model_groups'].split('|')):
                groups[g].append((float(r['lng']), float(r['lat'])))
    groups = {k: np.array(v) for k, v in groups.items()}
    sites = {k: merge_complexes(groups[k], PARAMS['complex_merge_distance_m']) for k in FAMILIES}
    inventory = {k: {'records': int(len(groups[k])), **({'merged_sites': int(len(sites[k]))} if k in sites else {})} for k in groups}

    nearest = {k: chord_to_km(cKDTree(sphere(v[:, 0], v[:, 1])).query(centres, workers=-1)[0]) for k, v in groups.items()}
    ksum = {m: {k: kernel_sum(sites[k], lon2d, lat2d, gt, to_grid, PARAMS['count_kernel_half_distance_km'] * m)[valid] for k in FAMILIES} for m in MULT}

    def criteria(m_res=1.0, m_srv=1.0, m_rec=1.0, m_cnt=1.0, n_sat=PARAMS['count_saturation_n']):
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
        return {'N': N, 'Q': Q[valid].astype('float64'), 'A': A, 'U': U, 'K': K, 'D': D, 'W': W[valid].astype('float64'), 'F': F[valid].astype('float64'), 'P': P}

    base = criteria()
    reproduction = {k: float(np.nanmax(np.abs(base[k] - read(k)[valid]))) for k in ['N', 'A', 'U', 'P']}

    # --- weights -------------------------------------------------------------------------
    weights, entropy = {}, {}
    for idx, names in CRITERIA.items():
        x = np.column_stack([base[n] for n in names])
        we, e = entropy_weights(x)
        eq = np.full(len(names), 1 / len(names))
        weights[idx] = {'combined': PARAMS['baseline_entropy_share'] * we + (1 - PARAMS['baseline_entropy_share']) * eq, 'entropy': we, 'critic': critic_weights(x), 'equal': eq}
        entropy[idx] = e
    score = {s: {idx: geometric(np.column_stack([base[n] for n in names]), weights[idx][s]) for idx, names in CRITERIA.items()} for s in ['combined', 'entropy', 'critic', 'equal']}
    main = score['combined']
    main_class = {idx: classes(v) for idx, v in main.items()}

    scheme_agreement = {idx: {s: {'same_class_pct': round(float(100 * np.mean(classes(score[s][idx]) == main_class[idx])), 2),
                                   'spearman': round(spearman(score[s][idx][::7], main[idx][::7]), 4),
                                   'mean_abs_difference': round(float(np.mean(np.abs(score[s][idx] - main[idx]))), 2)} for s in ['equal', 'entropy', 'critic']} for idx in INDICES}

    # --- Monte Carlo ---------------------------------------------------------------------
    runs = PARAMS['monte_carlo_runs']
    draws = [{'m_res': float(rng.choice(MULT)), 'm_srv': float(rng.choice(MULT)), 'm_rec': float(rng.choice(MULT)), 'm_cnt': float(rng.choice(MULT)),
              'n_sat': float(np.exp(rng.uniform(*np.log(PARAMS['saturation_range'])))),
              'share': float(rng.uniform(0, 1)),
              'w': {idx: rng.uniform(1 - PARAMS['weight_jitter'], 1 + PARAMS['weight_jitter'], len(CRITERIA[idx])) for idx in INDICES}} for _ in range(runs)]
    stack = {idx: np.empty((runs, n_cells), dtype='uint8') for idx in INDICES}
    for i, d in enumerate(draws):
        c = criteria(d['m_res'], d['m_srv'], d['m_rec'], d['m_cnt'], d['n_sat'])
        for idx, names in CRITERIA.items():
            wv = (d['share'] * weights[idx]['entropy'] + (1 - d['share']) * weights[idx]['equal']) * d['w'][idx]
            stack[idx][i] = np.round(2 * geometric(np.column_stack([c[n] for n in names]), wv / wv.sum())).astype('uint8')
    stability, spread, mc = {}, {}, {}
    for idx in INDICES:
        s = stack[idx]
        stability[idx] = 100 * (classes(s / 2.0) == main_class[idx][None, :]).mean(axis=0)
        p5, p95 = np.percentile(s, [5, 95], axis=0) / 2.0
        spread[idx] = p95 - p5
        within = (s / 2.0 >= (main[idx] - 10)[None, :]) & (s / 2.0 <= (main[idx] + 10)[None, :])
        mc[idx] = {'mean_class_stability_pct': round(float(stability[idx].mean()), 2), 'cells_stable_80pct_share': round(float(100 * (stability[idx] >= 80).mean()), 2),
                   'median_p5_p95_range': round(float(np.median(spread[idx])), 2), 'p90_p5_p95_range': round(float(np.percentile(spread[idx], 90)), 2),
                   'runs_within_10_points_pct': round(float(100 * within.mean()), 2),
                   'stability_by_class_pct': {str(k): round(float(stability[idx][main_class[idx] == k].mean()), 1) if (main_class[idx] == k).any() else None for k in range(1, 6)}}
        del stack[idx]

    # --- statistics ----------------------------------------------------------------------
    def to_grid2d(v, fill=np.nan):
        a = np.full((h, w), fill, dtype='float32')
        a[valid] = v
        return a
    grids = {idx: to_grid2d(main[idx]) for idx in INDICES}
    stats = {}
    for idx in INDICES:
        v = main[idx]
        stats[idx] = {'mean': round(float(v.mean()), 2), 'median': round(float(np.median(v)), 2), 'p90': round(float(np.percentile(v, 90)), 2), 'max': round(float(v.max()), 2),
                      'class_area_km2': {str(k): int((main_class[idx] == k).sum()) for k in range(1, 6)},
                      'class_share_pct': {str(k): round(float(100 * (main_class[idx] == k).mean()), 2) for k in range(1, 6)},
                      'morans_i': round(morans_i(np.nan_to_num(grids[idx]), valid), 4)}
    sample = slice(None, None, 5)
    corr = {'pearson': np.round(np.corrcoef([main[i] for i in INDICES]), 3).tolist(),
            'spearman': np.round(np.corrcoef([rankdata(main[i][sample]) for i in INDICES]), 3).tolist()}

    old = {r['id']: r for r in json.loads((ROOT / 'public/science/model-v0.3/regional30.json').read_text())}
    region_rows = []
    for num, rid in grid['region_ids'].items():
        m = regions[valid] == int(num)
        row = {'id': rid, 'name': grid['region_names'][num], 'assessed_km2': int(m.sum()), 'unassessed_km2': int(((regions == int(num)) & ~valid).sum())}
        for idx in INDICES:
            row[idx] = {'mean': round(float(main[idx][m].mean()), 2), 'median': round(float(np.median(main[idx][m])), 2),
                        'class_share_pct': [round(float(100 * (main_class[idx][m] == k).mean()), 2) for k in range(1, 6)],
                        'high_km2': int((main_class[idx][m] >= 4).sum()), 'mean_stability_pct': round(float(stability[idx][m].mean()), 1), 'v03_mean_30m': old[rid][idx]}
        region_rows.append(row)
    continuity = {idx: round(spearman([r[idx]['mean'] for r in region_rows], [r[idx]['v03_mean_30m'] for r in region_rows]), 3) for idx in INDICES}

    # --- external consistency ------------------------------------------------------------
    def cell_of(lon, lat):
        x, y = to_grid.transform(lon, lat)
        return int((y - gt[5]) / gt[4]), int((x - gt[2]) / gt[0])
    whs = json.loads((ROOT / 'data/tpi-reviewed-resources.json').read_text())
    boot = np.random.default_rng(PARAMS['seed'] + 1)
    unesco = {}
    for label, cats, idxs in [('all_27_components', {'culture', 'nature'}, ['TSI', 'TPI']), ('cultural_20_components', {'culture'}, ['TSI', 'TPI']), ('natural_7_components', {'nature'}, ['ESI', 'TRSI'])]:
        pts = [(cell_of(p['lng'], p['lat']), p['whcId']) for p in whs if p['category'] in cats]
        pts = [(rc, pid) for rc, pid in pts if 0 <= rc[0] < h and 0 <= rc[1] < w and valid[rc]]
        props = sorted({pid for _, pid in pts})
        unesco[label] = {'components_on_assessed_cells': len(pts), 'properties': len(props)}
        for idx in idxs:
            bg = np.sort(main[idx])
            vals = np.array([grids[idx][rc] for rc, _ in pts])
            pid = np.array([p for _, p in pts])
            reps = []
            for _ in range(PARAMS['bootstrap']):  # cluster bootstrap over properties
                pick = boot.choice(props, len(props))
                reps.append(auc(np.concatenate([vals[pid == p] for p in pick]), bg))
            unesco[label][idx] = {'auc': round(auc(vals, bg), 3), 'ci95_property_bootstrap': [round(float(x), 3) for x in np.percentile(reps, [2.5, 97.5])],
                                  'median_at_components': round(float(np.median(vals)), 1), 'median_background': round(float(np.median(bg)), 1),
                                  'components_in_class_4_5_pct': round(float(100 * np.mean(vals > 60)), 1)}

    b = PARAMS['block_km']
    br, bc = rows // b, cols // b
    block = br * 10000 + bc
    ids, inv, cnt = np.unique(block, return_inverse=True, return_counts=True)
    acc = np.zeros(len(ids))
    for lo, la in groups['accommodation']:
        r, c = cell_of(lo, la)
        if 0 <= r < h and 0 <= c < w and valid[r, c]:
            j = np.searchsorted(ids, (r // b) * 10000 + c // b)
            acc[j] += 1
    keep = cnt >= b * b / 4
    accommodation = {'blocks': int(keep.sum()), 'blocks_with_accommodation': int((acc[keep] > 0).sum()), 'records': int(acc[keep].sum())}
    super_block = (ids // 10000 // 4) * 1000 + (ids % 10000) // 4  # 100 km groups for the block bootstrap
    for idx in INDICES:
        mean = np.bincount(inv, weights=main[idx]) / cnt
        rho = spearman(mean[keep], acc[keep])
        groups_ = np.unique(super_block[keep])
        reps = []
        for _ in range(PARAMS['bootstrap']):
            pick = boot.choice(groups_, len(groups_))
            sel = np.concatenate([np.where(keep & (super_block == g))[0] for g in pick])
            reps.append(spearman(mean[sel], acc[sel]))
        accommodation[idx] = {'spearman': round(rho, 3), 'ci95_block_bootstrap': [round(float(x), 3) for x in np.percentile(reps, [2.5, 97.5])],
                              'uses_accommodation_as_input': idx == 'TSI'}

    # --- outputs -------------------------------------------------------------------------
    for idx in INDICES:
        geotiff(out / (idx + '-score.tif'), to_grid2d(main[idx], -9999).astype('float32'), gt, -9999)
        geotiff(out / (idx + '-stability.tif'), to_grid2d(stability[idx], -9999).astype('float32'), gt, -9999)

    # Web Mercator data images: R = score*2, G = class stability %, B = (P95-P5)*2, A = 255 on assessed land.
    merc = Transformer.from_crs(grid['crs'], 3857, always_xy=True)
    xs, ys = merc.transform([grid['bounds'][0], grid['bounds'][2], grid['bounds'][0], grid['bounds'][2]], [grid['bounds'][1], grid['bounds'][1], grid['bounds'][3], grid['bounds'][3]])
    px = 40075016.685578488 / (512 * 2 ** 7)
    x0, x1, y0, y1 = math.floor(min(xs) / px) * px, math.ceil(max(xs) / px) * px, math.floor(min(ys) / px) * px, math.ceil(max(ys) / px) * px
    mw, mh = int(round((x1 - x0) / px)), int(round((y1 - y0) / px))
    MX, MY = np.meshgrid(x0 + (np.arange(mw) + .5) * px, y1 - (np.arange(mh) + .5) * px)
    gx, gy = Transformer.from_crs(3857, grid['crs'], always_xy=True).transform(MX, MY)
    coords = np.array([(gy - gt[5]) / gt[4] - .5, (gx - gt[2]) / gt[0] - .5])
    cover = map_coordinates(valid.astype('float32'), coords, order=1, mode='constant', cval=0)

    def warp(v):
        return map_coordinates(np.nan_to_num(to_grid2d(v)), coords, order=1, mode='constant', cval=0) / np.maximum(cover, 1e-6)
    alpha = np.where(cover >= .5, 255, 0).astype('uint8')
    lon_w, lat_s = Transformer.from_crs(3857, 4326, always_xy=True).transform(x0, y0)
    lon_e, lat_n = Transformer.from_crs(3857, 4326, always_xy=True).transform(x1, y1)
    layers = []
    for idx in INDICES:
        rgba = np.dstack([np.clip(np.round(2 * warp(main[idx])), 0, 200), np.clip(np.round(warp(stability[idx])), 0, 100), np.clip(np.round(2 * warp(spread[idx])), 0, 200), alpha]).astype('uint8')
        rgba[alpha == 0] = 0
        Image.fromarray(rgba, 'RGBA').save(out / (idx + '.png'), optimize=True)
        layers.append({'id': idx, 'imageUrl': f'/science/model-v0.4/{idx}.png', 'width': mw, 'height': mh, 'west': lon_w, 'south': lat_s, 'east': lon_e, 'north': lat_n,
                       'encoding': {'R': 'score*2 (0-200)', 'G': 'class stability % (0-100)', 'B': '(P95-P5)*2 (0-200)', 'A': '255 = assessed land'},
                       'criteria': CRITERIA[idx], 'weights': {n: round(float(x), 4) for n, x in zip(CRITERIA[idx], weights[idx]['combined'])},
                       'statistics': stats[idx], 'monteCarlo': mc[idx], 'scoreUrl': f'/science/model-v0.4/{idx}-score.tif', 'stabilityUrl': f'/science/model-v0.4/{idx}-stability.tif'})

    table = lambda d: {idx: {s: {n: round(float(x), 4) for n, x in zip(CRITERIA[idx], d[idx][s])} for s in ['combined', 'entropy', 'critic', 'equal']} for idx in INDICES}
    results = {
        'version': VERSION, 'status': 'open-data screening; no expert calibration, no field validation', 'independentlyValidated': False,
        'grid': {'crs': grid['crs'], 'resolution_m': grid['resolution'], 'width': w, 'height': h, 'assessed_cells': int(n_cells), 'assessed_km2': int(n_cells)},
        'parameters': PARAMS, 'inventory': inventory, 'reproduction_max_abs_difference_vs_v02': {k: round(v, 6) for k, v in reproduction.items()},
        'criteria_mean': {k: round(float(v.mean()), 4) for k, v in base.items()}, 'criteria_sd': {k: round(float(v.std()), 4) for k, v in base.items()},
        'entropy': {idx: {n: round(float(x), 6) for n, x in zip(CRITERIA[idx], entropy[idx])} for idx in INDICES},
        'weights': table(weights), 'scheme_agreement_with_baseline': scheme_agreement, 'statistics': stats, 'correlation_order': INDICES, 'correlation': corr,
        'monte_carlo': mc, 'regional_rank_continuity_spearman_vs_v03_30m': continuity,
        'external_consistency': {'unesco_world_heritage': unesco, 'accommodation_blocks': accommodation,
                                 'note': 'Presence-background discrimination and rank correlation; neither is an accuracy assessment. UNESCO components are not model inputs but overlap the same places as OSM records.'},
        'inputs_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(inputs.glob('*.tif')) if p.stem in ['Q', 'W', 'F', 'regions']},
    }
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'layers.json').write_text(json.dumps({'version': VERSION, 'resolution_m': 1000, 'classes': ['[0,20]', '(20,40]', '(40,60]', '(60,80]', '(80,100]'], 'layers': layers, 'regions': region_rows}, ensure_ascii=False), encoding='utf-8')
    with (out / 'regional-statistics.csv').open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['region', 'index', 'mean', 'median', 'class1_pct', 'class2_pct', 'class3_pct', 'class4_pct', 'class5_pct', 'high_km2', 'mean_class_stability_pct', 'assessed_km2'])
        for r in region_rows:
            for idx in INDICES:
                wr.writerow([r['name'], idx, r[idx]['mean'], r[idx]['median'], *r[idx]['class_share_pct'], r[idx]['high_km2'], r[idx]['mean_stability_pct'], r['assessed_km2']])
    np.savez_compressed(out / '_arrays.npz', valid=valid, **{idx: grids[idx] for idx in INDICES}, **{idx + '_stab': to_grid2d(stability[idx]) for idx in INDICES}, **{idx + '_spread': to_grid2d(spread[idx]) for idx in INDICES})
    print(json.dumps({k: results[k] for k in ['inventory', 'reproduction_max_abs_difference_vs_v02', 'entropy', 'weights', 'scheme_agreement_with_baseline', 'statistics', 'correlation', 'monte_carlo', 'regional_rank_continuity_spearman_vs_v03_30m', 'external_consistency']}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inputs', default=str(ROOT / 'public/science/model-v0.2/inputs'))
    ap.add_argument('--out', default=str(ROOT / 'public/science/model-v0.4'))
    a = ap.parse_args()
    run(a.inputs, a.out)
