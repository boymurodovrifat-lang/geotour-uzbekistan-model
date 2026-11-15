# Portal publishing and performance

- `publish_assets.py` writes lossless WebP copies of the index and climate images (pixel values identical to the PNGs, checked by the script) and `public/science/story-probes.json`, the index values at the story-map reference points.
- `perf.cjs` measures load performance of a production build with Playwright under two emulated network profiles (cold cache, five runs). Third-party tiles, photos and weather requests are answered locally with `blank-tile.png`. Results: `public/science/portal-performance.json`.

Run after the models: `python analysis/portal/publish_assets.py`, then `node analysis/portal/perf.cjs http://127.0.0.1:8787 5`.
