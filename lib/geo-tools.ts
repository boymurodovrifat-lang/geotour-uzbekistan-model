// Pure map helpers for the geoportal shell: measuring, coordinates, clustering and export.
// Points are [latitude, longitude] in degrees (WGS 84), distances in metres.
export type Point = readonly [number, number];
export type ToolLang = 'uz' | 'en' | 'ru';

const EARTH_RADIUS = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversine(a: Point, b: Point) {
  const dLat = rad(b[0] - a[0]),
    dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(points: readonly Point[]) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversine(points[i - 1], points[i]);
  return sum;
}

// Spherical polygon area in square metres. The ring is closed automatically.
export function ringArea(points: readonly Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    sum += rad(b[1] - a[1]) * (2 + Math.sin(rad(a[0])) + Math.sin(rad(b[0])));
  }
  return Math.abs((sum * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

function num(value: number, digits: number, lang: ToolLang) {
  const [whole, fraction] = value.toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : ' ');
  return fraction ? grouped + (lang === 'en' ? '.' : ',') + fraction : grouped;
}

export function formatLength(metres: number, lang: ToolLang) {
  const km = lang === 'ru' ? 'км' : 'km',
    m = lang === 'ru' ? 'м' : 'm';
  if (metres < 1000) return num(metres, 0, lang) + ' ' + m;
  return num(metres / 1000, metres < 10000 ? 2 : metres < 100000 ? 1 : 0, lang) + ' ' + km;
}

export function formatArea(squareMetres: number, lang: ToolLang) {
  const m2 = lang === 'ru' ? 'м²' : 'm²',
    ha = lang === 'ru' ? 'га' : lang === 'en' ? 'ha' : 'ga',
    km2 = lang === 'ru' ? 'км²' : 'km²';
  if (squareMetres < 10000) return num(squareMetres, 0, lang) + ' ' + m2;
  if (squareMetres < 1e6) return num(squareMetres / 10000, 1, lang) + ' ' + ha;
  const value = squareMetres / 1e6;
  return num(value, value < 100 ? 2 : value < 1000 ? 1 : 0, lang) + ' ' + km2;
}

// Accepts "41.31, 69.28", "41,31 69,28", "69.28E 41.31N" and 41°18'36"N 69°16'48"E.
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const s = String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]/g, '"');
  if (!s || s.length > 60 || !/\d/.test(s)) return null;
  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

  if (!/[NSEW°'"]/.test(s)) {
    let pair: string[] | null = null;
    const tokens = s.split(/[\s;]+/).filter(Boolean);
    if (tokens.length === 2 && tokens.every((x) => /^-?\d+(?:[.,]\d+)?,?$/.test(x))) pair = tokens.map((x) => x.replace(/,$/, '').replace(',', '.'));
    else if (tokens.length === 1) {
      const m = tokens[0].match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (m) pair = [m[1], m[2]];
    }
    if (!pair) return null;
    const a = Number(pair[0]),
      b = Number(pair[1]);
    return Math.abs(a) > 90 && Math.abs(b) <= 90 ? valid(b, a) : valid(a, b);
  }

  const value = String.raw`(\d+(?:\.\d+)?)\s*(?:°\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*")?)?`;
  const part = new RegExp('([NSEW])\\s*' + value + '|' + value + '\\s*([NSEW])', 'g');
  let lat: number | null = null,
    lng: number | null = null,
    count = 0;
  const normal = s.replace(/(\d),(\d)/g, '$1.$2');
  for (const m of normal.matchAll(part)) {
    const prefix = Boolean(m[1]);
    const hemisphere = prefix ? m[1] : m[8];
    const degrees = Number(prefix ? m[2] : m[5]),
      minutes = Number((prefix ? m[3] : m[6]) || 0),
      seconds = Number((prefix ? m[4] : m[7]) || 0);
    count++;
    if (minutes >= 60 || seconds >= 60) return null;
    const signed = (degrees + minutes / 60 + seconds / 3600) * (hemisphere === 'S' || hemisphere === 'W' ? -1 : 1);
    if (hemisphere === 'N' || hemisphere === 'S') lat = signed;
    else lng = signed;
  }
  // Every digit must belong to one of the two matched parts.
  if (normal.replace(part, '').match(/\d/)) return null;
  return count === 2 && lat !== null && lng !== null ? valid(lat, lng) : null;
}

export function formatCoordinate(lat: number, lng: number, dms = false) {
  const ns = lat < 0 ? 'S' : 'N',
    ew = lng < 0 ? 'W' : 'E';
  if (!dms) return Math.abs(lat).toFixed(5) + '° ' + ns + ', ' + Math.abs(lng).toFixed(5) + '° ' + ew;
  const one = (value: number) => {
    let total = Math.round(Math.abs(value) * 3600);
    const d = Math.floor(total / 3600);
    total -= d * 3600;
    const m = Math.floor(total / 60),
      sec = total - m * 60;
    return d + '°' + String(m).padStart(2, '0') + '′' + String(sec).padStart(2, '0') + '″';
  };
  return one(lat) + ' ' + ns + ', ' + one(lng) + ' ' + ew;
}

// Approximate on-screen scale for Web Mercator at 96 dpi, rounded to two significant digits.
export function scaleDenominator(lat: number, zoom: number) {
  const metresPerPixel = (156543.03392804097 * Math.cos(rad(lat))) / 2 ** zoom;
  const raw = metresPerPixel / 0.0002645833;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

export function formatScale(lat: number, zoom: number, lang: ToolLang) {
  return '1 : ' + num(scaleDenominator(lat, zoom), 0, lang);
}

// Clustering in screen pixels: a grid pass, then nearby cells are merged into the larger one
// so that bubbles do not sit on top of each other. Every point ends up in exactly one group.
export function clusterPoints(points: readonly { x: number; y: number }[], cell: number) {
  const cells = new Map<string, { items: number[]; x: number; y: number }>();
  points.forEach((p, i) => {
    const key = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell);
    const group = cells.get(key);
    if (group) {
      group.items.push(i);
      group.x += p.x;
      group.y += p.y;
    } else cells.set(key, { items: [i], x: p.x, y: p.y });
  });
  const kept: { items: number[]; x: number; y: number }[] = [],
    reach = (cell * 0.75) ** 2;
  for (const group of [...cells.values()].sort((a, b) => b.items.length - a.items.length)) {
    const gx = group.x / group.items.length,
      gy = group.y / group.items.length;
    const near = kept.find((k) => (k.x / k.items.length - gx) ** 2 + (k.y / k.items.length - gy) ** 2 < reach);
    if (near) {
      near.items.push(...group.items);
      near.x += group.x;
      near.y += group.y;
    } else kept.push(group);
  }
  return kept.map((group) => ({ items: group.items, x: group.x / group.items.length, y: group.y / group.items.length }));
}

// CSV with quoting and a guard against spreadsheet formula injection in community-edited text.
export function toCsv(rows: readonly Record<string, unknown>[], columns: readonly string[]) {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",;\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\r\n') + '\r\n';
}

export function toGeoJson(rows: readonly Record<string, unknown>[], attribution: string) {
  return {
    type: 'FeatureCollection',
    attribution,
    features: rows.map(({ lat, lng, ...properties }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
      properties,
    })),
  };
}
