"""Demand-side check: regional index scores against official accommodation statistics.

Source: National Statistics Committee of the Republic of Uzbekistan, "Development of tourism and
recreation in Uzbekistan for 2024", release date 12.08.2025,
https://stat.uz/img/news/tourism-and-recreation_p37860.pdf . Values are transcribed from the tables
"Hotels and similar accommodation facilities" and "Specialized accommodation facilities" by region
(persons accommodated, thousand; number of beds). The script checks that the regions sum to the
printed national totals.

Neither table is a model input. OpenStreetMap accommodation points are an input of TSI only, so TSI
is reported but is partly circular. Counts are divided by the assessed land area of each region,
because the index values are area means. Spearman's rho with an exact-enough permutation p-value
(200,000 permutations), n = 14 regions. Because both tourism and mapped resources concentrate where
people live, the partial rank correlation given population density (Statistics Agency, 1 January 2025)
is reported as well.
Run: python analysis/validation/official_stats.py
"""
from pathlib import Path
import json
import numpy as np
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[2]
# region name in grid.json : (hotel guests, hotel beds, specialised guests, specialised beds)  2024
STATS = {
    'Qoraqalpog‘iston': (38.4, 1579, 14.4, 1636), 'Andijon': (76.9, 2456, 19.5, 2171),
    'Buxoro': (267.2, 8423, 13.0, 791), 'Jizzax': (66.3, 1544, 38.5, 1801),
    'Qashqadaryo': (71.3, 2366, 30.1, 7963), 'Navoiy': (48.3, 1978, 16.4, 1231),
    'Namangan': (66.4, 1449, 88.8, 4077), 'Samarqand': (428.4, 13827, 31.7, 2941),
    'Surxondaryo': (91.6, 2464, 31.1, 2103), 'Sirdaryo': (33.8, 731, 1.3, 28),
    'Toshkent viloyati': (150.2, 3928, 312.6, 14508), 'Farg‘ona': (81.2, 5421, 97.4, 4768),
    'Xorazm': (177.2, 4955, 23.9, 2902), 'Toshkent shahri': (1267.1, 28348, 73.8, 6781),
}
TOTALS = (2864.3, 79469, 792.5, 53701)
# Permanent population, thousand people, 1 January 2025 (preliminary). Statistics Agency, demographic
# press release January-December 2024, https://stat.uz/img/demografiya-press-reliz-23_01_2025-eng_p69821.pdf
POP = {'Qoraqalpog‘iston': 2029.7, 'Andijon': 3461.0, 'Buxoro': 2077.0, 'Jizzax': 1537.6, 'Qashqadaryo': 3639.3,
       'Navoiy': 1094.7, 'Namangan': 3131.7, 'Samarqand': 4297.5, 'Surxondaryo': 2945.5, 'Sirdaryo': 930.8,
       'Toshkent viloyati': 3108.5, 'Farg‘ona': 4144.7, 'Xorazm': 2032.4, 'Toshkent shahri': 3112.8}
POP_TOTAL = 37543.2


def perm_p(x, y, n=200000, seed=7):
    rng = np.random.default_rng(seed)
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    obs = abs(np.corrcoef(rx, ry)[0, 1])
    sims = np.array([abs(np.corrcoef(rx, rng.permutation(ry))[0, 1]) for _ in range(n)])
    return float((np.sum(sims >= obs - 1e-12) + 1) / (n + 1))


def partial_rank(x, y, z):
    """Spearman partial correlation of x and y given z (Pearson correlation of rank residuals)."""
    rank = lambda v: np.argsort(np.argsort(v)).astype(float)
    rx, ry, rz = rank(x), rank(y), rank(z)
    res = lambda a: a - np.polyval(np.polyfit(rz, a, 1), rz)
    return float(np.corrcoef(res(rx), res(ry))[0, 1])


def partial_perm_p(x, y, z, n=20000, seed=11):
    rng = np.random.default_rng(seed)
    obs = abs(partial_rank(x, y, z))
    sims = np.array([abs(partial_rank(x, rng.permutation(y), z)) for _ in range(n)])
    return float((np.sum(sims >= obs - 1e-12) + 1) / (n + 1))


def main():
    assert abs(sum(POP.values()) - POP_TOTAL) < 0.15
    for k in range(4):
        s = sum(v[k] for v in STATS.values())
        assert abs(s - TOTALS[k]) < 0.15, (k, s, TOTALS[k])
    regions = {r['name']: r for r in json.loads((ROOT / 'public/science/model-v0.4/layers.json').read_text(encoding='utf-8'))['regions']}
    names = sorted(STATS)
    area = np.array([regions[n]['assessed_km2'] for n in names], float)
    hotel = np.array([STATS[n][0] for n in names]) * 1000 / area      # guests per km2
    spec = np.array([STATS[n][2] for n in names]) * 1000 / area
    popd = np.array([POP[n] for n in names]) * 1000 / area           # people per km2
    out = {'source': 'stat.uz, Development of tourism and recreation in Uzbekistan for 2024 (released 12.08.2025)', 'n_regions': len(names), 'tests': []}
    for idx in ['TPI', 'TSI', 'ESI', 'TRSI']:
        mean = np.array([regions[n][idx]['mean'] for n in names])
        for label, y in [('hotel guests per km2', hotel), ('specialised-accommodation guests per km2', spec)]:
            rho = spearmanr(mean, y).statistic
            out['tests'].append({'index': idx, 'statistic': label, 'spearman': round(float(rho), 3), 'p_permutation': float('%.2g' % perm_p(mean, y)),
                                 'partial_spearman_given_population_density': round(partial_rank(mean, y, popd), 3),
                                 'partial_p_permutation': float('%.2g' % partial_perm_p(mean, y, popd)),
                                 'circular': idx == 'TSI' and label.startswith('hotel')})
    out['population_density_vs'] = {'hotel guests per km2': round(float(spearmanr(popd, hotel).statistic), 3),
                                    'specialised guests per km2': round(float(spearmanr(popd, spec).statistic), 3),
                                    **{idx: round(float(spearmanr(popd, [regions[n][idx]['mean'] for n in names]).statistic), 3) for idx in ['TPI', 'TSI', 'ESI', 'TRSI']}}
    out['table'] = [{'region': n, 'assessed_km2': int(a), 'hotel_guests_per_km2': round(float(h), 2), 'specialised_guests_per_km2': round(float(s), 2), 'population_per_km2': round(float(POP[n] * 1000 / a), 1),
                     **{i: regions[n][i]['mean'] for i in ['ESI', 'TSI', 'TPI', 'TRSI']}} for n, a, h, s in zip(names, area, hotel, spec)]
    (ROOT / 'public/science/model-v0.4/official-stats-check.json').write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf-8')
    return out


if __name__ == '__main__':
    r = main()
    for t in r['tests']:
        print(t)
    print(r['population_density_vs'])
