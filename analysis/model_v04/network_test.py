"""Does straight-line distance bias the v0.4 indices? A road-network test.

The v0.4 model measures access as the great-circle distance from a 1 km cell to the nearest resource
or service. Here every such distance is replaced by a road distance and the indices are recomputed
with the same baseline weights; the count-based criteria K and D and the landscape criteria Q, W, F
are kept, because they describe what is around a cell rather than how to get there.

Road distance = straight connector from the cell to the nearest vertex of the main-road network +
shortest path along the network + straight connector from the network to the resource
(multi-source Dijkstra from all resources of a group). The network is the portal's main-road layer
(motorway, trunk, primary and their links; OpenStreetMap, Geofabrik snapshot 2026-10-27), with
vertices closer than 120 m joined, largest connected component only. If a cell is closer to the
resource than to any road, the straight distance is kept. Because secondary and local roads are
missing, these road distances are an upper bound on real travel distance; the test therefore shows
the largest change that the straight-line assumption could be hiding.

Run: python analysis/model_v04/network_test.py --inputs public/science/model-v0.2/inputs
Writes public/science/model-v0.4/network-test.json.
"""
from pathlib import Path
import argparse, csv, json, math, sys
import numpy as np
import tifffile
from pyproj import Transformer
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compute import (ROOT, CRITERIA, FAMILIES, INDICES, PARAMS, sphere, chord_to_km, merge_complexes,  # noqa: E402
                     kernel_sum, geometric, classes, auc, spearman)

GROUPS = FAMILIES + ['accommodation', 'information', 'recreation']


def road_graph():
    feats = json.loads((ROOT / 'public/transport/roads.geojson').read_text())['features']
    index, lon, lat, ea, eb = {}, [], [], [], []

    def node(x, y):
        k = (round(x, 5), round(y, 5))
        if k not in index:
            index[k] = len(lon); lon.append(x); lat.append(y)
        return index[k]
    for f in feats:
        g = f['geometry']
        for line in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
            ids = [node(*p[:2]) for p in line]
            for a, b in zip(ids, ids[1:]):
                if a != b:
                    ea.append(a); eb.append(b)
    lon, lat = np.array(lon), np.array(lat)
    xyz = sphere(lon, lat)
    pairs = cKDTree(xyz).query_pairs(2 * math.sin(0.12 / (2 * 6371.0088)), output_type='ndarray')
    ea = np.concatenate([ea, pairs[:, 0]]).astype(int); eb = np.concatenate([eb, pairs[:, 1]]).astype(int)
    w = chord_to_km(np.linalg.norm(xyz[ea] - xyz[eb], axis=1))
    n = len(lon)
    g = coo_matrix((np.concatenate([w, w]), (np.concatenate([ea, eb]), np.concatenate([eb, ea]))), shape=(n, n)).tocsr()
    _, lab = connected_components(g, directed=False)
    keep = np.flatnonzero(lab == np.bincount(lab).argmax())
    sub = g[keep][:, keep]
    return sub, xyz[keep], {'vertices': int(len(keep)), 'edges': int(sub.nnz // 2), 'km': round(float(sub.sum() / 2), 0)}


def network_nearest(graph, vxyz, tree, targets_xyz, cells_xyz, d_euc):
    n = graph.shape[0]
    c_t, v_t = tree.query(targets_xyz, workers=-1)
    c_t = chord_to_km(c_t)
    best = np.full(n, np.inf)
    np.minimum.at(best, v_t, c_t)
    src = np.flatnonzero(np.isfinite(best))
    # super source n -> every snapped vertex with the connector length as edge weight
    g = graph.tocoo()
    rows = np.concatenate([g.row, np.full(len(src), n)]); cols = np.concatenate([g.col, src]); w = np.concatenate([g.data, best[src]])
    big = coo_matrix((w, (rows, cols)), shape=(n + 1, n + 1)).tocsr()
    dist = dijkstra(big, directed=True, indices=n)[:n]
    c_c, v_c = tree.query(cells_xyz, workers=-1)
    c_c = chord_to_km(c_c)
    d_net = c_c + dist[v_c]
    return np.where(d_euc <= c_c, d_euc, np.maximum(d_euc, d_net))


def run(inputs, out):
    inputs = Path(inputs)
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
    centres = sphere(lon2d[valid], lat2d[valid])

    groups = {k: [] for k in GROUPS}
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['excluded']:
                continue
            for g in filter(None, r['model_groups'].split('|')):
                groups[g].append((float(r['lng']), float(r['lat'])))
    groups = {k: np.array(v) for k, v in groups.items()}
    sites = {k: merge_complexes(groups[k], PARAMS['complex_merge_distance_m']) for k in FAMILIES}
    ksum = {k: kernel_sum(sites[k], lon2d, lat2d, gt, to_grid, PARAMS['count_kernel_half_distance_km'])[valid] for k in FAMILIES}

    graph, vxyz, info = road_graph()
    tree = cKDTree(vxyz)
    d_euc = {k: chord_to_km(cKDTree(sphere(v[:, 0], v[:, 1])).query(centres, workers=-1)[0]) for k, v in groups.items()}
    d_net = {k: network_nearest(graph, vxyz, tree, sphere(v[:, 0], v[:, 1]), centres, d_euc[k]) for k, v in groups.items()}
    road_gap = chord_to_km(tree.query(centres, workers=-1)[0])

    def criteria(near):
        dec = lambda k, hd: np.exp2(-near[k] / hd)
        N = dec('natural', 10)
        A = np.maximum.reduce([N, dec('cultural', 10), dec('general', 10)])
        U = (dec('accommodation', 5) + dec('information', 5)) / 2
        P = dec('recreation', 3)
        s = np.column_stack([ksum[k] for k in FAMILIES]); tot = s.sum(1)
        K = 1 - np.exp(-tot / PARAMS['count_saturation_n'])
        with np.errstate(divide='ignore', invalid='ignore'):
            p = s / tot[:, None]
            even = -np.where(p > 0, p * np.log(p), 0).sum(1) / math.log(3)
        D = (1 + 2 * np.where(tot > 1e-9, even, 0)) / 3
        return {'N': N, 'Q': Q[valid].astype('float64'), 'A': A, 'U': U, 'K': K, 'D': D, 'W': W[valid].astype('float64'), 'F': F[valid].astype('float64'), 'P': P}

    layers = {l['id']: l for l in json.loads((ROOT / 'public/science/model-v0.4/layers.json').read_text())['layers']}
    ce, cn = criteria(d_euc), criteria(d_net)
    res = {'network': info, 'cells': int(valid.sum()),
           'cell_to_main_road_km': {'median': round(float(np.median(road_gap)), 1), 'p90': round(float(np.percentile(road_gap, 90)), 1)},
           'detour': {}, 'indices': {}}
    for k in GROUPS:
        far = d_euc[k] > 2
        ratio = d_net[k][far] / d_euc[k][far]
        res['detour'][k] = {'median_ratio': round(float(np.median(ratio)), 2), 'p90_ratio': round(float(np.percentile(ratio, 90)), 2),
                            'median_extra_km': round(float(np.median(d_net[k] - d_euc[k])), 1)}
    whs = json.loads((ROOT / 'data/tpi-reviewed-resources.json').read_text())
    gx, gy = to_grid.transform([p['lng'] for p in whs], [p['lat'] for p in whs])
    rr, cc = ((np.array(gy) - gt[5]) / gt[4]).astype(int), ((np.array(gx) - gt[2]) / gt[0]).astype(int)
    flat = -np.ones((h, w), int); flat[valid] = np.arange(valid.sum())
    whs_idx = [(flat[r, c], p['category']) for r, c, p in zip(rr, cc, whs) if 0 <= r < h and 0 <= c < w and flat[r, c] >= 0]
    for i in INDICES:
        names = CRITERIA[i]
        wv = np.array([layers[i]['weights'][n] for n in names])
        se = geometric(np.column_stack([ce[n] for n in names]), wv)
        sn = geometric(np.column_stack([cn[n] for n in names]), wv)
        cats = {'TSI': {'culture', 'nature'}, 'TPI': {'culture', 'nature'}, 'ESI': {'nature'}, 'TRSI': {'nature'}}[i]
        pos = [j for j, c in whs_idx if c in cats]
        res['indices'][i] = {'spearman': round(spearman(se[::5], sn[::5]), 3), 'same_class_pct': round(float(np.mean(classes(se) == classes(sn)) * 100), 1),
                             'mean_abs_diff': round(float(np.mean(np.abs(se - sn))), 2), 'mean_change': round(float(np.mean(sn - se)), 2),
                             'class_4_5_share_pct': [round(float(np.mean(se > 60) * 100), 1), round(float(np.mean(sn > 60) * 100), 1)],
                             'unesco_auc': [round(auc(se[pos], np.sort(se)), 3), round(auc(sn[pos], np.sort(sn)), 3)], 'unesco_components': len(pos)}
    (Path(out) / 'network-test.json').write_text(json.dumps(res, indent=1))
    return res


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inputs', default=str(ROOT / 'public/science/model-v0.2/inputs'))
    ap.add_argument('--out', default=str(ROOT / 'public/science/model-v0.4'))
    a = ap.parse_args()
    print(json.dumps(run(a.inputs, a.out), indent=1))
