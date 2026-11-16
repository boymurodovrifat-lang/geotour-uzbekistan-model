"""Independent, demand-side test with geotagged Wikimedia Commons photographs.

Geotagged photographs are a common proxy for where visitors go (Wood et al. 2013; van Zanten et al. 2016).
Wikimedia Commons is not a model input. Photos inside Uzbekistan were collected through the Commons API
(list=geosearch over 0.2-degree tiles, subdivided where a tile returned the 500-result maximum) together
with the uploader and the EXIF date taken (DateTimeOriginal) where present; collected 16 November 2026.

Unit of evidence: photo-user-days (PUD), i.e. distinct (photographer, day) pairs per 1 km cell, which limits
the weight of single prolific uploaders. Day = date taken where the EXIF date is readable, else upload date;
where the date taken has month precision only, the month serves as the day key (conservative).

Tests
  1. Cell level: AUC of each index for cells with >= 1 PUD against all assessed cells, with a 95% interval
     from a bootstrap over 100 km groups of 25 km blocks. Two non-tourism baselines are scored the same way:
     proximity to built-up land (WorldCover dominant class 50) and the main-road proximity, so that the
     index can be compared with what settlement or road access alone would predict.
     Because most photographed cells hold a single photo-user-day, the main statistic weights each cell by its
     PUD (the probability that the cell of a random photo-user-day scores higher than a random assessed cell).
     Capture: share of all PUD that falls in the top 1%, 5% and 10% of land ranked by each candidate.
     Within settlements: the PUD-weighted AUC restricted to cells within 2 km of built-up land, i.e. whether
     an index separates the photographed towns from ordinary settlements.
  2. Block level (25 km blocks with >= 25% assessed land): Spearman's rho between the block mean index and
     log(1 + PUD), and the partial rank correlation given the block's built-up share.
  3. Season: months of photo-user-days with a readable date taken against the monthly climate comfort index, at national
     level and for the main heritage cities.
Run: python analysis/validation/commons_photos.py data/commons_photos_uz_2026-11-16.json
Writes public/science/model-v0.4/commons-photo-test.json, analysis/validation/commons_pud_1km.npz and paper/figures/fig_photos.png.
"""
from pathlib import Path
import json, math, re, sys, datetime
import numpy as np
import tifffile
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis/model_v04'))
sys.path.insert(0, str(ROOT / 'analysis/validation'))
from compute import auc  # noqa: E402
from official_stats import partial_rank, perm_p  # noqa: E402

INPUTS = ROOT / 'public/science/model-v0.2/inputs'
INDICES = ['ESI', 'TSI', 'TPI', 'TRSI']
CITIES = {'Samarkand': (39.6547, 66.9758), 'Bukhara': (39.7747, 64.4286), 'Khiva': (41.3783, 60.3639),
          'Tashkent': (41.3111, 69.2797), 'Shakhrisabz': (39.0579, 66.8340)}


def parse_day(dto, upload):
    m = re.search(r'(19[89]\d|20[0-2]\d)[:\-./](\d{2})[:\-./](\d{2})', dto or '')
    if m:
        y, mo, d = map(int, m.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f'{y:04d}-{mo:02d}-{d:02d}', mo, True
    m = re.search(r'(19[89]\d|20[0-2]\d)[:\-./](\d{2})(?!\d)', dto or '')
    if m and 1 <= int(m.group(2)) <= 12:   # month precision only: the month is the "day" key (conservative)
        return f'{m.group(1)}-{m.group(2)}', int(m.group(2)), True
    return upload or '', None, False


def wauc(v, w):
    """PUD-weighted AUC: probability that the cell of a random photo-user-day scores higher than a random cell."""
    srt = np.sort(v); m = w > 0
    lo = np.searchsorted(srt, v[m], side='left'); hi = np.searchsorted(srt, v[m], side='right')
    return float((((lo + hi) / 2) * w[m]).sum() / w[m].sum() / len(srt))


def capture(v, w, frac):
    """Share of PUD in the top `frac` of cells ranked by v; a tie group at the threshold is shared pro rata."""
    n = int(round(frac * len(v))); t = np.sort(v)[::-1][n - 1]
    above = v > t; tie = v == t
    take = (n - above.sum()) / tie.sum()
    return float((w[above].sum() + take * w[tie].sum()) / w.sum())


def main(photo_path):
    raw = json.loads(Path(photo_path).read_text(encoding='utf-8'))
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']
    regions = tifffile.imread(INPUTS / 'regions.tif')
    lc = tifffile.imread(INPUTS / 'landcover.tif')
    arrays = np.load(ROOT / 'public/science/model-v0.4/_arrays.npz')
    valid = arrays['valid'].astype(bool)
    score = {i: arrays[i] for i in INDICES}
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)

    lat = np.array([p[1] for p in raw]); lon = np.array([p[2] for p in raw])
    x, y = to_grid.transform(lon, lat)
    r = ((np.array(y) - gt[5]) / gt[4]).astype(int); c = ((np.array(x) - gt[2]) / gt[0]).astype(int)
    inside = (r >= 0) & (r < h) & (c >= 0) & (c < w)
    inside[inside] &= valid[r[inside], c[inside]]
    pud = {}
    months = np.zeros(12)
    city_months = {k: np.zeros(12) for k in CITIES}
    n_exif = 0
    seen_nat, seen_city = set(), set()
    for k in np.flatnonzero(inside):
        _, la, lo, user, upload, dto = raw[k]
        day, mo, exif = parse_day(dto, upload)
        if not user or not day:
            continue
        cell = (int(r[k]), int(c[k]))
        pud.setdefault(cell, set()).add((user, day))
        if exif:
            n_exif += 1
            if (user, day) not in seen_nat:          # months are counted per photo-user-day, not per photo
                seen_nat.add((user, day)); months[mo - 1] += 1
            for name, (cla, clo) in CITIES.items():
                if abs(la - cla) < 0.09 and abs(lo - clo) < 0.12 and (name, user, day) not in seen_city:
                    seen_city.add((name, user, day)); city_months[name][mo - 1] += 1
    pud_grid = np.zeros((h, w), 'float64')
    for (rr, cc), s in pud.items():
        pud_grid[rr, cc] = len(s)
    photo_cells = (pud_grid > 0) & valid

    # baselines: proximity to built-up land and to main roads (half-distance 5 km)
    built = (lc == 50)
    d_built = distance_transform_edt(~built) * 1.0  # grid units ~ 1 km
    base_built = np.exp2(-d_built / 5)
    roads = json.loads((ROOT / 'public/transport/roads.geojson').read_text())['features']
    road_mask = np.zeros((h, w), bool)
    for f in roads:
        g = f['geometry']
        for line in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
            xs, ys = to_grid.transform([p[0] for p in line], [p[1] for p in line])
            rr = ((np.array(ys) - gt[5]) / gt[4]).astype(int); cc = ((np.array(xs) - gt[2]) / gt[0]).astype(int)
            ok = (rr >= 0) & (rr < h) & (cc >= 0) & (cc < w)
            road_mask[rr[ok], cc[ok]] = True
    base_road = np.exp2(-distance_transform_edt(~road_mask) / 5)
    candidates = {**score, 'built-up proximity': base_built, 'main-road proximity': base_road}

    # block structure for the bootstrap and the block-level test
    b = 25
    rows, cols = np.nonzero(valid)
    blk = (rows // b) * 10000 + cols // b
    sup = (rows // (4 * b)) * 1000 + cols // (4 * b)
    pos = photo_cells[rows, cols]
    rng = np.random.default_rng(20261116)
    groups = np.unique(sup)
    res = {'photos_collected': len(raw), 'photos_inside_assessed_land': int(inside.sum()), 'photos_with_exif_date': n_exif,
           'photo_user_days': int(pud_grid.sum()), 'cells_with_photos': int(photo_cells.sum()),
           'cells_with_photos_pct': round(float(photo_cells.sum() / valid.sum() * 100), 2), 'cell_auc': {}, 'block': {}, 'season': {}}
    wpud = pud_grid[rows, cols]
    near_town = (d_built <= 2)[rows, cols]
    members = {g: np.flatnonzero(sup == g) for g in groups}
    boot = [np.concatenate([members[g] for g in rng.choice(groups, len(groups))]) for _ in range(500)]
    res['cell_auc_pud_weighted'] = {}; res['capture_pct'] = {}; res['within_settlements_pud_weighted_auc'] = {}
    res['settlement_cells'] = int(near_town.sum()); res['settlement_pud_share_pct'] = round(float(wpud[near_town].sum() / wpud.sum() * 100), 1)
    for name, arr in candidates.items():
        v = arr[rows, cols].astype('float64')
        a = auc(v[pos], np.sort(v)); aw = wauc(v, wpud)
        reps, repw = [], []
        for sel in boot:
            vv = v[sel]; pp = pos[sel]
            if pp.any():
                reps.append(auc(vv[pp], np.sort(vv))); repw.append(wauc(vv, wpud[sel]))
        ci = lambda r: [round(float(q), 3) for q in np.percentile(r, [2.5, 97.5])]
        res['cell_auc'][name] = {'auc': round(a, 3), 'ci95': ci(reps)}
        res['cell_auc_pud_weighted'][name] = {'auc': round(aw, 3), 'ci95': ci(repw)}
        res['capture_pct'][name] = {f'top{k}': round(capture(v, wpud, k / 100) * 100, 1) for k in (1, 5, 10)}
        res['within_settlements_pud_weighted_auc'][name] = round(wauc(v[near_town], wpud[near_town]), 3)
    # block level
    ids, inv, cnt = np.unique(blk, return_inverse=True, return_counts=True)
    keep = cnt >= b * b / 4
    pud_b = np.bincount(inv, weights=pud_grid[rows, cols])[keep]
    built_b = (np.bincount(inv, weights=built[rows, cols]) / cnt)[keep]
    yb = np.log1p(pud_b)
    for name in INDICES:
        m = (np.bincount(inv, weights=score[name][rows, cols]) / cnt)[keep]
        res['block'][name] = {'spearman': round(float(spearmanr(m, yb).statistic), 3),
                              'partial_given_built_up_share': round(partial_rank(m, yb, built_b), 3)}
    res['block']['n_blocks'] = int(keep.sum()); res['block']['blocks_with_photos'] = int((pud_b > 0).sum())
    res['block']['built_up_share_vs_photos'] = round(float(spearmanr(built_b, yb).statistic), 3)

    # season
    clim = json.loads((ROOT / 'public/science/climate/summary.json').read_text(encoding='utf-8'))
    cci_nat = np.array([m['mean'] for m in clim['monthly']])
    share = months / max(1, months.sum())
    res['season']['national'] = {'dated_photo_user_days': int(months.sum()), 'pud_month_share_pct': [round(float(x) * 100, 1) for x in share],
                                 'spearman_with_mean_cci': round(float(spearmanr(share, cci_nat).statistic), 3),
                                 'permutation_p': round(perm_p(share, cci_nat, n=20000), 3),
                                 'share_in_months_mean_cci_ge_60_pct': round(float(share[cci_nat >= 60].sum() * 100), 1),
                                 'months_mean_cci_ge_60': [int(i) + 1 for i in np.flatnonzero(cci_nat >= 60)]}
    dest = {d['name']: np.array(d['monthly']) for d in clim['destinations']}
    names = {'Samarkand': 'Samarkand', 'Bukhara': 'Bukhara', 'Khiva': 'Khiva · Itchan Kala', 'Tashkent': 'Tashkent', 'Shakhrisabz': 'Shakhrisabz'}
    for k, cm in city_months.items():
        if cm.sum() >= 30:
            res['season'][k] = {'photo_user_days': int(cm.sum()), 'spearman_with_cci': round(float(spearmanr(cm, dest[names[k]]).statistic), 3), 'permutation_p': round(perm_p(cm, dest[names[k]], n=20000), 3),
                                'top_months': [int(i) + 1 for i in np.argsort(-cm)[:4]]}
    out = ROOT / 'public/science/model-v0.4/commons-photo-test.json'
    out.write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding='utf-8')
    np.savez_compressed(ROOT / 'analysis/validation/commons_pud_1km.npz', pud=pud_grid.astype('float32'))
    figure(res, share, cci_nat, ROOT / 'paper/figures/fig_photos.png')
    return res


def figure(res, share, cci, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9})
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 3.8), constrained_layout=True, gridspec_kw={'width_ratios': [1.1, 1]})
    names = list(res['capture_pct'])
    y = np.arange(len(names))[::-1]
    shades = {'top1': '#0f6b5c', 'top5': '#3d9c8f', 'top10': '#9fd3c7'}
    grey = {'top1': '#5f6b67', 'top5': '#8f9a96', 'top10': '#c9d0cd'}
    for k, (key, lab) in enumerate([('top1', 'Top 1% of land'), ('top5', 'Top 5%'), ('top10', 'Top 10%')]):
        vals = [res['capture_pct'][n][key] for n in names]
        cols = [shades[key] if n in INDICES else grey[key] for n in names]
        a1.barh(y + (1 - k) * 0.26, vals, height=.25, color=cols, label=lab)
        for yy, v in zip(y, vals):
            a1.text(v + .6, yy + (1 - k) * 0.26, f'{v:.0f}', va='center', fontsize=7)
    a1.set_yticks(y, names); a1.set_xlim(0, 62)
    a1.set_xlabel('Share of all photo-user-days falling in the top-ranked land, %')
    a1.legend(frameon=False, fontsize=8, loc='upper right')
    a1.spines[['top', 'right']].set_visible(False)
    m = np.arange(1, 13)
    a2.bar(m, share * 100, color='#3d9c8f', width=.7, label='Photo-user-days (share, %)')
    a2.set_ylabel('Share of dated photo-user-days, %'); a2.set_xticks(m, list('JFMAMJJASOND')); a2.set_ylim(0, 18)
    a3 = a2.twinx(); a3.plot(m, cci, color='#8c510a', lw=2, marker='o', ms=4, label='Mean climate comfort (CCI)')
    a3.set_ylabel('Mean CCI'); a3.set_ylim(0, 128)
    a2.spines[['top']].set_visible(False); a3.spines[['top']].set_visible(False)
    h1, l1 = a2.get_legend_handles_labels(); h2, l2 = a3.get_legend_handles_labels()
    a2.legend(h1 + h2, l1 + l2, frameon=False, loc='upper left', fontsize=8, ncol=2)
    rho = res['season']['national']['spearman_with_mean_cci']
    a2.text(12.4, 16.2, f"Spearman's \u03c1 = {rho:.2f}", ha='right', fontsize=8)
    a1.set_title('(a) Where photographs are taken', loc='left', fontweight='bold')
    a2.set_title('(b) When photographs are taken', loc='left', fontweight='bold')
    fig.savefig(path, dpi=220); plt.close(fig)


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1]), indent=1, ensure_ascii=False))
