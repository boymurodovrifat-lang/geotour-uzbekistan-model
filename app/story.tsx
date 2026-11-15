'use client';
// Story map "Along the Silk Road": a scrolling narrative whose map follows the text.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ExternalLink, MapPinned } from 'lucide-react';
import routes from '../data/tourism-routes.json';
import photos from '../data/route-photos.json';
import { BASEMAPS } from './geoportal-ui';
import { addCountryFrame } from './map-frame';
import { canvasOverlay, loadRaw, paint, type Catalog } from './index-layer';
import { scoreClass, INDEX_RAMPS } from '../lib/index-v04';
import { ClimateStrip } from './climate';
import { CHAPTERS, STORY_UI, type StoryLang } from './story-content';

const INDICES = ['TPI', 'TSI', 'ESI', 'TRSI'] as const;
type Photo = { url: string; credit: string; license: string; licenseUrl: string; sourceUrl: string; title: string };
type ProbeValues = Record<string, { values: Record<string, { score: number; stability: number; range: number }> }>;

function Probe({ chapter, probes, lang }: { chapter: (typeof CHAPTERS)[number]; probes: ProbeValues; lang: StoryLang }) {
  const x = STORY_UI[lang];
  if (!chapter.probe) return null;
  // Values at the probe point, read from the published index images by analysis/portal/publish_assets.py.
  const rows = INDICES.map((id) => {
    const v = probes[chapter.id]?.values[id];
    return { id, cell: v ? { ...v, classId: scoreClass(v.score) } : null };
  });
  if (rows.every((r) => !r.cell)) return null;
  return (
    <figure className="story-probe">
      <figcaption>
        <MapPinned size={15} />
        {x.probe}: <b>{chapter.probe.place[lang]}</b>
      </figcaption>
      {rows.map(({ id, cell }) =>
        cell ? (
          <div className="story-probe-row" key={id}>
            <span>
              <b style={{ color: INDEX_RAMPS[id][4] }}>{id}</b> {x.indexNames[id]}
            </span>
            <i>
              <em style={{ width: cell.score + '%', background: INDEX_RAMPS[id][4] }} />
            </i>
            <strong>{Math.round(cell.score)}</strong>
            <small>
              {x.classes[cell.classId - 1]} · {x.stability} {cell.stability}%
            </small>
          </div>
        ) : null,
      )}
    </figure>
  );
}

export default function Story() {
  const [lang, setLang] = useState<StoryLang>('uz'),
    [ready, setReady] = useState(false),
    [active, setActive] = useState(0),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [probes, setProbes] = useState<ProbeValues>({}),
    [progress, setProgress] = useState(0);
  const mapEl = useRef<HTMLDivElement>(null),
    mapRef = useRef<any>(null),
    base = useRef<any>(null),
    lines = useRef<any>(null),
    overlay = useRef<any>(null),
    canvases = useRef<Record<string, HTMLCanvasElement>>({}),
    sections = useRef<(HTMLElement | null)[]>([]);
  const x = STORY_UI[lang];
  const routeById = useMemo(() => Object.fromEntries((routes as any[]).map((r) => [r.id, r])), []);

  // Language, Leaflet, index catalogue.
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('lang') || localStorage.getItem('geotour-language');
    if (wanted === 'uz' || wanted === 'en' || wanted === 'ru') setLang(wanted);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/vendor/leaflet.css';
    document.head.appendChild(l);
    if ((window as any).L) setReady(true);
    else {
      const s = document.createElement('script');
      s.src = '/vendor/leaflet.js';
      s.onload = () => setReady(true);
      document.body.appendChild(s);
    }
    fetch('/science/model-v0.4/layers.json')
      .then((r) => r.json())
      .then((d) => setCatalog(d as Catalog))
      .catch(() => setCatalog(null));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = x.title + ' · GeoTour Uzbekistan';
    try {
      localStorage.setItem('geotour-language', lang);
    } catch {
      /* storage may be unavailable */
    }
  }, [lang]);

  // Index values at the probe points (a few hundred bytes instead of four index images).
  useEffect(() => {
    fetch('/science/story-probes.json')
      .then((r) => r.json())
      .then((d: any) => setProbes(d?.probes || {}))
      .catch(() => undefined);
  }, []);

  // Map.
  useEffect(() => {
    if (!ready || !mapEl.current) return;
    const L = (window as any).L;
    const m = L.map(mapEl.current, { center: CHAPTERS[0].view.center, zoom: CHAPTERS[0].view.zoom, zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
    mapRef.current = m;
    m.createPane('indexRaster').style.zIndex = '380';
    addCountryFrame(L, m, { basemap: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(m);
    lines.current = L.layerGroup().addTo(m);
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(mapEl.current);
    return () => {
      observer.disconnect();
      m.remove();
      mapRef.current = null;
    };
  }, [ready]);

  // Which chapter is in view.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.current.forEach((s) => s && io.observe(s));
    const onScroll = () => {
      const h = document.documentElement;
      setProgress(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Apply the active chapter to the map.
  useEffect(() => {
    const m = mapRef.current,
      L = (window as any).L;
    if (!m || !L) return;
    const ch = CHAPTERS[active];
    const b = BASEMAPS[ch.basemap];
    base.current?.remove();
    base.current = L.tileLayer(b.url, { maxNativeZoom: b.maxNativeZoom, maxZoom: 20, attribution: b.attribution, className: b.className || '' }).addTo(m);
    base.current.bringToBack();

    lines.current.clearLayers();
    ch.routes.forEach((id) => {
      const r = routeById[id];
      if (!r) return;
      L.polyline(r.path, { color: '#ffffff', weight: 7, opacity: 0.9, interactive: false }).addTo(lines.current);
      L.polyline(r.path, { color: '#0f6b5c', weight: 3.5, opacity: 1, interactive: false, dashArray: r.pathStatus.startsWith('walk') ? '2 7' : undefined, lineCap: 'round' }).addTo(lines.current);
      if (ch.view.zoom < 8)
        r.stops.forEach((s: any) =>
          L.circleMarker([s.lat, s.lng], { radius: 5, color: '#ffffff', weight: 2, fillColor: '#0f6b5c', fillOpacity: 1 })
            .bindTooltip(s.name[lang], { direction: 'top', offset: [0, -6] })
            .addTo(lines.current),
        );
      else r.stops.forEach((s: any, i: number) =>
        L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'story-stop-wrap', html: '<span class="story-stop">' + (i + 1) + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] }), keyboard: false })
          .bindTooltip(s.name[lang], { direction: 'top', offset: [0, -12] })
          .addTo(lines.current),
      );
    });

    overlay.current?.remove();
    overlay.current = null;
    const layer = ch.index && catalog?.layers.find((l) => l.id === ch.index);
    if (layer) {
      loadRaw(layer)
        .then((raw) => {
          if (CHAPTERS[active] !== ch || !mapRef.current) return;
          const cv = canvases.current[layer.id] || (canvases.current[layer.id] = document.createElement('canvas'));
          if (!cv.dataset.painted) {
            paint(cv, raw, layer.id, 'smooth', false, null);
            cv.dataset.painted = '1';
          }
          overlay.current?.remove();
          overlay.current = canvasOverlay(L, cv, raw.frame, 'indexRaster', ch.basemap === 'light' ? 0.85 : 0.7).addTo(m);
        })
        .catch(() => undefined);
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) m.setView(ch.view.center, ch.view.zoom);
    else m.flyTo(ch.view.center, ch.view.zoom, { duration: 1.8 });
  }, [active, ready, catalog, lang]);

  const photoOf = (key: string) => (photos as Record<string, Photo>)[key];

  return (
    <div className="story" data-lang={lang}>
      <div className="story-progress" style={{ transform: 'scaleX(' + progress + ')' }} />
      <header className="story-bar">
        <a href={'/?lang=' + lang} className="story-back">
          <ArrowLeft size={17} />
          <span>{x.back}</span>
        </a>
        <b>GeoTour Uzbekistan</b>
        <div className="story-lang" role="group">
          {(['uz', 'en', 'ru'] as const).map((k) => (
            <button key={k} aria-pressed={lang === k} onClick={() => setLang(k)}>
              {k === 'uz' ? 'O‘Z' : k.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <div className="story-map" ref={mapEl} aria-label={x.title} />
      <main className="story-text">
        {CHAPTERS.map((ch, i) => (
          <section key={ch.id} data-i={i} data-active={i === active} ref={(el) => void (sections.current[i] = el)} className={'story-chapter' + (i === 0 ? ' hero' : '')}>
            {i === 0 ? (
              <>
                <p className="story-kicker">GeoTour Uzbekistan</p>
                <h1>{x.title}</h1>
                <p className="story-sub">{x.subtitle}</p>
              </>
            ) : (
              <>
                <p className="story-kicker">{ch.kicker[lang]}</p>
                <h2>{ch.title[lang]}</h2>
              </>
            )}
            {i === 0 && <h2 className="story-hero-h2">{ch.title[lang]}</h2>}
            {ch.body.map((p, k) => (
              <p key={k}>{p[lang]}</p>
            ))}
            {ch.photos.length > 0 && (
              <div className={'story-photos n' + Math.min(ch.photos.length, 4)}>
                {ch.photos.map((key) => {
                  const p = photoOf(key);
                  if (!p) return null;
                  return (
                    <figure key={key}>
                      <img src={p.url} alt={p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')} loading="lazy" />
                      <figcaption>
                        {x.photo}:{' '}
                        <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                          {p.credit}
                        </a>{' '}
                        ·{' '}
                        <a href={p.licenseUrl} target="_blank" rel="noreferrer">
                          {p.license}
                        </a>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
            <Probe chapter={ch} probes={probes} lang={lang} />
            {ch.probe && <ClimateStrip lat={ch.probe.lat} lng={ch.probe.lng} lang={lang} compact />}
            {ch.routes.length > 0 && i > 0 && (
              <a className="story-open" href={'/?lang=' + lang + '&route=' + ch.routes[0]}>
                {x.open} <ExternalLink size={14} />
              </a>
            )}
            {i === 0 && (
              <p className="story-scroll" aria-hidden="true">
                {x.scroll} <ChevronDown size={16} />
              </p>
            )}
            {i === CHAPTERS.length - 1 && (
              <footer className="story-foot">
                <p>{x.note}</p>
                <p>{x.sources}</p>
                <a className="story-cta" href={'/?lang=' + lang}>
                  {x.back}
                </a>
              </footer>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
