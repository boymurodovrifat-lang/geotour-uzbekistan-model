"""Build data/tourism-routes.json: editorial routes with stops, photos and a line along OSM main roads.

The line is the shortest path on the portal's own main-road layer (public/transport/roads.geojson),
with a straight connector from each stop to the nearest road vertex. It shows where the trip goes;
it is not turn-by-turn navigation and gives no travel time.
Run: python analysis/build_routes.py   (needs numpy, scipy)
"""
from pathlib import Path
import json, math
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
R = 6371.0088
T = lambda uz, en, ru: {'uz': uz, 'en': en, 'ru': ru}
OSM, APPROX = 'OpenStreetMap record', 'approximate, placed by hand'


def S(sid, day, lat, lng, name, note, photo=None, source=OSM):
    return {'id': sid, 'day': day, 'lat': lat, 'lng': lng, 'name': name, 'note': note, 'photo': photo, 'coordinateSource': source}


ROUTES = [
    {'id': 'silk-road-classics', 'theme': 'heritage', 'days': 8,
     'name': T('Buyuk Ipak yo‘li durdonalari', 'Silk Road classics', 'Жемчужины Великого шёлкового пути'),
     'summary': T('Toshkentdan Samarqand va Buxoro orqali Xivagacha: to‘rt tarixiy shahar va to‘qqizta asosiy yodgorlik.',
                  'From Tashkent through Samarkand and Bukhara to Khiva: four historic cities and nine key monuments.',
                  'Из Ташкента через Самарканд и Бухару в Хиву: четыре исторических города и девять главных памятников.'),
     'season': T('Mart–may va sentabr–noyabr', 'March–May and September–November', 'Март–май и сентябрь–ноябрь'),
     'transport': T('Shaharlar orasida poyezd yoki avtomobil; jadval va chiptalarni oldindan tekshiring.', 'Train or car between the cities; check timetables and tickets in advance.', 'Между городами поезд или автомобиль; расписание и билеты проверяйте заранее.'),
     'stops': [
         S('hazrati-imom', 1, 41.3373, 69.2401, T('Hazrati Imom majmuasi', 'Hazrati Imam complex', 'Комплекс Хазрати Имам'), T('Toshkentning diniy markazi; Mo‘yi Muborak madrasasida Usmon Mushafi saqlanadi.', 'The religious centre of Tashkent; the Muyi Muborak madrasa keeps the Uthman Quran.', 'Религиозный центр Ташкента; в медресе Муйи Муборак хранится Коран Усмана.'), 'local_tashkent'),
         S('chorsu', 1, 41.3267, 69.2350, T('Chorsu bozori', 'Chorsu Bazaar', 'Базар Чорсу'), T('Eski shahardagi gumbazli bozor: mevalar, ziravorlar va non rastalari.', 'The domed market of the old town: fruit, spice and bread rows.', 'Купольный рынок Старого города: ряды фруктов, специй и лепёшек.'), 'chorsu', APPROX),
         S('registon', 2, 39.6547, 66.9753, T('Registon maydoni', 'Registan Square', 'Площадь Регистан'), T('Uch madrasa ansambli: Ulug‘bek (1417–1420), Sherdor (1619–1636) va Tillakori (1646–1660).', 'An ensemble of three madrasas: Ulugh Beg (1417–1420), Sher-Dor (1619–1636) and Tilya-Kori (1646–1660).', 'Ансамбль трёх медресе: Улугбека (1417–1420), Шердор (1619–1636) и Тилля-Кари (1646–1660).'), 'local_samarkand'),
         S('shohi-zinda', 3, 39.6617, 66.9878, T('Shohi Zinda', 'Shah-i-Zinda', 'Шахи-Зинда'), T('Asosan XIV–XV asrlarga oid koshinkor maqbaralar ko‘chasi.', 'A street of tiled mausoleums, mostly from the 14th–15th centuries.', 'Улица изразцовых мавзолеев, в основном XIV–XV веков.'), 'shahi_zinda'),
         S('poi-kalon', 4, 39.7759, 64.4148, T('Poi Kalon', 'Po-i-Kalyan', 'Пои-Калян'), T('Kalon minorasi (1127), Kalon masjidi va Mir Arab madrasasi.', 'The Kalyan Minaret (1127), the Kalyan Mosque and the Mir-i-Arab Madrasa.', 'Минарет Калян (1127), мечеть Калян и медресе Мири Араб.'), 'local_bukhara'),
         S('ark', 4, 39.7779, 64.4111, T('Buxoro arki', 'Ark of Bukhara', 'Бухарский Арк'), T('Buxoro hukmdorlarining qal’a-qarorgohi; hozir muzey.', 'The fortress residence of the rulers of Bukhara, now a museum.', 'Крепость-резиденция правителей Бухары, сегодня музей.'), 'ark_bukhara'),
         S('labi-hovuz', 5, 39.7734, 64.4203, T('Labi Hovuz', 'Lyab-i Hauz', 'Ляби-Хауз'), T('Hovuz atrofidagi XVI–XVII asr ansambli: Ko‘kaldosh madrasasi, Nodir Devonbegi xonaqohi va madrasasi.', 'A 16th–17th-century ensemble around a pool: the Kukeldash Madrasa and the Nadir Divan-Begi khanaka and madrasa.', 'Ансамбль XVI–XVII веков вокруг водоёма: медресе Кукельдаш, ханака и медресе Надира Диван-беги.'), 'lyabi_hauz'),
         S('ichan-qala', 7, 41.3783, 60.3639, T('Ichan qal’a', 'Itchan Kala', 'Ичан-Кала'), T('Devor bilan o‘ralgan ichki shahar; 1990 yildan UNESCO ro‘yxatida.', 'The walled inner town, on the UNESCO World Heritage List since 1990.', 'Обнесённый стеной внутренний город; в списке ЮНЕСКО с 1990 года.'), 'local_khiva'),
         S('kalta-minor', 8, 41.3783, 60.3580, T('Kalta Minor', 'Kalta Minor', 'Кальта-Минар'), T('1851 yilda boshlanib, tugallanmay qolgan moviy koshinli minora.', 'A turquoise-tiled minaret begun in 1851 and left unfinished.', 'Минарет в бирюзовых изразцах, начатый в 1851 году и оставшийся незавершённым.'), 'kalta_minor'),
     ]},
    {'id': 'timurid-trail', 'theme': 'heritage', 'days': 3,
     'name': T('Temuriylar izidan', 'On the Timurid trail', 'По следам Тимуридов'),
     'summary': T('Samarqanddagi temuriylar yodgorliklaridan Amir Temur vatani Shahrisabzgacha.', 'From the Timurid monuments of Samarkand to Shakhrisabz, the home town of Amir Timur.', 'От тимуридских памятников Самарканда до Шахрисабза — родины Амира Темура.'),
     'season': T('Mart–iyun va sentabr–noyabr', 'March–June and September–November', 'Март–июнь и сентябрь–ноябрь'),
     'transport': T('Samarqand–Shahrisabz yo‘li tog‘ dovonidan o‘tadi; qishda yo‘l holatini tekshiring.', 'The Samarkand–Shakhrisabz road crosses a mountain pass; check road conditions in winter.', 'Дорога Самарканд–Шахрисабз идёт через горный перевал; зимой уточняйте состояние дороги.'),
     'stops': [
         S('gori-amir', 1, 39.6486, 66.9691, T('Go‘ri Amir maqbarasi', 'Gur-e-Amir Mausoleum', 'Мавзолей Гур-Эмир'), T('Amir Temur va temuriylar dafn etilgan XV asr boshidagi maqbara.', 'The early 15th-century mausoleum of Amir Timur and his descendants.', 'Мавзолей начала XV века, где похоронены Амир Темур и его потомки.'), 'gur_emir'),
         S('bibixonim', 1, 39.6604, 66.9823, T('Bibixonim masjidi', 'Bibi-Khanym Mosque', 'Мечеть Биби-Ханым'), T('1399–1404 yillarda qurilgan jome masjidi.', 'The congregational mosque built in 1399–1404.', 'Соборная мечеть, построенная в 1399–1404 годах.'), 'bibi_khanym'),
         S('ulugbek-rasadxonasi', 2, 39.6752, 67.0055, T('Ulug‘bek rasadxonasi', 'Ulugh Beg Observatory', 'Обсерватория Улугбека'), T('XV asr rasadxonasining yer osti sekstanti qoldig‘i va muzey.', 'The underground sextant of the 15th-century observatory and a museum.', 'Подземная часть секстанта обсерватории XV века и музей.'), 'ulugh_beg'),
         S('oqsaroy', 3, 39.0607, 66.8293, T('Oqsaroy', 'Ak-Saray Palace', 'Дворец Аксарай'), T('Amir Temur saroyining (1380–1404) ulkan peshtoqi qoldiqlari.', 'The remains of the giant portal of Amir Timur’s palace (1380–1404).', 'Остатки гигантского портала дворца Амира Темура (1380–1404).'), 'local_shakhrisabz'),
         S('dorut-tilovat', 3, 39.0497, 66.8276, T('Dorut Tilovat majmuasi', 'Dorut Tilovat complex', 'Комплекс Дорут-Тиловат'), T('Ko‘k Gumbaz masjidi (1435) va temuriylar davri maqbaralari.', 'The Kok Gumbaz Mosque (1435) and Timurid-era mausoleums.', 'Мечеть Кок-Гумбаз (1435) и мавзолеи тимуридской эпохи.')),
     ]},
    {'id': 'khorezm-aral', 'theme': 'heritage', 'days': 5,
     'name': T('Xorazm qal’alari va Orolbo‘yi', 'Khorezm fortresses and the Aral shore', 'Крепости Хорезма и Приаралье'),
     'summary': T('Xivadan qadimgi Xorazm qal’alari orqali Nukus muzeyi va Mo‘ynoqqacha.', 'From Khiva past the fortresses of ancient Khorezm to the Nukus museum and Muynak.', 'Из Хивы мимо крепостей древнего Хорезма к музею Нукуса и Муйнаку.'),
     'season': T('Aprel–may va sentabr–oktabr', 'April–May and September–October', 'Апрель–май и сентябрь–октябрь'),
     'transport': T('Uzoq masofali cho‘l yo‘llari: suv, yoqilg‘i va aloqa zaxirasini oldindan o‘ylang.', 'Long desert roads: plan water, fuel and phone coverage in advance.', 'Длинные пустынные дороги: заранее продумайте запас воды, топлива и связь.'),
     'stops': [
         S('ichan-qala', 1, 41.3783, 60.3639, T('Ichan qal’a', 'Itchan Kala', 'Ичан-Кала'), T('Devor bilan o‘ralgan ichki shahar; 1990 yildan UNESCO ro‘yxatida.', 'The walled inner town, on the UNESCO World Heritage List since 1990.', 'Обнесённый стеной внутренний город; в списке ЮНЕСКО с 1990 года.'), 'local_khiva'),
         S('tuproq-qala', 2, 41.9271, 60.8228, T('Tuproq qal’a', 'Toprak-Kala', 'Топрак-Кала'), T('Milodning dastlabki asrlariga oid Qadimgi Xorazm shahar-qal’asi xarobalari.', 'The ruins of a city-fortress of ancient Khorezm from the first centuries CE.', 'Руины города-крепости древнего Хорезма первых веков нашей эры.'), 'toprak_kala'),
         S('ayoz-qala', 2, 42.0056, 61.0306, T('Ayoz qal’a', 'Ayaz-Kala', 'Аяз-Кала'), T('Qizilqum chekkasidagi tepaliklarda joylashgan uchta qadimiy qal’a.', 'Three ancient fortresses on hills at the edge of the Kyzylkum.', 'Три древние крепости на холмах у края Кызылкума.'), 'ayaz_kala'),
         S('savitskiy', 3, 42.4654, 59.6130, T('Savitskiy nomidagi san’at muzeyi', 'Savitsky Art Museum', 'Музей искусств имени Савицкого'), T('1966 yilda asos solingan; rus avangardi va qoraqalpoq amaliy san’ati to‘plami.', 'Founded in 1966; a collection of Russian avant-garde and Karakalpak applied art.', 'Основан в 1966 году; собрание русского авангарда и каракалпакского прикладного искусства.')),
         S('mizdaxon', 4, 42.3980, 59.3844, T('Mizdaxon', 'Mizdakhan', 'Миздахкан'), T('Xo‘jayli yaqinidagi qadimiy nekropol va qal’a qoldiqlari.', 'An ancient necropolis and fortress remains near Khodjeyli.', 'Древний некрополь и остатки крепости близ Ходжейли.'), 'mizdakhan'),
         S('moynoq', 5, 43.7796, 59.0286, T('Mo‘ynoq kemalar qabristoni', 'Muynak ship graveyard', 'Кладбище кораблей в Муйнаке'), T('Sobiq port: Orol dengizi chekinganidan keyin qumda qolgan baliqchi kemalari.', 'A former port: fishing vessels left on the sand after the Aral Sea retreated.', 'Бывший порт: рыболовные суда, оставшиеся на песке после отступления Аральского моря.'), 'muynak', APPROX),
     ]},
    {'id': 'tashkent-mountains', 'theme': 'nature', 'days': 2,
     'name': T('Toshkent tog‘lari: Chorvoq va Chimyon', 'Tashkent mountains: Charvak and Chimgan', 'Горы Ташкента: Чарвак и Чимган'),
     'summary': T('Toshkentdan taxminan 80–90 km: suv ombori, G‘arbiy Tyan-Shan manzaralari va tog‘ kurortlari.', 'About 80–90 km from Tashkent: a reservoir, Western Tien-Shan views and mountain resorts.', 'Примерно в 80–90 км от Ташкента: водохранилище, виды Западного Тянь-Шаня и горные курорты.'),
     'season': T('May–oktabr; chang‘i uchun dekabr–mart', 'May–October; December–March for skiing', 'Май–октябрь; для лыж декабрь–март'),
     'transport': T('Avtomobil yoki uyushtirilgan transfer; tog‘da ob-havo tez o‘zgaradi.', 'Car or organised transfer; mountain weather changes quickly.', 'Автомобиль или организованный трансфер; погода в горах меняется быстро.'),
     'stops': [
         S('chorvoq', 1, 41.6157, 69.9866, T('Chorvoq suv ombori', 'Charvak Reservoir', 'Чарвакское водохранилище'), T('Chirchiq daryosidagi tog‘ suv ombori; manzara maydonchalari va sohil dam olish joylari.', 'A mountain reservoir on the Chirchik river with viewpoints and shore resorts.', 'Горное водохранилище на реке Чирчик со смотровыми площадками и зонами отдыха.'), 'charvak'),
         S('chimyon', 1, 41.5480, 70.0200, T('Chimyon', 'Chimgan', 'Чимган'), T('Katta Chimyon cho‘qqisi (3309 m) etagidagi tog‘ dam olish hududi.', 'A mountain recreation area below Greater Chimgan peak (3,309 m).', 'Горная зона отдыха у подножия Большого Чимгана (3309 м).'), 'local_chimgan'),
         S('amirsoy', 2, 41.4969, 69.9580, T('Amirsoy', 'Amirsoy', 'Амирсой'), T('2019 yilda ochilgan tog‘-chang‘i kurorti; kanat yo‘lidan yozda ham foydalaniladi.', 'A ski resort opened in 2019; the gondola also runs in summer.', 'Горнолыжный курорт, открытый в 2019 году; канатная дорога работает и летом.'), 'amirsoy', APPROX),
     ]},
    {'id': 'fergana-crafts', 'theme': 'craft', 'days': 3,
     'name': T('Farg‘ona vodiysi hunarmandlari', 'Crafts of the Fergana Valley', 'Ремёсла Ферганской долины'),
     'summary': T('Qo‘qon saroyi, Rishton kulolchiligi va Marg‘ilon ipagi.', 'The Kokand palace, Rishtan ceramics and Margilan silk.', 'Кокандский дворец, риштанская керамика и маргиланский шёлк.'),
     'season': T('Aprel–iyun va sentabr–oktabr', 'April–June and September–October', 'Апрель–июнь и сентябрь–октябрь'),
     'transport': T('Toshkentdan poyezd yoki Qamchiq dovoni orqali avtomobil.', 'By train from Tashkent or by car over the Kamchik pass.', 'Из Ташкента поездом или на автомобиле через перевал Камчик.'),
     'stops': [
         S('xudoyorxon', 1, 40.5387, 70.9380, T('Xudoyorxon o‘rdasi', 'Khudayar Khan Palace', 'Дворец Худояр-хана'), T('XIX asrning ikkinchi yarmida qurilgan Qo‘qon xonlari saroyi.', 'The palace of the Kokand khans, built in the second half of the 19th century.', 'Дворец кокандских ханов, построенный во второй половине XIX века.'), 'khudayar'),
         S('rishton', 2, 40.3596, 71.2857, T('Rishton kulolchiligi', 'Rishtan ceramics', 'Риштанская керамика'), T('Ko‘k-moviy sirli an’anaviy kulolchilik ustaxonalari va muzeylari.', 'Workshops and museums of traditional blue-glazed pottery.', 'Мастерские и музеи традиционной керамики с сине-голубой глазурью.')),
         S('margilon', 3, 40.4694, 71.7158, T('Marg‘ilon: Yodgorlik ipak fabrikasi', 'Margilan: Yodgorlik silk factory', 'Маргилан: шёлковая фабрика «Ёдгорлик»'), T('Atlas va adras an’anaviy usulda to‘qiladigan korxona.', 'A workshop where atlas and adras fabrics are woven by traditional methods.', 'Предприятие, где атлас и адрас ткут традиционным способом.'), 'margilan', APPROX),
     ]},
    {'id': 'nurata-aydarkul', 'theme': 'nature', 'days': 2,
     'name': T('Nurota va Aydarko‘l', 'Nurata and Lake Aydarkul', 'Нурата и озеро Айдаркуль'),
     'summary': T('Muqaddas buloq, tog‘ etagi qishloqlari va Qizilqumdagi ko‘l bo‘yida o‘tovda tunash.', 'A sacred spring, foothill villages and a night in a yurt by a lake in the Kyzylkum.', 'Священный источник, предгорные кишлаки и ночь в юрте у озера в Кызылкуме.'),
     'season': T('Mart–may va sentabr–oktabr', 'March–May and September–October', 'Март–май и сентябрь–октябрь'),
     'transport': T('Samarqand yoki Buxorodan avtomobil; cho‘lda yo‘l ko‘rsatkichlari kam.', 'By car from Samarkand or Bukhara; few road signs in the desert.', 'На автомобиле из Самарканда или Бухары; в пустыне мало указателей.'),
     'stops': [
         S('nurota-chashma', 1, 40.5551, 65.6799, T('Nurota: Chashma majmuasi', 'Nurata: Chashma complex', 'Нурата: комплекс Чашма'), T('Muqaddas buloq, baliqli hovuz va masjidlar; yonida qadimiy qal’a xarobalari.', 'A sacred spring, a pool with fish and mosques; the ruins of an old fortress stand nearby.', 'Священный источник, водоём с рыбой и мечети; рядом руины древней крепости.'), 'nurata'),
         S('aydarkol', 2, 41.0846, 65.9625, T('Aydarko‘l', 'Lake Aydarkul', 'Озеро Айдаркуль'), T('1969 yilgi toshqindan keyin hosil bo‘lgan yirik cho‘l ko‘li; sohilda o‘tov lagerlari.', 'A large desert lake formed after the 1969 flood; yurt camps stand on the shore.', 'Крупное пустынное озеро, возникшее после паводка 1969 года; на берегу юртовые лагеря.'), 'aydarkul'),
     ]},
    {'id': 'surkhan-heritage', 'theme': 'heritage', 'days': 2,
     'name': T('Surxon vohasi: buddaviy va islomiy meros', 'Surkhan oasis: Buddhist and Islamic heritage', 'Сурханский оазис: буддийское и исламское наследие'),
     'summary': T('Termiz atrofidagi buddaviy monastir, sayyidlar maqbaralari va XII asr minorasi.', 'A Buddhist monastery, the sayyid mausoleums and a 12th-century minaret around Termez.', 'Буддийский монастырь, мавзолеи сейидов и минарет XII века в окрестностях Термеза.'),
     'season': T('Oktabr–aprel; yozda juda issiq', 'October–April; very hot in summer', 'Октябрь–апрель; летом очень жарко'),
     'transport': T('Ayrim yodgorliklar chegara hududida: tashrif tartibini oldindan aniqlang.', 'Some sites lie in the border zone: confirm visiting rules in advance.', 'Часть памятников находится в приграничной зоне: заранее уточните порядок посещения.'),
     'stops': [
         S('fayoztepa', 1, 37.2862, 67.1880, T('Fayoztepa', 'Fayaz Tepa', 'Фаязтепа'), T('Milodiy I–III asrlarga oid buddaviy ibodatxona va monastir qoldiqlari.', 'The remains of a Buddhist temple and monastery of the 1st–3rd centuries CE.', 'Остатки буддийского храма и монастыря I–III веков нашей эры.')),
         S('sulton-saodat', 1, 37.2590, 67.3160, T('Sulton Saodat majmuasi', 'Sultan Saodat complex', 'Комплекс Султан Саодат'), T('Termiz sayyidlarining XI–XVII asrlarda shakllangan maqbaralar majmuasi.', 'The mausoleum complex of the Termez sayyids, formed in the 11th–17th centuries.', 'Комплекс мавзолеев термезских сейидов, сложившийся в XI–XVII веках.'), 'sultan_saodat', APPROX),
         S('jarqorgon', 2, 37.4766, 67.3963, T('Jarqo‘rg‘on minorasi', 'Jarkurgan Minaret', 'Джаркурганский минарет'), T('1108–1109 yillarda qurilgan, g‘isht “burmalari” bilan mashhur minora.', 'A minaret built in 1108–1109, known for its ribbed brick shaft.', 'Минарет 1108–1109 годов, известный рифлёным кирпичным стволом.')),
     ]},
]


# --- second set: routes that reuse the stops above and add a few new ones ------------------------------
_LIB = {s['id']: s for r in ROUTES for s in r['stops']}


def U(sid, day, note=None):
    """Reuse a stop defined above on another day, optionally with a route-specific note."""
    s = dict(_LIB[sid])
    s['day'] = day
    if note:
        s['note'] = note
    return s


ROUTES += [
    {'id': 'unesco-heritage', 'theme': 'heritage', 'days': 7,
     'name': T('UNESCO jahon merosi yo‘li', 'UNESCO World Heritage route', 'Маршрут по объектам Всемирного наследия ЮНЕСКО'),
     'summary': T('To‘rt tarixiy shahar markazi va G‘arbiy Tyan-Shan tog‘lari: Xiva, Buxoro, Samarqand, Shahrisabz, Chimyon.',
                  'Four historic centres and the Western Tien-Shan mountains: Khiva, Bukhara, Samarkand, Shakhrisabz and Chimgan.',
                  'Четыре исторических центра и горы Западного Тянь-Шаня: Хива, Бухара, Самарканд, Шахрисабз и Чимган.'),
     'season': T('Aprel–may va sentabr–oktabr', 'April–May and September–October', 'Апрель–май и сентябрь–октябрь'),
     'transport': T('Uzoq masofalar: Xiva–Buxoro va Samarqand–Toshkent oralig‘ida poyezd qulay.', 'Long distances: the train is convenient between Khiva and Bukhara and between Samarkand and Tashkent.', 'Большие расстояния: между Хивой и Бухарой и между Самаркандом и Ташкентом удобен поезд.'),
     'stops': [
         U('ichan-qala', 1), U('poi-kalon', 3, T('Buxoro tarixiy markazi 1993 yildan UNESCO ro‘yxatida; Kalon minorasi (1127) uning ramzi.', 'The Historic Centre of Bukhara has been on the UNESCO list since 1993; the Kalyan Minaret (1127) is its symbol.', 'Исторический центр Бухары в списке ЮНЕСКО с 1993 года; его символ — минарет Калян (1127).')),
         U('registon', 4, T('“Samarqand — madaniyatlar chorrahasi” obyekti 2001 yildan UNESCO ro‘yxatida; Registon uning markazi.', 'The property “Samarkand – Crossroad of Cultures” has been on the UNESCO list since 2001; the Registan is its centre.', 'Объект «Самарканд — перекрёсток культур» в списке ЮНЕСКО с 2001 года; его центр — Регистан.')),
         U('oqsaroy', 5, T('Shahrisabz tarixiy markazi 2000 yildan UNESCO ro‘yxatida; Oqsaroy peshtoqi — Amir Temur saroyidan qolgan qism.', 'The Historic Centre of Shakhrisyabz has been on the UNESCO list since 2000; the Ak-Saray portal is what remains of Amir Timur’s palace.', 'Исторический центр Шахрисабза в списке ЮНЕСКО с 2000 года; портал Аксарая — остаток дворца Амира Темура.')),
         U('chimyon', 7, T('G‘arbiy Tyan-Shan tog‘lari (UNESCO, 2016) manzarasi. Ro‘yxatga kirgan Chotqol qo‘riqxonasi uchastkalariga kirish tartibini oldindan aniqlang.', 'Views of the Western Tien-Shan (UNESCO, 2016). Check access rules in advance for the listed sections of the Chatkal reserve.', 'Виды Западного Тянь-Шаня (ЮНЕСКО, 2016). Порядок посещения включённых в список участков Чаткальского заповедника уточняйте заранее.')),
     ]},
    {'id': 'mountains-and-lakes', 'theme': 'nature', 'days': 6,
     'name': T('Tog‘lar va ko‘llar', 'Mountains and lakes', 'Горы и озёра'),
     'summary': T('Chorvoq va Chimyondan Zomin archazorlari orqali Nurota va Aydarko‘lgacha.', 'From Charvak and Chimgan through the juniper forests of Zaamin to Nurata and Lake Aydarkul.', 'От Чарвака и Чимгана через арчовые леса Заамина к Нурате и озеру Айдаркуль.'),
     'season': T('May–iyun va sentabr–oktabr', 'May–June and September–October', 'Май–июнь и сентябрь–октябрь'),
     'transport': T('Avtomobil kerak; tog‘ va cho‘l uchastkalarida yoqilg‘i va aloqani oldindan rejalang.', 'A car is needed; plan fuel and phone coverage for the mountain and desert sections.', 'Нужен автомобиль; на горных и пустынных участках заранее продумайте топливо и связь.'),
     'stops': [
         U('chorvoq', 1), U('chimyon', 1), U('amirsoy', 2),
         S('zomin', 3, 39.6220, 68.4750, T('Zomin milliy bog‘i', 'Zaamin National Park', 'Зааминский национальный парк'), T('Turkiston tizmasining shimoliy yonbag‘irlaridagi archa o‘rmonlari va tog‘ dam olish hududi.', 'Juniper forests and a mountain resort area on the northern slopes of the Turkestan range.', 'Арчовые леса и горная зона отдыха на северных склонах Туркестанского хребта.'), 'zaamin', APPROX),
         U('nurota-chashma', 5), U('aydarkol', 6),
     ]},
    {'id': 'tashkent-day', 'theme': 'heritage', 'days': 1,
     'name': T('Toshkent bir kunda', 'Tashkent in one day', 'Ташкент за один день'),
     'summary': T('Eski shahar, Chorsu bozori va shahar markazidagi Amir Temur xiyoboni.', 'The old town, Chorsu Bazaar and Amir Timur Square in the city centre.', 'Старый город, базар Чорсу и сквер Амира Темура в центре города.'),
     'season': T('Mart–iyun va sentabr–noyabr', 'March–June and September–November', 'Март–июнь и сентябрь–ноябрь'),
     'transport': T('Metro: Chorsu va Amir Temur xiyoboni bekatlari; qolgan masofalar piyoda yoki taksida.', 'Metro: Chorsu and Amir Temur Hiyoboni stations; the rest on foot or by taxi.', 'Метро: станции «Чорсу» и «Амир Темур хиёбони»; остальное пешком или на такси.'),
     'stops': [
         U('hazrati-imom', 1), U('chorsu', 1),
         S('amir-temur-xiyoboni', 1, 41.3111, 69.2797, T('Amir Temur xiyoboni', 'Amir Timur Square', 'Сквер Амира Темура'), T('Shahar markazidagi xiyobon; o‘rtasida 1993 yilda o‘rnatilgan Amir Temurning otliq haykali.', 'The central square of the city, with the equestrian statue of Amir Timur erected in 1993.', 'Сквер в центре города с конным памятником Амиру Темуру, установленным в 1993 году.'), 'amir_temur_sq', APPROX),
     ]},
    {'id': 'samarkand-two-days', 'theme': 'heritage', 'days': 2,
     'name': T('Samarqand ikki kunda', 'Samarkand in two days', 'Самарканд за два дня'),
     'summary': T('Registon va temuriylar yodgorliklaridan Afrosiyob va Ulug‘bek rasadxonasigacha.', 'From the Registan and the Timurid monuments to Afrasiab and the Ulugh Beg Observatory.', 'От Регистана и тимуридских памятников до Афрасиаба и обсерватории Улугбека.'),
     'season': T('Mart–iyun va sentabr–noyabr', 'March–June and September–November', 'Март–июнь и сентябрь–ноябрь'),
     'transport': T('Markazdagi yodgorliklar orasida piyoda; Afrosiyob va rasadxonaga taksi yoki avtobus.', 'On foot between the central monuments; taxi or bus to Afrasiab and the observatory.', 'Между памятниками центра пешком; до Афрасиаба и обсерватории на такси или автобусе.'),
     'stops': [
         U('gori-amir', 1), U('registon', 1), U('bibixonim', 1), U('shohi-zinda', 2),
         S('afrosiyob', 2, 39.6705, 66.9880, T('Afrosiyob shahristoni va muzeyi', 'Afrasiab site and museum', 'Городище и музей Афрасиаб'), T('Qadimgi Samarqand o‘rni; muzeyda VII asrga oid devoriy suratlar saqlanadi.', 'The site of ancient Samarkand; the museum keeps wall paintings from the 7th century.', 'Место древнего Самарканда; в музее хранятся настенные росписи VII века.'), 'afrasiab'),
         U('ulugbek-rasadxonasi', 2),
     ]},
    {'id': 'bukhara-two-days', 'theme': 'heritage', 'days': 2,
     'name': T('Buxoro ikki kunda', 'Bukhara in two days', 'Бухара за два дня'),
     'summary': T('Ark va Poi Kalondan Somoniylar maqbarasi, Labi Hovuz va Chor Minorgacha piyoda.', 'On foot from the Ark and Po-i-Kalyan to the Samanid Mausoleum, Lyab-i Hauz and Chor Minor.', 'Пешком от Арка и Пои-Калян до мавзолея Саманидов, Ляби-Хауза и Чор-Минора.'),
     'season': T('Mart–may va sentabr–noyabr', 'March–May and September–November', 'Март–май и сентябрь–ноябрь'),
     'transport': T('Eski shahar ichida piyoda; yozda ertalab va kechqurun yurish qulay.', 'On foot inside the old town; in summer walk in the morning and evening.', 'По старому городу пешком; летом удобнее утром и вечером.'),
     'stops': [
         S('somoniylar', 1, 39.7770, 64.4006, T('Somoniylar maqbarasi', 'Samanid Mausoleum', 'Мавзолей Саманидов'), T('IX–X asrlarga oid sulolaviy maqbara; pishiq g‘ishtdan terilgan naqshlari bilan mashhur.', 'A dynastic mausoleum of the 9th–10th centuries, known for its patterned baked brickwork.', 'Династический мавзолей IX–X веков, известный узорной кладкой из жжёного кирпича.'), 'samanid'),
         U('ark', 1), U('poi-kalon', 1), U('labi-hovuz', 2),
         S('chor-minor', 2, 39.7748, 64.4274, T('Chor Minor', 'Chor Minor', 'Чор-Минор'), T('1807 yilda qurilgan, to‘rt minorachali darvozaxona; madrasaning saqlanib qolgan qismi.', 'A gatehouse with four small towers built in 1807, the surviving part of a madrasa.', 'Надвратное здание с четырьмя башенками, построенное в 1807 году; сохранившаяся часть медресе.'), 'chor_minor'),
     ]},
    {'id': 'khiva-day', 'theme': 'heritage', 'days': 1,
     'name': T('Xiva: Ichan qal’a bo‘ylab bir kun', 'Khiva: a day inside Itchan Kala', 'Хива: день в Ичан-Кале'),
     'summary': T('Devor ichidagi shahar bo‘ylab piyoda: minoralar, yog‘och ustunli masjid va xon saroyi.', 'A walk through the walled town: minarets, a mosque of wooden columns and the khan’s palace.', 'Прогулка по городу в стенах: минареты, мечеть с деревянными колоннами и ханский дворец.'),
     'season': T('Aprel–may va sentabr–oktabr', 'April–May and September–October', 'Апрель–май и сентябрь–октябрь'),
     'transport': T('Ichan qal’a ichida faqat piyoda; yodgorliklarga umumiy chipta sotiladi.', 'On foot only inside Itchan Kala; a combined ticket covers the monuments.', 'По Ичан-Кале только пешком; на памятники продаётся единый билет.'),
     'stops': [
         U('ichan-qala', 1),
         S('tosh-hovli', 1, 41.3782, 60.3615, T('Tosh hovli saroyi', 'Tash Hauli Palace', 'Дворец Таш-Хаули'), T('1830-yillarda Olloqulixon davrida qurilgan saroy; koshinkor hovlilari bilan mashhur.', 'A palace built in the 1830s under Allakuli Khan, known for its tiled courtyards.', 'Дворец, построенный в 1830-х годах при Аллакули-хане; известен изразцовыми дворами.'), 'tash_hauli'),
         U('kalta-minor', 1),
         S('juma-masjid', 1, 41.3775, 60.3599, T('Juma masjidi', 'Juma Mosque', 'Джума-мечеть'), T('XVIII asr oxirida qayta qurilgan; ikki yuzdan ortiq o‘ymakor yog‘och ustuni bor.', 'Rebuilt at the end of the 18th century; it has more than two hundred carved wooden columns.', 'Перестроена в конце XVIII века; более двухсот резных деревянных колонн.'), 'juma_khiva'),
         S('islom-xoja', 1, 41.3766, 60.3601, T('Islomxo‘ja minorasi', 'Islam Khodja Minaret', 'Минарет Ислам-Ходжа'), T('1908–1910 yillarda qurilgan; Xivadagi eng baland minora.', 'Built in 1908–1910; the tallest minaret in Khiva.', 'Построен в 1908–1910 годах; самый высокий минарет Хивы.'), 'islam_khodja'),
     ]},
]


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))


def simplify(points, tol_km):
    """Douglas-Peucker on a lat/lng path with a tolerance in kilometres."""
    if len(points) < 3:
        return points
    keep = [0, len(points) - 1]
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        pa, pb = np.array(points[a]), np.array(points[b])
        seg = pb - pa
        scale = np.array([111.2, 111.2 * math.cos(math.radians(pa[0]))])
        rel = (np.array(points[a + 1:b]) - pa) * scale
        s = seg * scale
        n = float(np.hypot(*s))
        d = np.abs(rel[:, 0] * s[1] - rel[:, 1] * s[0]) / n if n > 0 else np.hypot(rel[:, 0], rel[:, 1])
        i = int(d.argmax())
        if d[i] > tol_km:
            m = a + 1 + i
            keep.append(m)
            stack += [(a, m), (m, b)]
    return [points[i] for i in sorted(set(keep))]


def main():
    photos = json.loads((ROOT / 'data/route-photos.json').read_text())
    roads = json.loads((ROOT / 'public/transport/roads.geojson').read_text())['features']
    index, coords, edges = {}, [], []

    def node(lng, lat):
        key = (round(lng, 5), round(lat, 5))
        if key not in index:
            index[key] = len(coords)
            coords.append((lat, lng))
        return index[key]
    for f in roads:
        g = f['geometry']
        for line in ([g['coordinates']] if g['type'] == 'LineString' else g['coordinates']):
            ids = [node(*p[:2]) for p in line]
            for a, b in zip(ids, ids[1:]):
                if a != b:
                    edges.append((a, b, hav(coords[a], coords[b])))
    xyz = lambda pts: np.array([[math.cos(math.radians(la)) * math.cos(math.radians(lo)), math.cos(math.radians(la)) * math.sin(math.radians(lo)), math.sin(math.radians(la))] for la, lo in pts])
    tree = cKDTree(xyz(coords))
    # Bridge digitising gaps: vertices closer than 120 m are treated as connected.
    for a, b in tree.query_pairs(2 * math.sin(0.12 / (2 * R)), output_type='ndarray'):
        edges.append((int(a), int(b), hav(coords[a], coords[b])))
    n = len(coords)
    r, c, w = zip(*edges)
    graph = coo_matrix((w + w, (r + c, c + r)), shape=(n, n)).tocsr()
    _, label = connected_components(graph, directed=False)
    main_component = np.bincount(label).argmax()
    in_main = np.where(label == main_component)[0]
    main_tree = cKDTree(xyz([coords[i] for i in in_main]))

    out, report = [], []
    for route in ROUTES:
        stops = route['stops']
        snap = [int(in_main[main_tree.query(xyz([(s['lat'], s['lng'])]))[1][0]]) for s in stops]
        path, total, schematic = [[stops[0]['lat'], stops[0]['lng']]], 0.0, False
        for i in range(len(stops) - 1):
            a, b = snap[i], snap[i + 1]
            here, there = (stops[i]['lat'], stops[i]['lng']), (stops[i + 1]['lat'], stops[i + 1]['lng'])
            direct = hav(here, there)
            access = hav(here, coords[a]) + hav(there, coords[b])
            leg = None
            if a != b and direct > 3:
                dist, pred = dijkstra(graph, directed=False, indices=a, return_predecessors=True)
                if np.isfinite(dist[b]) and dist[b] + access < 2.2 * direct + 15:
                    seq = [b]
                    while seq[-1] != a:
                        seq.append(int(pred[seq[-1]]))
                    leg = [list(coords[k]) for k in reversed(seq)]
                    total += float(dist[b]) + access
            if leg is None:  # neighbouring sights in one town, or no plausible road path
                total += direct
                schematic = schematic or direct > 3
                leg = []
            path += leg + [[there[0], there[1]]]
        short = total < 20  # town walks: keep every stop on the line and report the length to 0.5 km
        path = [[round(p[0], 5), round(p[1], 5)] for p in simplify(path, 0.02 if short else 0.25)]
        item = {k: route[k] for k in ['id', 'theme', 'days', 'name', 'summary', 'season', 'transport']}
        item.update({
            'kind': 'editorial', 'daysStatus': 'planning assumption, not verified travel duration',
            'distanceKm': (max(0.5, round(total * 2) / 2) if short else int(round(total / 5.0) * 5)),
            'pathStatus': ('walk: straight lines between neighbouring sights; not navigation' if short and not schematic else 'schematic straight segments where no main-road path was found' if schematic else 'shortest path on OSM main roads with straight connectors; not navigation'),
            'stops': [{**{k: s[k] for k in ['id', 'day', 'lat', 'lng', 'name', 'note', 'coordinateSource']},
                       'image': ({k: photos[s['photo']][k] for k in ['url', 'credit', 'license', 'licenseUrl', 'sourceUrl']} if s['photo'] else None)} for s in stops],
            'path': path,
        })
        out.append(item)
        report.append((route['id'], item['distanceKm'], len(path), item['pathStatus'][:9], [round(hav((s['lat'], s['lng']), coords[k]), 1) for s, k in zip(stops, snap)]))
    (ROOT / 'data/tourism-routes.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('nodes', n, 'main component', len(in_main), 'components', int(label.max()) + 1)
    for row in report:
        print(*row)


if __name__ == '__main__':
    main()
