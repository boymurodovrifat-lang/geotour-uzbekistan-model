// Content of the story map "Along the Silk Road". Facts are those already used and checked in the route notes.
export type StoryLang = 'uz' | 'en' | 'ru';
type T = Record<StoryLang, string>;
export type Chapter = {
  id: string;
  kicker: T;
  title: T;
  body: T[];
  view: { center: [number, number]; zoom: number };
  basemap: 'terrain' | 'light' | 'satellite';
  index: 'ESI' | 'TSI' | 'TPI' | 'TRSI' | null;
  routes: string[];
  photos: string[];
  probe?: { lat: number; lng: number; place: T };
};

export const STORY_UI = {
  uz: {
    title: 'Buyuk Ipak yo‘li bo‘ylab',
    subtitle: 'Xivadan Toshkentgacha: tarix, manzara va ochiq ma’lumotlar bilan hikoya',
    back: 'Xaritaga qaytish',
    scroll: 'Pastga suring',
    probe: 'Bu nuqtada',
    stability: 'barqarorlik',
    climate: 'Iqlim qulayligi, oylar bo‘yicha',
    photo: 'Surat',
    open: 'Portalda ochish',
    classes: ['juda past', 'past', 'o‘rtacha', 'yuqori', 'juda yuqori'],
    indexNames: { ESI: 'Ekoturizmga moslik', TSI: 'Turizmga moslik', TPI: 'Turistik salohiyat', TRSI: 'Rekreatsiya mosligi' },
    note: 'Indekslar ochiq ma’lumotlarga asoslangan dastlabki saralash: ekspert bahosi va dala tekshiruvi o‘tkazilmagan. Barqarorlik — 500 ta muqobil hisob-kitobning necha foizida katak o‘z sinfini saqlagani.',
    sources: 'Manbalar: OpenStreetMap, ESA WorldCover 2021, Copernicus DEM, UNESCO. Suratlar: Wikimedia Commons, muallif va litsenziya har surat ostida.',
  },
  en: {
    title: 'Along the Silk Road',
    subtitle: 'From Khiva to Tashkent: a story of history, landscape and open data',
    back: 'Back to the map',
    scroll: 'Scroll down',
    probe: 'At this point',
    stability: 'stability',
    climate: 'Climate comfort by month',
    photo: 'Photo',
    open: 'Open in the portal',
    classes: ['very low', 'low', 'moderate', 'high', 'very high'],
    indexNames: { ESI: 'Ecotourism suitability', TSI: 'Tourism suitability', TPI: 'Tourism potential', TRSI: 'Recreation suitability' },
    note: 'The indices are an open-data screening without expert weighting or field validation. Stability is the share of 500 alternative calculations in which the cell keeps its class.',
    sources: 'Sources: OpenStreetMap, ESA WorldCover 2021, Copernicus DEM, UNESCO. Photographs: Wikimedia Commons, author and licence under each photo.',
  },
  ru: {
    title: 'По Великому шёлковому пути',
    subtitle: 'От Хивы до Ташкента: история, ландшафт и открытые данные',
    back: 'Вернуться к карте',
    scroll: 'Прокрутите вниз',
    probe: 'В этой точке',
    stability: 'устойчивость',
    climate: 'Климатический комфорт по месяцам',
    photo: 'Фото',
    open: 'Открыть в портале',
    classes: ['очень низкий', 'низкий', 'средний', 'высокий', 'очень высокий'],
    indexNames: { ESI: 'Пригодность для экотуризма', TSI: 'Пригодность для туризма', TPI: 'Туристический потенциал', TRSI: 'Рекреационная пригодность' },
    note: 'Индексы — предварительный скрининг по открытым данным, без экспертной калибровки и полевой проверки. Устойчивость — доля из 500 альтернативных расчётов, в которых ячейка сохраняет свой класс.',
    sources: 'Источники: OpenStreetMap, ESA WorldCover 2021, Copernicus DEM, ЮНЕСКО. Фотографии: Wikimedia Commons, автор и лицензия под каждым снимком.',
  },
} as const;

export const CHAPTERS: Chapter[] = [
  {
    id: 'intro',
    kicker: { uz: 'Kirish', en: 'Introduction', ru: 'Введение' },
    title: { uz: 'Cho‘l, voha va tog‘lar orasida', en: 'Between desert, oasis and mountain', ru: 'Между пустыней, оазисом и горами' },
    body: [
      {
        uz: 'O‘zbekistonning tarixiy shaharlari daryo vohalarida, Qizilqum va Ustyurt cho‘llari chekkasida joylashgan. Sharqda esa G‘arbiy Tyan-Shan va Pomir-Oloy tog‘lari ko‘tariladi.',
        en: 'Uzbekistan’s historic cities lie in river oases at the edge of the Kyzylkum and Ustyurt deserts, while the Western Tien-Shan and Pamir-Alay ranges rise in the east.',
        ru: 'Исторические города Узбекистана лежат в речных оазисах на краю пустынь Кызылкум и Устюрт, а на востоке поднимаются Западный Тянь-Шань и Памиро-Алай.',
      },
      {
        uz: 'Bu hikoya klassik yo‘nalish bo‘ylab g‘arbdan sharqqa, Xivadan Toshkentgacha boradi. Har bir bekatda xarita ochiq ma’lumotlar nima deyishini ko‘rsatadi: turistik salohiyat, bu bahoning qanchalik ishonchli ekani va sayohat uchun qaysi oylar qulay ekani.',
        en: 'This story follows the classic route from west to east, from Khiva to Tashkent. At every stop the map shows what open data say: the tourism potential, how reliable that estimate is, and which months suit a visit.',
        ru: 'История следует классическому маршруту с запада на восток, от Хивы до Ташкента. На каждой остановке карта показывает, что говорят открытые данные: туристический потенциал, надёжность этой оценки и лучшие месяцы для поездки.',
      },
    ],
    view: { center: [40.9, 64.6], zoom: 6 },
    basemap: 'light',
    index: 'TPI',
    routes: ['silk-road-classics'],
    photos: [],
  },
  {
    id: 'khiva',
    kicker: { uz: '1-bob · Xiva', en: 'Chapter 1 · Khiva', ru: 'Глава 1 · Хива' },
    title: { uz: 'Devor ichidagi shahar', en: 'The walled town', ru: 'Город за стенами' },
    body: [
      {
        uz: 'Ichan qal’a — Xivaning devor bilan o‘ralgan ichki shahri, 1990 yildan UNESCO Jahon merosi ro‘yxatida. Bu yerda yodgorliklar bir-biridan bir necha yuz metr uzoqlikda: 1851 yilda boshlanib, tugallanmay qolgan Kalta Minor, 1908–1910 yillarda qurilgan va Xivadagi eng baland Islomxo‘ja minorasi, ikki yuzdan ortiq o‘ymakor yog‘och ustunli Juma masjidi.',
        en: 'Itchan Kala, the walled inner town of Khiva, has been on the UNESCO World Heritage List since 1990. Its monuments stand a few hundred metres apart: the Kalta Minor, begun in 1851 and left unfinished; the Islam Khodja Minaret of 1908–1910, the tallest in Khiva; and the Juma Mosque with more than two hundred carved wooden columns.',
        ru: 'Ичан-Кала, обнесённый стеной внутренний город Хивы, внесён в список Всемирного наследия ЮНЕСКО в 1990 году. Памятники стоят в нескольких сотнях метров друг от друга: Кальта-Минар, начатый в 1851 году и не законченный; минарет Ислам-Ходжа 1908–1910 годов, самый высокий в Хиве; Джума-мечеть с более чем двумястами резными деревянными колоннами.',
      },
      {
        uz: 'Resurslar va xizmatlar shunchalik zich joylashganki, turistik salohiyat va turizmga moslik eng yuqori sinfda. Bu baho barcha muqobil hisob-kitoblarda o‘zgarmaydi.',
        en: 'Resources and services are so densely packed that tourism potential and tourism suitability fall in the highest class, and the class does not change under any of the alternative calculations.',
        ru: 'Ресурсы и услуги расположены так плотно, что туристический потенциал и пригодность для туризма попадают в высший класс, и класс не меняется ни в одном из альтернативных расчётов.',
      },
    ],
    view: { center: [41.3779, 60.3604], zoom: 16 },
    basemap: 'satellite',
    index: null,
    routes: ['khiva-day'],
    photos: ['local_khiva', 'islam_khodja', 'juma_khiva'],
    probe: { lat: 41.3782, lng: 60.3605, place: { uz: 'Ichan qal’a', en: 'Itchan Kala', ru: 'Ичан-Кала' } },
  },
  {
    id: 'khorezm',
    kicker: { uz: '2-bob · Qadimgi Xorazm', en: 'Chapter 2 · Ancient Khorezm', ru: 'Глава 2 · Древний Хорезм' },
    title: { uz: 'Cho‘l chekkasidagi qal’alar', en: 'Fortresses at the desert’s edge', ru: 'Крепости на краю пустыни' },
    body: [
      {
        uz: 'Xivadan shimolda, Amudaryoning o‘ng sohilida Qadimgi Xorazm qal’alari turibdi. Tuproq qal’a milodning dastlabki asrlariga oid shahar-qal’a xarobalari, Ayoz qal’a esa Qizilqum chekkasidagi tepaliklarda joylashgan uchta qal’adan iborat.',
        en: 'North of Khiva, on the right bank of the Amu Darya, stand the fortresses of ancient Khorezm. Toprak-Kala is the ruin of a city-fortress from the first centuries CE; Ayaz-Kala is a group of three fortresses on hills at the edge of the Kyzylkum.',
        ru: 'К северу от Хивы, на правом берегу Амударьи, стоят крепости древнего Хорезма. Топрак-Кала — руины города-крепости первых веков нашей эры; Аяз-Кала — три крепости на холмах у края Кызылкума.',
      },
      {
        uz: 'Bu yerda ekoturizmga moslik ham yuqori: tarixiy obyektlar tabiiy cho‘l landshaftida turibdi. Lekin turistik salohiyat bahosi shaharlardagidek barqaror emas — u muqobil hisob-kitoblarning taxminan to‘rtdan birida boshqa sinfga o‘tadi.',
        en: 'Ecotourism suitability is also high here, because the monuments stand in a natural desert landscape. The tourism potential estimate is less stable than in the cities, however: it changes class in roughly one alternative calculation in four.',
        ru: 'Пригодность для экотуризма здесь тоже высока: памятники стоят в естественном пустынном ландшафте. Но оценка туристического потенциала менее устойчива, чем в городах: примерно в каждом четвёртом альтернативном расчёте она меняет класс.',
      },
    ],
    view: { center: [42.56, 60.05], zoom: 8.3 },
    basemap: 'satellite',
    index: 'ESI',
    routes: ['khorezm-aral'],
    photos: ['ayaz_kala', 'toprak_kala'],
    probe: { lat: 42.0056, lng: 61.0306, place: { uz: 'Ayoz qal’a', en: 'Ayaz-Kala', ru: 'Аяз-Кала' } },
  },
  {
    id: 'bukhara',
    kicker: { uz: '3-bob · Buxoro', en: 'Chapter 3 · Bukhara', ru: 'Глава 3 · Бухара' },
    title: { uz: 'Minoralar va hovuzlar shahri', en: 'A city of minarets and pools', ru: 'Город минаретов и хаузов' },
    body: [
      {
        uz: 'Buxoro tarixiy markazi 1993 yildan UNESCO ro‘yxatida. Uning ramzi — 1127 yilda qurilgan Kalon minorasi. Yaqin atrofda hukmdorlarning qal’a-qarorgohi bo‘lgan Ark, IX–X asrlarga oid Somoniylar maqbarasi, XVI–XVII asrlardagi Labi Hovuz ansambli va 1807 yilda qurilgan to‘rt minorachali Chor Minor joylashgan.',
        en: 'The Historic Centre of Bukhara has been on the UNESCO list since 1993. Its symbol is the Kalyan Minaret of 1127. Nearby stand the Ark, the fortress residence of the rulers; the Samanid Mausoleum of the 9th–10th centuries; the 16th–17th-century Lyab-i Hauz ensemble; and Chor Minor, a gatehouse with four small towers built in 1807.',
        ru: 'Исторический центр Бухары внесён в список ЮНЕСКО в 1993 году. Её символ — минарет Калян 1127 года. Рядом стоят Арк, крепость-резиденция правителей; мавзолей Саманидов IX–X веков; ансамбль Ляби-Хауз XVI–XVII веков и Чор-Минор — надвратное здание с четырьмя башенками 1807 года.',
      },
      {
        uz: 'Turistik salohiyat bu yerda ham eng yuqori. Rekreatsiya mosligi esa deyarli nolga teng: eski shahar zich qurilgan, xaritada yashil maydon va dam olish joylari deyarli yo‘q. Indekslar bir-birini takrorlamasligi shundan ko‘rinadi.',
        en: 'Tourism potential is again in the highest class. Recreation suitability, by contrast, is close to zero: the old town is densely built, with almost no mapped green space or recreation sites. This is why the four indices do not simply repeat one another.',
        ru: 'Туристический потенциал и здесь в высшем классе. Рекреационная пригодность, напротив, близка к нулю: старый город плотно застроен, на карте почти нет зелёных зон и мест отдыха. Поэтому четыре индекса не повторяют друг друга.',
      },
    ],
    view: { center: [39.7762, 64.4155], zoom: 15 },
    basemap: 'satellite',
    index: null,
    routes: ['bukhara-two-days'],
    photos: ['local_bukhara', 'samanid', 'chor_minor'],
    probe: { lat: 39.7759, lng: 64.4148, place: { uz: 'Poi Kalon', en: 'Po-i-Kalyan', ru: 'Пои-Калян' } },
  },
  {
    id: 'nurata',
    kicker: { uz: '4-bob · Nurota va Aydarko‘l', en: 'Chapter 4 · Nurata and Aydarkul', ru: 'Глава 4 · Нурата и Айдаркуль' },
    title: { uz: 'Cho‘l ichidagi ko‘l', en: 'A lake in the desert', ru: 'Озеро в пустыне' },
    body: [
      {
        uz: 'Buxoro va Samarqand oralig‘ida, asosiy yo‘ldan shimolda Nurota tizmasi ko‘tariladi. Uning etagidagi Nurotada muqaddas buloq va baliqli hovuz bor. Shimolroqda, Qizilqumda, 1969 yilgi toshqindan keyin hosil bo‘lgan yirik Aydarko‘l yastanib yotadi; sohilida o‘tov lagerlari ishlaydi.',
        en: 'Between Bukhara and Samarkand, north of the main road, rises the Nuratau range. Nurata, at its foot, has a sacred spring and a pool full of fish. Further north, in the Kyzylkum, lies Lake Aydarkul, a large lake formed after the flood of 1969, with yurt camps on its shore.',
        ru: 'Между Бухарой и Самаркандом, к северу от основной дороги, поднимается хребет Нуратау. В Нурате у его подножия есть священный источник и бассейн с рыбами. Севернее, в Кызылкуме, лежит крупное озеро Айдаркуль, возникшее после паводка 1969 года; на его берегу работают юрточные лагеря.',
      },
      {
        uz: 'Bu bob modelning chegarasini ko‘rsatadi. Ko‘l bo‘yida ekoturizmga moslik o‘rtacha, lekin bu baho muqobil hisob-kitoblarning faqat uchdan birida saqlanadi. Cho‘lda OpenStreetMap nuqtalari kam, shuning uchun model bu yerda ishonchli xulosa bera olmaydi — va buni ochiq aytadi.',
        en: 'This chapter shows where the model reaches its limit. On the lake shore ecotourism suitability is moderate, but the class holds in only about a third of the alternative calculations. Few OpenStreetMap points exist in the desert, so the model cannot give a firm answer here, and it says so.',
        ru: 'Эта глава показывает предел модели. На берегу озера пригодность для экотуризма средняя, но класс сохраняется лишь примерно в трети альтернативных расчётов. В пустыне мало точек OpenStreetMap, поэтому модель не может дать здесь уверенный ответ и прямо об этом сообщает.',
      },
    ],
    view: { center: [40.78, 65.95], zoom: 8.5 },
    basemap: 'terrain',
    index: 'ESI',
    routes: ['nurata-aydarkul'],
    photos: ['aydarkul', 'nurata'],
    probe: { lat: 40.92, lng: 66.0, place: { uz: 'Aydarko‘l sohili', en: 'Shore of Lake Aydarkul', ru: 'Берег Айдаркуля' } },
  },
  {
    id: 'samarkand',
    kicker: { uz: '5-bob · Samarqand', en: 'Chapter 5 · Samarkand', ru: 'Глава 5 · Самарканд' },
    title: { uz: 'Madaniyatlar chorrahasi', en: 'Crossroad of cultures', ru: 'Перекрёсток культур' },
    body: [
      {
        uz: '“Samarqand — madaniyatlar chorrahasi” 2001 yildan UNESCO ro‘yxatida. Registonda uchta madrasa turibdi: Ulug‘bek (1417–1420), Sherdor (1619–1636) va Tillakori (1646–1660). Go‘ri Amirda Amir Temur va temuriylar dafn etilgan, Shohi Zinda esa asosan XIV–XV asrlarga oid koshinkor maqbaralar ko‘chasi.',
        en: '“Samarkand – Crossroad of Cultures” has been on the UNESCO list since 2001. On the Registan stand three madrasas: Ulugh Beg (1417–1420), Sher-Dor (1619–1636) and Tilya-Kori (1646–1660). Gur-e-Amir holds the tombs of Amir Timur and his descendants, and Shah-i-Zinda is a street of tiled mausoleums, mostly from the 14th and 15th centuries.',
        ru: '«Самарканд — перекрёсток культур» внесён в список ЮНЕСКО в 2001 году. На Регистане стоят три медресе: Улугбека (1417–1420), Шердор (1619–1636) и Тилля-Кари (1646–1660). В Гур-Эмире похоронены Амир Темур и его потомки, а Шахи-Зинда — улица изразцовых мавзолеев, в основном XIV–XV веков.',
      },
      {
        uz: 'Shimoliy-sharqda qadimgi Samarqand o‘rni — Afrosiyob shahristoni bor; muzeyida VII asr devoriy suratlari saqlanadi. Registon atrofi butun mamlakatdagi eng yuqori turistik salohiyatli kataklardan biri.',
        en: 'To the north-east lies Afrasiab, the site of ancient Samarkand, whose museum keeps wall paintings of the 7th century. The cells around the Registan are among the highest-scoring in the whole country for tourism potential.',
        ru: 'На северо-востоке находится городище Афрасиаб — место древнего Самарканда, в музее которого хранятся росписи VII века. Ячейки вокруг Регистана — одни из самых высоких по туристическому потенциалу во всей стране.',
      },
    ],
    view: { center: [39.6595, 66.982], zoom: 14 },
    basemap: 'satellite',
    index: null,
    routes: ['samarkand-two-days'],
    photos: ['local_samarkand', 'shahi_zinda', 'gur_emir', 'afrasiab'],
    probe: { lat: 39.6547, lng: 66.9753, place: { uz: 'Registon', en: 'Registan', ru: 'Регистан' } },
  },
  {
    id: 'shakhrisabz',
    kicker: { uz: '6-bob · Shahrisabz', en: 'Chapter 6 · Shakhrisabz', ru: 'Глава 6 · Шахрисабз' },
    title: { uz: 'Amir Temurning vatani', en: 'The home town of Amir Timur', ru: 'Родина Амира Темура' },
    body: [
      {
        uz: 'Samarqanddan janubga yo‘l tog‘ dovonidan o‘tib, Shahrisabzga olib boradi. Shahar tarixiy markazi 2000 yildan UNESCO ro‘yxatida. Oqsaroydan — Amir Temur saroyidan (1380–1404) — ulkan peshtoq qoldiqlari, Dorut Tilovatda esa 1435 yildagi Ko‘k Gumbaz masjidi saqlangan.',
        en: 'South of Samarkand the road crosses a mountain pass to Shakhrisabz, whose historic centre has been on the UNESCO list since 2000. Of the Ak-Saray, Amir Timur’s palace (1380–1404), the remains of a giant portal survive; the Dorut Tilovat complex keeps the Kok Gumbaz Mosque of 1435.',
        ru: 'К югу от Самарканда дорога через горный перевал ведёт в Шахрисабз, исторический центр которого внесён в список ЮНЕСКО в 2000 году. От Аксарая, дворца Амира Темура (1380–1404), сохранились остатки гигантского портала; в комплексе Дорут-Тиловат стоит мечеть Кок-Гумбаз 1435 года.',
      },
      {
        uz: 'Bu yerda turistik salohiyat yuqori, lekin baho sinf chegarasiga yaqin: muqobil hisob-kitoblarning qariyb yarmida u qo‘shni sinfga o‘tadi. Shuning uchun portal har bir katakda ballni ham, uning barqarorligini ham ko‘rsatadi.',
        en: 'Tourism potential is high here, but the score lies close to a class boundary and moves to the neighbouring class in nearly half of the alternative calculations. This is why the portal shows every cell’s score together with its stability.',
        ru: 'Туристический потенциал здесь высокий, но оценка близка к границе класса и почти в половине альтернативных расчётов переходит в соседний класс. Поэтому портал показывает для каждой ячейки и балл, и его устойчивость.',
      },
    ],
    view: { center: [39.0553, 66.829], zoom: 14.5 },
    basemap: 'satellite',
    index: null,
    routes: ['timurid-trail'],
    photos: ['local_shakhrisabz'],
    probe: { lat: 39.0607, lng: 66.8293, place: { uz: 'Oqsaroy', en: 'Ak-Saray', ru: 'Аксарай' } },
  },
  {
    id: 'tashkent',
    kicker: { uz: '7-bob · Toshkent va tog‘lar', en: 'Chapter 7 · Tashkent and the mountains', ru: 'Глава 7 · Ташкент и горы' },
    title: { uz: 'Poytaxtdan G‘arbiy Tyan-Shanga', en: 'From the capital to the Western Tien-Shan', ru: 'От столицы к Западному Тянь-Шаню' },
    body: [
      {
        uz: 'Toshkentda yo‘l Hazrati Imom majmuasi — Usmon Mushafi saqlanadigan diniy markaz va gumbazli Chorsu bozori orqali o‘tadi. Shahardan taxminan 80–90 km uzoqlikda Chorvoq suv ombori, Katta Chimyon cho‘qqisi (3309 m) etagidagi dam olish hududi va 2019 yilda ochilgan Amirsoy kurorti joylashgan.',
        en: 'In Tashkent the route passes the Hazrati Imam complex, the religious centre that keeps the Uthman Quran, and the domed Chorsu Bazaar. Some 80–90 km away lie the Charvak Reservoir, the recreation area below Greater Chimgan peak (3,309 m) and the Amirsoy resort, opened in 2019.',
        ru: 'В Ташкенте маршрут проходит через комплекс Хазрати Имам — религиозный центр, где хранится Коран Усмана, — и купольный базар Чорсу. В 80–90 км от города лежат Чарвакское водохранилище, зона отдыха у подножия Большого Чимгана (3309 м) и курорт Амирсой, открытый в 2019 году.',
      },
      {
        uz: 'Tog‘larda manzara o‘zgaradi: bu mamlakatdagi to‘rtala indeks birdaniga yuqori bo‘lgan kam sonli hududlardan biri. Rekreatsiya mosligi xaritasi asosan shu yerda yonadi — yashil yonbag‘irlar, suv bo‘yi va dam olish joylari bir-biriga yaqin.',
        en: 'In the mountains the picture changes: this is one of the few areas of the country where all four indices are high at once. The recreation suitability map lights up mainly here, where green slopes, waterside and recreation facilities lie close together.',
        ru: 'В горах картина меняется: это один из немногих районов страны, где все четыре индекса одновременно высоки. Карта рекреационной пригодности загорается в основном здесь, где зелёные склоны, берега и места отдыха находятся рядом.',
      },
    ],
    view: { center: [41.48, 69.72], zoom: 9.6 },
    basemap: 'terrain',
    index: 'TRSI',
    routes: ['tashkent-day', 'tashkent-mountains'],
    photos: ['chorsu', 'charvak', 'local_chimgan'],
    probe: { lat: 41.548, lng: 70.02, place: { uz: 'Chimyon', en: 'Chimgan', ru: 'Чимган' } },
  },
  {
    id: 'epilogue',
    kicker: { uz: 'Xulosa', en: 'Epilogue', ru: 'Заключение' },
    title: { uz: 'Ma’lumotlar nimani aytadi', en: 'What the data say', ru: 'Что говорят данные' },
    body: [
      {
        uz: 'Yo‘nalishning deyarli barcha shahar bekatlari turistik salohiyatning eng yuqori sinfida va bu baho ko‘pincha barqaror. Eng yuqori ikki sinf esa mamlakatning atigi 9 foizini egallaydi: imkoniyatlar vohalar va tog‘ etaklarida to‘plangan.',
        en: 'Almost every city stop on the route lies in the highest class of tourism potential, and in most of them that result is stable. The two highest classes together cover only about 9% of the country: opportunity is concentrated in the oases and the foothills.',
        ru: 'Почти все городские остановки маршрута находятся в высшем классе туристического потенциала, и в большинстве из них этот результат устойчив. Два высших класса вместе занимают лишь около 9% страны: возможности сосредоточены в оазисах и предгорьях.',
      },
      {
        uz: 'Cho‘l va olis tabiiy hududlarda baho past yoki noaniq chiqadi — bu ko‘pincha resurs yo‘qligini emas, ma’lumot kamligini bildiradi. Portalda istalgan katakni bosib, uning ballini, sinfini va ishonchliligini o‘zingiz tekshirishingiz mumkin.',
        en: 'In the desert and in remote natural areas scores are low or uncertain, which often reflects missing data rather than missing resources. In the portal you can click any cell and check its score, class and reliability for yourself.',
        ru: 'В пустыне и отдалённых природных районах оценки низкие или неопределённые — чаще из-за нехватки данных, а не ресурсов. В портале можно нажать на любую ячейку и самому проверить её балл, класс и надёжность.',
      },
    ],
    view: { center: [40.9, 64.6], zoom: 6 },
    basemap: 'light',
    index: 'TPI',
    routes: ['silk-road-classics'],
    photos: [],
  },
];
