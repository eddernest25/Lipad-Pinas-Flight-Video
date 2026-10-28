#!/usr/bin/env node
// Flat, north-up satellite-map flight video (the "Flightradar-style" look).
//   GOOGLE_MAP_TILES_KEY=xxxx node render-flat.js --track out/x.track.json --out out/x.mp4 [options]
//
//   --fps 30 --intro 0 --flight 56 --outro 8      timing (seconds). Total = intro+flight+outro
//   --out-fps 30                                   output frame rate; render at --fps 15 and output 30 to halve render time (frames are repeated)
//   --scale 1                                      1 = 1080x1920, 0.5 = fast preview
//   --google-key KEY                               omit -> stand-in low-res map (offline testing only)
//   --logo path.png  --logo-pos bc|tl|tr|bl|br     page logo for the "Follow Us" badge
//   --music file.mp3                               mixed under the video, faded out at the end
//   --zoom-close 11 --zoom-cruise 6.6              camera zoom levels (Web Mercator); see flat.html zoomAt()
//   --stills 0,3,20      PNGs at those video-seconds, no video
//   --from N --to M      frame range (previews)    --keep-frames
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);

const trackFile = opt('track', 'out/sample.track.json');
const outFile = path.resolve(opt('out', 'out/flat.mp4'));
const FPS = +opt('fps', 30), INTRO = +opt('intro', 0), FLIGHT = +opt('flight', 56), OUTRO = +opt('outro', 8), SCALE = +opt('scale', 1);
const W = 1080, H = 1920, TOTAL = INTRO + FLIGHT + OUTRO, NFRAMES = Math.round(TOTAL * FPS);
const KEY = opt('google-key', process.env.GOOGLE_MAP_TILES_KEY || '');
const logoFile = opt('logo', '');
const cfg = {
  intro: INTRO, flight: FLIGHT, outro: OUTRO, tiles: KEY ? 'google' : 'vector',
  zoomClose: +opt('zoom-close', 11), zoomCruise: +opt('zoom-cruise', 6.6), zoomOutEnd: +opt('zoom-out-end', .14), zoomInStart: +opt('zoom-in-start', .90),
  logo: logoFile ? '/logo' + path.extname(logoFile) : '', logoPos: opt('logo-pos', 'bc'), maxTileZoom: +opt('max-tile-zoom', 19)
};
const track = JSON.parse(fs.readFileSync(trackFile, 'utf8'));

// ---- Google Map Tiles API (2D): satellite + roadmap/labels layer, fetched server-side and streamed to the page (nothing is written to disk)
const tileCache = new Map();   // in-memory only, for this run: each unique tile is fetched from Google at most once
const sessions = {};   // plain = satellite only, lab = satellite + roadmap/place-name layer
function gfetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); if (opts.body) req.write(opts.body); req.end();
  });
}
async function newSession(kind) {
  const body = { mapType: 'satellite', language: 'en-US', region: 'US' };
  if (kind === 'lab') { body.layerTypes = ['layerRoadmap']; body.overlay = false; }
  const r = await gfetch(`https://tile.googleapis.com/v1/createSession?key=${KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status !== 200) throw new Error(`createSession(${kind}) failed (${r.status}): ${r.body.toString().slice(0, 300)}`);
  sessions[kind] = JSON.parse(r.body.toString()).session; return sessions[kind];
}

let googleRequests = 0;
async function getGoogleTile(kind, z, x, y) {
  const key = `${kind}/${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!sessions[kind]) await newSession(kind);
      googleRequests++;
      const r = await gfetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${sessions[kind]}&key=${KEY}`);
      if ((r.status === 400 || r.status === 401) && attempt < 2) { sessions[kind] = null; continue; }   // expired session -> renew
      if (r.status >= 500 && attempt < 2) continue;
      return { status: r.status, type: r.headers['content-type'], body: r.body };
    }
  })();
  tileCache.set(key, p.then ? p : p);
  const out = await p; if (out.status !== 200) tileCache.delete(key); else tileCache.set(key, out);
  return out;
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), u = url.pathname;
    let m;
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return fs.createReadStream(path.join(__dirname, 'viewer/flat.html')).pipe(res); }
    if (u === '/earth.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return fs.createReadStream(path.join(__dirname, 'viewer/earth.jpg')).pipe(res); }
    if (logoFile && u.startsWith('/logo')) { res.writeHead(200, { 'content-type': mime[path.extname(logoFile).toLowerCase()] || 'image/png' }); return fs.createReadStream(logoFile).pipe(res); }
    if (u === '/mapdata.json') { res.writeHead(200, { 'content-type': 'application/json' }); return fs.createReadStream(path.join(__dirname, 'viewer/mapdata.json')).pipe(res); }
    if ((m = u.match(/^\/tile\/(plain|lab)\/(\d+)\/(\d+)\/(\d+)$/)) && KEY) {
      const r = await getGoogleTile(m[1], m[2], m[3], m[4]);
      res.writeHead(r.status, { 'content-type': r.type || 'image/jpeg' }); return res.end(r.body);
    }
    if (u === '/viewport' && KEY) {
      const kind = Number(url.searchParams.get('zoom')) >= 9 ? 'lab' : 'plain';
      if (!sessions[kind]) await newSession(kind);
      const q = url.searchParams, r = await gfetch(`https://tile.googleapis.com/tile/v1/viewport?session=${sessions[kind]}&key=${KEY}&zoom=${q.get('zoom')}&north=${q.get('north')}&south=${q.get('south')}&east=${q.get('east')}&west=${q.get('west')}`);
      res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(r.body);
    }
    res.writeHead(404); res.end();
  } catch (e) { console.error('[server]', e.message); res.writeHead(500); res.end(); }
});

(async () => {
  if (KEY) { await newSession('plain'); await newSession('lab'); console.log('Google tile sessions OK'); } else console.log('No Google key -> crisp vector stand-in map (testing only)');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text().slice(0, 200)); });
  await page.goto(base);
  await page.waitForFunction(() => typeof window.initFlat === 'function');
  await page.evaluate(([c, t]) => window.initFlat(c, t), [cfg, track]);

  if (KEY && !opt('stills', '')) {
    const from0 = +opt('from', 0), to0 = Math.min(+opt('to', NFRAMES - 1), NFRAMES - 1);
    const list = await page.evaluate(([f, a, b]) => window.tileList(f, a, b), [FPS, from0, to0]);
    const FREE = 100000, PRICE = 0.60, maxTiles = +opt('max-tiles', 20000);
    console.log(`\nThis video needs ${list.length} unique Google map tiles (billed per tile request).`);
    console.log(`Google lists 100,000 free tile requests per month, then $0.60 per 1,000. This video alone would cost about $${Math.max(0, (list.length - FREE) * PRICE / 1000).toFixed(2)} if you had used up the free allowance.\n`);
    if (flag('count-tiles')) { await browser.close(); server.close(); return; }
    if (list.length > maxTiles && !flag('force')) { console.error(`Refusing to continue: ${list.length} tiles is more than --max-tiles ${maxTiles}. Re-run with --force or a higher --max-tiles if that is OK.`); process.exit(2); }
    // prefetch everything in parallel (24 at a time) so rendering never waits on the network
    const t1 = Date.now(); let done = 0, i = 0;
    await Promise.all(Array.from({ length: 24 }, async () => { while (i < list.length) { const k = list[i++].split('/'); await getGoogleTile(k[0], k[1], k[2], k[3]).catch(() => {}); if (++done % 200 === 0) console.log(`prefetched ${done}/${list.length}`); } }));
    console.log(`prefetch done in ${((Date.now() - t1) / 1000).toFixed(0)}s, Google requests made: ${googleRequests}`);
  }

  const stills = opt('stills', '');
  if (stills) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    for (const s of stills.split(',').map(Number)) {
      await page.evaluate(t => window.setTime(t), s);
      const f = outFile.replace(/\.\w+$/, `_t${String(s).replace('.', '_')}.png`);
      await page.screenshot({ path: f }); console.log('still', f);
    }
    await browser.close(); server.close(); return;
  }

  const framesDir = path.join(path.dirname(outFile), 'frames_' + path.basename(outFile, path.extname(outFile)));
  fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
  const from = +opt('from', 0), to = Math.min(+opt('to', NFRAMES - 1), NFRAMES - 1), t0 = Date.now();
  for (let n = from; n <= to; n++) {
    await page.evaluate(t => window.setTime(t), n / FPS);
    await page.screenshot({ path: path.join(framesDir, `f${String(n - from).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if ((n - from) % 30 === 0) { const done = n - from + 1, el = (Date.now() - t0) / 1000; console.log(`frame ${done}/${to - from + 1}  ${(el / done).toFixed(2)} s/frame  eta ${Math.round(el / done * (to - n))}s`); }
  }
  await browser.close(); server.close();
  if (KEY) console.log(`Total Google tile requests this run: ${googleRequests}`);

  const dur = (to - from + 1) / FPS, music = opt('music', '');
  const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.jpg')];
  if (music) args.push('-stream_loop', '-1', '-i', music, '-filter_complex', `[1:a]afade=t=out:st=${Math.max(0, dur - 2.5)}:d=2.5[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-t', String(dur));
  const OUTFPS = +opt('out-fps', FPS);
  if (OUTFPS !== FPS) args.push('-vf', `fps=${OUTFPS}`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
  const ff = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (ff.status !== 0) process.exit(ff.status);
  if (!flag('keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
  console.log('wrote', outFile, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
})().catch(e => { console.error(e); process.exit(1); });
