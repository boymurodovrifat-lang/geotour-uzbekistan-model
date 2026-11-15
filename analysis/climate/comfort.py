"""Monthly climate comfort for sightseeing tourism in Uzbekistan ("when to go").

Inputs
  analysis/climate/terraclimate_normals_1991_2020.npz   1991-2020 monthly means of TerraClimate
      (Abatzoglou et al. 2018) tmax, tmin (degC), ppt (mm/month), srad (W m-2), ws (m s-1), vap (kPa),
      1/8 degree, produced by reduce_terraclimate.py from yearly NCSS subsets.
  public/science/model-v0.2/inputs/{regions,elevation_m}.tif and grid.json   (1 km EPSG:6933 grid)

Comfort model (a monthly-climate adaptation of the Holiday Climate Index layout, Scott et al. 2016).
The weights follow the HCI:Urban; the rating curves are this study's own simplification and are
tested below.
  TC  thermal comfort from the daytime apparent temperature AT = Tmax + 0.33 e - 0.70 ws - 4.00
      (Steadman 1994, shade form; e vapour pressure in hPa), rated with a piecewise-linear form of the
      HCI thermal scale (TC_T / TC_R below): 1 at 24 degC, 0.5 at 17 and 33.5 degC, 0 at -5 and 39 degC.
  A   aesthetic / sky: srad / Rso, Rso = (0.75 + 2e-5 z) Ra (FAO-56 eqs 21 and 37). 1 at >= 0.75,
      0 at <= 0.35.
  P   precipitation: 1 at <= 15 mm per month, 0 at >= 120 mm.
  W   wind: 1 at <= 4 m s-1, 0 at >= 10 m s-1.
  CCI = 100 TC^0.4 A^0.2 P^0.3 W^0.1  (HCI weights 4:2:3:1, combined by the weighted geometric mean used
      for the suitability indices, so that a freezing or very hot month cannot be rescued by dry sunny
      weather; the additive HCI form is reported as a sensitivity case). Classes <=20, 20-40, 40-60,
      60-80, >80.

Outputs
  public/science/climate/comfort.png    Web Mercator, 12 months stacked vertically (R = score*2, A = 255)
  public/science/climate/climate.json   frame and metadata read by the portal
  public/science/climate/summary.json   statistics, regional and destination calendars, sensitivity
  paper/figures/fig_climate.png
Run: python analysis/climate/comfort.py
"""
from pathlib import Path
import json, math
import numpy as np
import tifffile
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, map_coordinates

ROOT = Path(__file__).resolve().parents[2]
INPUTS = ROOT / 'public/science/model-v0.2/inputs'
OUT = ROOT / 'public/science/climate'
MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])
# Thermal rating: piecewise-linear version of the HCI thermal-comfort scale (Scott et al. 2016, rating/10),
# applied to the daytime apparent temperature instead of the HCI effective temperature.
TC_T = [-5, 3, 9, 12.5, 15.5, 17, 18, 19, 21, 24, 26, 27.5, 29.5, 31.5, 33.5, 35.5, 37.5, 39]
TC_R = [0, .1, .2, .3, .4, .5, .6, .7, .9, 1, .9, .8, .7, .6, .5, .4, .2, 0]
BASE = {'shift': 0.0, 'ppt': (15.0, 120.0), 'sky': (0.35, 0.75), 'wind': (4.0, 10.0),
        'weights': (4, 2, 3, 1), 'aggregation': 'geometric'}
VARIANTS = {
    'thermal scale -2 degC': {**BASE, 'shift': -2.0},
    'thermal scale +2 degC': {**BASE, 'shift': 2.0},
    'precipitation thresholds -30%': {**BASE, 'ppt': (10.5, 84.0)},
    'precipitation thresholds +30%': {**BASE, 'ppt': (19.5, 156.0)},
    'equal weights': {**BASE, 'weights': (1, 1, 1, 1)},
    'arithmetic aggregation (HCI form)': {**BASE, 'aggregation': 'arithmetic'},
}


def ra_mj(lat_deg, doy):
    """Extraterrestrial radiation, MJ m-2 day-1 (FAO-56 eq. 21)."""
    phi = np.radians(lat_deg)
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    d = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(d), -1, 1))
    return 24 * 60 / np.pi * 0.0820 * dr * (ws * np.sin(phi) * np.sin(d) + np.cos(phi) * np.cos(d) * np.sin(ws))


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


def score(c, lat, z, p=BASE):
    """c: dict of (12, n) arrays at the points; lat, z: (n,) arrays. Returns CCI (12, n) and sub-scores."""
    e = c['vap'] * 10
    at = c['tmax'] + 0.33 * e - 0.70 * c['ws'] - 4.00
    tc = np.interp(at, np.array(TC_T) + p['shift'], TC_R)
    rso = (0.75 + 2e-5 * np.maximum(z, 0))[None] * ra_mj(lat[None], MID_DOY[:, None])
    sky = ramp(c['srad'] * 0.0864 / rso, *p['sky'])
    pr = 1 - ramp(c['ppt'], *p['ppt'])
    wi = 1 - ramp(c['ws'], *p['wind'])
    w = np.array(p['weights'], float) / sum(p['weights'])
    if p.get('aggregation', 'geometric') == 'arithmetic':
        cci = 100 * (w[0] * tc + w[1] * sky + w[2] * pr + w[3] * wi)
    else:  # weighted geometric mean, as in the suitability indices: a failing component cannot be offset
        cci = 100 * tc ** w[0] * sky ** w[1] * pr ** w[2] * wi ** w[3]
    return cci, {'TC': tc, 'A': sky, 'P': pr, 'W': wi, 'AT': at}


def classes(s):
    return np.digitize(s, [20, 40, 60, 80], right=True)


def best_months(v):
    top = v.max()
    return [int(i) for i in np.flatnonzero((v > 60) & (v >= top - 12))]


def main():
    nz = np.load(ROOT / 'analysis/climate/terraclimate_normals_1991_2020.npz')
    lat_c, lon_c = nz['lat'], nz['lon']
    if lat_c[0] > lat_c[-1]:
        flip = True
        lat_c = lat_c[::-1]
    else:
        flip = False
    clim = {}
    for v in ['tmax', 'tmin', 'ppt', 'srad', 'ws', 'vap']:
        a = nz[v][:, ::-1] if flip else nz[v]
        # fill sea / lake gaps with the nearest land value so interpolation does not bleed NaN
        miss = ~np.isfinite(a[0])
        if miss.any():
            _, (ii, jj) = distance_transform_edt(miss, return_indices=True)
            a = a[:, ii, jj]
        clim[v] = a
    dlat, dlon = lat_c[1] - lat_c[0], lon_c[1] - lon_c[0]

    def sample(lon, lat):
        rows, cols = (lat - lat_c[0]) / dlat, (lon - lon_c[0]) / dlon
        return {v: np.stack([map_coordinates(a[m], [rows, cols], order=1, mode='nearest') for m in range(12)]) for v, a in clim.items()}

    grid = json.loads((ROOT / 'public/science/model-v0.2/grid.json').read_text())
    gt, h, w = grid['transform'], grid['height'], grid['width']
    regions = tifffile.imread(INPUTS / 'regions.tif')
    elev = tifffile.imread(INPUTS / 'elevation_m.tif').astype('float64')
    elev = np.where(elev < -1000, np.nan, elev)
    land = regions > 0
    to_ll = Transformer.from_crs(grid['crs'], 4326, always_xy=True)

    # ---- 1 km equal-area cells: statistics ----------------------------------------------------
    rr, cc = np.nonzero(land)
    lon1, lat1 = to_ll.transform(gt[2] + (cc + .5) * gt[0], gt[5] + (rr + .5) * gt[4])
    z1 = np.nan_to_num(elev[rr, cc], nan=float(np.nanmedian(elev)))
    c1 = sample(lon1, lat1)
    cci1, sub1 = score(c1, lat1, z1)
    reg1 = regions[rr, cc]
    names = grid['region_names']

    monthly = []
    for m in range(12):
        k = classes(cci1[m])
        monthly.append({'month': m + 1, 'mean': round(float(cci1[m].mean()), 1),
                        'share_good_or_better_pct': round(float((cci1[m] > 60).mean() * 100), 1),
                        'share_very_good_pct': round(float((cci1[m] > 80).mean() * 100), 1),
                        'class_share_pct': {str(i + 1): round(float((k == i).mean() * 100), 1) for i in range(5)}})
    limiting = {}
    for m in range(12):
        lg = lambda x: -np.log(np.maximum(x, 1e-6))  # loss in log space = contribution to the geometric mean
        tc_loss = .4 * lg(sub1['TC'][m]); a_loss = .2 * lg(sub1['A'][m]); p_loss = .3 * lg(sub1['P'][m]); w_loss = .1 * lg(sub1['W'][m])
        lim = np.argmax(np.stack([tc_loss, a_loss, p_loss, w_loss]), axis=0)
        limiting[m + 1] = {n: round(float((lim == i).mean() * 100), 1) for i, n in enumerate(['thermal', 'sky', 'precipitation', 'wind'])}
    good_months = (cci1 > 60).sum(axis=0)

    region_rows = []
    for num, name in names.items():
        sel = reg1 == int(num)
        if not sel.any():
            continue
        v = cci1[:, sel].mean(axis=1)
        region_rows.append({'id': grid['region_ids'][num], 'name': name, 'monthly': [round(float(x), 1) for x in v],
                            'best_months': [i + 1 for i in best_months(v)],
                            'good_months_median': int(np.median(good_months[sel]))})

    dests = json.loads((ROOT / 'data/tourism-destinations.json').read_text(encoding='utf-8'))
    pts = [(d['id'], d['name']['en'], d['lng'], d['lat']) for d in dests]
    to_grid = Transformer.from_crs(4326, grid['crs'], always_xy=True)
    plon = np.array([p[2] for p in pts]); plat = np.array([p[3] for p in pts])
    gx, gy = to_grid.transform(plon, plat)
    pr_, pc_ = ((gy - gt[5]) / gt[4]).astype(int), ((gx - gt[2]) / gt[0]).astype(int)
    pz = np.nan_to_num(elev[np.clip(pr_, 0, h - 1), np.clip(pc_, 0, w - 1)], nan=0)
    cp = sample(plon, plat)
    ccp, subp = score(cp, plat, pz)
    dest_rows = [{'id': p[0], 'name': p[1], 'monthly': [round(float(x), 1) for x in ccp[:, i]],
                  'apparent_tmax_c': [round(float(x), 1) for x in subp['AT'][:, i]],
                  'ppt_mm': [round(float(x), 1) for x in cp['ppt'][:, i]],
                  'best_months': [m + 1 for m in best_months(ccp[:, i])]} for i, p in enumerate(pts)]

    # ---- sensitivity ---------------------------------------------------------------------------
    base_cls = classes(cci1)
    base_best_d = [set(best_months(ccp[:, i])) for i in range(len(pts))]
    sens = {}
    for name, p in VARIANTS.items():
        s, _ = score(c1, lat1, z1, p)
        sp, _ = score(cp, plat, pz, p)
        jac = []
        for i in range(len(pts)):
            a, b = base_best_d[i], set(best_months(sp[:, i]))
            jac.append(len(a & b) / max(1, len(a | b)))
        sens[name] = {'mean_abs_diff': round(float(np.abs(s - cci1).mean()), 2),
                      'same_class_pct': round(float((classes(s) == base_cls).mean() * 100), 1),
                      'peak_month_same_pct': round(float((s.argmax(0) == cci1.argmax(0)).mean() * 100), 1),
                      'destination_best_months_jaccard_mean': round(float(np.mean(jac)), 2)}

    # ---- Web Mercator image ------------------------------------------------------------------------
    merc = Transformer.from_crs(grid['crs'], 3857, always_xy=True)
    b = grid['bounds']
    xs, ys = merc.transform([b[0], b[2], b[0], b[2]], [b[1], b[1], b[3], b[3]])
    px = 40075016.685578488 / (512 * 2 ** 5)  # ~2.4 km at the equator, ~1.8 km over Uzbekistan
    x0, x1, y0, y1 = math.floor(min(xs) / px) * px, math.ceil(max(xs) / px) * px, math.floor(min(ys) / px) * px, math.ceil(max(ys) / px) * px
    mw, mh = int(round((x1 - x0) / px)), int(round((y1 - y0) / px))
    MX, MY = np.meshgrid(x0 + (np.arange(mw) + .5) * px, y1 - (np.arange(mh) + .5) * px)
    gx2, gy2 = Transformer.from_crs(3857, grid['crs'], always_xy=True).transform(MX, MY)
    coords = np.array([(gy2 - gt[5]) / gt[4] - .5, (gx2 - gt[2]) / gt[0] - .5])
    cover = map_coordinates(land.astype('float32'), coords, order=1, mode='constant', cval=0)
    zf = np.where(np.isfinite(elev), elev, 0)
    zm = map_coordinates(zf, coords, order=1, mode='nearest')
    mlon, mlat = Transformer.from_crs(3857, 4326, always_xy=True).transform(MX, MY)
    inside = cover >= .5
    cm = sample(mlon[inside], mlat[inside])
    ccm, _ = score(cm, mlat[inside], zm[inside])
    stack = np.zeros((12 * mh, mw, 4), 'uint8')
    for m in range(12):
        tile = np.zeros((mh, mw, 4), 'uint8')
        tile[inside, 0] = np.clip(np.round(ccm[m] * 2), 0, 200)
        tile[inside, 3] = 255
        stack[m * mh:(m + 1) * mh] = tile
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(stack, 'RGBA').save(OUT / 'comfort.png', optimize=True)
    lon_w, lat_s = Transformer.from_crs(3857, 4326, always_xy=True).transform(x0, y0)
    lon_e, lat_n = Transformer.from_crs(3857, 4326, always_xy=True).transform(x1, y1)
    frame = {'width': mw, 'height': mh, 'west': lon_w, 'south': lat_s, 'east': lon_e, 'north': lat_n}
    meta = {'version': 'climate-comfort-0.1', 'image': '/science/climate/comfort.png', 'frame': frame, 'months': 12,
            'encoding': {'R': 'comfort score*2 (0-200)', 'A': '255 inside Uzbekistan', 'layout': 'months stacked vertically, January on top'},
            'source': 'TerraClimate 1991-2020 monthly normals (Abatzoglou et al. 2018), 1/8 degree subset; elevation from the model-v0.2 inputs',
            'method': 'CCI = 100 TC^0.4 A^0.2 P^0.3 W^0.1 (weighted geometric mean, HCI weights); see analysis/climate/comfort.py and summary.json'}
    (OUT / 'climate.json').write_text(json.dumps(meta, indent=1))
    summary = {'method': {k: list(v) if isinstance(v, tuple) else v for k, v in BASE.items()},
               'cells_1km': int(land.sum()), 'monthly': monthly, 'limiting_factor_pct': limiting,
               'good_months_per_cell': {'median': int(np.median(good_months)), 'p10': int(np.percentile(good_months, 10)), 'p90': int(np.percentile(good_months, 90)),
                                        'share_with_at_least_4_pct': round(float((good_months >= 4).mean() * 100), 1)},
               'regions': region_rows, 'destinations': dest_rows, 'sensitivity': sens}
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=1, ensure_ascii=False))
    figure(stack, mh, summary, ROOT / 'paper/figures/fig_climate.png')
    return summary


RAMP = ['#8c510a', '#c7893f', '#e6d3a3', '#9fd2c4', '#3d9c8f', '#0f6b5c']


def figure(stack, mh, summary, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 8.5})
    cmap = LinearSegmentedColormap.from_list('cci', RAMP)
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    fig = plt.figure(figsize=(11, 8.6), constrained_layout=True)
    gs = fig.add_gridspec(4, 4, height_ratios=[1, 1, 1, 1.25])
    for m in range(12):
        ax = fig.add_subplot(gs[m // 4, m % 4])
        t = stack[m * mh:(m + 1) * mh]
        v = np.where(t[..., 3] > 0, t[..., 0] / 2, np.nan)
        im = ax.imshow(v, cmap=cmap, vmin=0, vmax=100, interpolation='nearest')
        good = summary['monthly'][m]['share_good_or_better_pct']
        ax.set_title(f'{months[m]}  ·  {good:.0f}% good or better', loc='left', fontsize=8.5)
        ax.set_axis_off()
    cb = fig.colorbar(im, ax=fig.axes, orientation='vertical', shrink=.55, pad=.01)
    cb.set_label('Climate comfort index (0–100)')
    ax = fig.add_subplot(gs[3, :])
    rows = summary['regions']
    data = np.array([r['monthly'] for r in rows])
    order = np.argsort(-data.mean(1))
    ax.imshow(data[order], cmap=cmap, vmin=0, vmax=100, aspect='auto')
    ax.set_yticks(range(len(rows)), [rows[i]['name'] for i in order], fontsize=7.5)
    ax.set_xticks(range(12), months)
    for (i, j), val in np.ndenumerate(data[order]):
        ax.text(j, i, f'{val:.0f}', ha='center', va='center', fontsize=6.5, color='white' if val > 75 or val < 18 else '#1a1a1a')
    ax.set_title('Regional mean comfort by month', loc='left', fontweight='bold')
    for s in ax.spines.values():
        s.set_visible(False)
    fig.savefig(path, dpi=220)
    plt.close(fig)


if __name__ == '__main__':
    s = main()
    print(json.dumps({'monthly': [(r['month'], r['mean'], r['share_good_or_better_pct']) for r in s['monthly']],
                      'good_months': s['good_months_per_cell'], 'sens': s['sensitivity'],
                      'dest': [(d['name'], d['best_months']) for d in s['destinations']]}, indent=0, ensure_ascii=False))
