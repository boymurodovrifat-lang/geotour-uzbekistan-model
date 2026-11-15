'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Search,
  X,
  MapPin,
  Layers,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  ChartColumn,
  Landmark,
  Route,
  BookOpen,
  Ruler,
  Share2,
  Printer,
  LocateFixed,
  Maximize2,
  Minimize2,
  Info,
  Trash2,
  Copy,
  House,
  Mountain,
  BedDouble,
  Star,
  Download,
  Navigation,
  Phone,
  Clock,
  Globe,
  Crosshair,
  Banknote,
  CircleAlert,
  RotateCcw,
} from 'lucide-react';
import destinations from '../data/tourism-destinations.json';
import routes from '../data/tourism-routes.json';
import homeIndices from '../data/home-indices.json';
import { cleanPlaces } from '../lib/tourist';
import boundaries from '../data/region-boundaries.json';
import { regionPointFilter } from '../lib/raster-region';
import { CLASS_RANGES, INDEX_RAMPS, classColors } from '../lib/index-v04';
import { clusterPoints, formatCoordinate, parseCoordinates, toCsv, toGeoJson } from '../lib/geo-tools';
import { addCountryFrame } from './map-frame';
import { useTransport } from './transport';
import { useWeatherLayer, WeatherCard } from './weather';
import { useClimateLayer, ClimateMonthBar, ClimateStrip, CLIMATE_RAMP } from './climate';
import { useIndexLayer, IndexHeader, IndexLegend, IndexControls, IndexSwipe, IndexRegionPanel, indexSummaries, indexNote as indexNoteText } from './index-layer';
import { MapStatus, MapContextMenu, MeasureBar, useMeasure, copyText, downloadFile } from './gp-tools';
import {
  ui,
  pro,
  POI_LAYERS,
  POI_COLORS,
  BASEMAPS,
  THEMES,
  CATALOG,
  LAYER_SOURCE,
  readPermalink,
  type Basemap,
  type ThemeId,
  type LayerState,
} from './geoportal-ui';
const countryFilters = boundaries.features.map((f) => regionPointFilter(f));
const insideCountry = (p: { lat: number; lng: number }) => countryFilters.some((f) => f(p));

const labels={uz:{indices:'Indekslar',indexTitle:'Turizm indekslari',indexIntro:'Besh mustaqil yo‘nalish bo‘yicha baholash.',indexNote:'Xaritada 30 m v0.3 dastlabki hisobi. Yangi v1.0 formulalari bo‘yicha milliy qatlamlar hali hisoblanmagan. Yuqori sinf tashrif ruxsati yoki shahar reytingi emas.',indexLink:'Yangi v1.0 formulasi',mapMethod:'Xaritadagi v0.3 metodikasi',explore:'Manzillar',places:'Obyektlar',trips:'Marshrutlar',title:'O‘zbekistonni kashf eting',intro:'Madaniy meros, shaharlar va tog‘lar. Sayohatingizni manzildan boshlang.',search:'Nom bo‘yicha qidirish',all:'Barcha turlar',culture:'Madaniy meros va muzeylar',sight:'Diqqatga sazovor joylar',nature:'Tabiat va manzara',stay:'Turar joy',food:'Ovqatlanish',money:'Bank va bankomat',health:'Tibbiy yordam',fuel:'Yoqilg‘i',transport:'Transport',info:'Axborot markazi',map:'Xarita',settings:'Xarita qatlamlari',roads:'Asosiy yo‘llar',trails:'OSM marshrut va so‘qmoqlar',close:'Yopish',source:'Manba',unknown:'Ma’lumot taqdim etilmagan',contact:'Kontakt',address:'Manzil',hours:'Ish vaqti',price:'Narx',imageMissing:'Tasdiqlangan rasm mavjud emas',directions:'Xaritada yo‘l izlash',official:'Rasmiy manba',heritage:'Madaniy meros',season:'Tavsiya etilgan mavsum',days:'kun',plan:'Tahririy sayohat rejasi',planNote:'Bu sayohat g‘oyasi, tasdiqlangan transport yo‘li emas. Kunlar rejalashtirish uchun taxmin. Yo‘l vaqti, bron va kirish ruxsatlarini alohida tekshiring.',noRank:'Manzillar reyting qilinmaydi. Viloyatning cho‘l maydoni shaharning turistik ahamiyatini pasaytirmaydi.',research:'Indekslar va metodika (UZ)',method:'Metodika (UZ)',more:'Ko‘proq ko‘rsatish',none:'Mos obyekt topilmadi',poiNote:'OSM ma’lumotlari tozalangan va guruhlangan. Xizmatlar 8 manzilning 40 km atrofini qamraydi. Qayd etilganlik xizmat sifati yoki hozir ochiqligini tasdiqlamaydi.',rules:'Kirish qoidalari',rulesNote:'Muhofaza hududida ruxsat, mavsumiy cheklov va xizmatlarni tashrifdan oldin operator yoki rasmiy manbadan aniqlang.',stops:'Bekatlar',open:'Tafsilotlar',website:'Veb-sayt',photo:'Surat',loading:'Ma’lumotlar yuklanmoqda…'},en:{indices:'Indices',indexTitle:'Tourism indices',indexIntro:'Five independent approaches to assessment.',indexNote:'The map displays preliminary 30 m v0.3 calculations. National layers using the new v1.0 formulas are not yet calculated. A high class is not access permission or a city ranking.',indexLink:'New v1.0 formula (UZ)',mapMethod:'Map v0.3 methodology (UZ)',explore:'Destinations',places:'Places & services',trips:'Routes',title:'Discover Uzbekistan',intro:'Living heritage, cities and mountains. Start with a destination.',search:'Search by name',all:'All categories',culture:'Heritage & museums',sight:'Sights',nature:'Nature & viewpoints',stay:'Accommodation',food:'Food & drink',money:'Banks & ATMs',health:'Healthcare',fuel:'Fuel',transport:'Transport',info:'Visitor information',map:'Map',settings:'Map layers',roads:'Main roads',trails:'OSM routes & trail segments',close:'Close',source:'Source',unknown:'Information not provided',contact:'Contact',address:'Address',hours:'Opening hours',price:'Price',imageMissing:'No verified photograph available',directions:'Find directions on map',official:'Official source',heritage:'Cultural heritage',season:'Suggested season',days:'days',plan:'Editorial trip idea',planNote:'A trip idea, not a verified transport route. Days are planning estimates. Check travel times, bookings and access separately.',noRank:'Destinations are not ranked. A province’s desert area does not reduce a city’s tourism significance.',research:'Indices & methodology (UZ)',method:'Methodology (UZ)',more:'Show more',none:'No matching places',poiNote:'OSM records are cleaned and grouped. Services cover a 40 km radius around eight destinations. A mapped service does not guarantee quality or current availability.',rules:'Access rules',rulesNote:'For protected areas, confirm permits, seasonal restrictions and services with the operator or official source before visiting.',stops:'Stops',open:'Details',website:'Website',photo:'Photo',loading:'Loading places…'},ru:{indices:'Индексы',indexTitle:'Индексы туризма',indexIntro:'Пять самостоятельных направлений оценки.',indexNote:'На карте предварительный расчёт v0.3 с шагом 30 м. Национальные слои по новым формулам v1.0 ещё не рассчитаны. Высокий класс не означает разрешение на посещение или рейтинг города.',indexLink:'Новая формула v1.0 (UZ)',mapMethod:'Методика карты v0.3 (UZ)',explore:'Направления',places:'Места и услуги',trips:'Маршруты',title:'Откройте Узбекистан',intro:'Культурное наследие, города и горы. Начните с направления.',search:'Поиск по названию',all:'Все категории',culture:'Наследие и музеи',sight:'Достопримечательности',nature:'Природа и виды',stay:'Проживание',food:'Еда и напитки',money:'Банки и банкоматы',health:'Медицина',fuel:'Топливо',transport:'Транспорт',info:'Туристическая информация',map:'Карта',settings:'Слои карты',roads:'Основные дороги',trails:'Маршруты и участки троп OSM',close:'Закрыть',source:'Источник',unknown:'Информация не предоставлена',contact:'Контакты',address:'Адрес',hours:'Часы работы',price:'Стоимость',imageMissing:'Проверенное фото отсутствует',directions:'Найти дорогу на карте',official:'Официальный источник',heritage:'Культурное наследие',season:'Рекомендуемый сезон',days:'дней',plan:'Редакционная идея поездки',planNote:'Идея поездки, а не проверенный транспортный маршрут. Дни — ориентир для планирования. Время в пути, бронирование и разрешения уточняйте отдельно.',noRank:'Направления не ранжируются. Площадь пустыни в области не уменьшает туристическое значение города.',research:'Индексы и методика (UZ)',method:'Методика (UZ)',more:'Показать ещё',none:'Места не найдены',poiNote:'Записи OSM очищены и сгруппированы. Услуги охватывают радиус 40 км вокруг восьми направлений. Наличие на карте не гарантирует качество или доступность услуги.',rules:'Правила посещения',rulesNote:'Перед посещением охраняемой территории уточните разрешения, сезонные ограничения и услуги у оператора или в официальном источнике.',stops:'Остановки',open:'Подробнее',website:'Сайт',photo:'Фото',loading:'Загрузка данных…'}};
type Lang = keyof typeof labels;
type Panel = 'layers' | 'indices' | 'explore' | 'places' | 'trips' | 'legend' | 'about' | null;
const FIXED_LAYERS = ['index', 'dest', 'borders', 'roads', 'routes', 'weather', 'climate'];
const PIN_ICON =
  '<svg viewBox="0 0 24 32" width="28" height="38" aria-hidden="true"><path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 32 12 32s12-11.4 12-20.2C24 5.3 18.6 0 12 0z" fill="#c2410c" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4.5" fill="#fff"/></svg>';
const placeKey = (p: any) => (p.isPin ? 'pin:' + Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5) : String(p.id || (p.osmType || 'node') + '-' + p.osmId));
const byName = new Intl.Collator(undefined, { ignorePunctuation: true, sensitivity: 'base', numeric: true });
const routeStops = (route: any): any[] => (route?.stops || []).map((s: any, i: number) => ({ ...s, id: 's:' + route.id + ':' + s.id, routeId: route.id, order: i + 1, description: s.note }));
const hideBroken = (e: any) => {
  e.currentTarget.style.display = 'none';
};
const pinAt = (lat: number, lng: number) => ({ id: 'pin', isPin: true, name: '', lat, lng });

export default function Tourist() {
  const [lang, setLang] = useState<Lang>('uz'),
    [panel, setPanel] = useState<Panel>('layers'),
    [layersTab, setLayersTab] = useState<'catalog' | 'mine'>('catalog'),
    [openGroups, setOpenGroups] = useState<string[]>(['gIndex', 'gDest']),
    [infoOpen, setInfoOpen] = useState(''),
    [theme, setTheme] = useState<ThemeId | ''>('indices'),
    [bg, setBg] = useState<Basemap>('terrain'),
    [bgOpen, setBgOpen] = useState(false),
    [indexOn, setIndexOn] = useState(true),
    [bordersOn, setBordersOn] = useState(true),
    [destOn, setDestOn] = useState(false),
    [poiOn, setPoiOn] = useState<string[]>([]),
    [roadsOn, setRoadsOn] = useState(false),
    [routesOn, setRoutesOn] = useState(false),
    [weatherOn, setWeatherOn] = useState(false),
    [climateOn, setClimateOn] = useState(false),
    [climateMonth, setClimateMonth] = useState(() => new Date().getMonth()),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [placesMode, setPlacesMode] = useState<'all' | 'saved'>('all'),
    [routeFilter, setRouteFilter] = useState<string>('all'),
    [saved, setSaved] = useState<any[]>([]),
    [globalQuery, setGlobalQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [searchCursor, setSearchCursor] = useState(0),
    [data, setData] = useState<any[]>([]),
    [computed, setComputed] = useState<any>(null),
    [loaded, setLoaded] = useState(false),
    [serviceRecords, setServiceRecords] = useState<any[]>([]),
    [servicesLoaded, setServicesLoaded] = useState(false),
    [error, setError] = useState(''),
    [dataAttempt, setDataAttempt] = useState(0),
    [pendingSel, setPendingSel] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [trip, setTrip] = useState<any>(null),
    [ready, setReady] = useState(false),
    [mapReady, setMapReady] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [view, setView] = useState(''),
    [shareOpen, setShareOpen] = useState(false),
    [toast, setToast] = useState(''),
    [fullscreen, setFullscreen] = useState(false),
    [limit, setLimit] = useState(60);
  const mapRef = useRef<any>(null),
    mapEl = useRef<HTMLDivElement>(null),
    markers = useRef<any>(null),
    searchInput = useRef<HTMLInputElement>(null),
    permalink = useRef(readPermalink('')),
    frameRoute = useRef<any>(null),
    locateLayer = useRef<any>(null);
  const t = labels[lang],
    g = ui[lang],
    x = pro[lang];
  const localized = (v: any) => (typeof v === 'string' ? v : v?.[lang] || v?.uz || v?.en || '');
  const source = (p: any) => {
    const id = String(p.id || '').match(/^(?:osm-)?(node|way|relation)[-\/](\d+)$/);
    const u =
      p.sourceUrl ||
      p.sources?.[0]?.url ||
      p.website ||
      (id ? 'https://www.openstreetmap.org/' + id[1] + '/' + id[2] : p.osmId ? 'https://www.openstreetmap.org/' + (p.osmType || 'node') + '/' + p.osmId : '');
    return /^https?:\/\//i.test(u) ? u : '';
  };
  const dayWord = (n: number) =>
    lang === 'ru'
      ? n % 10 === 1 && n % 100 !== 11
        ? 'день'
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? 'дня'
          : 'дней'
      : lang === 'en' && n === 1
        ? 'day'
        : t.days;
  const name = (p: any) =>
    p.isPin ? x.pinTitle : p.nameIsCategoryFallback ? (t as any)[p.category] || p.name : p['name:' + lang] || localized(p.name);
  const image = (p: any) => (typeof p.image === 'string' ? p.image : p.image?.url);
  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 760;

  // Load Leaflet, saved places and the permalink state.
  useEffect(() => {
    const link = readPermalink(window.location.search);
    permalink.current = link;
    const wanted = link.lang || localStorage.getItem('geotour-language');
    if (wanted && ['uz', 'en', 'ru'].includes(wanted)) setLang(wanted as Lang);
    if (link.bg && link.bg in BASEMAPS) setBg(link.bg as Basemap);
    if (link.theme && link.theme in THEMES) setTheme(link.theme as ThemeId);
    if (link.layers) {
      setTheme((link.theme as ThemeId) || '');
      setIndexOn(link.layers.includes('index'));
      setRoadsOn(link.layers.includes('roads'));
      setRoutesOn(link.layers.includes('routes'));
      setWeatherOn(link.layers.includes('weather'));
      setClimateOn(link.layers.includes('climate'));
      setPoiOn(link.layers.filter((l) => (POI_LAYERS as readonly string[]).includes(l)));
    }
    if (link.month !== undefined) setClimateMonth(link.month);
    const linkedRoute = (routes as any[]).find((r) => r.id === link.route);
    if (linkedRoute) setTrip(linkedRoute);
    if (linkedRoute && !link.view) frameRoute.current = linkedRoute;
    if (link.sel?.startsWith('s:')) {
      const owner = (routes as any[]).find((r) => link.sel!.startsWith('s:' + r.id + ':'));
      const stop = routeStops(owner).find((st) => st.id === link.sel);
      if (stop) {
        setTrip(owner);
        setSelected(stop);
      }
    } else if (link.pin) setSelected(pinAt(link.pin.lat, link.pin.lng));
    else if (link.sel?.startsWith('d:')) setSelected((destinations as any[]).find((d) => d.id === link.sel!.slice(2)) || null);
    else if (link.sel?.startsWith('p:')) setPendingSel(link.sel.slice(2));
    try {
      const stored = JSON.parse(localStorage.getItem('geotour-saved') || '[]');
      if (Array.isArray(stored)) setSaved(stored.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)).slice(0, 500));
    } catch {
      /* A damaged list is ignored. */
    }
    if (window.innerWidth < 760) setPanel(null);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/vendor/leaflet.css';
    document.head.appendChild(l);
    const s = document.createElement('script');
    s.src = '/vendor/leaflet.js';
    s.onload = () => setReady(true);
    if ((window as any).L) setReady(true);
    else document.body.appendChild(s);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInput.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setBgOpen(false);
        setShareOpen(false);
      }
    };
    document.addEventListener('fullscreenchange', fs);
    window.addEventListener('keydown', key);
    setHydrated(true);
    return () => {
      document.removeEventListener('fullscreenchange', fs);
      window.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/data', { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d: any) => {
        setData(cleanPlaces(d.points, insideCountry));
        setComputed(d.computed);
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError('data');
      });
    return () => c.abort();
  }, [dataAttempt]);
  useEffect(() => {
    localStorage.setItem('geotour-language', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (hydrated) localStorage.setItem('geotour-saved', JSON.stringify(saved));
  }, [saved, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // Map.
  useEffect(() => {
    if (!ready || !mapEl.current) return;
    const L = (window as any).L,
      m = L.map(mapEl.current, { center: [40.5, 65.5], zoom: 6, minZoom: 4, maxZoom: 18, zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: false });
    mapRef.current = m;
    addCountryFrame(L, m, { basemap: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(m);
    markers.current = L.layerGroup().addTo(m);
    const resize = () => m.invalidateSize();
    const observer = new ResizeObserver(resize);
    observer.observe(mapEl.current);
    const moved = () => {
      const c = m.getCenter();
      setView(c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + m.getZoom());
    };
    const closePopups = () => setBgOpen(false);
    m.on('moveend', moved);
    m.on('click', closePopups);
    moved();
    window.addEventListener('beforeprint', resize);
    window.addEventListener('afterprint', resize);
    setMapReady(true);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', resize);
      window.removeEventListener('afterprint', resize);
      m.off('moveend', moved);
      m.off('click', closePopups);
      m.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [ready]);
  useEffect(() => {
    const m = mapRef.current;
    if (!mapReady || !m) return;
    const L = (window as any).L,
      b = BASEMAPS[bg];
    const layer = L.tileLayer(b.url, {
      maxNativeZoom: b.maxNativeZoom,
      maxZoom: 20,
      attribution: b.attribution,
      className: b.className,
    }).addTo(m);
    layer.bringToBack();
    return () => {
      m.removeLayer(layer);
    };
  }, [mapReady, bg]);

  const indexMap = useIndexLayer(mapRef, mapReady, indexOn, lang);
  const inIndexRegion = useMemo(() => regionPointFilter(indexMap.feature), [indexMap.feature]);
  const weather = useWeatherLayer(mapRef, mapReady, weatherOn, lang);
  const climate = useClimateLayer(mapRef, mapReady, climateOn, climateMonth);
  const transport = useTransport(mapRef, mapReady && (roadsOn || routesOn), indexMap.region, lang);
  const measure = useMeasure(mapRef, mapReady, lang);
  useEffect(() => {
    transport.setRoadsOn(roadsOn);
    transport.setRoutesOn(routesOn);
  }, [roadsOn, routesOn]);

  // Permalink layers that live inside the index hook.
  useEffect(() => {
    if (!hydrated) return;
    const link = permalink.current;
    if (link.layers) {
      setBordersOn(link.layers.includes('borders'));
      setDestOn(link.layers.includes('dest'));
    }
    if (link.region) indexMap.setRegion(link.region);
    if (link.opacity !== undefined) indexMap.setOpacity(link.opacity);
  }, [hydrated]);
  // Restore the saved view after the index layer has done its initial fit.
  useEffect(() => {
    const v = permalink.current.view,
      m = mapRef.current;
    if (!mapReady || !v || !m) return;
    const id = setTimeout(() => m.setView([v.lat, v.lng], v.z, { animate: false }), 350);
    return () => clearTimeout(id);
  }, [mapReady]);
  // Write the permalink.
  useEffect(() => {
    if (!hydrated) return;
    const q = new URLSearchParams();
    q.set('lang', lang);
    if (theme) q.set('theme', theme);
    q.set('bg', bg);
    q.set('layers', activeLayers.join(','));
    if (indexOn) {
      q.set('index', indexMap.index);
      if (indexMap.opacity !== 90) q.set('op', String(indexMap.opacity));
    }
    if (indexMap.region !== 'all') q.set('region', indexMap.region);
    if (view) {
      const [lat, lng, z] = view.split(',');
      q.set('lat', lat);
      q.set('lng', lng);
      q.set('z', z);
    }
    if (selected?.isPin) q.set('pin', selected.lat.toFixed(5) + ',' + selected.lng.toFixed(5));
    else if (selected?.routeId) q.set('sel', selected.id);
    else if (selected?.id) q.set('sel', ((destinations as any[]).some((d) => d.id === selected.id) ? 'd:' : 'p:') + selected.id);
    else if (pendingSel) q.set('sel', 'p:' + pendingSel);
    if (trip) q.set('route', trip.id);
    if (climateOn) q.set('cm', String(climateMonth + 1));
    window.history.replaceState(null, '', '?' + q.toString());
  }, [hydrated, lang, theme, bg, indexOn, indexMap.index, indexMap.opacity, indexMap.region, bordersOn, destOn, poiOn, roadsOn, routesOn, weatherOn, climateOn, climateMonth, view, selected, pendingSel, trip]);

  // Places and services load lazily, only when a place layer, the list or a shared place needs them.
  const needServices = poiOn.length > 0 || panel === 'places' || !!pendingSel || globalQuery.trim().length >= 2;
  useEffect(() => {
    if (!needServices || servicesLoaded) return;
    const c = new AbortController();
    Promise.all(
      ['/tourism/accommodation.json', '/tourism/services.json'].map((url) =>
        fetch(url, { signal: c.signal }).then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
      ),
    )
      .then((records: any) => {
        setServiceRecords(cleanPlaces([...records[0], ...records[1]], insideCountry));
        setServicesLoaded(true);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError('services');
      });
    return () => c.abort();
  }, [needServices, servicesLoaded, dataAttempt]);
  const allPlaces = useMemo(() => cleanPlaces([...serviceRecords, ...data], insideCountry), [data, serviceRecords]);
  const filtered = useMemo(
    () =>
      allPlaces
        .filter((p) => (!category || p.category === category) && p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a, b) => byName.compare(a.name, b.name)),
    [allPlaces, query, category],
  );
  const dests = (destinations as any[]).filter((d) => localized(d.name).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  // A shared link to one place is resolved as soon as its record has loaded.
  useEffect(() => {
    if (!pendingSel) return;
    const found = allPlaces.find((p) => p.id === pendingSel);
    if (found) setSelected(found);
    if (found || (loaded && servicesLoaded)) setPendingSel('');
  }, [pendingSel, allPlaces, loaded, servicesLoaded]);

  // Saved places.
  const savedKeys = useMemo(() => new Set(saved.map(placeKey)), [saved]);
  const isSaved = (p: any) => savedKeys.has(placeKey(p));
  const toggleSave = (p: any) => {
    const key = placeKey(p),
      had = savedKeys.has(key);
    setSaved((v) => (had ? v.filter((s) => placeKey(s) !== key) : [{ ...p, name: p.isPin ? x.pinTitle : p.name }, ...v].slice(0, 500)));
    setToast(had ? x.savedRemoved : x.savedAdded);
  };
  const savedShown = saved.filter((p) => name(p).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const exportList = (kind: 'csv' | 'geojson') => {
    const list = placesMode === 'saved' ? savedShown : filtered;
    const rows = list.map((p) => ({
      name: name(p),
      category: (t as any)[p.category] || (p.isPin ? x.pinTitle : t.explore),
      lat: p.lat,
      lng: p.lng,
      address: localized(p.address),
      phone: p.phone || '',
      website: p.website || '',
      opening_hours: p.openingHours || p.opening_hours || '',
      source: source(p),
    }));
    const stamp = new Date().toISOString().slice(0, 10),
      base = 'geotour-' + (placesMode === 'saved' ? 'saved' : category || 'places') + '-' + stamp;
    if (kind === 'csv')
      downloadFile(base + '.csv', 'text/csv;charset=utf-8', '﻿' + toCsv(rows, ['name', 'category', 'lat', 'lng', 'address', 'phone', 'website', 'opening_hours', 'source']));
    else
      downloadFile(
        base + '.geojson',
        'application/geo+json',
        JSON.stringify(toGeoJson(rows, '© OpenStreetMap contributors (ODbL 1.0) · GeoTour Uzbekistan')),
      );
  };

  // Layer model. Borders and destinations share state with the index hook.
  const isOn = (id: string) =>
    id === 'index'
      ? indexOn
      : id === 'dest'
        ? destOn
        : id === 'borders'
          ? bordersOn
          : id === 'roads'
            ? roadsOn
            : id === 'routes'
              ? routesOn
              : id === 'weather'
                ? weatherOn
                : id === 'climate'
                  ? climateOn
                  : poiOn.includes(id);
  const setOn = (id: string, on: boolean) => {
    setTheme('');
    if (id === 'index') setIndexOn(on);
    else if (id === 'dest') setDestOn(on);
    else if (id === 'borders') setBordersOn(on);
    else if (id === 'roads') setRoadsOn(on);
    else if (id === 'routes') setRoutesOn(on);
    else if (id === 'weather') setWeatherOn(on);
    else if (id === 'climate') setClimateOn(on);
    else setPoiOn((v) => (on ? [...new Set([...v, id])] : v.filter((p) => p !== id)));
  };
  const activeLayers = [...FIXED_LAYERS.filter(isOn), ...POI_LAYERS.filter((p) => poiOn.includes(p))];
  const applyTheme = (id: ThemeId) => {
    const s: LayerState = THEMES[id];
    setTheme(id);
    setIndexOn(s.index);
    if (s.indexId) indexMap.setIndex(s.indexId);
    setDestOn(s.dest);
    setBordersOn(s.borders);
    setRoadsOn(s.roads);
    setRoutesOn(s.routes);
    setPoiOn(s.poi);
    setSelected(null);
    setTrip(null);
  };
  const clearLayers = () => {
    setTheme('');
    setIndexOn(false);
    setDestOn(false);
    setBordersOn(false);
    setRoadsOn(false);
    setRoutesOn(false);
    setWeatherOn(false);
    setClimateOn(false);
    setPoiOn([]);
  };
  const layerName = (id: string) =>
    id === 'index'
      ? g.indexLayer
      : id === 'dest'
        ? g.destLayer
        : id === 'borders'
          ? g.borders
          : id === 'roads'
            ? t.roads
            : id === 'routes'
              ? t.trails
              : id === 'weather'
                ? g.weatherLayer
                : id === 'climate'
                  ? g.climateLayer
                  : (t as any)[id];
  const swatch = (id: string) =>
    id === 'index' ? (
      <i className="gp-swatch ramp" style={{ background: 'linear-gradient(90deg,' + (INDEX_RAMPS[indexMap.index] || INDEX_RAMPS.ESI).join(',') + ')' }} />
    ) : id === 'borders' ? (
      <i className="gp-swatch line" style={{ background: '#5f7f70' }} />
    ) : id === 'roads' ? (
      <i className="gp-swatch line" style={{ background: '#4d667b' }} />
    ) : id === 'routes' ? (
      <i className="gp-swatch line dashed" />
    ) : id === 'weather' ? (
      <i className="gp-swatch wx">°</i>
    ) : id === 'climate' ? (
      <i className="gp-swatch ramp" style={{ background: 'linear-gradient(90deg,' + CLIMATE_RAMP.join(',') + ')' }} />
    ) : (
      <i className="gp-swatch" style={{ background: id === 'dest' ? '#176b61' : POI_COLORS[id] }} />
    );

  // Region outlines when the index layer is off (the index hook draws them otherwise).
  useEffect(() => {
    const m = mapRef.current;
    if (!mapReady || !m || !bordersOn) return;
    const L = (window as any).L;
    const outlines = L.geoJSON(boundaries, {
      style: (f: any) => ({
        color: indexMap.region !== 'all' && f.properties.regionId === indexMap.region ? '#244e3c' : '#5f7f70',
        weight: indexMap.region !== 'all' && f.properties.regionId === indexMap.region ? 2.4 : 1.2,
        opacity: 0.9,
        fill: true,
        fillOpacity: 0,
      }),
      onEachFeature: (f: any, p: any) => {
        const label = document.createElement('span');
        label.textContent = lang === 'en' ? f.properties.shapeName : f.properties.nameUz;
        p.bindTooltip(label, { sticky: true });
      },
    }).addTo(m);
    return () => {
      m.removeLayer(outlines);
    };
  }, [mapReady, bordersOn, indexMap.region, lang]);

  const focus = (p: any) => {
    setSelected(p);
    if (!p.routeId) setTrip(null);
    setSearchOpen(false);
    if (isMobile()) setPanel(null);
    const m = mapRef.current;
    if (m)
      m.fitBounds(
        [
          [p.lat, p.lng],
          [p.lat, p.lng],
        ],
        {
          maxZoom: p.heritage ? 12 : p.isPin ? Math.max(m.getZoom(), 11) : p.routeId ? 14 : 15,
          paddingTopLeft: [25, 75],
          paddingBottomRight: m.getSize().x < 700 ? [25, m.getSize().y * 0.55 + 15] : [430, 40],
        },
      );
  };
  const dropPin = (lat: number, lng: number) => focus(pinAt(lat, lng));
  useEffect(() => {
    const r = frameRoute.current,
      m = mapRef.current;
    if (!mapReady || !r || !m) return;
    frameRoute.current = null;
    // After the layers have done their initial country fit.
    const id = setTimeout(() => m.fitBounds(r.path, { paddingTopLeft: [40, 70], paddingBottomRight: m.getSize().x < 700 ? [40, m.getSize().y * 0.55 + 15] : [440, 60], maxZoom: r.distanceKm < 20 ? 16 : 13, animate: false }), 400);
    return () => clearTimeout(id);
  }, [mapReady]);
  const openRoute = (r: any) => {
    setTrip(r);
    setSelected(null);
    const m = mapRef.current;
    if (m && r.path?.length)
      m.fitBounds(r.path, {
        paddingTopLeft: [40, 70],
        paddingBottomRight: m.getSize().x < 700 ? [40, m.getSize().y * 0.55 + 15] : [440, 60],
        maxZoom: r.distanceKm < 20 ? 16 : 13,
      });
    if (isMobile()) setPanel(null);
  };
  const fitRegion = (regionId: string) => {
    const m = mapRef.current,
      L = (window as any).L;
    indexMap.setRegion(regionId);
    const f = boundaries.features.find((b) => b.properties.regionId === regionId);
    if (m && L) m.fitBounds(L.geoJSON(f || boundaries).getBounds(), { padding: [30, 30], maxZoom: f ? 10 : 6 });
  };

  // Markers: place layers (clustered), destinations, trip stops, the selection and dropped pins.
  const savedMode = panel === 'places' && placesMode === 'saved';
  useEffect(() => {
    const m = mapRef.current,
      grp = markers.current;
    if (!m || !grp) return;
    const L = (window as any).L;
    const open = (p: any) => () => {
      if (!m.__geotourTool) focus(p);
    };
    const draw = () => {
      grp.clearLayers();
      const showList = panel === 'places' && !savedMode && (query || category || !poiOn.length);
      const pool = savedMode ? saved : showList ? filtered : poiOn.length ? allPlaces.filter((p) => poiOn.includes(p.category)) : [];
      const bounds = m.getBounds().pad(0.08),
        zoom = m.getZoom();
      const inView = pool.filter((p) => bounds.contains([p.lat, p.lng]));
      const single = (p: any) =>
        L.circleMarker([p.lat, p.lng], {
          radius: 6.5,
          color: '#fff',
          weight: 1.5,
          fillColor: POI_COLORS[p.category] || '#176b61',
          fillOpacity: 0.95,
        })
          .bindTooltip(name(p), { direction: 'top', className: 'travel-map-name' })
          .on('click', open(p))
          .addTo(grp);
      if (zoom >= 14 || inView.length <= 40) inView.slice(0, 1500).forEach(single);
      else {
        const projected = inView.map((p) => m.project([p.lat, p.lng], zoom));
        for (const cell of clusterPoints(projected, 62)) {
          if (cell.items.length === 1) {
            single(inView[cell.items[0]]);
            continue;
          }
          const members = cell.items.map((i) => inView[i]),
            kinds = new Set(members.map((p) => p.category)),
            size = members.length < 10 ? 30 : members.length < 100 ? 36 : 44;
          const bubble = document.createElement('span');
          bubble.textContent = members.length > 999 ? (members.length / 1000).toFixed(1) + 'k' : String(members.length);
          bubble.style.background = kinds.size === 1 ? POI_COLORS[[...kinds][0]] || '#1f4f46' : '#1f4f46';
          L.marker(m.unproject([cell.x, cell.y], zoom), {
            icon: L.divIcon({ className: 'gp-cluster', html: bubble, iconSize: [size, size] }),
            title: members.length + ' ' + x.cluster,
            keyboard: false,
          })
            .on('click', () => {
              if (m.__geotourTool) return;
              m.fitBounds(L.latLngBounds(members.map((p) => [p.lat, p.lng])), { padding: [70, 70], maxZoom: Math.min(18, zoom + 3) });
            })
            .addTo(grp);
        }
      }
      const stops = routeStops(trip);
      if (trip?.path?.length > 1) {
        L.polyline(trip.path, { color: '#ffffff', weight: 7, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grp);
        L.polyline(trip.path, { color: '#0f6b5c', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grp);
      }
      for (const p of stops) {
        const badge = document.createElement('span');
        badge.textContent = String(p.order);
        if (selected?.id === p.id) badge.className = 'on';
        L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'gp-stop', html: badge, iconSize: [26, 26] }), keyboard: false, zIndexOffset: selected?.id === p.id ? 900 : 500 })
          .bindTooltip(p.order + '. ' + localized(p.name), { direction: 'top', offset: [0, -12], className: 'travel-map-name' })
          .on('click', open(p))
          .addTo(grp);
      }
      const main = trip
        ? []
        : destOn || panel === 'explore'
          ? (destinations as any[]).filter((d) => indexMap.region === 'all' || inIndexRegion(d))
          : [];
      for (const p of main as any[]) {
        const label = localized(p.name);
        L.circleMarker([p.lat, p.lng], {
          radius: 9,
          color: '#fff',
          weight: 2,
          fillColor: p.heritage ? '#b56b2c' : '#176b61',
          fillOpacity: 0.95,
        })
          .bindTooltip(label, { direction: 'top', permanent: true, offset: [0, inView.length ? -16 : -6], className: 'travel-map-name' })
          .on('click', open(p))
          .addTo(grp);
      }
      if (selected?.isPin)
        L.marker([selected.lat, selected.lng], {
          icon: L.divIcon({ className: 'gp-pin', html: PIN_ICON, iconSize: [28, 38], iconAnchor: [14, 38] }),
          keyboard: false,
        })
          .on('click', open(selected))
          .addTo(grp);
      else if (selected && !selected.routeId) {
        L.circleMarker([selected.lat, selected.lng], { radius: 15, color: '#0f5148', weight: 3, opacity: 0.9, fill: false, interactive: false }).addTo(grp);
        if (!main.includes(selected))
          L.circleMarker([selected.lat, selected.lng], {
            radius: 7,
            color: '#fff',
            weight: 2,
            fillColor: POI_COLORS[selected.category] || '#176b61',
            fillOpacity: 1,
            interactive: false,
          }).addTo(grp);
      }
    };
    draw();
    m.on('moveend', draw);
    return () => m.off('moveend', draw);
  }, [mapReady, panel, savedMode, saved, filtered, allPlaces, poiOn, lang, trip, selected, destOn, indexMap.region, inIndexRegion, query, category]);
  useEffect(() => {
    setLimit(60);
  }, [category, query, placesMode]);

  // Map tools.
  const goHome = () => {
    const m = mapRef.current,
      L = (window as any).L;
    indexMap.setRegion('all');
    if (m && L) m.fitBounds(L.geoJSON(boundaries).getBounds(), { padding: [30, 30] });
  };
  const locate = () => {
    const m = mapRef.current,
      L = (window as any).L;
    if (!m) return;
    m.once('locationfound', (e: any) => {
      if (locateLayer.current) m.removeLayer(locateLayer.current);
      locateLayer.current = L.layerGroup([
        L.circle(e.latlng, { radius: e.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.08, interactive: false }),
        L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }),
      ]).addTo(m);
    });
    m.once('locationerror', () => setToast(g.locError));
    m.locate({ setView: true, maxZoom: 13 });
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const copyLink = () => copyText(window.location.href, () => setToast(g.copied));
  const openPanel = (p: Exclude<Panel, null>) => {
    setPanel((v) => (v === p ? null : p));
    setSearchOpen(false);
    setShareOpen(false);
    if (p === 'places' || p === 'explore') setQuery('');
  };
  const retryData = () => {
    setError('');
    setDataAttempt((v) => v + 1);
  };

  // Global search across coordinates, destinations, regions, layers and places.
  const results = useMemo(() => {
    const s = globalQuery.trim().toLocaleLowerCase();
    if (s.length < 2) return [];
    const out: { kind: string; key: string; label: string; hint: string; run: () => void }[] = [];
    const at = parseCoordinates(globalQuery);
    if (at)
      out.push({
        kind: 'coord',
        key: 'c',
        label: formatCoordinate(at.lat, at.lng),
        hint: x.dropPin,
        run: () => dropPin(at.lat, at.lng),
      });
    for (const d of destinations as any[])
      if (localized(d.name).toLocaleLowerCase().includes(s))
        out.push({ kind: 'dest', key: 'd' + d.id, label: localized(d.name), hint: d.heritage ? localized(d.heritage) : t.explore, run: () => focus(d) });
    for (const f of boundaries.features) {
      const nm = lang === 'en' ? f.properties.shapeName : f.properties.nameUz;
      if ((f.properties.nameUz + ' ' + f.properties.shapeName).toLocaleLowerCase().includes(s))
        out.push({
          kind: 'region',
          key: 'r' + f.properties.regionId,
          label: nm,
          hint: g.regions,
          run: () => {
            fitRegion(f.properties.regionId);
            setSearchOpen(false);
          },
        });
    }
    const layerIds = [...FIXED_LAYERS, ...POI_LAYERS];
    for (const id of layerIds)
      if (String(layerName(id)).toLocaleLowerCase().includes(s))
        out.push({
          kind: 'layer',
          key: 'l' + id,
          label: layerName(id),
          hint: g.layers,
          run: () => {
            setOn(id, true);
            setPanel('layers');
            setLayersTab('mine');
            setSearchOpen(false);
          },
        });
    for (const m of homeIndices)
      if ((m.id + ' ' + m.name[lang]).toLocaleLowerCase().includes(s))
        out.push({
          kind: 'layer',
          key: 'i' + m.id,
          label: m.id + ' · ' + m.name[lang],
          hint: t.indices,
          run: () => {
            indexMap.setIndex(m.id);
            setIndexOn(true);
            setSearchOpen(false);
          },
        });
    let n = 0;
    for (const p of allPlaces) {
      if (n >= 8) break;
      if (p.name.toLocaleLowerCase().includes(s)) {
        n++;
        out.push({ kind: 'place', key: 'p' + placeKey(p), label: name(p), hint: (t as any)[p.category], run: () => focus(p) });
      }
    }
    return out.slice(0, 24);
  }, [globalQuery, lang, allPlaces, indexOn, poiOn, roadsOn, routesOn]);
  useEffect(() => setSearchCursor(0), [globalQuery]);

  const panelTitle =
    panel === 'layers'
      ? g.layers
      : panel === 'indices'
        ? t.indexTitle
        : panel === 'explore'
          ? t.explore
          : panel === 'places'
            ? t.places
            : panel === 'trips'
              ? t.trips
              : panel === 'legend'
                ? g.legend
                : g.about;
  const groupCount = (items: string[]) => items.filter(isOn).length;
  const kinds: [string, string][] = [
    ['coord', x.coords],
    ['dest', t.explore],
    ['region', g.regions],
    ['layer', g.layers],
    ['place', t.places],
  ];
  const indexNote = indexNoteText(lang);
  const indexColors = classColors(indexMap.index);
  const indexTitle = indexMap.index + ' · ' + localized(indexMap.profile.name);
  const busy =
    (!loaded && !error) ||
    (needServices && !servicesLoaded && !error) ||
    (indexOn && indexMap.status === 'loading') ||
    ((roadsOn || routesOn) && !transport.bundle && !transport.error);
  const layerRow = (id: string) => (
    <div className="gp-layer-item" key={id}>
      <div className="gp-layer-row">
        <label className="gp-layer">
          <input type="checkbox" checked={isOn(id)} onChange={(e) => setOn(id, e.target.checked)} />
          {swatch(id)}
          <span>{layerName(id)}</span>
        </label>
        <button
          className="gp-layer-info"
          aria-expanded={infoOpen === id}
          aria-label={x.layerInfo + ': ' + layerName(id)}
          title={x.layerInfo}
          onClick={() => setInfoOpen((v) => (v === id ? '' : id))}
        >
          <Info size={15} />
        </button>
      </div>
      {infoOpen === id && (
        <p className="gp-layer-meta">
          {x.info[LAYER_SOURCE[id].kind]}{' '}
          <a href={LAYER_SOURCE[id].url} target="_blank" rel="noreferrer">
            {x.metadata}
            <ExternalLink size={12} />
          </a>
        </p>
      )}
    </div>
  );
  const placeRow = (p: any) => (
    <button className="travel-place" key={placeKey(p)} onClick={() => focus(p)}>
      <i className="gp-swatch" style={{ background: p.isPin ? '#c2410c' : POI_COLORS[p.category] || '#176b61' }} />
      <span>
        <b>{name(p)}</b>
        <small>{(t as any)[p.category] || (p.isPin ? formatCoordinate(p.lat, p.lng) : p.heritage ? localized(p.heritage) : t.explore)}</small>
      </span>
      {isSaved(p) && <Star size={14} className="gp-star" />}
      <ChevronRight size={15} />
    </button>
  );
  const sel = selected;
  const selRows: [React.ReactNode, string, string][] = sel
    ? (
        [
          [<MapPin size={15} key="i" />, t.address, localized(sel.address)],
          [<Phone size={15} key="i" />, t.contact, [sel.phone, sel.email].filter(Boolean).join(' · ') || localized(sel.contact)],
          [<Clock size={15} key="i" />, t.hours, localized(sel.openingHours || sel.opening_hours)],
          [<Banknote size={15} key="i" />, t.price, localized(sel.price)],
        ] as [React.ReactNode, string, string][]
      ).filter((row) => row[2])
    : [];

  return (
    <div className={'gp' + (fullscreen ? ' gp-fullscreen' : '')}>
      <header className="gp-header">
        <a href="/" className="gp-brand">
          <Compass />
          <span>
            GeoTour Uzbekistan<small>{t.title}</small>
          </span>
        </a>
        <div className="gp-search" role="search">
          <label className="gp-search-box">
            <Search size={17} />
            <input
              ref={searchInput}
              aria-label={g.searchAll}
              placeholder={g.searchAll}
              value={globalQuery}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSearchCursor((v) => Math.min(v + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSearchCursor((v) => Math.max(v - 1, 0));
                } else if (e.key === 'Enter' && results[searchCursor]) results[searchCursor].run();
                else if (e.key === 'Escape') {
                  setSearchOpen(false);
                  e.currentTarget.blur();
                }
              }}
            />
            {globalQuery ? (
              <button type="button" aria-label={t.close} onClick={() => setGlobalQuery('')}>
                <X size={15} />
              </button>
            ) : (
              <kbd title={x.searchKey}>/</kbd>
            )}
          </label>
          {searchOpen && globalQuery.trim().length >= 2 && (
            <div className="gp-search-results">
              {!results.length && <p className="gp-search-empty">{needServices && !servicesLoaded && !error ? x.loading : g.noResults}</p>}
              {kinds.map(([kind, title]) => {
                const rows = results.filter((r) => r.kind === kind);
                return rows.length ? (
                  <div className="gp-search-group" key={kind}>
                    <h4>{title}</h4>
                    {rows.map((r) => (
                      <button key={r.key} data-active={results.indexOf(r) === searchCursor} onMouseDown={(e) => e.preventDefault()} onClick={r.run}>
                        {kind === 'coord' ? <Crosshair size={15} /> : kind === 'dest' ? <Landmark size={15} /> : kind === 'layer' ? <Layers size={15} /> : <MapPin size={15} />}
                        <span>{r.label}</span>
                        <small>{r.hint}</small>
                      </button>
                    ))}
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
        <nav className="gp-header-right">
          <a className="gp-story-link" href={'/story?lang=' + lang}>
            <BookOpen size={16} />
            <span>{g.story}</span>
          </a>
          <div className="gp-lang" role="group" aria-label="Language / Til / Язык">
            {(['uz', 'en', 'ru'] as const).map((k) => (
              <button key={k} aria-pressed={lang === k} lang={k} title={k === 'uz' ? 'O‘zbekcha' : k === 'en' ? 'English' : 'Русский'} onClick={() => setLang(k)}>
                {k === 'uz' ? 'O‘Z' : k.toUpperCase()}
              </button>
            ))}
          </div>
        </nav>
      </header>
      {searchOpen && globalQuery.trim().length >= 2 && <div className="gp-scrim" onClick={() => setSearchOpen(false)} />}

      <main className="gp-body">
        {panel && (
          <aside className="gp-panel" data-panel={panel} aria-label={panelTitle}>
            <div className="gp-panel-head">
              <h2>{panelTitle}</h2>
              <button onClick={() => setPanel(null)} aria-label={t.close} title={t.close}>
                <X size={18} />
              </button>
            </div>
            {panel === 'layers' && (
              <div className="gp-panel-tabs" role="group">
                <button aria-pressed={layersTab === 'catalog'} onClick={() => setLayersTab('catalog')}>
                  {g.catalog}
                </button>
                <button aria-pressed={layersTab === 'mine'} onClick={() => setLayersTab('mine')}>
                  {g.myLayers}
                  {activeLayers.length > 0 && <span className="gp-count">{activeLayers.length}</span>}
                </button>
              </div>
            )}
            <div className="gp-panel-scroll">
              {panel === 'layers' && layersTab === 'catalog' && (
                <>
                  <div className="gp-label">{g.theme}</div>
                  <div className="gp-themes">
                    {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                      <button key={id} className="gp-theme" aria-pressed={theme === id} onClick={() => applyTheme(id)}>
                        {id === 'indices' ? <ChartColumn size={18} /> : id === 'heritage' ? <Landmark size={18} /> : id === 'nature' ? <Mountain size={18} /> : <BedDouble size={18} />}
                        <span>{g.themes[id]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="gp-label">{g.catalog}</div>
                  {CATALOG.map((grp) => {
                    const open = openGroups.includes(grp.id),
                      count = groupCount(grp.items);
                    return (
                      <section className="gp-group" data-open={open} key={grp.id}>
                        <button aria-expanded={open} onClick={() => setOpenGroups((v) => (open ? v.filter((k) => k !== grp.id) : [...v, grp.id]))}>
                          <ChevronRight size={16} />
                          <span>{(g as any)[grp.id]}</span>
                          {count > 0 && <span className="gp-count">{count}</span>}
                        </button>
                        {open && (
                          <div className="gp-group-body">
                            {grp.items.map(layerRow)}
                            {grp.id === 'gIndex' && (
                              <div className="gp-radio-list" role="radiogroup" aria-label={t.indices}>
                                {homeIndices.map((m) => (
                                  <label className="gp-layer sub" key={m.id}>
                                    <input
                                      type="radio"
                                      name="gp-index"
                                      checked={indexOn && indexMap.index === m.id}
                                      onChange={() => {
                                        indexMap.setIndex(m.id);
                                        setOn('index', true);
                                      }}
                                    />
                                    <b style={{ color: m.color }}>{m.id}</b>
                                    <span>{localized(m.name)}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </>
              )}
              {panel === 'layers' && layersTab === 'mine' && (
                <>
                  {!activeLayers.length ? (
                    <p className="gp-empty">
                      <Layers size={22} />
                      {g.noLayers}
                    </p>
                  ) : (
                    <>
                      {activeLayers.map((id) => (
                        <section className="gp-mine-row" key={id}>
                          <header>
                            {swatch(id)}
                            <span>{id === 'index' ? indexTitle : layerName(id)}</span>
                            <button aria-label={g.remove + ': ' + layerName(id)} title={g.remove} onClick={() => setOn(id, false)}>
                              <X size={15} />
                            </button>
                          </header>
                          {id === 'index' && <IndexControls state={indexMap} lang={lang} />}
                        </section>
                      ))}
                      <button className="gp-clear" onClick={clearLayers}>
                        <Trash2 size={14} />
                        {g.clearAll}
                      </button>
                    </>
                  )}
                </>
              )}
              {panel === 'indices' && (
                <section className="travel-indices" aria-label={t.indexTitle}>
                  <p className="gp-intro">{lang === 'uz' ? 'To‘rt mustaqil yo‘nalish bo‘yicha baholash.' : lang === 'en' ? 'Four independent approaches to assessment.' : 'Четыре самостоятельных направления оценки.'}</p>
                  {homeIndices.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      className="travel-index-card"
                      aria-pressed={indexOn && indexMap.index === m.id}
                      onClick={() => {
                        indexMap.setIndex(m.id);
                        setOn('index', true);
                      }}
                      style={{ borderLeftColor: m.color }}
                    >
                      <span className="travel-index-code" style={{ color: m.color, background: m.background }}>
                        {m.id}
                      </span>
                      <span className="travel-index-copy">
                        <b>{localized(m.name)}</b>
                        <small>{indexSummaries[m.id]?.[lang]}</small>
                      </span>
                      {indexOn && indexMap.index === m.id ? <Check size={17} /> : <ChevronRight size={16} />}
                    </button>
                  ))}
                  <p className="travel-note">{indexNote}</p>
                  <a className="travel-index-method" href="/science/model-v0.4/METHOD_UZ.md" target="_blank" rel="noreferrer">
                    {lang === 'uz' ? 'v0.4 metodikasi' : lang === 'en' ? 'v0.4 method (UZ)' : 'Методика v0.4 (UZ)'}
                    <ExternalLink size={13} />
                  </a>
                  {indexOn && <IndexRegionPanel state={indexMap} lang={lang} />}
                </section>
              )}
              {panel === 'places' && (
                <div className="gp-seg wide" role="group">
                  <button aria-pressed={placesMode === 'all'} onClick={() => setPlacesMode('all')}>
                    {x.allPlaces}
                  </button>
                  <button aria-pressed={placesMode === 'saved'} onClick={() => setPlacesMode('saved')}>
                    <Star size={14} />
                    {x.savedList}
                    {saved.length > 0 && <span className="gp-count">{saved.length}</span>}
                  </button>
                </div>
              )}
              {(panel === 'explore' || panel === 'places') && (
                <label className="travel-search">
                  <Search size={16} />
                  <input aria-label={t.search} placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
              )}
              {panel === 'explore' && (
                <>
                  {dests.map((d) => (
                    <button className="destination-card" key={d.id} aria-pressed={selected?.id === d.id} onClick={() => focus(d)}>
                      {image(d) && <img src={image(d)} alt={name(d)} loading="lazy" />}
                      <span>
                        <small>{d.heritage ? localized(d.heritage) : t.explore}</small>
                        <b>{name(d)}</b>
                        <p>{localized(d.description)}</p>
                        <em>
                          {t.open} <ChevronRight size={14} />
                        </em>
                      </span>
                      {d.image?.credit && (
                        <small className="travel-card-credit">
                          {t.photo}: {d.image.credit} · {d.image.license}
                        </small>
                      )}
                    </button>
                  ))}
                  {!dests.length && <p className="gp-empty">{t.none}</p>}
                  <p className="travel-note">{t.noRank}</p>
                </>
              )}
              {panel === 'places' && placesMode === 'all' && (
                <>
                  <select className="gp-select" aria-label={t.all} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">{t.all}</option>
                    {POI_LAYERS.map((c) => (
                      <option key={c} value={c}>
                        {(t as any)[c]}
                      </option>
                    ))}
                  </select>
                  <div className="gp-list-meta">
                    <span>{loaded && servicesLoaded ? filtered.length.toLocaleString('ru') + ' ' + x.objects : error ? x.loadError : t.loading}</span>
                    {filtered.length > 0 && (
                      <span className="gp-export" title={x.download}>
                        <Download size={14} />
                        <button onClick={() => exportList('csv')}>CSV</button>
                        <button onClick={() => exportList('geojson')}>GeoJSON</button>
                      </span>
                    )}
                  </div>
                  {filtered.slice(0, limit).map(placeRow)}
                  {loaded && servicesLoaded && !filtered.length && <p className="gp-empty">{t.none}</p>}
                  {filtered.length > limit && (
                    <button className="travel-more" onClick={() => setLimit((v) => v + 60)}>
                      {t.more}
                    </button>
                  )}
                  <p className="travel-note">{t.poiNote}</p>
                </>
              )}
              {panel === 'places' && placesMode === 'saved' && (
                <>
                  {saved.length > 0 && (
                    <div className="gp-list-meta">
                      <span>{savedShown.length + ' ' + x.objects}</span>
                      <span className="gp-export" title={x.download}>
                        <Download size={14} />
                        <button onClick={() => exportList('csv')}>CSV</button>
                        <button onClick={() => exportList('geojson')}>GeoJSON</button>
                      </span>
                    </div>
                  )}
                  {savedShown.map(placeRow)}
                  {!saved.length && (
                    <p className="gp-empty">
                      <Star size={22} />
                      {x.savedEmpty}
                    </p>
                  )}
                </>
              )}
              {panel === 'trips' && (
                <>
                  <a className="gp-story-card" href={'/story?lang=' + lang}>
                    <b>{g.story}</b>
                    <span>{lang === 'uz' ? 'Xiva, Buxoro, Nurota, Samarqand, Shahrisabz va Toshkent bo‘ylab xarita bilan birga o‘qiladigan hikoya.' : lang === 'en' ? 'Khiva to Tashkent as a scrolling story: the map follows the text.' : 'От Хивы до Ташкента: карта следует за текстом.'}</span>
                  </a>
                  <div className="gp-seg wide gp-route-filter" role="group" aria-label={x.routeThemesLabel}>
                    {['all', ...Object.keys(x.routeThemes)].map((id) => (
                      <button key={id} aria-pressed={routeFilter === id} onClick={() => setRouteFilter(id)}>
                        {id === 'all' ? x.routeAll : (x.routeThemes as any)[id]}
                        <span className="gp-count">{id === 'all' ? (routes as any[]).length : (routes as any[]).filter((r) => r.theme === id).length}</span>
                      </button>
                    ))}
                  </div>
                  {(routes as any[]).filter((r) => routeFilter === 'all' || r.theme === routeFilter).map((r) => {
                    const cover = r.stops.find((st: any) => st.image)?.image;
                    return (
                      <button className="destination-card route" key={r.id} aria-pressed={trip?.id === r.id} onClick={() => openRoute(r)}>
                        {cover && <img src={cover.url} alt="" loading="lazy" onError={hideBroken} />}
                        <span>
                          <small>
                            {(x.routeThemes as any)[r.theme]} · {r.days} {dayWord(r.days)}
                          </small>
                          <b>{localized(r.name)}</b>
                          <p>{localized(r.summary)}</p>
                          <span className="gp-chips">
                            <i>
                              {r.stops.length} {x.stopsWord}
                            </i>
                            <i>≈ {r.distanceKm} km</i>
                            <i>{localized(r.season)}</i>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <p className="travel-note">{t.planNote}</p>
                </>
              )}
              {panel === 'legend' && (
                <div className="gp-legend">
                  {!activeLayers.length && !trip && <p className="gp-empty">{g.noLayers}</p>}
                  {indexOn && (
                    <section>
                      <h3>{indexTitle}</h3>
                      {indexColors.map((c, i) => (
                        <div className="gp-legend-row" key={c}>
                          <i className="gp-swatch box" style={{ background: c }} />
                          <span>{x.classes[i]}</span>
                          <small>{CLASS_RANGES[i]}</small>
                        </div>
                      ))}
                      <p className="gp-legend-note">{indexNote}</p>
                    </section>
                  )}
                  {(destOn || trip) && (
                    <section>
                      <h3>{g.destLayer}</h3>
                      <div className="gp-legend-row">
                        <i className="gp-swatch" style={{ background: '#176b61' }} />
                        <span>{t.explore}</span>
                      </div>
                      <div className="gp-legend-row">
                        <i className="gp-swatch" style={{ background: '#b56b2c' }} />
                        <span>{g.heritageMarker}</span>
                      </div>
                    </section>
                  )}
                  {poiOn.length > 0 && (
                    <section>
                      <h3>{t.places}</h3>
                      {POI_LAYERS.filter((p) => poiOn.includes(p)).map((p) => (
                        <div className="gp-legend-row" key={p}>
                          <i className="gp-swatch" style={{ background: POI_COLORS[p] }} />
                          <span>{(t as any)[p]}</span>
                        </div>
                      ))}
                    </section>
                  )}
                  {bordersOn && (
                    <section>
                      <h3>{g.gAdmin}</h3>
                      <div className="gp-legend-row">
                        {swatch('borders')}
                        <span>{g.borders}</span>
                      </div>
                    </section>
                  )}
                  {(roadsOn || routesOn) && transport.bundle && (
                    <section>
                      <h3>{g.gTransport}</h3>
                      {roadsOn && (
                        <div className="gp-legend-row">
                          {swatch('roads')}
                          <span>{t.roads}</span>
                        </div>
                      )}
                      {routesOn && (
                        <div className="gp-legend-row">
                          {swatch('routes')}
                          <span>{t.trails}</span>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
              {panel === 'about' && (
                <div className="gp-about">
                  <p>{g.aboutText}</p>
                  <p className="travel-note">{t.noRank}</p>
                  <h3>{g.links}</h3>
                  <a href={'/story?lang=' + lang}>
                    {g.story}
                    <ExternalLink size={13} />
                  </a>
                  <a href="/science/climate/METHOD_UZ.md" target="_blank" rel="noreferrer">
                    {g.climateLayer} · {t.source}
                    <ExternalLink size={13} />
                  </a>
                  <a href="/science/model-v0.4/METHOD_UZ.md" target="_blank" rel="noreferrer">
                    {lang === 'uz' ? 'Indekslar usuli (v0.4)' : lang === 'en' ? 'Index method note, v0.4 (UZ)' : 'Методика индексов v0.4 (UZ)'}
                    <ExternalLink size={13} />
                  </a>
                  <a href="/tourism/services-metadata.json" target="_blank" rel="noreferrer">
                    OSM · {t.source}
                    <ExternalLink size={13} />
                  </a>
                  <a href="/tourism/photo-credits.json" target="_blank" rel="noreferrer">
                    {t.photo} · {t.source}
                    <ExternalLink size={13} />
                  </a>
                  <small>© OpenStreetMap contributors · UNESCO</small>
                </div>
              )}
            </div>
          </aside>
        )}

        <section className="gp-map" data-bg={bg} aria-label={t.map}>
          <div ref={mapEl} className="gp-map-canvas" />
          {busy && <div className="gp-progress" role="progressbar" aria-label={x.loading} />}
          {indexOn && (
            <>
              <IndexHeader state={indexMap} lang={lang} />
              <IndexLegend state={indexMap} lang={lang} />
              <IndexSwipe state={indexMap} lang={lang} />
            </>
          )}
          <div className="gp-basemap">
            <button
              className="gp-basemap-current"
              aria-expanded={bgOpen}
              aria-label={g.basemap + ': ' + g.bg[bg]}
              title={g.basemap}
              onClick={() => setBgOpen((v) => !v)}
            >
              <img src={BASEMAPS[bg].thumb} alt="" className={'gp-thumb-' + bg} />
              <span>{g.bg[bg]}</span>
            </button>
            {bgOpen && (
              <div className="gp-basemap-list" role="listbox" aria-label={g.basemap}>
                {(Object.keys(BASEMAPS) as Basemap[]).map((k) => (
                  <button
                    key={k}
                    role="option"
                    aria-selected={bg === k}
                    onClick={() => {
                      setBg(k);
                      setBgOpen(false);
                    }}
                  >
                    <img src={BASEMAPS[k].thumb} alt="" className={'gp-thumb-' + k} />
                    <span>{g.bg[k]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="gp-map-tools">
            <button onClick={goHome} title={g.home} aria-label={g.home}>
              <House size={17} />
            </button>
            <button onClick={locate} title={g.locate} aria-label={g.locate}>
              <LocateFixed size={17} />
            </button>
            <button onClick={toggleFullscreen} title={g.fullscreen} aria-label={g.fullscreen} aria-pressed={fullscreen}>
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
          <MapContextMenu
            mapRef={mapRef}
            ready={mapReady}
            lang={lang}
            onPin={dropPin}
            onMeasure={measure.startAt}
            onCopied={() => setToast(x.coordsCopied)}
          />
          <MeasureBar state={measure} lang={lang} closeLabel={t.close} clearLabel={g.clear} />
          {climateOn && climate.status === 'ready' && <ClimateMonthBar month={climateMonth} setMonth={setClimateMonth} lang={lang} />}
          {!error && climateOn && climate.status === 'failed' && (
            <div className="gp-banner" role="alert">
              <CircleAlert size={16} />
              <span>{lang === 'uz' ? 'Iqlim qatlami yuklanmadi.' : lang === 'en' ? 'The climate layer could not be loaded.' : 'Не удалось загрузить климатический слой.'}</span>
            </div>
          )}
          {!error && weatherOn && weather.status === 'failed' && (
            <div className="gp-banner" role="alert">
              <CircleAlert size={16} />
              <span>{lang === 'uz' ? 'Ob-havo ma’lumoti olinmadi.' : lang === 'en' ? 'Weather data could not be loaded.' : 'Не удалось получить данные о погоде.'}</span>
              <button onClick={weather.retry}>
                <RotateCcw size={14} />
                {x.retry}
              </button>
            </div>
          )}
          {error && (
            <div className="gp-banner" role="alert">
              <CircleAlert size={16} />
              <span>{x.loadError}</span>
              <button onClick={retryData}>
                <RotateCcw size={14} />
                {x.retry}
              </button>
            </div>
          )}
          {shareOpen && (
            <div className="gp-share" role="dialog" aria-label={g.share}>
              <button className="gp-close" onClick={() => setShareOpen(false)} aria-label={t.close}>
                <X size={16} />
              </button>
              <h3>{g.share}</h3>
              <p>{g.shareNote}</p>
              <div className="gp-share-row">
                <input readOnly value={typeof window === 'undefined' ? '' : window.location.href} onFocus={(e) => e.target.select()} aria-label={g.share} />
                <button onClick={copyLink}>
                  <Copy size={14} />
                  {g.copy}
                </button>
              </div>
            </div>
          )}
          {toast && (
            <p className="gp-toast" role="status">
              <Check size={15} />
              {toast}
            </p>
          )}
          {(sel || trip) && (
            <article className="gp-detail" aria-label={sel ? name(sel) : localized(trip.name)}>
              <button
                className="gp-close"
                aria-label={t.close}
                onClick={() => {
                  if (!(sel?.routeId && trip)) setTrip(null);
                  setSelected(null);
                }}
              >
                <X size={17} />
              </button>
              {sel ? (
                <>
                  {image(sel) && <img className="gp-detail-image" src={image(sel)} alt={name(sel)} onError={hideBroken} />}
                  <div className="gp-detail-body">
                    {sel.routeId && trip && (
                      <button className="gp-back" onClick={() => setSelected(null)}>
                        <ChevronLeft size={15} />
                        {localized(trip.name)}
                      </button>
                    )}
                    <div className="gp-kicker">
                      <i className="gp-swatch" style={{ background: sel.isPin ? '#c2410c' : sel.heritage ? '#b56b2c' : POI_COLORS[sel.category] || '#176b61' }} />
                      {sel.routeId ? x.dayLabel(sel.day) + ' · ' + sel.order + '-' + x.stopWord : sel.isPin ? x.coords : sel.heritage ? localized(sel.heritage) : (t as any)[sel.category] || t.explore}
                    </div>
                    <h2>{name(sel)}</h2>
                    <div className="gp-actions">
                      <a className="gp-action primary" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?to=${sel.lat},${sel.lng}`} title={t.directions}>
                        <Navigation size={15} />
                        {x.directions}
                      </a>
                      <button className="gp-action" aria-pressed={isSaved(sel)} onClick={() => toggleSave(sel)}>
                        <Star size={15} />
                        {isSaved(sel) ? x.saved : x.save}
                      </button>
                      <button className="gp-action" onClick={() => copyText(window.location.href, () => setToast(x.linkCopied))}>
                        <Share2 size={15} />
                        {g.share}
                      </button>
                    </div>
                    {sel.description && <p className="gp-detail-text">{localized(sel.description)}</p>}
                    <dl className="gp-facts">
                      {selRows.map(([icon, label, value]) => (
                        <div key={label}>
                          <dt title={label} aria-label={label}>
                            {icon}
                          </dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                      {sel.website && /^https?:\/\//i.test(sel.website) && (
                        <div>
                          <dt title={x.website} aria-label={x.website}>
                            <Globe size={15} />
                          </dt>
                          <dd>
                            <a href={sel.website} target="_blank" rel="noreferrer">
                              {sel.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}
                            </a>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt title={x.coords} aria-label={x.coords}>
                          <Crosshair size={15} />
                        </dt>
                        <dd>
                          <button className="gp-coord" title={x.copyCoords} onClick={() => copyText(formatCoordinate(sel.lat, sel.lng), () => setToast(x.coordsCopied))}>
                            {formatCoordinate(sel.lat, sel.lng)}
                            <Copy size={13} />
                          </button>
                        </dd>
                      </div>
                    </dl>
                    {(sel.suggestedSeason || sel.season?.label) && (
                      <p className="gp-detail-text">
                        <b>{t.season}: </b>
                        {localized(sel.suggestedSeason || sel.season.label)}
                        {sel.season?.sourceUrl && (
                          <>
                            {' '}
                            <a href={sel.season.sourceUrl} target="_blank" rel="noreferrer">
                              {t.source}
                              <ExternalLink size={12} />
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {(sel.id === 'chimgan' || sel.accessRules) && (
                      <p className="travel-note">
                        <b>{t.rules}</b>
                        <br />
                        {localized(sel.accessRules) || t.rulesNote}
                      </p>
                    )}
                    {Number.isFinite(sel.lat) && Number.isFinite(sel.lng) && <WeatherCard lat={sel.lat} lng={sel.lng} lang={lang} />}
                    {Number.isFinite(sel.lat) && Number.isFinite(sel.lng) && <ClimateStrip lat={sel.lat} lng={sel.lng} lang={lang} />}
                    {sel.coordinateSource?.startsWith('approx') && <p className="gp-detail-hint">{x.approxCoord}</p>}
                    {sel.routeId && trip && (
                      <div className="gp-pager">
                        {[-1, 1].map((step) => {
                          const next = routeStops(trip)[sel.order - 1 + step];
                          return (
                            <button key={step} disabled={!next} onClick={() => next && focus(next)}>
                              {step < 0 && <ChevronLeft size={15} />}
                              <span>{next ? next.order + '. ' + localized(next.name) : step < 0 ? x.routeStart : x.routeEnd}</span>
                              {step > 0 && <ChevronRight size={15} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="gp-detail-links">
                      {source(sel) && (
                        <a target="_blank" rel="noreferrer" href={source(sel)}>
                          {t.source}
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {sel.image?.credit && (
                        <span>
                          {t.photo}:{' '}
                          <a href={sel.image.sourceUrl} target="_blank" rel="noreferrer">
                            {sel.image.credit}
                          </a>{' '}
                          ·{' '}
                          <a href={sel.image.licenseUrl} target="_blank" rel="noreferrer">
                            {sel.image.license}
                          </a>
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="gp-gallery" aria-label={t.photo}>
                    {routeStops(trip)
                      .filter((st) => st.image)
                      .map((st) => (
                        <button key={st.id} onClick={() => focus(st)} title={localized(st.name)}>
                          <img src={st.image.url} alt={localized(st.name)} loading="lazy" onError={(e: any) => (e.currentTarget.parentNode.style.display = 'none')} />
                          <span>
                            {st.order}. {localized(st.name)}
                          </span>
                        </button>
                      ))}
                  </div>
                  <div className="gp-detail-body">
                    <div className="gp-kicker">
                      <Route size={14} />
                      {(x.routeThemes as any)[trip.theme]} · {t.plan}
                    </div>
                    <h2>{localized(trip.name)}</h2>
                    <div className="gp-route-meta">
                      <span>
                        <b>{trip.days}</b>
                        {dayWord(trip.days)}
                      </span>
                      <span>
                        <b>{trip.stops.length}</b>
                        {x.stopsWord}
                      </span>
                      <span>
                        <b>≈ {trip.distanceKm}</b>
                        km
                      </span>
                    </div>
                    <p className="gp-detail-text">{localized(trip.summary)}</p>
                    {[...new Set(trip.stops.map((st: any) => st.day) as number[])].map((day) => (
                      <section className="gp-day" key={day}>
                        <h3>{x.dayLabel(day)}</h3>
                        {routeStops(trip)
                          .filter((st) => st.day === day)
                          .map((st) => (
                            <button className="gp-route-stop" key={st.id} onClick={() => focus(st)}>
                              <b>{st.order}</b>
                              <span>
                                <strong>{localized(st.name)}</strong>
                                <small>{localized(st.note)}</small>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                      </section>
                    ))}
                    <dl className="gp-facts">
                      <div>
                        <dt title={t.season} aria-label={t.season}>
                          <Clock size={15} />
                        </dt>
                        <dd>
                          <b>{t.season}: </b>
                          {localized(trip.season)}
                        </dd>
                      </div>
                      <div>
                        <dt title={x.transport} aria-label={x.transport}>
                          <Navigation size={15} />
                        </dt>
                        <dd>{localized(trip.transport)}</dd>
                      </div>
                    </dl>
                    <p className="travel-note">
                      {t.planNote} {trip.pathStatus.startsWith('schematic') ? x.pathSchematic : trip.pathStatus.startsWith('walk') ? x.pathWalk : x.pathRoads}
                    </p>
                  </div>
                </>
              )}
            </article>
          )}
        </section>
      </main>

      <nav
        className="gp-toolbar"
        aria-label={g.tools}
        onScroll={(e) => {
          const el = e.currentTarget;
          el.classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
        }}
      >
        {(
          [
            ['layers', g.layers, <Layers size={19} key="i" />],
            ['indices', t.indices, <ChartColumn size={19} key="i" />],
            ['explore', t.explore, <Landmark size={19} key="i" />],
            ['places', t.places, <MapPin size={19} key="i" />],
            ['trips', t.trips, <Route size={19} key="i" />],
            ['legend', g.legend, <BookOpen size={19} key="i" />],
          ] as [Exclude<Panel, null>, string, React.ReactNode][]
        ).map(([id, label, icon]) => (
          <button key={id} className="gp-tool" aria-pressed={panel === id} onClick={() => openPanel(id)}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
        <span className="gp-toolbar-gap" />
        <button className="gp-tool" aria-pressed={measure.active} onClick={measure.toggle}>
          <Ruler size={19} />
          <span>{g.measure}</span>
        </button>
        <button
          className="gp-tool"
          aria-pressed={shareOpen}
          onClick={() => {
            setShareOpen((v) => !v);
            copyLink();
          }}
        >
          <Share2 size={19} />
          <span>{g.share}</span>
        </button>
        <button className="gp-tool gp-tool-print" onClick={() => window.print()}>
          <Printer size={19} />
          <span>{g.print}</span>
        </button>
        <button className="gp-tool" aria-pressed={panel === 'about'} onClick={() => openPanel('about')}>
          <Info size={19} />
          <span>{g.about}</span>
        </button>
        <span className="gp-toolbar-sep" />
        <MapStatus mapRef={mapRef} ready={mapReady} lang={lang} onCopied={() => setToast(x.coordsCopied)} />
      </nav>

      <section className="gp-print" aria-hidden="true">
        <div>
          <h3>{x.activeLayers}</h3>
          <ul>
            {activeLayers.map((id) => (
              <li key={id}>
                {swatch(id)}
                {id === 'index' ? indexTitle : layerName(id)}
              </li>
            ))}
          </ul>
        </div>
        {indexOn && (
          <div>
            <h3>{indexTitle}</h3>
            <ul>
              {indexColors.map((c, i) => (
                <li key={c}>
                  <i className="gp-swatch box" style={{ background: c }} />
                  {x.classes[i]} · {CLASS_RANGES[i]}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          {hydrated && (
            <>
              {x.printed}: {new Date().toLocaleDateString(lang === 'uz' ? 'ru' : lang)} · {window.location.host}
              <br />
            </>
          )}
          {BASEMAPS[bg].attribution} · © OpenStreetMap contributors · GeoTour v0.4 (1 km)
        </p>
      </section>
    </div>
  );
}
