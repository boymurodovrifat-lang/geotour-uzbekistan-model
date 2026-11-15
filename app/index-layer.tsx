'use client';
// Index layer of the main map: v0.4 open-data screening on the 1 km grid.
// One data image per index is coloured in the browser, so the same pixels serve the smooth map,
// the five-class map, the click inspector and the uncertainty view.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronUp, Download, RotateCcw } from 'lucide-react';
import boundaries from '../data/region-boundaries.json';
import homeIndices from '../data/home-indices.json';
import { CLASS_RANGES, INDEX_RAMPS, buildLut, classColors, colorize, readCell, toPixel, type DisplayMode, type ImageFrame } from '../lib/index-v04';

export type IndexLang = 'uz' | 'en' | 'ru';
const BASE = '/science/model-v0.4/';

export const indexSummaries: Record<string, Record<IndexLang, string>> = {
  ESI: { uz: 'Tabiiy obyektlarga yaqinlik va landshaft', en: 'Natural sites nearby and landscape', ru: 'Близость природных объектов и ландшафт' },
  TSI: { uz: 'Resurslar, turar joy va axborot xizmati', en: 'Resources, lodging and visitor information', ru: 'Ресурсы, размещение и информация' },
  TPI: { uz: 'Resurslar zichligi va xilma-xilligi', en: 'Density and diversity of resources', ru: 'Плотность и разнообразие ресурсов' },
  TRSI: { uz: 'Yashil hudud, suv bo‘yi va dam joylari', en: 'Green areas, watersides and rest sites', ru: 'Зелёные зоны, берега и места отдыха' },
};

const texts = {
  uz: {
    active: 'FAOL INDEKS',
    version: '1 km · v0.4 · ochiq ma’lumot skriningi',
    scale: 'Ball shkalasi',
    all: 'Butun O‘zbekiston',
    region: 'Hudud',
    display: 'Ko‘rinish',
    smooth: 'Silliq',
    stepped: '5 sinf',
    opacity: 'Shaffoflik',
    dim: 'Beqaror hududlarni xiralashtirish',
    dimHint: 'Vazn va masofa o‘zgarganda sinfi almashadigan joylar ochroq ko‘rsatiladi.',
    compare: 'Ikki indeksni solishtirish',
    right: 'O‘ngdagi indeks',
    comparison: 'Taqqoslash',
    divider: 'Taqqoslash chegarasi',
    fit: 'O‘zbekistonni to‘liq ko‘rsatish',
    classes: ['Juda past', 'Past', 'O‘rtacha', 'Yuqori', 'Juda yuqori'],
    areaShare: 'Baholangan maydon ulushi',
    weights: 'Mezonlar va vaznlar',
    stability: 'Sinf barqarorligi',
    stabilityNote: '500 ta Monte-Karlo ssenariysida boshlang‘ich sinf saqlangan ulush (o‘rtacha).',
    note: 'Ochiq ma’lumotlar asosidagi dastlabki saralash. Ekspert kalibrlashi va dala tekshiruvi o‘tkazilmagan; yuqori ball tashrif ruxsatini bildirmaydi.',
    method: 'Metodika (v0.4)',
    results: 'Hisob natijalari (JSON)',
    geotiff: 'GeoTIFF (1 km)',
    loading: 'Qatlam yuklanmoqda…',
    error: 'Qatlam yuklanmadi.',
    retry: 'Qayta yuklash',
    show: 'Batafsil ko‘rsatish',
    hide: 'Yig‘ish',
    score: 'Ball',
    range: 'Noaniqlik oralig‘i (P5–P95)',
    points: 'ball',
    outside: 'Bu nuqta baholanmagan (suv, qor yoki chegara tashqarisi).',
    regions: '14 hudud · maydon statistikasi',
    regionsNote: 'Hudud bo‘yicha 1 km kataklarning o‘rtacha balli. Bu shaharlar yoki manzillar reytingi emas. Chiziq besh sinfning maydondagi ulushini ko‘rsatadi.',
    order: 'Tartib',
    byName: 'Alifbo',
    byMean: 'O‘rtacha ball',
    assessed: 'Baholangan',
    crit: { N: 'Tabiiy obyektga yaqinlik', Q: 'Landshaft tabiiyligi va relyef', A: 'Turistik resursga yaqinlik', U: 'Turar joy va axborot xizmati', K: 'Resurslar zichligi', D: 'Resurs turlari xilma-xilligi', W: 'Yashil hudud yoki suv bo‘yi', F: 'Yurishga qulay qiyalik', P: 'Dam olish joylariga yaqinlik' },
  },
  en: {
    active: 'ACTIVE INDEX',
    version: '1 km · v0.4 · open-data screening',
    scale: 'Score scale',
    all: 'All Uzbekistan',
    region: 'Region',
    display: 'Display',
    smooth: 'Smooth',
    stepped: '5 classes',
    opacity: 'Opacity',
    dim: 'Fade unstable areas',
    dimHint: 'Places whose class changes when weights and distances vary are drawn lighter.',
    compare: 'Compare two indices',
    right: 'Right index',
    comparison: 'Comparison',
    divider: 'Comparison divider',
    fit: 'Fit Uzbekistan',
    classes: ['Very low', 'Low', 'Moderate', 'High', 'Very high'],
    areaShare: 'Share of assessed land',
    weights: 'Criteria and weights',
    stability: 'Class stability',
    stabilityNote: 'Mean share of 500 Monte Carlo scenarios that keep the baseline class.',
    note: 'A preliminary screening from open data. No expert calibration or field validation; a high score is not permission to visit.',
    method: 'Method (v0.4)',
    results: 'Results (JSON)',
    geotiff: 'GeoTIFF (1 km)',
    loading: 'Loading layer…',
    error: 'The layer could not be loaded.',
    retry: 'Reload',
    show: 'Show details',
    hide: 'Collapse',
    score: 'Score',
    range: 'Uncertainty range (P5–P95)',
    points: 'points',
    outside: 'This point is not assessed (water, snow or outside the boundary).',
    regions: '14 regions · area statistics',
    regionsNote: 'Mean score of 1 km cells per region. This is not a ranking of cities or destinations. Bars show the share of land in each of the five classes.',
    order: 'Order',
    byName: 'Alphabetical',
    byMean: 'Mean score',
    assessed: 'Assessed',
    crit: { N: 'Proximity to natural sites', Q: 'Landscape naturalness and relief', A: 'Proximity to tourism resources', U: 'Lodging and visitor information', K: 'Density of resources', D: 'Diversity of resource types', W: 'Green cover or waterside', F: 'Walkable slope', P: 'Proximity to rest sites' },
  },
  ru: {
    active: 'АКТИВНЫЙ ИНДЕКС',
    version: '1 км · v0.4 · скрининг по открытым данным',
    scale: 'Шкала баллов',
    all: 'Весь Узбекистан',
    region: 'Регион',
    display: 'Вид',
    smooth: 'Плавный',
    stepped: '5 классов',
    opacity: 'Прозрачность',
    dim: 'Приглушить неустойчивые участки',
    dimHint: 'Места, класс которых меняется при изменении весов и расстояний, показаны светлее.',
    compare: 'Сравнить два индекса',
    right: 'Индекс справа',
    comparison: 'Сравнение',
    divider: 'Граница сравнения',
    fit: 'Весь Узбекистан',
    classes: ['Очень низкая', 'Низкая', 'Средняя', 'Высокая', 'Очень высокая'],
    areaShare: 'Доля оценённой площади',
    weights: 'Критерии и веса',
    stability: 'Устойчивость класса',
    stabilityNote: 'Средняя доля из 500 сценариев Монте-Карло, в которых исходный класс сохраняется.',
    note: 'Предварительный скрининг по открытым данным. Экспертной калибровки и полевой проверки нет; высокий балл не означает разрешения на посещение.',
    method: 'Методика (v0.4)',
    results: 'Результаты (JSON)',
    geotiff: 'GeoTIFF (1 км)',
    loading: 'Слой загружается…',
    error: 'Слой не загрузился.',
    retry: 'Повторить',
    show: 'Подробнее',
    hide: 'Свернуть',
    score: 'Балл',
    range: 'Диапазон неопределённости (P5–P95)',
    points: 'балла',
    outside: 'Точка не оценена (вода, снег или вне границы).',
    regions: '14 регионов · статистика площади',
    regionsNote: 'Средний балл ячеек 1 км по региону. Это не рейтинг городов или направлений. Полоса показывает долю площади в каждом из пяти классов.',
    order: 'Порядок',
    byName: 'По алфавиту',
    byMean: 'Средний балл',
    assessed: 'Оценено',
    crit: { N: 'Близость природных объектов', Q: 'Естественность ландшафта и рельеф', A: 'Близость туристических ресурсов', U: 'Размещение и информация', K: 'Плотность ресурсов', D: 'Разнообразие типов ресурсов', W: 'Зелёный покров или берег', F: 'Удобный для ходьбы уклон', P: 'Близость мест отдыха' },
  },
} as const;
export const indexNote = (lang: IndexLang) => texts[lang].note;
export const indexClassNames = (lang: IndexLang) => texts[lang].classes;

export type Layer = ImageFrame & {
  id: string;
  imageUrl: string;
  imageFallbackUrl?: string;
  criteria: string[];
  weights: Record<string, number>;
  statistics: { mean: number; class_share_pct: Record<string, number> };
  monteCarlo: { mean_class_stability_pct: number };
  scoreUrl: string;
};
export type RegionRow = { id: string; name: string; assessed_km2: number; [index: string]: any };
export type Catalog = { layers: Layer[]; regions: RegionRow[] };
export type Raw = { data: Uint8ClampedArray; frame: ImageFrame };

const rawCache = new Map<string, Promise<Raw>>();
export function loadRaw(layer: Layer): Promise<Raw> {
  let job = rawCache.get(layer.id);
  if (!job) {
    job = new Promise<Raw>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          resolve({ data: ctx.getImageData(0, 0, c.width, c.height).data, frame: { ...layer, width: c.width, height: c.height } });
        } catch (error) {
          reject(error);
        }
      };
      // Lossless WebP first; the archival PNG holds the same values if a browser cannot decode WebP.
      img.onerror = () => {
        if (layer.imageFallbackUrl && !img.src.endsWith(layer.imageFallbackUrl)) img.src = layer.imageFallbackUrl;
        else reject(new Error('index image'));
      };
      img.src = layer.imageUrl;
    });
    job.catch(() => rawCache.delete(layer.id));
    rawCache.set(layer.id, job);
  }
  return job;
}

// Draws one index into a canvas, optionally clipped to a region polygon.
export function paint(canvas: HTMLCanvasElement, raw: Raw, index: string, mode: DisplayMode, dim: boolean, feature: any) {
  const { width, height } = raw.frame;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!,
    image = ctx.createImageData(width, height);
  colorize(raw.data, image.data, buildLut(index, mode), dim);
  ctx.globalCompositeOperation = 'source-over';
  ctx.putImageData(image, 0, 0);
  if (!feature) return;
  const g = feature.geometry,
    polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  for (const rings of polygons)
    for (const ring of rings) {
      ring.forEach((p: number[], i: number) => {
        const [x, y] = toPixel(raw.frame, p[0], p[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  ctx.fill('evenodd');
  ctx.globalCompositeOperation = 'source-over';
}

export function canvasOverlay(L: any, canvas: HTMLCanvasElement, frame: ImageFrame, pane: string, opacity: number) {
  // Leaflet's image overlay, with a canvas as its element.
  const Overlay = L.ImageOverlay.extend({
    _initImage(this: any) {
      const el = (this._image = this._url);
      L.DomUtil.addClass(el, 'leaflet-image-layer');
      if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
      if (this.options.className) L.DomUtil.addClass(el, this.options.className);
      el.onselectstart = L.Util.falseFn;
      el.onmousemove = L.Util.falseFn;
    },
  });
  return new Overlay(
    canvas,
    [
      [frame.south, frame.west],
      [frame.north, frame.east],
    ],
    { pane, opacity, interactive: false, className: 'index-raster', attribution: 'GeoTour v0.4 · ESA WorldCover 2021 · Copernicus DEM GLO-90 · © OpenStreetMap' },
  );
}

export function useIndexLayer(mapRef: RefObject<any>, ready: boolean, active: boolean, lang: IndexLang) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [index, setIndex] = useState('ESI'),
    [region, setRegion] = useState('all'),
    [opacity, setOpacity] = useState(90),
    [mode, setMode] = useState<DisplayMode>('smooth'),
    [dimUnstable, setDimUnstable] = useState(false),
    [legendOpen, setLegendOpen] = useState(false),
    [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'),
    [attempt, setAttempt] = useState(0),
    [compareOn, setCompareOn] = useState(false),
    [compareIndex, setCompareIndex] = useState('TSI'),
    [swipe, setSwipe] = useState(50),
    [reset, setReset] = useState(0);
  const overlayRef = useRef<any>(null);
  const t = texts[lang];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('index')?.toUpperCase();
    if (requested && homeIndices.some((m) => m.id === requested)) setIndex(requested);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    fetch(BASE + 'layers.json', { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setCatalog(d as Catalog))
      .catch((e) => {
        if (e.name !== 'AbortError') setStatus('error');
      });
    return () => c.abort();
  }, [attempt]);
  useEffect(() => {
    if (compareIndex === index) setCompareIndex(index === 'ESI' ? 'TSI' : 'ESI');
  }, [index, compareIndex]);

  const feature = useMemo(() => boundaries.features.find((f) => f.properties.regionId === region), [region]);
  const layer = catalog?.layers.find((l) => l.id === index);
  const profile = homeIndices.find((m) => m.id === index) || homeIndices[0];
  const regionRow = catalog?.regions.find((r) => r.id === region);
  const regionTitle = region === 'all' ? t.all : lang === 'en' ? feature?.properties.shapeName : feature?.properties.nameUz;

  // Fit the country or the selected region.
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const L = (window as any).L;
    const frame = requestAnimationFrame(() => {
      m.invalidateSize({ pan: false });
      const mobile = m.getSize().x < 700;
      m.fitBounds(L.geoJSON(feature || boundaries).getBounds(), {
        paddingTopLeft: mobile ? [18, 90] : [32, 100],
        paddingBottomRight: mobile ? [18, 110] : [32, 90],
        maxZoom: feature ? 10 : 6,
        animate: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, feature, reset]);

  // Main raster and, when comparing, the second one in its own pane.
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !active || !catalog || !m) return;
    const L = (window as any).L;
    for (const [name, z] of [['indexRaster', 350], ['indexCompare', 351]] as const)
      if (!m.getPane(name)) {
        m.createPane(name);
        m.getPane(name).style.zIndex = z;
        m.getPane(name).style.pointerEvents = 'none';
      }
    let alive = true;
    const added: any[] = [];
    setStatus('loading');
    const wanted = [{ id: index, pane: 'indexRaster' }, ...(compareOn ? [{ id: compareIndex, pane: 'indexCompare' }] : [])];
    Promise.all(
      wanted.map(async (w) => {
        const l = catalog.layers.find((x) => x.id === w.id);
        if (!l) throw new Error('layer');
        return { ...w, raw: await loadRaw(l) };
      }),
    )
      .then((items) => {
        if (!alive) return;
        for (const item of items) {
          const canvas = document.createElement('canvas');
          paint(canvas, item.raw, item.id, mode, dimUnstable, feature);
          const overlay = canvasOverlay(L, canvas, item.raw.frame, item.pane, opacity / 100).addTo(m);
          added.push(overlay);
          if (item.pane === 'indexRaster') overlayRef.current = { overlay, raw: item.raw };
        }
        overlayRef.current = { ...overlayRef.current, all: added };
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
      for (const o of added) m.removeLayer(o);
      overlayRef.current = null;
    };
  }, [ready, active, catalog, index, compareOn, compareIndex, mode, dimUnstable, feature, attempt]);
  useEffect(() => {
    for (const o of overlayRef.current?.all || []) o.setOpacity(opacity / 100);
  }, [opacity, status]);

  // Swipe: the two panes are clipped at the divider.
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !active || !m) return;
    const clip = () => {
      const left = m.getPane('indexRaster'),
        right = m.getPane('indexCompare');
      if (!compareOn) {
        if (left) left.style.clip = 'auto';
        if (right) right.style.clip = 'auto';
        return;
      }
      const p = m.containerPointToLayerPoint([0, 0]),
        size = m.getSize(),
        cut = p.x + (size.x * swipe) / 100;
      if (left) left.style.clip = `rect(${p.y}px, ${cut}px, ${p.y + size.y}px, ${p.x}px)`;
      if (right) right.style.clip = `rect(${p.y}px, ${p.x + size.x}px, ${p.y + size.y}px, ${cut}px)`;
    };
    clip();
    m.on('move zoomend resize', clip);
    return () => {
      m.off('move zoomend resize', clip);
      for (const name of ['indexRaster', 'indexCompare']) {
        const pane = m.getPane(name);
        if (pane) pane.style.clip = 'auto';
      }
    };
  }, [ready, active, compareOn, swipe, status]);

  // Click inspector: the stored score, its class and the Monte Carlo figures of that cell.
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !active || !catalog || !m) return;
    const L = (window as any).L;
    const click = async (e: any) => {
      if (m.__geotourTool) return;
      const id = compareOn && e.containerPoint.x > (m.getSize().x * swipe) / 100 ? compareIndex : index;
      const l = catalog.layers.find((x) => x.id === id);
      if (!l) return;
      if (feature) {
        const [x, y] = [e.latlng.lng, e.latlng.lat];
        const inside = (ring: number[][]) => {
          let hit = false;
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
            if (ring[i][1] > y !== ring[j][1] > y && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
          return hit;
        };
        const g: any = feature.geometry,
          polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        if (!polygons.some((rings: number[][][]) => inside(rings[0]) && !rings.slice(1).some(inside))) return;
      }
      let raw: Raw;
      try {
        raw = await loadRaw(l);
      } catch {
        return;
      }
      const cell = readCell(raw.data, raw.frame, e.latlng.lng, e.latlng.lat);
      const box = document.createElement('div');
      box.className = 'index-cell-popup';
      const add = (tag: string, text: string, cls = '') => {
        const el = document.createElement(tag);
        el.textContent = text;
        if (cls) el.className = cls;
        box.appendChild(el);
        return el;
      };
      const name = homeIndices.find((x) => x.id === id)?.name[lang] || id;
      add('small', id + ' · ' + name);
      if (!cell) add('p', t.outside);
      else {
        const head = add('strong', cell.score.toFixed(1) + ' / 100 · ' + t.classes[cell.classId - 1]);
        head.style.borderLeftColor = classColors(id)[cell.classId - 1];
        const meter = document.createElement('div');
        meter.className = 'index-cell-meter';
        const fill = document.createElement('i');
        fill.style.width = cell.score + '%';
        fill.style.background = classColors(id)[cell.classId - 1];
        meter.appendChild(fill);
        box.appendChild(meter);
        add('p', t.stability + ': ' + cell.stability + '%');
        add('p', t.range + ': ' + cell.range.toFixed(1) + ' ' + t.points);
        add('small', l.criteria.map((c) => (t.crit as any)[c] + ' ' + l.weights[c].toFixed(2)).join(' · '));
      }
      L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(box).openOn(m);
    };
    m.on('click', click);
    return () => {
      m.off('click', click);
      m.closePopup();
    };
  }, [ready, active, catalog, index, compareOn, compareIndex, swipe, lang, feature]);

  return {
    catalog,
    index,
    setIndex,
    region,
    setRegion,
    feature,
    regionTitle,
    regionRow,
    opacity,
    setOpacity,
    mode,
    setMode,
    dimUnstable,
    setDimUnstable,
    legendOpen,
    setLegendOpen,
    status,
    profile,
    layer,
    compareOn,
    setCompareOn,
    compareIndex,
    setCompareIndex,
    swipe,
    setSwipe,
    fitCountry: () => {
      setRegion('all');
      setReset((v) => v + 1);
    },
    retry: () => setAttempt((n) => n + 1),
  };
}
export type IndexLayerState = ReturnType<typeof useIndexLayer>;

export function IndexHeader({ state: s, lang }: { state: IndexLayerState; lang: IndexLang }) {
  const t = texts[lang];
  return (
    <div className="index-map-heading">
      <span>{t.active}</span>
      <strong>
        {s.index} · {s.profile.name[lang]}
      </strong>
      <small>
        {s.regionTitle} · {t.version}
      </small>
    </div>
  );
}

const gradient = (index: string) => 'linear-gradient(90deg,' + (INDEX_RAMPS[index] || INDEX_RAMPS.ESI).join(',') + ')';

export function IndexLegend({ state: s, lang }: { state: IndexLayerState; lang: IndexLang }) {
  const t = texts[lang],
    colors = classColors(s.index),
    shares: number[] | null = s.regionRow ? s.regionRow[s.index].class_share_pct : s.layer ? [1, 2, 3, 4, 5].map((k) => s.layer!.statistics.class_share_pct[String(k)]) : null,
    stability = s.regionRow ? s.regionRow[s.index].mean_stability_pct : s.layer?.monteCarlo.mean_class_stability_pct;
  return (
    <aside className={'index-map-legend ' + (s.legendOpen ? 'expanded' : '')} aria-label={t.scale}>
      <button className="index-legend-toggle" aria-label={s.legendOpen ? t.hide : t.show} aria-expanded={s.legendOpen} onClick={() => s.setLegendOpen((v) => !v)}>
        <span>
          <b>{s.index}</b> {t.scale}
        </span>
        {s.legendOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {s.mode === 'smooth' ? (
        <div className="index-color-scale smooth" style={{ background: gradient(s.index) }} />
      ) : (
        <div className="index-color-scale">
          {colors.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
      )}
      <div className="index-scale-ticks">
        {[0, 20, 40, 60, 80, 100].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="index-scale-names">
        <span>{t.classes[0]}</span>
        <span>{t.classes[2]}</span>
        <span>{t.classes[4]}</span>
      </div>
      {s.legendOpen && (
        <div className="index-legend-more">
          {shares && (
            <>
              <h4>
                {t.areaShare} · {s.regionTitle}
              </h4>
              <div className="index-class-rows">
                {colors.map((c, i) => (
                  <div key={c}>
                    <i style={{ background: c }} />
                    <span>{t.classes[i]}</span>
                    <small>{CLASS_RANGES[i]}</small>
                    <b>{shares[i].toFixed(1)}%</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {s.layer && (
            <>
              <h4>{t.weights}</h4>
              <div className="index-weight-rows">
                {s.layer.criteria.map((c) => (
                  <div key={c}>
                    <span>{(t.crit as any)[c]}</span>
                    <i>
                      <u style={{ width: s.layer!.weights[c] * 100 + '%', background: colors[3] }} />
                    </i>
                    <b>{s.layer!.weights[c].toFixed(2)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          {stability !== undefined && (
            <p className="index-legend-stability" title={t.stabilityNote}>
              {t.stability}: <b>{Number(stability).toFixed(0)}%</b>
              <small>{t.stabilityNote}</small>
            </p>
          )}
          <p>{t.note}</p>
          <div className="index-legend-links">
            <a href={BASE + 'METHOD_UZ.md'} target="_blank" rel="noreferrer">
              {t.method} ↗
            </a>
            <a href={BASE + 'results.json'} target="_blank" rel="noreferrer">
              {t.results} ↗
            </a>
            {s.layer && (
              <a href={s.layer.scoreUrl} download>
                <Download size={12} /> {t.geotiff}
              </a>
            )}
          </div>
        </div>
      )}
      {s.status === 'error' ? (
        <div className="index-raster-error" role="alert">
          <span>{t.error}</span>
          <button onClick={s.retry}>
            <RotateCcw size={12} />
            {t.retry}
          </button>
        </div>
      ) : s.status === 'loading' ? (
        <p className="index-raster-status" role="status">
          {t.loading}
        </p>
      ) : null}
    </aside>
  );
}

export function IndexControls({ state: s, lang }: { state: IndexLayerState; lang: IndexLang }) {
  const t = texts[lang];
  return (
    <div className="index-controls">
      <div className="index-field">
        <span>{t.display}</span>
        <div className="gp-seg wide" role="group" aria-label={t.display}>
          <button aria-pressed={s.mode === 'smooth'} onClick={() => s.setMode('smooth')}>
            {t.smooth}
          </button>
          <button aria-pressed={s.mode === 'classes'} onClick={() => s.setMode('classes')}>
            {t.stepped}
          </button>
        </div>
      </div>
      <label className="index-field">
        <span>
          {t.opacity} <b>{s.opacity}%</b>
        </span>
        <input aria-label={t.opacity} type="range" min="10" max="100" value={s.opacity} onChange={(e) => s.setOpacity(Number(e.target.value))} />
      </label>
      <label className="index-field">
        <span>{t.region}</span>
        <select aria-label={t.region} value={s.region} onChange={(e) => s.setRegion(e.target.value)}>
          <option value="all">{t.all}</option>
          {boundaries.features
            .map((f) => ({ id: f.properties.regionId, name: lang === 'en' ? f.properties.shapeName : f.properties.nameUz }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label className="index-check" title={t.dimHint}>
        <input type="checkbox" checked={s.dimUnstable} onChange={(e) => s.setDimUnstable(e.target.checked)} />
        <span>
          {t.dim}
          <small>{t.dimHint}</small>
        </span>
      </label>
      <label className="index-check">
        <input type="checkbox" checked={s.compareOn} onChange={(e) => s.setCompareOn(e.target.checked)} />
        <span>{t.compare}</span>
      </label>
      {s.compareOn && (
        <label className="index-field">
          <span>{t.right}</span>
          <select aria-label={t.right} value={s.compareIndex} onChange={(e) => s.setCompareIndex(e.target.value)}>
            {homeIndices
              .filter((m) => m.id !== s.index)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.name[lang]}
                </option>
              ))}
          </select>
        </label>
      )}
      <button className="index-reset" onClick={s.fitCountry}>
        {t.fit}
      </button>
    </div>
  );
}

export function IndexSwipe({ state: s, lang }: { state: IndexLayerState; lang: IndexLang }) {
  const t = texts[lang];
  if (!s.compareOn) return null;
  return (
    <>
      <div className="index-swipe-line" style={{ left: s.swipe + '%' }} />
      <div className="index-swipe-control">
        <div>
          <b>← {s.index}</b>
          <span>{t.comparison}</span>
          <b>{s.compareIndex} →</b>
        </div>
        <input aria-label={t.divider} type="range" min="5" max="95" value={s.swipe} onChange={(e) => s.setSwipe(Number(e.target.value))} />
      </div>
    </>
  );
}

export function IndexRegionPanel({ state: s, lang }: { state: IndexLayerState; lang: IndexLang }) {
  const [sort, setSort] = useState<'name' | 'mean'>('mean');
  const t = texts[lang];
  if (!s.catalog) return null;
  const colors = classColors(s.index);
  const label = (r: RegionRow) => (lang === 'en' ? boundaries.features.find((f) => f.properties.regionId === r.id)?.properties.shapeName || r.name : r.name);
  const rows = [...s.catalog.regions].sort((a, b) => (sort === 'mean' ? b[s.index].mean - a[s.index].mean : label(a).localeCompare(label(b))));
  return (
    <details className="index-region-panel">
      <summary>{t.regions}</summary>
      <p>{t.regionsNote}</p>
      <label>
        {t.order}
        <select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'mean')}>
          <option value="mean">{t.byMean}</option>
          <option value="name">{t.byName}</option>
        </select>
      </label>
      <div className="index-region-rows">
        {rows.map((r) => {
          const v = r[s.index];
          return (
            <button key={r.id} aria-pressed={s.region === r.id} onClick={() => s.setRegion(s.region === r.id ? 'all' : r.id)}>
              <span>
                {label(r)}
                <b>{v.mean.toFixed(1)}</b>
              </span>
              <span className="index-region-bar" role="img" aria-label={t.classes.map((n, i) => n + ': ' + v.class_share_pct[i].toFixed(1) + '%').join('; ')}>
                {v.class_share_pct.map((share: number, i: number) => (
                  <i key={i} style={{ width: share + '%', background: colors[i] }} />
                ))}
              </span>
              <small>
                {t.assessed}: {r.assessed_km2.toLocaleString('ru')} km² · {t.stability.toLowerCase()} {v.mean_stability_pct.toFixed(0)}%
              </small>
            </button>
          );
        })}
      </div>
      <a href={BASE + 'regional-statistics.csv'} download>
        CSV ↓
      </a>
    </details>
  );
}
