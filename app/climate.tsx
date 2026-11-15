'use client';
// Monthly climate comfort ("when to go"), computed from TerraClimate 1991-2020 monthly normals by
// analysis/climate/comfort.py. One Web Mercator PNG holds the twelve months stacked vertically;
// R = score*2 (0-200), A = 255 where the score is defined.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { toPixel, type ImageFrame } from '../lib/index-v04';

type Lang = 'uz' | 'en' | 'ru';
type Meta = { image: string; imageFallback?: string; frame: ImageFrame; months: number; source: string; version: string };
type Climate = { meta: Meta; data: Uint8ClampedArray };

export const CLIMATE_RAMP = ['#8c510a', '#c7893f', '#e6d3a3', '#9fd2c4', '#3d9c8f', '#0f6b5c'];
const MONTHS = {
  uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
};
const TEXT = {
  uz: {
    title: 'Qachon borish kerak',
    best: 'Eng qulay oylar',
    none: 'Yil davomida qulay oy yo‘q',
    classes: ['juda noqulay', 'noqulay', 'o‘rtacha', 'qulay', 'juda qulay'],
    note: 'Iqlim qulayligi 1991–2020 yillar oylik normalari (TerraClimate) bo‘yicha: harorat, namlik, yog‘in, quyosh radiatsiyasi va shamol. Bu o‘rtacha iqlim, ob-havo prognozi emas.',
    layer: 'Iqlim qulayligi',
    month: 'Oy',
  },
  en: {
    title: 'When to go',
    best: 'Best months',
    none: 'No comfortable month in the year',
    classes: ['very poor', 'poor', 'fair', 'good', 'very good'],
    note: 'Climate comfort from 1991–2020 monthly normals (TerraClimate): temperature, humidity, precipitation, solar radiation and wind. Average climate, not a weather forecast.',
    layer: 'Climate comfort',
    month: 'Month',
  },
  ru: {
    title: 'Когда ехать',
    best: 'Лучшие месяцы',
    none: 'Комфортных месяцев в году нет',
    classes: ['очень плохо', 'плохо', 'удовлетворительно', 'хорошо', 'очень хорошо'],
    note: 'Климатический комфорт по месячным нормам 1991–2020 гг. (TerraClimate): температура, влажность, осадки, солнечная радиация и ветер. Это средний климат, а не прогноз погоды.',
    layer: 'Климатический комфорт',
    month: 'Месяц',
  },
} as const;

export const monthNames = (lang: Lang) => MONTHS[lang];
export const climateText = (lang: Lang) => TEXT[lang];
export const comfortClass = (score: number) => (score > 80 ? 4 : score > 60 ? 3 : score > 40 ? 2 : score > 20 ? 1 : 0);

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
export function comfortColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100)) * (CLIMATE_RAMP.length - 1),
    i = Math.min(Math.floor(t), CLIMATE_RAMP.length - 2),
    f = t - i,
    a = hex(CLIMATE_RAMP[i]),
    b = hex(CLIMATE_RAMP[i + 1]);
  return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',') + ')';
}

let job: Promise<Climate | null> | null = null;
export function loadClimate(): Promise<Climate | null> {
  if (!job)
    job = fetch('/science/climate/climate.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (value: unknown): Promise<Climate> | null => {
          const meta = value as Meta | null;
          return (
          meta &&
          new Promise<Climate>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              const ctx = c.getContext('2d', { willReadFrequently: true })!;
              ctx.drawImage(img, 0, 0);
              resolve({ meta, data: ctx.getImageData(0, 0, c.width, c.height).data });
            };
            img.onerror = () => {
              if (meta.imageFallback && !img.src.endsWith(meta.imageFallback)) img.src = meta.imageFallback;
              else reject(new Error('climate image'));
            };
            img.src = meta.image;
          })
          );
        },
      )
      .catch(() => {
        job = null;
        return null;
      });
  return job;
}

export function monthlyAt(c: Climate, lat: number, lng: number): number[] | null {
  const f = c.meta.frame,
    [x, y] = toPixel(f, lng, lat),
    col = Math.floor(x),
    row = Math.floor(y);
  if (col < 0 || row < 0 || col >= f.width || row >= f.height) return null;
  const out: number[] = [];
  for (let m = 0; m < 12; m++) {
    const p = ((m * f.height + row) * f.width + col) * 4;
    if (c.data[p + 3] < 128) return null;
    out.push(c.data[p] / 2);
  }
  return out;
}

export const bestMonths = (values: number[]) => {
  const top = Math.max(...values);
  return values.map((v, i) => [v, i] as const).filter(([v]) => v > 60 && v >= top - 12).map(([, i]) => i);
};

/** Twelve-month comfort strip for a place. Renders nothing if the climate data are not published. */
export function ClimateStrip({ lat, lng, lang, compact = false }: { lat: number; lng: number; lang: Lang; compact?: boolean }) {
  const [values, setValues] = useState<number[] | null>(null);
  useEffect(() => {
    let live = true;
    setValues(null);
    loadClimate().then((c) => live && c && setValues(monthlyAt(c, lat, lng)));
    return () => {
      live = false;
    };
  }, [lat, lng]);
  if (!values) return null;
  const x = TEXT[lang],
    best = bestMonths(values),
    names = MONTHS[lang];
  return (
    <section className={'gp-climate' + (compact ? ' compact' : '')} aria-label={x.title}>
      <header>
        <b>{x.title}</b>
        <span>{best.length ? x.best + ': ' + best.map((i) => names[i]).join(', ') : x.none}</span>
      </header>
      <ol>
        {values.map((v, i) => (
          <li key={i} title={names[i] + ' · ' + Math.round(v) + '/100 · ' + x.classes[comfortClass(v)]} data-best={best.includes(i) || undefined}>
            <i style={{ height: Math.max(8, v) + '%', background: comfortColor(v) }} />
            <small>{names[i].slice(0, lang === 'uz' && i === 5 ? 3 : 1)}</small>
          </li>
        ))}
      </ol>
      {!compact && <p>{x.note}</p>}
    </section>
  );
}

/** Map layer: comfort of one month, coloured in the browser. */
export function useClimateLayer(mapRef: RefObject<any>, ready: boolean, on: boolean, month: number) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const overlay = useRef<any>(null),
    canvas = useRef<HTMLCanvasElement | null>(null),
    climate = useRef<Climate | null>(null);
  useEffect(() => {
    const map = mapRef.current,
      L = (window as any).L;
    if (!ready || !map || !L || !on) {
      overlay.current?.remove();
      overlay.current = null;
      setStatus('idle');
      return;
    }
    let live = true;
    setStatus('loading');
    loadClimate().then((c) => {
      if (!live) return;
      if (!c) return setStatus('failed');
      climate.current = c;
      const f = c.meta.frame;
      if (!map.getPane('climate')) {
        map.createPane('climate');
        map.getPane('climate').style.zIndex = '390';
      }
      canvas.current = document.createElement('canvas');
      canvas.current.width = f.width;
      canvas.current.height = f.height;
      const Overlay = L.ImageOverlay.extend({
        _initImage(this: any) {
          const el = (this._image = this._url);
          L.DomUtil.addClass(el, 'leaflet-image-layer');
          if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
          L.DomUtil.addClass(el, 'climate-raster');
        },
      });
      overlay.current = new Overlay(canvas.current, [[f.south, f.west], [f.north, f.east]], { pane: 'climate', opacity: 0.78, interactive: false, attribution: 'Climate: TerraClimate 1991–2020' }).addTo(map);
      setStatus('ready');
    });
    return () => {
      live = false;
      overlay.current?.remove();
      overlay.current = null;
    };
  }, [ready, on]);
  useEffect(() => {
    const c = climate.current,
      cv = canvas.current;
    if (status !== 'ready' || !c || !cv) return;
    const f = c.meta.frame,
      ctx = cv.getContext('2d')!,
      img = ctx.createImageData(f.width, f.height),
      lut = new Uint8ClampedArray(201 * 3);
    for (let v = 0; v <= 200; v++) {
      const m = comfortColor(v / 2).match(/\d+/g)!.map(Number);
      lut.set(m, v * 3);
    }
    const offset = month * f.height * f.width * 4;
    for (let p = 0, n = f.width * f.height * 4; p < n; p += 4) {
      const a = c.data[offset + p + 3];
      if (a < 128) continue;
      const v = Math.min(200, c.data[offset + p]) * 3;
      img.data[p] = lut[v];
      img.data[p + 1] = lut[v + 1];
      img.data[p + 2] = lut[v + 2];
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    overlay.current?._reset?.();
  }, [status, month]);
  return { status, readAt: (lat: number, lng: number) => (climate.current ? monthlyAt(climate.current, lat, lng) : null) };
}

/** Month bar shown on the map while the climate layer is on. */
export function ClimateMonthBar({ month, setMonth, lang }: { month: number; setMonth: (m: number) => void; lang: Lang }) {
  const x = TEXT[lang];
  return (
    <div className="gp-month-bar" role="group" aria-label={x.layer + ' · ' + x.month}>
      <b>{x.layer}</b>
      <div>
        {MONTHS[lang].map((n, i) => (
          <button key={n} aria-pressed={month === i} onClick={() => setMonth(i)}>
            {n}
          </button>
        ))}
      </div>
      <span className="gp-month-legend" aria-hidden="true">
        <i style={{ background: 'linear-gradient(90deg,' + CLIMATE_RAMP.join(',') + ')' }} />
        <small>{x.classes[0]}</small>
        <small>{x.classes[4]}</small>
      </span>
    </div>
  );
}
