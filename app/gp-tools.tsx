'use client';
// Self-contained map tools for the geoportal shell. Each keeps its own state so that
// pointer movement never re-renders the whole portal.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Crosshair, ExternalLink, LocateFixed, MapPin, Ruler, Trash2, Undo2, X } from 'lucide-react';
import { formatArea, formatCoordinate, formatLength, formatScale, haversine, pathLength, ringArea } from '../lib/geo-tools';
import { pro, type GeoLang } from './geoportal-ui';

type MapRef = RefObject<any>;
const leaflet = () => (window as any).L;

export function copyText(text: string, done: () => void) {
  navigator.clipboard?.writeText(text).then(done, () => undefined);
}

/* Cursor coordinates, zoom and scale. */
export function MapStatus({ mapRef, ready, lang, onCopied }: { mapRef: MapRef; ready: boolean; lang: GeoLang; onCopied: () => void }) {
  const [state, setState] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [dms, setDms] = useState(false);
  const x = pro[lang];
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    let frame = 0,
      cursor: { lat: number; lng: number } | null = null;
    const push = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const at = cursor || m.getCenter();
        setState({ lat: at.lat, lng: at.lng, zoom: m.getZoom() });
      });
    };
    const move = (e: any) => {
      cursor = e.latlng;
      push();
    };
    const out = () => {
      cursor = null;
      push();
    };
    m.on('mousemove', move);
    m.on('mouseout', out);
    m.on('zoomend moveend', push);
    push();
    return () => {
      cancelAnimationFrame(frame);
      m.off('mousemove', move);
      m.off('mouseout', out);
      m.off('zoomend moveend', push);
    };
  }, [ready]);
  if (!state) return <div className="gp-status" />;
  const text = formatCoordinate(state.lat, state.lng, dms);
  return (
    <div className="gp-status">
      <button className="gp-status-coord" title={x.copyCoords} aria-label={x.copyCoords + ': ' + text} onClick={() => copyText(text, onCopied)}>
        <Crosshair size={14} />
        <span>{text}</span>
      </button>
      <button className="gp-status-unit" title={x.coordFormat} aria-label={x.coordFormat} onClick={() => setDms((v) => !v)}>
        {dms ? 'DMS' : 'DD'}
      </button>
      <span className="gp-status-item" title={x.zoom}>
        {x.zoom} <b>{Number(state.zoom.toFixed(2))}</b>
      </span>
      <span className="gp-status-item" title={x.scale}>
        <b>{formatScale(state.lat, state.zoom, lang)}</b>
      </span>
    </div>
  );
}

/* Distance and area measuring with live segment labels. */
export function useMeasure(mapRef: MapRef, ready: boolean, lang: GeoLang) {
  const [active, setActive] = useState(false),
    [mode, setMode] = useState<'line' | 'area'>('line'),
    [points, setPoints] = useState<[number, number][]>([]);
  const finished = useRef(false),
    current = useRef(points);
  useEffect(() => {
    current.current = points;
  }, [points]);

  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !active) return;
    const L = leaflet();
    m.__geotourTool = true;
    m.doubleClickZoom.disable();
    m.getContainer().classList.add('gp-measuring');
    const rubber = L.polyline([], { color: '#c2410c', weight: 2, opacity: 0.75, dashArray: '4 7', interactive: false }).addTo(m);
    const click = (e: any) => {
      if (e.originalEvent?.detail > 1) return;
      const point: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPoints((v) => (finished.current ? [point] : [...v, point]));
      finished.current = false;
    };
    const finish = () => {
      finished.current = true;
      rubber.setLatLngs([]);
    };
    const move = (e: any) => {
      const pts = current.current;
      if (finished.current || !pts.length) return void rubber.setLatLngs([]);
      const here = [e.latlng.lat, e.latlng.lng];
      rubber.setLatLngs(mode === 'area' && pts.length > 1 ? [pts[pts.length - 1], here, pts[0]] : [pts[pts.length - 1], here]);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false);
      else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) setPoints((v) => v.slice(0, -1));
    };
    m.on('click', click);
    m.on('dblclick', finish);
    m.on('mousemove', move);
    window.addEventListener('keydown', key);
    return () => {
      m.off('click', click);
      m.off('dblclick', finish);
      m.off('mousemove', move);
      window.removeEventListener('keydown', key);
      m.removeLayer(rubber);
      m.__geotourTool = false;
      m.doubleClickZoom.enable();
      m.getContainer().classList.remove('gp-measuring');
    };
  }, [ready, active, mode]);

  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m || !points.length) return;
    const L = leaflet(),
      group = L.layerGroup().addTo(m),
      closed = mode === 'area' && points.length > 2;
    if (closed) L.polygon(points, { color: '#c2410c', weight: 2.5, fillColor: '#f97316', fillOpacity: 0.16, interactive: false }).addTo(group);
    else L.polyline(points, { color: '#c2410c', weight: 3, interactive: false }).addTo(group);
    const ring = closed ? [...points, points[0]] : points;
    if (ring.length <= 16)
      for (let i = 1; i < ring.length; i++) {
        const label = document.createElement('span');
        label.textContent = formatLength(haversine(ring[i - 1], ring[i]), lang);
        L.marker([(ring[i - 1][0] + ring[i][0]) / 2, (ring[i - 1][1] + ring[i][1]) / 2], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'gp-seg-label', html: label, iconSize: [0, 0] }),
        }).addTo(group);
      }
    for (const p of points)
      L.circleMarker(p, { radius: 4.5, color: '#c2410c', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(group);
    return () => {
      m.removeLayer(group);
    };
  }, [ready, points, mode, lang]);

  const reset = () => {
    setPoints([]);
    finished.current = false;
  };
  const closedRing = mode === 'area' && points.length > 2;
  return {
    active,
    mode,
    points,
    length: closedRing ? pathLength([...points, points[0]]) : pathLength(points),
    area: closedRing ? ringArea(points) : 0,
    setMode: (next: 'line' | 'area') => {
      setMode(next);
      finished.current = false;
    },
    toggle: () => {
      setActive((v) => !v);
      reset();
    },
    startAt: (point: [number, number]) => {
      setActive(true);
      setPoints([point]);
      finished.current = false;
    },
    stop: () => {
      setActive(false);
      reset();
    },
    clear: reset,
    undo: () => setPoints((v) => v.slice(0, -1)),
  };
}
export type MeasureState = ReturnType<typeof useMeasure>;

export function MeasureBar({ state: s, lang, closeLabel, clearLabel }: { state: MeasureState; lang: GeoLang; closeLabel: string; clearLabel: string }) {
  const x = pro[lang];
  if (!s.active) return null;
  const enough = s.mode === 'area' ? s.points.length > 2 : s.points.length > 1;
  return (
    <div className="gp-measure-bar" role="status">
      <Ruler size={16} />
      <div className="gp-seg" role="group" aria-label={x.mLine + ' / ' + x.mArea}>
        <button aria-pressed={s.mode === 'line'} onClick={() => s.setMode('line')}>
          {x.mLine}
        </button>
        <button aria-pressed={s.mode === 'area'} onClick={() => s.setMode('area')}>
          {x.mArea}
        </button>
      </div>
      <span className="gp-measure-value">
        {!enough ? (
          s.mode === 'area' ? x.hintArea : x.hintLine
        ) : s.mode === 'area' ? (
          <>
            <b>{formatArea(s.area, lang)}</b>
            <small>
              {x.perimeter}: {formatLength(s.length, lang)}
            </small>
          </>
        ) : (
          <b>{formatLength(s.length, lang)}</b>
        )}
      </span>
      {s.points.length > 0 && (
        <>
          <button className="gp-icon-btn" onClick={s.undo} title={x.undo + ' (Ctrl+Z)'} aria-label={x.undo}>
            <Undo2 size={15} />
          </button>
          <button className="gp-icon-btn" onClick={s.clear} title={clearLabel} aria-label={clearLabel}>
            <Trash2 size={15} />
          </button>
        </>
      )}
      <button className="gp-icon-btn" onClick={s.stop} title={closeLabel + ' (Esc)'} aria-label={closeLabel}>
        <X size={15} />
      </button>
    </div>
  );
}

/* Right-click (or long-press) menu on the map. */
export function MapContextMenu({
  mapRef,
  ready,
  lang,
  onPin,
  onMeasure,
  onCopied,
}: {
  mapRef: MapRef;
  ready: boolean;
  lang: GeoLang;
  onPin: (lat: number, lng: number) => void;
  onMeasure: (point: [number, number]) => void;
  onCopied: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; lat: number; lng: number; zoom: number } | null>(null);
  const x = pro[lang];
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const open = (e: any) => {
      e.originalEvent?.preventDefault();
      if (m.__geotourTool) return;
      const size = m.getSize();
      setMenu({ x: Math.min(e.containerPoint.x, size.x - 250), y: Math.min(e.containerPoint.y, size.y - 230), lat: e.latlng.lat, lng: e.latlng.lng, zoom: Math.round(m.getZoom()) });
    };
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    m.on('contextmenu', open);
    m.on('click movestart zoomstart', close);
    window.addEventListener('keydown', key);
    return () => {
      m.off('contextmenu', open);
      m.off('click movestart zoomstart', close);
      window.removeEventListener('keydown', key);
    };
  }, [ready]);
  if (!menu) return null;
  const text = formatCoordinate(menu.lat, menu.lng);
  const run = (action: () => void) => () => {
    action();
    setMenu(null);
  };
  return (
    <div className="gp-context" role="menu" style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}>
      <button role="menuitem" className="gp-context-coord" title={x.copyCoords} onClick={run(() => copyText(text, onCopied))}>
        <Crosshair size={15} />
        <span>{text}</span>
      </button>
      <button role="menuitem" onClick={run(() => onPin(menu.lat, menu.lng))}>
        <MapPin size={15} />
        {x.dropPin}
      </button>
      <button role="menuitem" onClick={run(() => onMeasure([menu.lat, menu.lng]))}>
        <Ruler size={15} />
        {x.measureHere}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          mapRef.current?.panTo([menu.lat, menu.lng]);
          setMenu(null);
        }}
      >
        <LocateFixed size={15} />
        {x.centerHere}
      </button>
      <a
        role="menuitem"
        target="_blank"
        rel="noreferrer"
        href={`https://www.openstreetmap.org/#map=${menu.zoom}/${menu.lat.toFixed(5)}/${menu.lng.toFixed(5)}`}
        onClick={() => setMenu(null)}
      >
        <ExternalLink size={15} />
        {x.openOsm}
      </a>
    </div>
  );
}

export function downloadFile(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
