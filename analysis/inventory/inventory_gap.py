"""How visible is an official pilgrimage inventory to open data, and what does it change in the national indices?

Evidence
  * Official inventory: public/tourism/religious-sites.json, built from the list of the Committee on Religious
    Affairs (525 records, 505 with a usable coordinate inside the country).
  * OpenStreetMap: religious and commemorative features from the Geofabrik extract of 15 November 2026
    (analysis/inventory/osm_religious_261115.json, written by extract_osm_religious.py).
  * Model input: the OpenStreetMap tourism points of the published model (public/science/model-v0.2/poi-audit.csv,
    records not excluded, groups 'cultural' and 'general').
  * Wikimedia Commons: geotagged photographs collected on 16 November 2026 (data/commons_photos_uz_2026-11-16.json).

Questions
  1. Representation. For each official site: distance to the nearest OSM worship or shrine feature, to any OSM
     religious or commemorative feature, to the nearest model record, to the nearest Commons photograph; and a
     name match (same object in OSM within 2 km, fuzzy match of the name stripped of generic words).
  2. Positional agreement. For name-matched pairs, the distance between the official point and the OSM object.
  3. Consequence for the indices. TSI and TPI at the cells of the official sites, by visibility to the model.
  4. Counterfactual. The baseline TSI and TPI are recomputed with the official sites added to the cultural
     resource family (same kernels, same 300 m merging, baseline weights fixed), and the change in score, class and
     regional ranking is measured. A demand-side check compares both versions with the Commons photo-user-days
     (PUD-weighted AUC, as in analysis/validation/commons_photos.py).
Nothing here is a field check: OSM absence means 'not mapped', not 'does not exist'.
Run: python analysis/inventory/inventory_gap.py
Writes public/science/model-v0.4/inventory-gap.json, analysis/inventory/site_visibility.csv and
analysis/inventory/augmented_1km.npz (baseline and recomputed TSI/TPI grids).
"""
from pathlib import Path
import csv, json, math, re, sys, unicodedata
import numpy as np
import tifffile
from pyproj import Transformer
from scipy.spatial import cKDTree
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis/model_v04'))
from compute import sphere, chord_to_km, geometric, classes, kernel_sum, merge_complexes, spearman, FAMILIES, PARAMS  # noqa: E402

SEED = 20261118
WORSHIP_BUILDING = {'mosque', 'church', 'cathedral', 'chapel', 'synagogue', 'temple', 'shrine', 'mausoleum', 'religious'}
SHRINE_HISTORIC = {'tomb', 'religious', 'shrine', 'mosque', 'church', 'wayside_shrine'}
GENERIC = {
    # Uzbek (Latin), after normalisation
    'masjid', 'masjidi', 'jome', 'jomei', 'juma', 'maqbara', 'maqbarasi', 'ziyoratgoh', 'ziyoratgohi', 'ziyoratgox', 'ziyoratgoxi',
    'majmua', 'majmuasi', 'madrasa', 'madrasasi', 'cherkov', 'cherkovi', 'xonaqo', 'xonaqosi', 'xonaqoh', 'xonaqohi', 'qabriston', 'qabristoni',
    'yodgorlik', 'yodgorligi', 'sobor', 'sobori', 'ibodatxona', 'ibodatxonasi', 'daxma', 'daxmasi', 'dahma', 'dahmasi', 'qadamjo', 'qadamjosi',
    'binosi', 'bino', 'va', 'arxitektura', 'memoriy', 'ansambli', 'ansambl', 'kompleksi', 'kompleks',
    # English
    'mosque', 'mausoleum', 'shrine', 'complex', 'madrasah', 'madrassah', 'madrasa', 'church', 'cathedral', 'cemetery', 'tomb', 'memorial', 'of', 'the',
    'and', 'ensemble', 'necropolis',
    # Russian, transliterated by norm()
    'mechet', 'mecheti', 'mavzolei', 'mavzolej', 'kompleks', 'medrese', 'tserkov', 'tserkovi', 'sobor', 'khram', 'kladbishche', 'pamyatnik',
    'svyatynya', 'ansambl', 'dzhuma', 'dzhame', 'khanaka', 'mazar', 'mazari',
}
CYR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ', ['a', 'b', 'v', 'g', 'd', 'e', 'yo', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's',
                                                         't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'y', '', 'e', 'yu', 'ya', 'o', 'q', 'g', 'h']))


def norm(s):
    """Lower-case Latin text: Cyrillic transliterated, apostrophes and diacritics dropped."""
    s = ''.join(CYR.get(c, c) for c in s.lower())
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[‘’ʻʼ`'´ʹ]", '', s)
    return re.sub(r'[^a-z0-9 ]+', ' ', s)


def skeleton(word):
    """Consonant skeleton that absorbs Uzbek/Russian/English spelling variants (x/kh/h, q/k, j/dzh, w/v)."""
    w = word.replace('dzh', 'j').replace('zh', 'j').replace('kh', 'x').replace('gh', 'g').replace('sh', 'S').replace('ch', 'C').replace('ts', 's')
    w = w.replace('h', 'x').replace('q', 'k').replace('w', 'v')
    w = re.sub(r'[aeiouy]', '', w)
    return re.sub(r'(.)\1+', r'\1', w)


def core(name):
    words = [w for w in norm(name).split() if w not in GENERIC and len(w) > 1]
    return ' '.join(skeleton(w) for w in words if skeleton(w))


def same_name(a, b):
    ca, cb = core(a), core(b)
    if len(ca.replace(' ', '')) < 3 or len(cb.replace(' ', '')) < 3:
        return False
    return fuzz.token_set_ratio(ca, cb) >= 85


def _grid(v, valid):
    a = np.full(valid.shape, np.nan, dtype='float32')
    a[valid] = v
    return a


def km_tree(lon, lat):
    return cKDTree(sphere(np.asarray(lon), np.asarray(lat)))


def nearest_km(tree, lon, lat):
    d, i = tree.query(sphere(np.asarray(lon), np.asarray(lat)), workers=-1)
    return chord_to_km(d), i


def main():
    sites = json.loads((ROOT / 'public/tourism/religious-sites.json').read_text(encoding='utf-8'))['sites']
    lon = np.array([s['lng'] for s in sites])
    lat = np.array([s['lat'] for s in sites])
    osm = json.loads((ROOT / 'analysis/inventory/osm_religious_261115.json').read_text(encoding='utf-8'))
    feats = osm['features']

    def kind(t):
        if t.get('amenity') == 'place_of_worship' or t.get('building') in WORSHIP_BUILDING or t.get('historic') in SHRINE_HISTORIC \
                or t.get('landuse') == 'religious' or ('religion' in t and t.get('landuse') not in ('cemetery',) and t.get('amenity') != 'grave_yard'):
            return 'worship'
        if t.get('landuse') == 'cemetery' or t.get('amenity') == 'grave_yard':
            return 'cemetery'
        return 'heritage'
    kinds = np.array([kind(f['tags']) for f in feats])
    flon = np.array([f['lng'] for f in feats])
    flat = np.array([f['lat'] for f in feats])
    names = [' | '.join(v for k, v in f['tags'].items() if k.startswith('name') or k in ('old_name', 'alt_name')) for f in feats]

    trees = {k: km_tree(flon[kinds == k], flat[kinds == k]) for k in ('worship', 'heritage', 'cemetery')}
    d_osm = {k: nearest_km(trees[k], lon, lat)[0] for k in trees}
    d_wh = np.minimum(d_osm['worship'], d_osm['heritage'])
    d_any = np.minimum(d_wh, d_osm['cemetery'])

    # model input records (cultural and general families) -------------------------------------------
    model = {'cultural': [], 'general': []}
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['excluded']:
                continue
            for g in r['model_groups'].split('|'):
                if g in model:
                    model[g].append((float(r['lng']), float(r['lat'])))
    mpts = np.array(model['cultural'] + model['general'])
    d_model, _ = nearest_km(km_tree(mpts[:, 0], mpts[:, 1]), lon, lat)

    # Commons ------------------------------------------------------------------------------------------
    photos = json.loads((ROOT / 'data/commons_photos_uz_2026-11-16.json').read_text())
    plon = np.array([p[2] for p in photos])
    plat = np.array([p[1] for p in photos])
    d_photo, _ = nearest_km(km_tree(plon, plat), lon, lat)

    # name matching against named OSM objects within 2 km --------------------------------------------
    named = np.array([bool(n) for n in names])
    ntree = km_tree(flon[named], flat[named])
    nidx = np.where(named)[0]
    match = [None] * len(sites)
    for i, s in enumerate(sites):
        cand = ntree.query_ball_point(sphere(np.array([s['lng']]), np.array([s['lat']]))[0], 2 * math.sin(2.0 / (2 * 6371.0088)))
        best = None
        for c in cand:
            j = nidx[c]
            if any(same_name(s['name'], n) for n in names[j].split(' | ')):
                dkm = float(chord_to_km(np.linalg.norm(sphere(np.array([s['lng']]), np.array([s['lat']]))[0] - sphere(np.array([flon[j]]), np.array([flat[j]]))[0])))
                if best is None or dkm < best[1]:
                    best = (j, dkm)
        if best:
            match[i] = {'osm': feats[best[0]]['osm'], 'name': names[best[0]], 'distance_m': round(best[1] * 1000), 'kind': str(kinds[best[0]]),
                        'wikidata': feats[best[0]]['tags'].get('wikidata')}
    matched = np.array([m is not None for m in match])
    offsets = np.array([m['distance_m'] for m in match if m])

    # index values at the sites -------------------------------------------------------------------------
    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)
    xs, ys = to_grid.transform(lon, lat)
    rows = ((np.asarray(ys) - gt[5]) / gt[4]).astype(int)
    cols = ((np.asarray(xs) - gt[2]) / gt[0]).astype(int)
    score = {k: tifffile.imread(ROOT / f'public/science/model-v0.4/{k}-score.tif').astype('float64') for k in ('TSI', 'TPI')}
    inputs = ROOT / 'public/science/model-v0.2/inputs'
    regions = tifffile.imread(inputs / 'regions.tif')
    valid = np.isfinite(score['TSI']) & (score['TSI'] >= 0) & (regions > 0)
    on = valid[rows, cols]

    vis = {
        'osm_worship_250m': d_osm['worship'] <= 0.25, 'osm_worship_or_heritage_250m': d_wh <= 0.25, 'osm_any_incl_cemetery_250m': d_any <= 0.25,
        'osm_worship_or_heritage_500m': d_wh <= 0.5, 'osm_name_match_2km': matched,
        'model_record_500m': d_model <= 0.5, 'model_record_1km': d_model <= 1.0, 'commons_photo_150m': d_photo <= 0.15, 'commons_photo_500m': d_photo <= 0.5,
    }
    pct = lambda m: round(float(100 * np.mean(m)), 1)
    region_names = sorted({s['region'] for s in sites})
    by_region = []
    for r in region_names:
        m = np.array([s['region'] == r for s in sites])
        by_region.append({'region': r, 'sites': int(m.sum()), **{k: pct(v[m]) for k, v in vis.items()}})
    faith_rows = []
    for fth in sorted({s['faith'] for s in sites}):
        m = np.array([s['faith'] == fth for s in sites])
        faith_rows.append({'faith': fth, 'sites': int(m.sum()), **{k: pct(v[m]) for k, v in vis.items() if k in ('osm_worship_or_heritage_250m', 'osm_name_match_2km', 'model_record_500m', 'commons_photo_150m')}})
    # joint visibility
    vm, vo, vc = vis['model_record_500m'], vis['osm_worship_or_heritage_250m'], vis['commons_photo_150m']
    joint = {'none_of_three': pct(~vm & ~vo & ~vc), 'all_three': pct(vm & vo & vc), 'osm_but_not_model': pct(vo & ~vm), 'model_but_not_osm_250m': pct(vm & ~vo),
             'photo_but_not_model': pct(vc & ~vm)}

    # national percentile of the site cells and score by model visibility ----------------------------
    natl = {k: np.sort(score[k][valid]) for k in score}
    site_score = {k: score[k][rows, cols] for k in score}
    def pctile(k, v):
        return 100 * np.searchsorted(natl[k], v, side='right') / len(natl[k])
    at_sites = {}
    for k in score:
        v = site_score[k][on]
        vmod = vm[on]
        at_sites[k] = {'median_all': round(float(np.median(v)), 1), 'median_visible_to_model': round(float(np.median(v[vmod])), 1),
                       'median_not_visible_to_model': round(float(np.median(v[~vmod])), 1),
                       'median_national_percentile_visible': round(float(np.median(pctile(k, v[vmod]))), 1),
                       'median_national_percentile_not_visible': round(float(np.median(pctile(k, v[~vmod]))), 1),
                       'share_low_class_le2_visible_pct': pct(classes(v[vmod]) <= 2), 'share_low_class_le2_not_visible_pct': pct(classes(v[~vmod]) <= 2),
                       'share_high_class_ge4_visible_pct': pct(classes(v[vmod]) >= 4), 'share_high_class_ge4_not_visible_pct': pct(classes(v[~vmod]) >= 4)}

    # counterfactual: official sites added to the cultural family -------------------------------------
    X, Y = np.meshgrid(gt[2] + (np.arange(w) + .5) * gt[0], gt[5] + (np.arange(h) + .5) * gt[4])
    lon2d, lat2d = to_ll.transform(X, Y)
    centres = sphere(lon2d[valid], lat2d[valid])
    groups = {k: [] for k in FAMILIES}
    with (ROOT / 'public/science/model-v0.2/poi-audit.csv').open(encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['excluded']:
                continue
            for g in r['model_groups'].split('|'):
                if g in groups:
                    groups[g].append((float(r['lng']), float(r['lat'])))
    groups = {k: np.array(v) for k, v in groups.items()}
    U = tifffile.imread(inputs / 'U.tif').astype('float64')[valid]
    wts = json.loads((ROOT / 'public/science/model-v0.4/results.json').read_text())['weights']
    wtsi = np.array([wts['TSI']['combined']['A'], wts['TSI']['combined']['U']])
    wtpi = np.array([wts['TPI']['combined'][c] for c in ('A', 'K', 'D')])

    def indices(cultural):
        g = dict(groups, cultural=cultural)
        near = {k: chord_to_km(cKDTree(sphere(v[:, 0], v[:, 1])).query(centres, workers=-1)[0]) for k, v in g.items()}
        dec = lambda k: np.exp2(-near[k] / PARAMS['resource_half_distance_km'])
        A = np.maximum.reduce([dec('natural'), dec('cultural'), dec('general')])
        merged = {k: merge_complexes(g[k], PARAMS['complex_merge_distance_m']) for k in FAMILIES}
        s = np.column_stack([kernel_sum(merged[k], lon2d, lat2d, gt, to_grid, PARAMS['count_kernel_half_distance_km'])[valid] for k in FAMILIES])
        total = s.sum(axis=1)
        K = 1 - np.exp(-total / PARAMS['count_saturation_n'])
        with np.errstate(divide='ignore', invalid='ignore'):
            p = s / total[:, None]
            even = -np.where(p > 0, p * np.log(p), 0).sum(axis=1) / math.log(3)
        D = (1 + 2 * np.where(total > 1e-9, even, 0)) / 3
        return {'TSI': geometric(np.column_stack([A, U]), wtsi), 'TPI': geometric(np.column_stack([A, K, D]), wtpi), 'merged_cultural_sites': int(len(merged['cultural']))}

    base = indices(groups['cultural'])
    # Variant 'all': every mapped official site. Variant 'no_plain_mosques': without the community mosques whose
    # name has no shrine, tomb, complex, madrasa or monument word (a conservative reading of 'tourism resource').
    plain = np.array([bool(re.search(r'masjid', s['name'], re.I)) and not re.search(r'ziyorat|maqbara|majmua|madras|xonaq|qadamjo|yodgor', s['name'], re.I)
                      for s in sites])
    variants = {'all': np.ones(len(sites), bool), 'no_plain_mosques': ~plain}
    augs = {v: indices(np.vstack([groups['cultural'], np.column_stack([lon[m], lat[m]])])) for v, m in variants.items()}
    aug = augs['all']
    reproduction = {k: round(float(np.max(np.abs(base[k] - score[k][valid]))), 4) for k in ('TSI', 'TPI')}
    reg_valid = regions[valid]
    region_ids = {int(n): grid['region_names'][n] for n in grid['region_names']}
    site_cells = np.zeros((h, w), bool)
    site_cells[rows[on], cols[on]] = True
    sc_valid = site_cells[valid]
    counter = {'reproduction_max_abs_difference_vs_published': reproduction, 'plain_mosques_excluded_in_variant': int(plain.sum()),
               'merged_cultural_sites': {'baseline': base['merged_cultural_sites'], **{v: a['merged_cultural_sites'] for v, a in augs.items()}}}
    pud = np.load(ROOT / 'analysis/validation/commons_pud_1km.npz')['pud'][valid].astype('float64')

    def wauc(v, wgt):
        order = np.sort(v)
        lo = np.searchsorted(order, v, side='left')
        hi = np.searchsorted(order, v, side='right')
        r = (lo + hi) / 2 / len(order)
        return float((r * wgt).sum() / wgt.sum())
    mcz = np.load(ROOT / 'public/science/model-v0.4/_arrays.npz')
    stab = {k: mcz[k + '_stab'][valid].astype('float64') for k in ('TSI', 'TPI')}
    spread = {k: mcz[k + '_spread'][valid].astype('float64') for k in ('TSI', 'TPI')}
    np.savez_compressed(ROOT / 'analysis/inventory/augmented_1km.npz', valid=valid,
                        **{f'{k}_base': _grid(base[k], valid) for k in ('TSI', 'TPI')},
                        **{f'{k}_{v}': _grid(augs[v][k], valid) for v in augs for k in ('TSI', 'TPI')})
    rng = np.random.default_rng(SEED)
    block = ((rows_all := np.where(valid)[0]) // 100) * 1000 + np.where(valid)[1] // 100  # 100 km groups for the bootstrap
    ub = np.unique(block)
    for variant, k in [(v, kk) for v in augs for kk in ('TSI', 'TPI')]:
        b, a = base[k], augs[variant][k]
        cb, ca = classes(b), classes(a)
        changed = cb != ca
        regional = []
        for num, nm in sorted(region_ids.items()):
            m = reg_valid == num
            if not m.any():
                continue
            regional.append({'region': nm, 'mean_baseline': round(float(b[m].mean()), 2), 'mean_with_inventory': round(float(a[m].mean()), 2),
                             'cells_class_changed_pct': round(float(100 * changed[m].mean()), 2), 'cells_up_to_high_class': int(((ca >= 4) & (cb < 4) & m).sum())})
        rb = np.argsort(np.argsort([-r['mean_baseline'] for r in regional])) + 1
        ra = np.argsort(np.argsort([-r['mean_with_inventory'] for r in regional])) + 1
        for r, x, y in zip(regional, rb, ra):
            r['rank_baseline'], r['rank_with_inventory'] = int(x), int(y)
        # demand-side check: PUD-weighted AUC, paired bootstrap over 100 km groups
        has = pud > 0
        reps = []
        for _ in range(500):
            pick = rng.choice(ub, len(ub))
            idx = np.concatenate([np.where(block == g)[0] for g in pick])
            reps.append(wauc(a[idx], pud[idx] * (pud[idx] > 0)) - wauc(b[idx], pud[idx] * (pud[idx] > 0)) if (pud[idx] > 0).any() else np.nan)
        reps = np.array(reps)
        counter.setdefault(variant, {})[k] = {
            'cells_class_changed': int(changed.sum()), 'cells_class_changed_pct': round(float(100 * changed.mean()), 2),
            'cells_raised_to_high_class_ge4': int(((ca >= 4) & (cb < 4)).sum()), 'cells_high_class_ge4_baseline': int((cb >= 4).sum()),
            'mean_change_all_cells': round(float((a - b).mean()), 3), 'max_change': round(float((a - b).max()), 1),
            'cells_change_ge10_points': int(((a - b) >= 10).sum()),
            'site_cells_median_baseline': round(float(np.median(b[sc_valid])), 1), 'site_cells_median_with_inventory': round(float(np.median(a[sc_valid])), 1),
            'site_cells_low_class_le2_baseline_pct': round(float(100 * np.mean(cb[sc_valid] <= 2)), 1),
            'site_cells_low_class_le2_with_inventory_pct': round(float(100 * np.mean(ca[sc_valid] <= 2)), 1),
            'regional_rank_spearman_baseline_vs_augmented': round(spearman(rb, ra), 3), 'regions_changing_rank': int((rb != ra).sum()),
            'commons_pud_weighted_auc': {'baseline': round(wauc(b, pud * has), 4), 'with_inventory': round(wauc(a, pud * has), 4),
                                         'difference_ci95_block_bootstrap': [round(float(x), 4) for x in np.nanpercentile(reps, [2.5, 97.5])]},
            # Is the change covered by the published Monte Carlo uncertainty? (stability = % of runs keeping the class;
            # spread = P95 - P5 of the score). A change larger than the whole band width lies outside the band.
            'changed_cells_reported_stable_ge80pct': int((changed & (stab[k] >= 80)).sum()),
            'changed_cells_reported_stable_ge80pct_share_of_changed': round(float(100 * (changed & (stab[k] >= 80)).sum() / max(changed.sum(), 1)), 1),
            'cells_change_exceeds_mc_band_width': int((np.abs(a - b) > spread[k]).sum()),
            'site_cells_change_exceeds_mc_band_width_pct': round(float(100 * np.mean(np.abs(a - b)[sc_valid] > spread[k][sc_valid])), 1),
            'regional': regional,
        }

    # positional agreement of the official coordinates ----------------------------------------------------
    shared = sum(1 for s in sites if s.get('coordinateNote', {}).get('uz', '').startswith('Bu koordinata'))
    result = {
        'version': 'inventory-gap-1', 'date': '2026-11-18', 'osm_extract': osm['source'], 'osm_features': len(feats),
        'osm_features_by_kind': {k: int((kinds == k).sum()) for k in ('worship', 'heritage', 'cemetery')}, 'osm_relations_without_way_points': osm['relationsDropped'],
        'official': {'records': 525, 'mapped': len(sites), 'not_mapped': 525 - len(sites), 'sharing_a_coordinate': shared,
                     'on_assessed_cells': int(on.sum()), 'distinct_cells': int(site_cells.sum())},
        'representation_pct': {k: pct(v) for k, v in vis.items()},
        'joint_pct': joint, 'by_region': by_region, 'by_faith': faith_rows,
        'distance_km_median': {'osm_worship': round(float(np.median(d_osm['worship'])), 3), 'osm_worship_or_heritage': round(float(np.median(d_wh)), 3),
                               'model_record': round(float(np.median(d_model)), 3), 'commons_photo': round(float(np.median(d_photo)), 3)},
        'name_match': {'matched': int(matched.sum()), 'matched_pct': pct(matched), 'offset_m_median': int(np.median(offsets)), 'offset_m_p75': int(np.percentile(offsets, 75)),
                       'offset_m_p90': int(np.percentile(offsets, 90)), 'offset_over_500m': int((offsets > 500).sum()), 'with_wikidata': sum(1 for m in match if m and m['wikidata'])},
        'index_at_sites': at_sites, 'counterfactual': counter,
        'note': 'OSM absence means not mapped, not absent on the ground. Name matching uses a consonant skeleton of the name without generic words '
                '(mosque, mausoleum, shrine ...) and a fuzzy token-set ratio >= 85 within 2 km; see site_visibility.csv for every pair.',
    }
    (ROOT / 'public/science/model-v0.4/inventory-gap.json').write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    with (ROOT / 'analysis/inventory/site_visibility.csv').open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['id', 'name', 'region', 'faith', 'lat', 'lng', 'd_osm_worship_km', 'd_osm_heritage_km', 'd_osm_cemetery_km', 'd_model_km', 'd_commons_km',
                     'osm_match', 'osm_match_name', 'osm_match_m', 'TSI', 'TPI', 'TSI_with_inventory', 'TPI_with_inventory'])
        vidx = np.full((h, w), -1)
        vidx[valid] = np.arange(valid.sum())
        for i, s in enumerate(sites):
            j = vidx[rows[i], cols[i]]
            m = match[i] or {}
            wr.writerow([s['id'], s['name'], s['region'], s['faith'], s['lat'], s['lng'], round(float(d_osm['worship'][i]), 3), round(float(d_osm['heritage'][i]), 3),
                         round(float(d_osm['cemetery'][i]), 3), round(float(d_model[i]), 3), round(float(d_photo[i]), 3), m.get('osm', ''), m.get('name', ''), m.get('distance_m', ''),
                         *(round(float(x), 1) if j >= 0 else '' for x in ((base['TSI'][j], base['TPI'][j], aug['TSI'][j], aug['TPI'][j]) if j >= 0 else (0, 0, 0, 0)))])
    print(json.dumps({k: result[k] for k in ('official', 'representation_pct', 'joint_pct', 'distance_km_median', 'name_match', 'index_at_sites')}, indent=1, ensure_ascii=False))
    print(json.dumps({v: {k: {kk: vv for kk, vv in x.items() if kk != 'regional'} for k, x in counter[v].items()} for v in augs}, indent=1))
    return result


if __name__ == '__main__':
    main()
