# GeoTour Uzbekistan

Open geoportal and screening model for tourism, ecotourism and recreation opportunity in Uzbekistan.

Live portal: https://geotour-uzbekistan.uz

This repository holds the analysis code, the 1 km input rasters, the results and the main source files of the portal, so that every number shown in the portal can be recomputed.

## What the model is

Four indices on a 1 km equal-area grid (EPSG:6933, 438,100 km² of assessed land), computed from open data only:

| Index | Question | Criteria |
|---|---|---|
| ESI | Is a documented natural feature close by, in a natural landscape? | N, Q |
| TSI | Do resources and basic visitor services occur together? | A, U |
| TPI | How many documented resources, of how many kinds, are within reach? | A, K, D |
| TRSI | Does the place suit light outdoor recreation? | W, F, P |

Each index is a weighted geometric mean on a 0–100 scale. Weights lie midway between equal weights and Shannon entropy weights. A 500-run Monte Carlo experiment over weights and distance parameters gives, for every cell, the share of runs that keep the baseline class and the 5th–95th percentile range.

**This is a screening, not a validated assessment.** No expert weighting and no field validation have been done. A high score is not a permission to develop or to visit. The indices do not measure legal access, carrying capacity, biodiversity, service quality, travel time, climate, safety or demand. The method note (Uzbek) is in `public/science/model-v0.4/METHOD_UZ.md`.

## Repository layout

| Path | Content |
|---|---|
| `analysis/model_v04/compute.py` | Criteria, weights, indices, Monte Carlo, external checks, all tables |
| `analysis/model_v04/figures.py`, `figures_context.py` | Figures 1–6 |
| `analysis/build_routes.py` | Route lines on the OpenStreetMap main-road network |
| `analysis/model_v04/sobol.py`, `network_test.py` | Sobol variance decomposition; road-network instead of straight-line distance |
| `analysis/validation/official_stats.py` | Regional check against official accommodation statistics (stat.uz, 2024), controlled for population density |
| `analysis/protected/` | OpenStreetMap protected areas (Geofabrik, 15 Nov 2026) and the ESI sensitivity test |
| `analysis/climate/` | TerraClimate 1991–2020 monthly normals and the monthly climate comfort index ("When to go") |
| `analysis/portal/` | Lossless WebP publishing step, story-map probe values, load-performance measurement |
| `public/science/model-v0.2/` | Grid definition, audited point table and 1 km input rasters |
| `public/science/model-v0.3/regional30.json` | Regional means of the earlier 30 m version, used for comparison |
| `public/science/model-v0.4/` | Results: scores, class stability, data images for the map, `results.json`, regional statistics |
| `public/transport/` | Simplified OpenStreetMap main roads and metadata |
| `data/` | World Heritage reference points, routes and photo credits |
| `paper/figures/` | Figures as used in the manuscript |
| `app/`, `lib/`, `tests/` | Main source files of the portal (React, Leaflet), including the live weather layer (`app/weather.tsx`, data from Open-Meteo), and their tests |

The portal is a Next.js-style application; only its main source files are included here. Generated files, the UI component library and the earlier 30 m tile pyramids are not.

## Reproduce

Python 3.10 or later.

```
pip install -r requirements.txt
python analysis/model_v04/compute.py --inputs public/science/model-v0.2/inputs --out public/science/model-v0.4
python analysis/model_v04/figures_context.py
python analysis/model_v04/figures.py
python analysis/build_routes.py
```

`compute.py` uses a fixed random seed and takes about two minutes. `figures.py` reads `_arrays.npz`, which `compute.py` writes next to the results. SHA-256 hashes of the input rasters are stored in `results.json`.

## Data sources and licences

| Data | Source | Licence |
|---|---|---|
| Points of interest, roads, boundaries | © OpenStreetMap contributors; boundaries via geoBoundaries | ODbL 1.0 |
| Land cover | ESA WorldCover 2021 v200 | CC BY 4.0 |
| Elevation | Copernicus DEM GLO-90 | Copernicus DEM licence, free with attribution |
| World Heritage reference points | UNESCO World Heritage Centre web list | see source |
| Route photographs | Wikimedia Commons, credited per photo in `data/route-photos.json` | per photo |
| Monthly climate normals | TerraClimate (Abatzoglou et al. 2018), 1991–2020 | CC0 1.0 |
| Regional accommodation and population | Statistics Committee / Statistics Agency of Uzbekistan, public releases | public statistics |
| Live weather in the portal | Open-Meteo, requested in the visitor's browser; not stored here | CC BY 4.0 |

The code in this repository is released under the MIT licence (see `LICENSE`). Derived data keep the licences of their sources; files derived from OpenStreetMap remain under ODbL 1.0.

## Known limits

- OpenStreetMap is incomplete: absence of a point is not absence of a resource. The download date of the point extract is not recorded; it is older than the dated Geofabrik snapshot of 27 October 2026 used for roads and services.
- The natural group consists almost entirely of named peaks and viewpoints, so ESI does not recognise remote protected areas.
- Distances are straight-line, not travel time.
- A dominant land-cover class at 1 km hides small features.

## Authors

Farrux Gulmuradov (Samarkand State Technical University; ORCID 0009-0004-7601-9557), Rifat Boymurodov (Samarkand State University named after Sharof Rashidov; ORCID 0000-0002-7459-2710), Ismoil Omonov, Muhriddin Qalandarov, Bekzod Tursunov, Asliddin Po‘latov and Nurali Umarov (Samarkand State Technical University).

Contact: Rifat Boymurodov, boymurodovrifat@gmail.com

## How to cite

Gulmuradov, F.; Boymurodov, R.; Omonov, I.; Qalandarov, M.; Tursunov, B.; Po‘latov, A.; Umarov, N. An open, reproducible geoportal for screening tourism and ecotourism suitability in Uzbekistan. Manuscript under preparation, 2026. Code and data: https://github.com/boymurodovrifat-lang/geotour-uzbekistan-model

## Acknowledgement

Analysis code and documentation were prepared with the help of an AI assistant (Claude, Anthropic) and reviewed by the author.
