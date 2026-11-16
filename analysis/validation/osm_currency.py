"""How current is the model's OpenStreetMap point extract?

The point extract used by the model (data/tourism-poi.json, 8,598 records) carries no download date. This
script compares it object by object with a dated Geofabrik extract (uzbekistan-261115.osm.pbf, data to
2026-11-15): which records still exist with the same type tag, and how many objects of the same types exist
now but are missing from the model extract. Points outside the model domain are ignored by both sides
(country bounding box test followed by the model's own exclusion list in poi-audit.csv).
Run: python analysis/validation/osm_currency.py PBF data/tourism-poi.json public/science/model-v0.2/poi-audit.csv OUT.json
Needs pyosmium.
"""
import csv, json, sys, collections
import osmium

TYPE_KEYS = ('tourism', 'historic', 'natural', 'leisure')


class Collect(osmium.SimpleHandler):
    def __init__(self, types):
        super().__init__()
        self.types = types
        self.found = {}

    def _take(self, kind, o):
        t = o.tags
        for k in TYPE_KEYS:
            v = t.get(k)
            if v in self.types:
                self.found[f'{kind}-{o.id}'] = (v, t.get('name') is not None, max(o.timestamp.year, 0) if o.timestamp else 0)
                return

    def node(self, n): self._take('node', n)
    def way(self, w): self._take('way', w)
    def relation(self, r): self._take('relation', r)


def main(pbf, poi_path, audit_path, out):
    poi = json.load(open(poi_path, encoding='utf-8'))
    model = {p['id']: p['type'] for p in poi}
    used = set()
    with open(audit_path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if not r['excluded'] and r['model_groups']:
                used.add(r['id'])
    types = set(model.values())
    h = Collect(types)
    h.apply_file(pbf)
    now = h.found
    same = [i for i, t in model.items() if i in now and now[i][0] == t]
    changed = [i for i, t in model.items() if i in now and now[i][0] != t]
    gone = [i for i in model if i not in now]
    used_same = [i for i in used if i in now and now[i][0] == model[i]]
    named_now = {i: v for i, v in now.items() if v[1]}
    new_named = [i for i in named_now if i not in model]
    by_type_new = collections.Counter(named_now[i][0] for i in new_named)
    by_type_model = collections.Counter(t for i, t in model.items())
    newest_edit = collections.Counter(now[i][2] for i in new_named)
    res = {'pbf': pbf, 'model_records': len(model), 'model_records_used_by_indices': len(used),
           'still_present_same_type': len(same), 'present_type_changed': len(changed), 'no_longer_present': len(gone),
           'used_records_still_present_pct': round(100 * len(used_same) / max(1, len(used)), 1),
           'named_objects_of_model_types_now': len(named_now), 'named_now_not_in_model': len(new_named),
           'new_named_by_type_top': by_type_new.most_common(15),
           'model_by_type_top': by_type_model.most_common(15),
           'new_named_by_last_edit_year': sorted(newest_edit.items())}
    json.dump(res, open(out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(res, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:5])
