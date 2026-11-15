'use client';
// Live weather from Open-Meteo (https://open-meteo.com, CC BY 4.0). No key, fetched in the visitor's browser.
// Two uses: a "weather now" map layer for the main cities and resorts, and a forecast block in the place card.
import { useEffect, useRef, useState, type RefObject } from 'react';

type Lang = 'uz' | 'en' | 'ru';
type Kind = 'clear' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export type WeatherNow = { temp: number; code: number; wind: number; humidity: number; isDay: boolean };
export type WeatherDay = { date: string; code: number; max: number; min: number; rain: number | null };
export type Weather = { now: WeatherNow; days: WeatherDay[]; fetchedAt: number };

const API = 'https://api.open-meteo.com/v1/forecast';
const QUERY =
  '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5';
const TTL = 15 * 60 * 1000;

export const WEATHER_PLACES: { id: string; lat: number; lng: number; name: Record<Lang, string> }[] = [
  { id: 'tashkent', lat: 41.311, lng: 69.279, name: { uz: 'Toshkent', en: 'Tashkent', ru: 'Ташкент' } },
  { id: 'samarkand', lat: 39.654, lng: 66.975, name: { uz: 'Samarqand', en: 'Samarkand', ru: 'Самарканд' } },
  { id: 'bukhara', lat: 39.774, lng: 64.423, name: { uz: 'Buxoro', en: 'Bukhara', ru: 'Бухара' } },
  { id: 'khiva', lat: 41.378, lng: 60.364, name: { uz: 'Xiva', en: 'Khiva', ru: 'Хива' } },
  { id: 'nukus', lat: 42.461, lng: 59.617, name: { uz: 'Nukus', en: 'Nukus', ru: 'Нукус' } },
  { id: 'muynak', lat: 43.78, lng: 59.03, name: { uz: 'Mo‘ynoq', en: 'Muynak', ru: 'Муйнак' } },
  { id: 'navoi', lat: 40.103, lng: 65.373, name: { uz: 'Navoiy', en: 'Navoi', ru: 'Навои' } },
  { id: 'karshi', lat: 38.861, lng: 65.789, name: { uz: 'Qarshi', en: 'Karshi', ru: 'Карши' } },
  { id: 'termez', lat: 37.224, lng: 67.278, name: { uz: 'Termiz', en: 'Termez', ru: 'Термез' } },
  { id: 'jizzakh', lat: 40.116, lng: 67.842, name: { uz: 'Jizzax', en: 'Jizzakh', ru: 'Джизак' } },
  { id: 'zaamin', lat: 39.622, lng: 68.475, name: { uz: 'Zomin', en: 'Zaamin', ru: 'Заамин' } },
  { id: 'gulistan', lat: 40.49, lng: 68.784, name: { uz: 'Guliston', en: 'Gulistan', ru: 'Гулистан' } },
  { id: 'chimgan', lat: 41.548, lng: 70.02, name: { uz: 'Chimyon', en: 'Chimgan', ru: 'Чимган' } },
  { id: 'namangan', lat: 40.998, lng: 71.673, name: { uz: 'Namangan', en: 'Namangan', ru: 'Наманган' } },
  { id: 'fergana', lat: 40.389, lng: 71.783, name: { uz: 'Farg‘ona', en: 'Fergana', ru: 'Фергана' } },
  { id: 'andijan', lat: 40.783, lng: 72.344, name: { uz: 'Andijon', en: 'Andijan', ru: 'Андижан' } },
];

const TEXT = {
  uz: {
    title: 'Ob-havo',
    now: 'Hozir',
    wind: 'Shamol',
    humidity: 'Namlik',
    rain: 'Yog‘in ehtimoli',
    loading: 'Ob-havo yuklanmoqda…',
    failed: 'Ob-havo ma’lumoti olinmadi.',
    retry: 'Qayta urinish',
    source: 'Manba: Open-Meteo · model prognozi, rasmiy ogohlantirish emas',
    kmh: 'km/soat',
    today: 'Bugun',
    days: ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'],
    kind: { clear: 'Ochiq', partly: 'Biroz bulutli', cloud: 'Bulutli', fog: 'Tuman', drizzle: 'Mayda yomg‘ir', rain: 'Yomg‘ir', snow: 'Qor', storm: 'Momaqaldiroq' },
  },
  en: {
    title: 'Weather',
    now: 'Now',
    wind: 'Wind',
    humidity: 'Humidity',
    rain: 'Chance of precipitation',
    loading: 'Loading weather…',
    failed: 'Weather data could not be loaded.',
    retry: 'Try again',
    source: 'Source: Open-Meteo · model forecast, not an official warning',
    kmh: 'km/h',
    today: 'Today',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    kind: { clear: 'Clear', partly: 'Partly cloudy', cloud: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm' },
  },
  ru: {
    title: 'Погода',
    now: 'Сейчас',
    wind: 'Ветер',
    humidity: 'Влажность',
    rain: 'Вероятность осадков',
    loading: 'Загрузка погоды…',
    failed: 'Не удалось получить данные о погоде.',
    retry: 'Повторить',
    source: 'Источник: Open-Meteo · модельный прогноз, не официальное предупреждение',
    kmh: 'км/ч',
    today: 'Сегодня',
    days: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    kind: { clear: 'Ясно', partly: 'Переменная облачность', cloud: 'Пасмурно', fog: 'Туман', drizzle: 'Морось', rain: 'Дождь', snow: 'Снег', storm: 'Гроза' },
  },
} as const;

/** WMO weather interpretation codes, grouped into eight display kinds. */
export function weatherKind(code: number): Kind {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}
export const weatherLabel = (code: number, lang: Lang) => TEXT[lang].kind[weatherKind(code)];

const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>';
const GLYPH: Record<Kind, string> = {
  clear: SUN,
  partly: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.4 14.6 2.8 2.8 0 0 0 9 20z"/>',
  cloud: CLOUD,
  fog: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 7.1 3.5 3.5 0 0 0 7 14z"/><path d="M5 18h14M8 21h8"/>',
  drizzle: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M9 18v1M13 18v1M17 18v1"/>',
  rain: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 7.1 3.5 3.5 0 0 0 7 14z"/><path d="M8 17l-1 4M12 17l-1 4M16 17l-1 4"/>',
  snow: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 7.1 3.5 3.5 0 0 0 7 14z"/><path d="M8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01"/>',
  storm: '<path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 7.1 3.5 3.5 0 0 0 7 14z"/><path d="M12.5 15l-2.5 4h3l-1.5 3"/>',
};
export function weatherSvg(code: number, isDay = true, size = 18) {
  const kind = weatherKind(code);
  const body = kind === 'clear' && !isDay ? MOON : GLYPH[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function parse(j: any): Weather {
  const c = j.current,
    d = j.daily;
  return {
    now: { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, humidity: c.relative_humidity_2m, isDay: c.is_day !== 0 },
    days: d.time.map((date: string, i: number) => ({ date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max?.[i] ?? null })),
    fetchedAt: Date.now(),
  };
}
const cache = new Map<string, Weather>();
const keyOf = (lat: number, lng: number) => lat.toFixed(2) + ',' + lng.toFixed(2);

/** One request for any number of points; results are cached for 15 minutes per rounded coordinate. */
export async function fetchWeather(points: { lat: number; lng: number }[], signal?: AbortSignal): Promise<Weather[]> {
  const fresh = (p: { lat: number; lng: number }) => {
    const hit = cache.get(keyOf(p.lat, p.lng));
    return hit && Date.now() - hit.fetchedAt < TTL ? hit : null;
  };
  const missing = points.filter((p) => !fresh(p));
  if (missing.length) {
    const url = API + '?latitude=' + missing.map((p) => p.lat.toFixed(3)).join(',') + '&longitude=' + missing.map((p) => p.lng.toFixed(3)).join(',') + QUERY;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('weather ' + response.status);
    const json = await response.json();
    (Array.isArray(json) ? json : [json]).forEach((item: any, i: number) => cache.set(keyOf(missing[i].lat, missing[i].lng), parse(item)));
  }
  return points.map((p) => cache.get(keyOf(p.lat, p.lng)) as Weather);
}

const round = (v: number) => (Math.round(v) === 0 ? 0 : Math.round(v));
const degree = (v: number) => (round(v) > 0 ? '+' : '') + round(v) + '°';

/** Forecast block for the place card. */
export function WeatherCard({ lat, lng, lang }: { lat: number; lng: number; lang: Lang }) {
  const x = TEXT[lang];
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'failed'; data?: Weather }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchWeather([{ lat, lng }], controller.signal)
      .then(([data]) => setState({ status: 'ready', data }))
      .catch((error) => {
        if (error?.name !== 'AbortError') setState({ status: 'failed' });
      });
    return () => controller.abort();
  }, [lat, lng, attempt]);
  if (state.status === 'loading') return <section className="gp-weather" aria-busy="true"><p className="gp-weather-note">{x.loading}</p></section>;
  if (state.status === 'failed' || !state.data)
    return (
      <section className="gp-weather">
        <p className="gp-weather-note">
          {x.failed} <button onClick={() => setAttempt((n) => n + 1)}>{x.retry}</button>
        </p>
      </section>
    );
  const { now, days } = state.data;
  return (
    <section className="gp-weather" aria-label={x.title}>
      <header>
        <span className="gp-weather-icon" dangerouslySetInnerHTML={{ __html: weatherSvg(now.code, now.isDay, 34) }} />
        <strong>{degree(now.temp)}</strong>
        <span>
          <b>{weatherLabel(now.code, lang)}</b>
          <small>
            {x.wind} {round(now.wind)} {x.kmh} · {x.humidity} {round(now.humidity)}%
          </small>
        </span>
      </header>
      <ol>
        {days.map((d, i) => (
          <li key={d.date} title={weatherLabel(d.code, lang) + (d.rain === null ? '' : ' · ' + x.rain + ' ' + d.rain + '%')}>
            <small>{i === 0 ? x.today : x.days[new Date(d.date + 'T12:00:00').getDay()]}</small>
            <span dangerouslySetInnerHTML={{ __html: weatherSvg(d.code, true, 20) }} />
            <b>{degree(d.max)}</b>
            <i>{degree(d.min)}</i>
          </li>
        ))}
      </ol>
      <p className="gp-weather-note">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {x.source}
        </a>
      </p>
    </section>
  );
}

/** "Weather now" layer: a temperature badge on the main cities and resorts. */
export function useWeatherLayer(mapRef: RefObject<any>, ready: boolean, on: boolean, lang: Lang) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [tick, setTick] = useState(0);
  const layerRef = useRef<any>(null);
  useEffect(() => {
    const map = mapRef.current,
      L = (window as any).L;
    if (!ready || !map || !L || !on) {
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    setStatus('loading');
    fetchWeather(WEATHER_PLACES, controller.signal)
      .then((all) => {
        all.forEach((w, i) => {
          const place = WEATHER_PLACES[i];
          const html = `<span class="gp-wx" data-kind="${weatherKind(w.now.code)}">${weatherSvg(w.now.code, w.now.isDay, 17)}<b>${degree(w.now.temp)}</b></span>`;
          L.marker([place.lat, place.lng], { icon: L.divIcon({ className: 'gp-wx-wrap', html, iconSize: [58, 26], iconAnchor: [29, 13] }), keyboard: false, zIndexOffset: 400 })
            .bindTooltip(`${place.name[lang]} · ${weatherLabel(w.now.code, lang)} · ${TEXT[lang].wind} ${round(w.now.wind)} ${TEXT[lang].kmh}`, { direction: 'top', offset: [0, -12] })
            .addTo(group);
        });
        setStatus('ready');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setStatus('failed');
      });
    const timer = setTimeout(() => setTick((n) => n + 1), TTL + 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      group.remove();
    };
  }, [ready, on, lang, tick]);
  return { status, retry: () => setTick((n) => n + 1) };
}
