"""Build public/tourism/religious-sites.json and the photos in public/tourism/religious/ from the
Excel list of the Committee on Religious Affairs ("diniy turizm obektlari", 13 sheets, one per region).

What the script does
  1. Reads every sheet: name, address, coordinates, description; section rows ("Islomiy qadamjolar",
     "Xristian cherkovlari", district names) set the faith and district of the rows below them.
  2. Parses coordinates written as decimal degrees, as degrees-minutes-seconds with N/E or with
     Cyrillic-style C/B or S/V letters (all meaning north/east), with decimal commas.
  3. Keeps a point only if the coordinate parses and lies inside Uzbekistan; rows whose coordinate is
     missing, malformed or copied from another region are listed in the source note, not mapped.
  4. Exports the images embedded in each row as WebP (longest side <= 1280 px), drops the images listed
     in analysis/tourism/religious_photo_review.json (map and satellite screenshots, web-page captures)
     and adds the Wikimedia Commons photographs accepted there, each with author and licence.
Run: python analysis/tourism/build_religious_sites.py PATH/TO/diniy_turizm_obektlari.xlsx
     (needs openpyxl, pillow, shapely). Commons metadata (thumb URL, author, licence) is read from the
     API copy in analysis/tourism/religious_commons_meta.json, which the review step wrote.
"""
from pathlib import Path
import collections, io, json, re, sys
import openpyxl
from PIL import Image
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'O‘zbekiston Respublikasi Din ishlari bo‘yicha qo‘mitasi'
REGION = {'toshkent': 'Toshkent viloyati', 'qoraqalpoqg`iston': "Qoraqalpog'iston Respublikasi", 'qashqadaryo': 'Qashqadaryo viloyati',
          'navoiy': 'Navoiy viloyati', 'namangan': 'Namangan viloyati', 'xorazm': 'Xorazm viloyati', 'farg`ona': "Farg'ona viloyati",
          'toshkent shahri': 'Toshkent shahri', 'surxandaryo': 'Surxondaryo viloyati', 'sirdaryo': 'Sirdaryo viloyati',
          'samarqand': 'Samarqand viloyati', 'andijon': 'Andijon viloyati', 'buxoro': 'Buxoro viloyati'}
CODE = {'Toshkent viloyati': 'tv', 'Toshkent shahri': 'ts', "Qoraqalpog'iston Respublikasi": 'qr', 'Qashqadaryo viloyati': 'qa',
        'Navoiy viloyati': 'nv', 'Namangan viloyati': 'nm', 'Xorazm viloyati': 'xr', "Farg'ona viloyati": 'fr',
        'Surxondaryo viloyati': 'sx', 'Sirdaryo viloyati': 'sr', 'Samarqand viloyati': 'sm', 'Andijon viloyati': 'an', 'Buxoro viloyati': 'bx'}
COPIED = {'rel-an-056', 'rel-an-057'}  # Andijan rows carrying coordinates of Bukhara shrines (copy error in the list)
BORDER = {'rel-sm-025', 'rel-sm-038', 'rel-sm-055', 'rel-bx-013'}  # points falling just inside a neighbouring region
# Region names (as in data/region-boundaries.json) for the English and Russian coordinate notes.
REGION_EN = {'Andijon': 'Andijan', 'Namangan': 'Namangan', 'Farg‘ona': 'Fergana', 'Qoraqalpog‘iston': 'Karakalpakstan', 'Xorazm': 'Khorezm',
             'Navoiy': 'Navoi', 'Surxondaryo': 'Surkhandarya', 'Samarqand': 'Samarkand', 'Toshkent viloyati': 'Tashkent', 'Sirdaryo': 'Syrdarya',
             'Jizzax': 'Jizzakh', 'Buxoro': 'Bukhara', 'Qashqadaryo': 'Kashkadarya', 'Toshkent shahri': 'Tashkent city'}
REGION_RU = {'Andijon': 'Андижанскую', 'Namangan': 'Наманганскую', 'Farg‘ona': 'Ферганскую', 'Qoraqalpog‘iston': 'Каракалпакскую', 'Xorazm': 'Хорезмскую',
             'Navoiy': 'Навоийскую', 'Surxondaryo': 'Сурхандарьинскую', 'Samarqand': 'Самаркандскую', 'Toshkent viloyati': 'Ташкентскую',
             'Sirdaryo': 'Сырдарьинскую', 'Jizzax': 'Джизакскую', 'Buxoro': 'Бухарскую', 'Qashqadaryo': 'Кашкадарьинскую', 'Toshkent shahri': 'Ташкентскую'}


def localize(rec, translations):
    """Add English and Russian versions from analysis/tourism/site_translations.json.

    The translations were made from the Uzbek text of each record (name, the address joined with district
    and region, description) and only translate it; nothing is added. `name` stays the Uzbek string and
    `name:en` / `name:ru` sit next to it; `addressText` and `description` become {uz, en, ru}.
    """
    tr = translations.get(rec['id'])
    uz_addr = ', '.join(v for v in (rec.get('address'), rec.get('district'), rec.get('region')) if v)
    if not tr:
        rec['addressText'] = {'uz': uz_addr}
        rec['description'] = {'uz': rec.get('description', '')}
        return
    rec['name:en'], rec['name:ru'] = tr['n']
    rec['addressText'] = {'uz': uz_addr, 'en': tr['a'][0], 'ru': tr['a'][1]}
    desc = rec.get('description', '')
    rec['description'] = {'uz': desc, 'en': tr['d'][0], 'ru': tr['d'][1]} if desc.strip(' -') else {'uz': desc}


def norm(s):
    return re.sub(r'\s+', ' ', str(s).replace('\xa0', ' ')).strip() if s is not None else ''


def parse_coord(s):
    t = norm(s)
    if not t:
        return None
    for a, b in (('’', "'"), ('′', "'"), ('‘', "'"), ('″', '"'), ("''", '"'), ('”', '"'), ('“', '"')):
        t = t.replace(a, b)
    t = re.sub(r'(\d),(\d+)\s*"', r'\1.\2"', t)
    vals = [float(m.group(1)) + float(m.group(2)) / 60 + float(m.group(3) or 0) / 3600
            for m in re.finditer(r'(\d{2,3})\s*°\s*(\d{1,2})\s*\'\s*(?:(\d{1,2}(?:\.\d+)?)\s*"?)?', t)]
    if len(vals) < 2:
        vals = [float(x) for x in re.findall(r'(?<![\d.])(\d{2}\.\d{3,})', t)]
    if len(vals) < 2:
        return None
    a, b = vals[:2]
    if 55 < a < 74 and 36 < b < 46:
        a, b = b, a
    return (round(a, 6), round(b, 6)) if 36.5 < a < 46 and 55.5 < b < 73.5 else None


def faith(name, section):
    s = (name + ' ' + section).lower()
    if re.search(r'cherkov|церк|sobor|pravoslav|provaslav|katolik|xristian', s):
        return 'christian'
    if re.search(r'sinagog|yahudiy', s):
        return 'jewish'
    if re.search(r'budd', s):
        return 'buddhist'
    return 'islamic'


def clean(s):
    s = re.sub(r'[“”"«»„]', '', s).strip().rstrip('.').strip()
    s = re.sub(r'\b(SH|CH)([a-z‘’ʼ\'])', lambda m: m.group(1)[0] + m.group(1)[1].lower() + m.group(2), s)
    return re.sub(r'\s+', ' ', s).replace(' ,', ',')


def clean_text(s):
    s = re.sub(r'\b(SH|CH)([a-z‘’ʼ\'])', lambda m: m.group(1)[0] + m.group(1)[1].lower() + m.group(2), s or '')
    return re.sub(r'\s+', ' ', s).replace('¬', '').strip()


def main(xlsx):
    review = json.loads((ROOT / 'analysis/tourism/religious_photo_review.json').read_text(encoding='utf-8'))
    commons_meta = json.loads((ROOT / 'analysis/tourism/religious_commons_meta.json').read_text(encoding='utf-8'))
    rejected = set(review['rejected_official_images'])
    translations = json.loads((ROOT / 'analysis/tourism/site_translations.json').read_text(encoding='utf-8'))
    boundary = json.loads((ROOT / 'data/region-boundaries.json').read_text(encoding='utf-8'))
    country = [(f['properties']['nameUz'], shape(f['geometry'])) for f in boundary['features']]
    out_dir = ROOT / 'public/tourism/religious'
    out_dir.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(xlsx)
    rows, counter = [], collections.Counter()
    for ws in wb.worksheets:
        region = REGION[ws.title.strip().lower()]
        imgs = collections.defaultdict(list)
        for im in ws._images:
            imgs[im.anchor._from.row + 1].append((im.anchor._from.col, im))
        section = district = ''
        last = None
        for r in range(2, ws.max_row + 1):
            v = [ws.cell(r, c).value for c in range(1, 6)]
            name, addr, coord, desc = norm(v[1]), norm(v[2]), v[3], norm(v[4])
            if name and not coord and not addr and not desc:
                if re.search(r'qadamjo|cherkov|yahudiy|budd|xristian', name.lower()):
                    section, district = name, ''
                else:
                    district = name
                continue
            if not name and last is not None:  # continuation row of the previous entry
                last['address'] = (last['address'] + ' ' + addr).strip()
                last['description'] = (last['description'] + ' ' + desc).strip()
                last['_imgs'] += [im for _, im in imgs.get(r, [])]
                continue
            if not name or name.lower().startswith('ziyoratgoh nomi'):
                continue
            counter[region] += 1
            last = {'id': f'rel-{CODE[region]}-{counter[region]:03d}', 'name': name, 'region': region, 'district': district,
                    'address': addr, 'description': desc, 'faith': faith(name, section), 'coord': parse_coord(coord), 'raw': norm(coord),
                    '_imgs': [im for _, im in sorted(imgs.get(r, []), key=lambda z: z[0])]}
            rows.append(last)
    shared = collections.Counter(x['coord'] for x in rows if x['coord'])
    sites, unmapped = [], []
    for x in rows:
        rec = {'id': x['id'], 'name': clean(x['name']), 'category': 'religion', 'faith': x['faith'], 'region': x['region'],
               'district': clean(x['district']) if x['district'] else '', 'address': clean_text(x['address']), 'description': clean_text(x['description'])}
        ok = x['coord'] and x['id'] not in COPIED and any(p.contains(Point(x['coord'][1], x['coord'][0])) for _, p in country)
        if not ok:
            unmapped.append({**rec, 'coordinateRaw': x['raw']})
            continue
        localize(rec, translations)
        rec['lat'], rec['lng'] = x['coord']
        notes = {'uz': [], 'en': [], 'ru': []}
        if shared[x['coord']] > 1:
            n = shared[x['coord']] - 1
            notes['uz'].append(f"Bu koordinata ro‘yxatdagi yana {n} ta obyektga ham berilgan; joylashuv taxminiy bo‘lishi mumkin.")
            notes['en'].append(f"The list gives this coordinate to {n} other site{'s' if n > 1 else ''} as well; the location may be approximate.")
            notes['ru'].append(f"Эта координата в списке указана ещё для {n} {'объекта' if n == 1 else 'объектов'}; местоположение может быть приблизительным.")
        if x['id'] in BORDER:
            where = next(n for n, p in country if p.contains(Point(x['coord'][1], x['coord'][0])))
            notes['uz'].append(f'Nuqta xaritada {where} viloyati chegarasi ichiga tushadi; joylashuvni tekshirish tavsiya etiladi.')
            notes['en'].append(f'On the map the point falls inside {REGION_EN[where]} Region; please verify the location.')
            notes['ru'].append(f'На карте точка попадает в {REGION_RU[where]} область; местоположение рекомендуется проверить.')
        if notes['uz']:
            rec['coordinateNote'] = {k: ' '.join(v) for k, v in notes.items()}
        images = []
        for k, im in enumerate(x['_imgs']):
            fn = f"{x['id']}-{k + 1}.webp"
            if fn in rejected:
                continue
            pic = Image.open(io.BytesIO(im._data())).convert('RGB')
            pic.thumbnail((1280, 1280), Image.LANCZOS)
            pic.save(out_dir / fn, 'WEBP', quality=78, method=6)
            images.append({'url': '/tourism/religious/' + fn, 'w': pic.size[0], 'h': pic.size[1], 'credit': SOURCE, 'license': 'Rasmiy ro‘yxat',
                           'licenseUrl': '/tourism/religious-sites.md', 'sourceUrl': '/tourism/religious-sites.md', 'hosted': 'local'})
        for page in review['commons'].get(x['id'], []):
            m = commons_meta[page]
            images.append({**m, 'sourceUrl': page, 'hosted': 'wikimedia'})
        rec['images'] = images
        sites.append(rec)
    meta = {'title': 'Ziyorat turizmi obyektlari', 'source': SOURCE, 'received': '2026-11-17', 'records': len(rows), 'mapped': len(sites), 'notMapped': len(unmapped),
            'withPhotos': sum(1 for s in sites if s['images']),
            'photosOfficial': sum(1 for s in sites for i in s['images'] if i['hosted'] == 'local'),
            'photosCommons': sum(1 for s in sites for i in s['images'] if i['hosted'] == 'wikimedia'),
            'note': 'Ro‘yxat, koordinata va tavsiflar manbadan o‘zgartirilmasdan olindi (faqat qo‘shtirnoq va bo‘shliqlar tozalandi). Manbadagi xarita skrinshotlari surat sifatida ishlatilmadi. Surati yo‘q obyektlarga Wikimedia Commons’dan nomi mos yoki nuqtaga juda yaqin, ochiq litsenziyali suratlar qo‘shildi (muallif va litsenziya bilan).'}
    (ROOT / 'public/tourism/religious-sites.json').write_text(json.dumps({'meta': meta, 'sites': sites}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(meta)
    for u in unmapped:
        print('not mapped:', u['id'], u['name'], '|', u['coordinateRaw'])


if __name__ == '__main__':
    main(sys.argv[1])
