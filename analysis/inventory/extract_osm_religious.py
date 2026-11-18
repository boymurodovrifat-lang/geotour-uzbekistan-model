"""Extract religious and commemorative features of Uzbekistan from an OpenStreetMap PBF extract.

Kept: every node, way and relation with at least one of
  amenity=place_of_worship | amenity=grave_yard | landuse=cemetery | religion=*
  building in {mosque, church, cathedral, chapel, synagogue, temple, shrine, mausoleum, religious}
  historic in {tomb, memorial, monument, archaeological_site, ruins, building, castle, fort, city_gate,
               religious, shrine, mosque, church}
For ways the point is the mean of the node locations; for relations the mean of the member-way points
already seen (relations without such members are dropped and counted). Only the tags needed for the
inventory comparison are written.
Run: python analysis/inventory/extract_osm_religious.py uzbekistan-261115.osm.pbf OUT.json
Needs pyosmium.
"""
import json, sys
import osmium

BUILDING = {'mosque', 'church', 'cathedral', 'chapel', 'synagogue', 'temple', 'shrine', 'mausoleum', 'religious'}
HISTORIC = {'tomb', 'memorial', 'monument', 'archaeological_site', 'ruins', 'building', 'castle', 'fort', 'city_gate',
            'religious', 'shrine', 'mosque', 'church'}
KEEP = ('name', 'name:uz', 'name:ru', 'name:en', 'name:uz-Cyrl', 'old_name', 'alt_name', 'amenity', 'religion', 'denomination',
        'building', 'historic', 'tomb', 'landuse', 'tourism', 'heritage', 'wikidata', 'wikipedia')


def wanted(t):
    return (t.get('amenity') in ('place_of_worship', 'grave_yard') or t.get('landuse') == 'cemetery' or 'religion' in t
            or t.get('building') in BUILDING or t.get('historic') in HISTORIC)


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.out, self.way_pt, self.dropped = [], {}, 0

    def rec(self, kind, o, lat, lon):
        tags = {k: o.tags.get(k) for k in KEEP if o.tags.get(k)}
        self.out.append({'osm': f'{kind}/{o.id}', 'lat': round(lat, 6), 'lng': round(lon, 6), 'tags': tags})

    def node(self, n):
        if wanted(n.tags) and n.location.valid():
            self.rec('node', n, n.location.lat, n.location.lon)

    def way(self, w):
        ok = wanted(w.tags)
        if not ok and len(w.tags):  # untagged ways are kept because they can be multipolygon members
            return
        pts = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
        if not pts:
            return
        lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        self.way_pt[w.id] = (lat, lon)
        if ok:
            self.rec('way', w, lat, lon)

    def relation(self, r):
        if not wanted(r.tags):
            return
        pts = [self.way_pt[m.ref] for m in r.members if m.type == 'w' and m.ref in self.way_pt]
        if not pts:
            self.dropped += 1
            return
        self.rec('relation', r, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


if __name__ == '__main__':
    h = H()
    h.apply_file(sys.argv[1], locations=True, idx='flex_mem')
    json.dump({'source': sys.argv[1].split('/')[-1], 'features': h.out, 'relationsDropped': h.dropped},
              open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(len(h.out), 'features;', h.dropped, 'relations without way members')
