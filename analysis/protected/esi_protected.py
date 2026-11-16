"""ESI variant with protected areas.

v0.4 builds the natural criterion N from named peaks and viewpoints only. Here N is replaced by
N' = max(N, P), where P = 1 inside an OpenStreetMap protected area (boundary=protected_area,
boundary=national_park or leisure=nature_reserve; Geofabrik extract of 15 November 2026) and decays as
2^(-d/10 km) with the distance d to the nearest protected cell outside it, i.e. with the same
half-distance as the natural resources. Q and the baseline weights are unchanged.

The natural World Heritage components are themselves protected areas, so their AUC under the variant is
partly circular and is reported only for comparison. Two non-circular diagnostics are added: how much of
the protected estate the published ESI places in the high classes, and the regional rank correlation with
guests in specialised (resort, sanatorium, camp) accommodation from the official statistics
(analysis/validation/official_stats.py).
Run: python analysis/protected/esi_protected.py
Writes public/science/model-v0.4/esi-protected-test.json and analysis/protected/protected_1km.tif.
"""
from pathlib import Path
import csv, json, math, sys
import numpy as np
import tifffile
import shapely
from shapely.geometry import shape
from pyproj import Transformer
from scipy.spatial import cKDTree
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis/model_v04'))
sys.path.insert(0, str(ROOT / 'analysis/validation'))
from compute import sphere, chord_to_km, geometric, classes, auc  # noqa: E402
import official_stats  # noqa: E402

INPUTS = ROOT / 'public/science/model-v0.2/inputs'


def main():
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']
    read = lambda n: np.where((a := tifffile.imread(INPUTS / (n + '.tif')).astype('float64')) < -9000, np.nan, a)
    regions = tifffile.imread(INPUTS / 'regions.tif')
    Q, Wc, F = read('Q'), read('W'), read('F')
    valid = (regions > 0) & np.isfinite(Q) & np.isfinite(Wc) & np.isfinite(F)
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)
    X, Y = np.meshgrid(gt[2] + (np.arange(w) + .5) * gt[0], gt[5] + (np.arange(h) + .5) * gt[4])
    lon, lat = to_ll.transform(X, Y)
    lon_v, lat_v = lon[valid], lat[valid]
    centres = sphere(lon_v, lat_v)

    fc = json.loads((ROOT / 'analysis/protected/protected_areas_osm_261115.geojson').read_text(encoding='utf-8'))
    union = shapely.union_all([shape(f['geometry']).buffer(0) for f in fc['features']])
    shapely.prepare(union)
    inside = shapely.contains_xy(union, lon_v, lat_v)
    pa_grid = np.zeros((h, w), 'uint8'); pa_grid[valid] = inside
    tifffile.imwrite(ROOT / 'analysis/protected/protected_1km.tif', pa_grid, compression='zlib')

    d_pa = chord_to_km(cKDTree(centres[inside]).query(centres, workers=-1)[0])
    P = np.exp2(-d_pa / 10)

    natural = []
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if not r['excluded'] and 'natural' in r['model_groups'].split('|'):
                natural.append((float(r['lng']), float(r['lat'])))
    natural = np.array(natural)
    N = np.exp2(-chord_to_km(cKDTree(sphere(natural[:, 0], natural[:, 1])).query(centres, workers=-1)[0]) / 10)
    q = Q[valid]
    layer = {l['id']: l for l in json.loads((ROOT / 'public/science/model-v0.4/layers.json').read_text(encoding='utf-8'))['layers']}['ESI']
    wv = np.array([layer['weights']['N'], layer['weights']['Q']])
    esi = geometric(np.column_stack([N, q]), wv)
    esi_pa = geometric(np.column_stack([np.maximum(N, P), q]), wv)

    # reproduction check against the published ESI raster
    pub = tifffile.imread(ROOT / 'public/science/model-v0.4/ESI-score.tif')[valid]
    repro = float(np.nanmax(np.abs(pub - esi)))

    whs = json.loads((ROOT / 'data/tpi-reviewed-resources.json').read_text())
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    flat = -np.ones((h, w), int); flat[valid] = np.arange(valid.sum())
    pos, pos_in_pa = [], 0
    for p in whs:
        if p['category'] != 'nature':
            continue
        x, y = to_grid.transform(p['lng'], p['lat'])
        r, c = int((y - gt[5]) / gt[4]), int((x - gt[2]) / gt[0])
        if 0 <= r < h and 0 <= c < w and flat[r, c] >= 0:
            pos.append(flat[r, c]); pos_in_pa += int(inside[flat[r, c]])

    reg = regions[valid]
    names = {int(k): v for k, v in grid['region_names'].items()}
    region_mean = {names[k]: (float(esi[reg == k].mean()), float(esi_pa[reg == k].mean())) for k in names}
    spec = {n: official_stats.STATS[n][2] * 1000 / float((reg == k).sum()) for k, n in names.items()}
    popd = {n: official_stats.POP[n] * 1000 / float((reg == k).sum()) for k, n in names.items()}
    order = sorted(spec)
    y = np.array([spec[n] for n in order]); z = np.array([popd[n] for n in order])
    res = {'source': 'OpenStreetMap, Geofabrik extract uzbekistan-261115.osm.pbf (data to 2026-11-15)', 'protected_polygons': len(fc['features']),
           'reproduction_max_abs_diff_vs_published_ESI': round(repro, 4),
           'protected_share_of_assessed_land_pct': round(float(inside.mean() * 100), 1), 'protected_km2': int(inside.sum()),
           'published_ESI_on_protected_land': {'mean': round(float(esi[inside].mean()), 1), 'class_4_5_pct': round(float((esi[inside] > 60).mean() * 100), 1),
                                               'class_1_pct': round(float((esi[inside] <= 20).mean() * 100), 1)},
           'published_ESI_off_protected_land': {'mean': round(float(esi[~inside].mean()), 1), 'class_4_5_pct': round(float((esi[~inside] > 60).mean() * 100), 1)},
           'variant': {'spearman_with_published': round(float(spearmanr(esi[::5], esi_pa[::5]).statistic), 3),
                       'same_class_pct': round(float((classes(esi) == classes(esi_pa)).mean() * 100), 1),
                       'class_4_5_share_pct': [round(float((esi > 60).mean() * 100), 1), round(float((esi_pa > 60).mean() * 100), 1)],
                       'mean': [round(float(esi.mean()), 1), round(float(esi_pa.mean()), 1)]},
           'natural_whs_components': {'n': len(pos), 'inside_protected_areas': pos_in_pa,
                                      'auc': [round(auc(esi[pos], np.sort(esi)), 3), round(auc(esi_pa[pos], np.sort(esi_pa)), 3)],
                                      'median_score': [round(float(np.median(esi[pos])), 1), round(float(np.median(esi_pa[pos])), 1)],
                                      'note': 'circular for the variant: the components lie inside protected areas'},
           'regional_specialised_accommodation': {
               'spearman': [round(float(spearmanr([region_mean[n][0] for n in order], y).statistic), 3), round(float(spearmanr([region_mean[n][1] for n in order], y).statistic), 3)],
               'partial_given_population_density': [round(official_stats.partial_rank(np.array([region_mean[n][0] for n in order]), y, z), 3),
                                                    round(official_stats.partial_rank(np.array([region_mean[n][1] for n in order]), y, z), 3)]},
           'regional_means': {n: [round(a, 1), round(b, 1)] for n, (a, b) in region_mean.items()}}
    (ROOT / 'public/science/model-v0.4/esi-protected-test.json').write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding='utf-8')
    return res


if __name__ == '__main__':
    print(json.dumps(main(), indent=1, ensure_ascii=False))
