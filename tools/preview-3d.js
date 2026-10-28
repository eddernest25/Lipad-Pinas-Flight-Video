#!/usr/bin/env node
// Preview stills of a flight over Google Photorealistic 3D Tiles (Cesium). No video is made.
//   GOOGLE_MAP_TILES_KEY=... node tools/preview-3d.js out/track.json --times 9,30,52 --out out/p3d
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const trackFile = argv.find(a => !a.startsWith('--') && !/^[\d.,]+$/.test(a));
const KEY = process.env.GOOGLE_MAP_TILES_KEY; if (!KEY) { console.error('GOOGLE_MAP_TILES_KEY is not set'); process.exit(2); }
const D = JSON.parse(fs.readFileSync(trackFile, 'utf8')), P = D.points, FLIGHT = +opt('flight', 64), outBase = opt('out', 'out/p3d');
const times = opt('times', '9,30,52').split(',').map(Number);
const at = u => { let b = 0, bd = 1e9; P.forEach((p, i) => { const d = Math.abs((p.v ?? i / (P.length - 1)) - u); if (d < bd) { bd = d; b = i; } }); return b; };
const bearing = (a, b) => { const t = x => x * Math.PI / 180, y = Math.sin(t(b.lon - a.lon)) * Math.cos(t(b.lat)), x = Math.cos(t(a.lat)) * Math.sin(t(b.lat)) - Math.sin(t(a.lat)) * Math.cos(t(b.lat)) * Math.cos(t(b.lon - a.lon)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
(async () => {
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) console.log('[page]', t.slice(0, 200)); });
  await page.goto('file://' + path.join(__dirname, '../viewer/globe3d.html'));
  await page.waitForFunction(() => window.Cesium, null, { timeout: 60000 });
  await page.evaluate(([k, pts, l]) => window.init(k, pts, l), [KEY, P.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt })), D.meta.flight]);
  for (const s of times) {
    const i = at(s / FLIGHT), p = P[i], q = P[Math.min(P.length - 1, i + Math.max(2, Math.round(P.length / 40)))], p0 = P[Math.max(0, i - 2)];
    const hd = bearing(i === P.length - 1 ? p0 : p, i === P.length - 1 ? p : q), alt = p.alt || 0;
    const range = Math.max(6000, Math.min(60000, 4000 + alt * 6)), pitch = -(22 + Math.min(1, alt / 9000) * 14);
    const r = await page.evaluate(a => window.view(...a), [p.lat, p.lon, alt, hd, pitch, range, 90000]);
    const f = `${outBase}_t${s}.png`; await page.screenshot({ path: f }); console.log('still', f, JSON.stringify(r), 'alt', Math.round(alt), 'range', range);
  }
  await browser.close();
})().catch(e => { console.error('::error title=3D preview failed::' + String(e.message).slice(0, 300)); process.exit(1); });
