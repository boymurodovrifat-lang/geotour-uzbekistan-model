// Lab measurement of the portal's load performance (production build, cold cache).
// Usage: node analysis/portal/perf.cjs http://127.0.0.1:8787 5 > public/science/portal-performance.json
// Two network profiles are emulated through the Chrome DevTools Protocol. Third-party base-map tiles and
// the weather API are answered locally with a fixed small response, so the figures describe the portal's
// own code and data; real tiles add to the totals on a real network.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const TILE = fs.readFileSync(path.join(__dirname, 'blank-tile.png'));
const PROFILES = {
  broadband: { viewport: { width: 1440, height: 900 }, down: 20e6, up: 5e6, rtt: 20, cpu: 1 },
  'slow-4g-mobile': { viewport: { width: 390, height: 844 }, down: 1.6e6, up: 0.75e6, rtt: 150, cpu: 4, mobile: true },
};
const PAGES = { portal: '/?lang=uz', story: '/story?lang=uz' };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function once(browser, base, page, prof) {
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: !!prof.mobile, hasTouch: !!prof.mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route(/arcgisonline|openstreetmap\.org\/|cartocdn|opentopomap|tile/i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  await p.route(/open-meteo\.com/, (r) => r.fulfill({ json: [] }));
  await p.route(/wikimedia\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: prof.rtt, downloadThroughput: prof.down / 8, uploadThroughput: prof.up / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  let bytes = 0, requests = 0;
  const own = new Set();
  cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.startsWith(base)) own.add(e.requestId); });
  cdp.on('Network.loadingFinished', (e) => { if (own.has(e.requestId)) { bytes += e.encodedDataLength; requests++; } });
  await p.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const t0 = Date.now();
  await p.goto(base + PAGES[page], { waitUntil: 'load', timeout: 180000 });
  let ready = null;
  try {
    await p.waitForSelector(page === 'portal' ? 'canvas.index-raster' : '.story-probe', { timeout: 120000 });
    ready = Date.now() - t0;
  } catch { /* not reached */ }
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { ttfb: n.responseStart, fcp: fcp ? fcp.startTime : null, lcp: window.__lcp || null, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  await ctx.close();
  return { ...m, ready, bytes, requests };
}

(async () => {
  const [base, runs] = [process.argv[2] || 'http://127.0.0.1:8787', +process.argv[3] || 5];
  const browser = await chromium.launch();
  const out = { measured: new Date().toISOString(), base, runs, note: 'cold cache, production build served locally by wrangler; third-party tiles, photos and weather answered locally', results: {} };
  for (const [pn, prof] of Object.entries(PROFILES)) {
    for (const page of Object.keys(PAGES)) {
      const rs = [];
      for (let i = 0; i < runs; i++) rs.push(await once(browser, base, page, prof));
      const key = pn + ':' + page;
      out.results[key] = { profile: { downMbps: prof.down / 1e6, rttMs: prof.rtt, cpuSlowdown: prof.cpu, viewport: prof.viewport }, median: {} };
      for (const k of ['ttfb', 'fcp', 'lcp', 'dcl', 'load', 'ready', 'bytes', 'requests']) out.results[key].median[k] = Math.round(median(rs.map((r) => r[k] ?? Infinity)));
      out.results[key].runs = rs.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : Math.round(v)])));
      process.stderr.write(key + ' ' + JSON.stringify(out.results[key].median) + '\n');
    }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
