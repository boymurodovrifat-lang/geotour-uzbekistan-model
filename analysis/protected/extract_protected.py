"""Extract protected areas of Uzbekistan from an OpenStreetMap PBF extract (Geofabrik).

Selected: closed ways and multipolygon relations tagged boundary=protected_area, boundary=national_park
or leisure=nature_reserve. Output: GeoJSON (EPSG:4326) with osm id, name, the selection tags and
protect_class. Needs pyosmium.
Run: python analysis/protected/extract_protected.py uzbekistan-YYMMDD.osm.pbf out.geojson
"""
import json, sys
import osmium

KEEP = ('boundary', 'leisure', 'protect_class', 'protection_title', 'name', 'name:en', 'name:uz', 'operator', 'iucn_level')


class Areas(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.wkt = osmium.geom.GeoJSONFactory()
        self.features = []

    def area(self, a):
        t = a.tags
        if not (t.get('boundary') in ('protected_area', 'national_park') or t.get('leisure') == 'nature_reserve'):
            return
        try:
            geom = json.loads(self.wkt.create_multipolygon(a))
        except Exception:
            return
        oid = ('way/' if a.from_way() else 'relation/') + str(a.orig_id())
        props = {k: t.get(k) for k in KEEP if t.get(k) is not None}
        props['osm'] = oid
        self.features.append({'type': 'Feature', 'properties': props, 'geometry': geom})


if __name__ == '__main__':
    h = Areas()
    h.apply_file(sys.argv[1], locations=True, idx='flex_mem')
    json.dump({'type': 'FeatureCollection', 'source': sys.argv[1], 'features': h.features}, open(sys.argv[2], 'w'), ensure_ascii=False)
    print(len(h.features), 'areas')
