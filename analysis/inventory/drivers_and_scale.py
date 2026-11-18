"""Two follow-up tests of the register comparison (inventory_gap.py must have run first).

1. The register as independent validation data, at three scales.
   The published TSI and TPI were computed without the register, so the register sites are an independent
   presence sample. Discrimination is measured as the probability that a site cell scores higher than a
   background cell (ties count one half) against
     (a) national background: all assessed cells farther than 1 km from any site;
     (b) regional background: the same, inside the site's own region;
     (c) local background: cells 2-10 km from the site (and > 1 km from any site);
     (d) local background of the same settlement status: as (c), restricted to cells whose dominant
         land cover is built-up when the site cell is built-up, and not built-up otherwise.
   (c) and (d) are averaged over sites. Intervals: bootstrap over 100 km groups of sites (1,000 replicates).
   Reported for all sites and separately for sites visible / not visible to the model (500 m).

2. What predicts omission? Logistic regressions of visibility to the model (resource record <= 500 m),
   to OpenStreetMap (worship or heritage feature <= 250 m) and to Commons (photograph <= 150 m) on
   the site's setting: distance to built-up land, built-up share within 5 km, distance to a main road,
   distance to the nearest of the four main heritage cities (Tashkent, Samarkand, Bukhara, Khiva),
   location in the Fergana Valley (Andijan, Fergana, Namangan) and site type (shrine or monument vs.
   mosque). Distances enter as log2(km + 0.1), so an odds ratio is the change per doubling of distance.
   Standard errors are clustered by district. A last model adds model visibility to the Commons model:
   if photographs were an independent check, model visibility should not predict them once setting is
   controlled for.
Run: python analysis/inventory/drivers_and_scale.py
Writes public/science/model-v0.4/inventory-drivers-scale.json.
"""
from pathlib import Path
import csv, json, math, re, sys
import numpy as np
import tifffile
from pyproj import Transformer
from scipy.spatial import cKDTree
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis/model_v04'))
from compute import sphere, chord_to_km  # noqa: E402

SEED = 20261119
CITIES = {'Tashkent': (69.2401, 41.2995), 'Samarkand': (66.9750, 39.6542), 'Bukhara': (64.4286, 39.7747), 'Khiva': (60.3631, 41.3783)}
FERGANA = {"Andijon viloyati", "Farg'ona viloyati", "Namangan viloyati"}


def main():
    rows = list(csv.DictReader((ROOT / 'analysis/inventory/site_visibility.csv').open(encoding='utf-8-sig')))
    sites = {s['id']: s for s in json.loads((ROOT / 'public/tourism/religious-sites.json').read_text(encoding='utf-8'))['sites']}
    lon = np.array([float(r['lng']) for r in rows]); lat = np.array([float(r['lat']) for r in rows])
    vis_model = np.array([float(r['d_model_km']) <= 0.5 for r in rows])
    vis_osm = np.array([min(float(r['d_osm_worship_km']), float(r['d_osm_heritage_km'])) <= 0.25 for r in rows])
    vis_photo = np.array([float(r['d_commons_km']) <= 0.15 for r in rows])

    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)
    xs, ys = to_grid.transform(lon, lat)
    r_ = ((np.asarray(ys) - gt[5]) / gt[4]).astype(int); c_ = ((np.asarray(xs) - gt[2]) / gt[0]).astype(int)
    inputs = ROOT / 'public/science/model-v0.2/inputs'
    regions = tifffile.imread(inputs / 'regions.tif')
    lc = tifffile.imread(inputs / 'landcover.tif')
    score = {k: tifffile.imread(ROOT / f'public/science/model-v0.4/{k}-score.tif').astype('float64') for k in ('TSI', 'TPI')}
    valid = np.isfinite(score['TSI']) & (score['TSI'] >= 0) & (regions > 0)
    X, Y = np.meshgrid(gt[2] + (np.arange(w) + .5) * gt[0], gt[5] + (np.arange(h) + .5) * gt[4])
    lon2d, lat2d = to_ll.transform(X, Y)
    vr, vc = np.where(valid)
    cxyz = sphere(lon2d[valid], lat2d[valid])
    ctree = cKDTree(cxyz)
    sxyz = sphere(lon, lat)
    d_site, _ = cKDTree(sxyz).query(cxyz, workers=-1)
    far = chord_to_km(d_site) > 1.0                      # background cells: > 1 km from any site
    built = (lc[valid] == 50)
    reg_valid = regions[valid]
    vidx = np.full((h, w), -1); vidx[valid] = np.arange(valid.sum())
    site_cell = vidx[r_, c_]
    chord = lambda km: 2 * math.sin(km / (2 * 6371.0088))
    group = (r_ // 100) * 1000 + c_ // 100

    # ---------------- 1. scale-dependent discrimination ------------------------------------------
    def frac_below(v, bg):
        bg = np.sort(bg)
        return (np.searchsorted(bg, v, side='left') + np.searchsorted(bg, v, side='right')) / 2 / len(bg)

    ring = [ctree.query_ball_point(sxyz[i], chord(10.0)) for i in range(len(rows))]
    ring = [np.array([j for j in rr if far[j] and chord_to_km(np.linalg.norm(cxyz[j] - sxyz[i])) >= 2.0]) for i, rr in enumerate(ring)]
    out = {}
    for k in ('TSI', 'TPI'):
        sv = score[k][valid]
        v_site = sv[site_cell]
        nat_bg = np.sort(sv[far])
        per = {'national': frac_below(v_site, nat_bg),
               'regional': np.array([frac_below(np.array([v_site[i]]), sv[far & (reg_valid == regions[r_[i], c_[i]])])[0] for i in range(len(rows))]),
               'local_2_10km': np.array([frac_below(np.array([v_site[i]]), sv[ring[i]])[0] if len(ring[i]) else np.nan for i in range(len(rows))]),
               'local_same_settlement_status': np.array([
                   (lambda m: frac_below(np.array([v_site[i]]), sv[m])[0] if len(m) else np.nan)(ring[i][built[ring[i]] == built[site_cell[i]]]) if len(ring[i]) else np.nan
                   for i in range(len(rows))])}
        rng = np.random.default_rng(SEED)
        ug = np.unique(group)
        res = {}
        for subset, m in (('all', np.ones(len(rows), bool)), ('visible_to_model', vis_model), ('not_visible_to_model', ~vis_model)):
            res[subset] = {}
            for scale, p in per.items():
                est = float(np.nanmean(p[m]))
                reps = []
                for _ in range(1000):
                    pick = rng.choice(ug, len(ug))
                    idx = np.concatenate([np.where((group == g) & m)[0] for g in pick])
                    if len(idx):
                        reps.append(np.nanmean(p[idx]))
                res[subset][scale] = {'auc': round(est, 3), 'ci95': [round(float(x), 3) for x in np.percentile(reps, [2.5, 97.5])], 'n_sites': int(m.sum())}
        out[k] = res
    # site cells in built-up land
    built_share_sites = float(np.mean(built[site_cell]))

    # ---------------- 2. drivers of omission -------------------------------------------------------
    bxyz = cxyz[built]
    d_built = chord_to_km(cKDTree(bxyz).query(sxyz, workers=-1)[0])
    share5 = np.array([np.mean(built[ctree.query_ball_point(sxyz[i], chord(5.0))]) for i in range(len(rows))])
    roads = json.loads((ROOT / 'public/transport/roads.geojson').read_text())['features']
    pts = []
    lines = []
    for f in roads:
        gm = f['geometry']
        lines += [gm['coordinates']] if gm['type'] == 'LineString' else (gm['coordinates'] if gm['type'] == 'MultiLineString' else [])
    for c in lines:
        c = np.array(c, dtype=float)
        for a, b in zip(c[:-1], c[1:]):
            n = max(1, int(math.ceil(np.hypot(*(b - a)) / 0.002)))   # about 200 m steps
            t = np.linspace(0, 1, n + 1)[:-1, None]
            pts.append(a + t * (b - a))
        pts.append(c[-1:])
    pts = np.vstack(pts)
    d_road = chord_to_km(cKDTree(sphere(pts[:, 0], pts[:, 1])).query(sxyz, workers=-1)[0])
    cxyz4 = sphere(np.array([v[0] for v in CITIES.values()]), np.array([v[1] for v in CITIES.values()]))
    d_city = chord_to_km(cKDTree(cxyz4).query(sxyz)[0])
    fergana = np.array([r['region'] in FERGANA for r in rows]).astype(float)
    plain = np.array([bool(re.search(r'masjid', r['name'], re.I)) and not re.search(r'ziyorat|maqbara|majmua|madras|xonaq|qadamjo|yodgor', r['name'], re.I) for r in rows])
    church = np.array([r['faith'] != 'islamic' for r in rows])
    district = np.array([(sites[r['id']]['region'] + '|' + (sites[r['id']].get('district') or '')) for r in rows])
    _, cl = np.unique(district, return_inverse=True)
    l2 = lambda d: np.log2(d + 0.1)
    Xd = np.column_stack([l2(d_built), share5 * 10, l2(d_road), l2(d_city), fergana, plain.astype(float)])
    names = ['log2 distance to built-up land', 'built-up share within 5 km (per 10 points)', 'log2 distance to main road',
             'log2 distance to heritage city', 'Fergana Valley', 'plain mosque']
    covs = {'d_built_km_median': round(float(np.median(d_built)), 2), 'built_share_5km_median': round(float(np.median(share5)), 3),
            'd_road_km_median': round(float(np.median(d_road)), 2), 'd_city_km_median': round(float(np.median(d_city)), 1),
            'site_cells_built_up_share': round(built_share_sites, 3), 'districts': int(cl.max() + 1)}

    def logit(y, Xm, nm):
        m = sm.Logit(y.astype(float), sm.add_constant(Xm)).fit(disp=0, cov_type='cluster', cov_kwds={'groups': cl})
        ci = np.asarray(m.conf_int())
        rowsout = {n: {'odds_ratio': round(float(np.exp(m.params[i + 1])), 2), 'ci95': [round(float(np.exp(ci[i + 1, 0])), 2), round(float(np.exp(ci[i + 1, 1])), 2)],
                       'p': float(f'{m.pvalues[i + 1]:.3g}')} for i, n in enumerate(nm)}
        pred = m.predict()
        order = np.argsort(pred)
        ranks = np.empty(len(pred)); ranks[order] = np.arange(1, len(pred) + 1)
        pos = y.astype(bool)
        auc = (ranks[pos].sum() - pos.sum() * (pos.sum() + 1) / 2) / (pos.sum() * (~pos).sum())
        return {'n': int(len(y)), 'visible': int(y.sum()), 'pseudo_r2': round(float(m.prsquared), 3), 'in_sample_auc': round(float(auc), 3), 'coefficients': rowsout}
    models = {'model': logit(vis_model, Xd, names), 'osm': logit(vis_osm, Xd, names), 'commons': logit(vis_photo, Xd, names),
              'commons_given_model': logit(vis_photo, np.column_stack([Xd, vis_model.astype(float)]), names + ['visible to the model'])}
    result = {'version': 'inventory-drivers-scale-1', 'date': '2026-11-18',
              'discrimination': out, 'covariates': covs, 'logit': models,
              'note': 'Discrimination: probability that a register site cell scores above a background cell (ties one half); background cells are > 1 km '
                      'from any register site; local = 2-10 km ring, averaged over sites; 95% intervals from 1,000 bootstrap draws of 100 km site groups. '
                      'Logit: cluster-robust (district) standard errors; distances as log2(km + 0.1).'}
    (ROOT / 'public/science/model-v0.4/inventory-drivers-scale.json').write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(result, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
