// Display helpers for the v0.4 data images (one RGBA image per index, Web Mercator).
// R = score*2 (0-200), G = class stability % (0-100), B = (P95-P5)*2, A = 255 on assessed land.
// Colours never feed back into any calculation.
export const INDEX_RAMPS: Record<string, readonly string[]> = {
  ESI: ['#f4f7ec', '#cfe6b0', '#8fca83', '#3f9f61', '#12733f', '#07452a'],
  TSI: ['#f1f5fb', '#c3daf0', '#85b4e0', '#3f82c6', '#17539a', '#0b2f66'],
  TPI: ['#fbf4e6', '#f7d9a0', '#f0ac55', '#d67a22', '#a04c10', '#662b08'],
  TRSI: ['#f5f1fa', '#dccdee', '#b79ada', '#8663bd', '#59339a', '#351a66'],
};
export const CLASS_RANGES = ['0–20', '>20–40', '>40–60', '>60–80', '>80–100'] as const;
export type DisplayMode = 'smooth' | 'classes';

function rgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid display colour');
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function rampColor(ramp: readonly string[], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1),
    i = Math.min(ramp.length - 2, Math.floor(x)),
    f = x - i,
    a = rgb(ramp[i]),
    b = rgb(ramp[i + 1]);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}

// Fixed classes [0,20], (20,40], (40,60], (60,80], (80,100] -> 1..5 (same rule as the analysis).
export function scoreClass(score: number) {
  return score <= 20 ? 1 : score <= 40 ? 2 : score <= 60 ? 3 : score <= 80 ? 4 : 5;
}

export function classColors(index: string): string[] {
  const ramp = INDEX_RAMPS[index] || INDEX_RAMPS.ESI;
  return [0.06, 0.3, 0.52, 0.76, 1].map((t) => '#' + rampColor(ramp, t).map((v) => v.toString(16).padStart(2, '0')).join(''));
}

// 201 RGBA entries, one per encoded score step (0.5 points). Low scores stay mostly transparent
// so that the terrain remains readable under the layer.
export function buildLut(index: string, mode: DisplayMode) {
  const ramp = INDEX_RAMPS[index] || INDEX_RAMPS.ESI,
    lut = new Uint8ClampedArray(201 * 4),
    classes = classColors(index).map(rgb),
    classAlpha = [70, 190, 235, 250, 255];
  for (let v = 0; v <= 200; v++) {
    const score = v / 2;
    let color: [number, number, number], alpha: number;
    if (mode === 'classes') {
      const k = scoreClass(score) - 1;
      color = classes[k];
      alpha = classAlpha[k];
    } else {
      color = rampColor(ramp, score / 100);
      alpha = Math.round(255 * Math.min(1, 0.16 + 0.84 * Math.pow(Math.min(1, score / 45), 0.85)));
    }
    lut.set([color[0], color[1], color[2], alpha], v * 4);
  }
  return lut;
}

// Colours `raw` into `out` (both RGBA, same size). With `dimUnstable`, cells whose class is kept
// in fewer Monte Carlo runs are faded.
export function colorize(raw: Uint8ClampedArray, out: Uint8ClampedArray, lut: Uint8ClampedArray, dimUnstable: boolean) {
  for (let p = 0; p < raw.length; p += 4) {
    if (raw[p + 3] < 128) {
      out[p + 3] = 0;
      continue;
    }
    const q = Math.min(200, raw[p]) * 4;
    out[p] = lut[q];
    out[p + 1] = lut[q + 1];
    out[p + 2] = lut[q + 2];
    out[p + 3] = dimUnstable ? Math.round(lut[q + 3] * (0.18 + 0.82 * Math.min(100, raw[p + 1]) / 100)) : lut[q + 3];
  }
  return out;
}

export type ImageFrame = { width: number; height: number; west: number; south: number; east: number; north: number };
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// Longitude/latitude -> fractional pixel in a Web Mercator image.
export function toPixel(frame: ImageFrame, lng: number, lat: number): [number, number] {
  const x = ((lng - frame.west) / (frame.east - frame.west)) * frame.width;
  const y = ((mercatorY(frame.north) - mercatorY(lat)) / (mercatorY(frame.north) - mercatorY(frame.south))) * frame.height;
  return [x, y];
}

export function readCell(raw: Uint8ClampedArray, frame: ImageFrame, lng: number, lat: number) {
  const [x, y] = toPixel(frame, lng, lat),
    col = Math.floor(x),
    row = Math.floor(y);
  if (col < 0 || row < 0 || col >= frame.width || row >= frame.height) return null;
  const p = (row * frame.width + col) * 4;
  if (raw[p + 3] < 128) return null;
  const score = raw[p] / 2;
  return { score, classId: scoreClass(score), stability: raw[p + 1], range: raw[p + 2] / 2 };
}
