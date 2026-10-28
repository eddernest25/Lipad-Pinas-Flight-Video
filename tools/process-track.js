#!/usr/bin/env node
// raw track -> cleaned, resampled, annotated track ready for the renderer.
//   node tools/process-track.js <raw.json> <processed.json> [--dt 30] [--gazetteer data/gazetteer.json]
const fs = require('fs');
const { distKm, bearing, interpGC, KT_TO_KMH } = require('./geo');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [inFile, outFile] = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const DT = +opt('dt', 30);
const PACING = opt('pacing', 'places');   // 'places' = slow down near places (3D style) | 'uniform' = steady crawl, slower only at takeoff/landing (flat map style)
const VIDEO_S = +opt('video-secs', 0), PAD_S = +opt('pad-secs', 2), PAD_REAL = +opt('pad-real', 45);  // exact timing: PAD_S video-seconds before liftoff and after touchdown, whole video = VIDEO_S
const LIFT_ALT_M = +opt('lift-alt', 90);
const MAX_KT = 700, GAP_S = 240, MAX_PLACES = +opt('places', 9), MIN_SEP_S = +opt('sep', 1500);

const raw = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const log = { raw: raw.points.length, spikes: 0, gaps: [], dups: 0 };

// 1. sort + de-duplicate timestamps
let pts = raw.points.slice().sort((a, b) => a.t - b.t).filter((p, i, a) => (i && p.t === a[i-1].t) ? (log.dups++, false) : true);
const t0 = pts[0].t; pts.forEach(p => p.t -= t0);

// 2. drop spikes: implied speed from last good point is impossible
const good = [pts[0]];
for (const p of pts.slice(1)) {
  const q = good[good.length - 1];
  const kt = distKm(q, p) / KT_TO_KMH / Math.max(1 / 3600, (p.t - q.t) / 3600);
  if (kt > MAX_KT) { log.spikes++; continue; }
  good.push(p);
}

// 3. resample to fixed dt; across gaps, great-circle interpolate and flag as estimated
const T = good[good.length - 1].t;
const res = [];
let j = 0;
for (let t = 0; t <= T + 1e-6; t += DT) {
  while (j < good.length - 2 && good[j + 1].t < t) j++;
  const a = good[j], b = good[j + 1];
  const span = b.t - a.t, f = span ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  const pos = interpGC(a, b, f);
  const est = span > GAP_S;
  res.push({ t, lat: pos.lat, lon: pos.lon, alt: a.alt + (b.alt - a.alt) * f, gs: a.gs + (b.gs - a.gs) * f, est });
}
// make sure the last real point is included
const last = good[good.length - 1];
if (res[res.length - 1].t < last.t) res.push({ t: last.t, lat: last.lat, lon: last.lon, alt: last.alt, gs: last.gs, est: false });
for (let i = 1; i < good.length; i++) if (good[i].t - good[i-1].t > GAP_S)
  log.gaps.push({ fromMin: +(good[i-1].t / 60).toFixed(1), toMin: +(good[i].t / 60).toFixed(1) });

// 3b. trim to [PAD_REAL s before liftoff .. PAD_REAL s after touchdown] (only when --video-secs is given)
let liftI = 0, downI = res.length - 1;
if (VIDEO_S) {
  const a = res.findIndex(p => p.alt > LIFT_ALT_M), b = res.length - 1 - [...res].reverse().findIndex(p => p.alt > LIFT_ALT_M);
  if (a >= 0) {
    const from = Math.max(0, a - Math.round(PAD_REAL / DT)), to = Math.min(res.length - 1, b + Math.round(PAD_REAL / DT));
    const base = res[from].t; res.splice(to + 1); res.splice(0, from); res.forEach(p => p.t -= base);
    liftI = a - from; downI = b - from;
    console.log(`trim: liftoff at index ${liftI}, touchdown at ${downI} of ${res.length - 1} (${(res[res.length-1].t/3600).toFixed(2)} h kept)`);
  }
}

// 4. heading (smoothed + unwrapped so the camera never snaps across 360->0), distance flown
const n = res.length, K = 4;
const hdg = res.map((p, i) => bearing(res[Math.max(0, i - K)], res[Math.min(n - 1, i + K)]));
for (let i = 1; i < n; i++) { while (hdg[i] - hdg[i-1] > 180) hdg[i] -= 360; while (hdg[i] - hdg[i-1] < -180) hdg[i] += 360; }
let dist = 0;
res.forEach((p, i) => { if (i) dist += distKm(res[i-1], p); p.dist = dist; p.hdg = hdg[i]; });
// airborne heading is meaningless on the ground at the start/end; copy nearest airborne value
const air = res.findIndex(p => p.alt > 300), airEnd = res.length - 1 - [...res].reverse().findIndex(p => p.alt > 300);

// 5. detect "places it passes": closest approach of the track to each gazetteer entry
const gaz = JSON.parse(fs.readFileSync(opt('gazetteer', 'data/gazetteer.json'), 'utf8'));
let cands = [];
for (const g of gaz) {
  let best = { d: 1e9, i: -1 };
  res.forEach((p, i) => {
    const d = g.meridian !== undefined ? Math.abs(((p.lon - g.meridian + 540) % 360) - 180) * 111 * Math.cos(p.lat * Math.PI / 180) : distKm(p, g);
    if (d < best.d) best = { d, i };
  });
  if (best.d <= g.r) cands.push({ ...g, i: best.i, t: res[best.i].t, passKm: Math.round(best.d), score: g.imp - 3 * best.d / g.r });
}
const A = res[0], Bp = res[res.length - 1];
const fixed = [
  { name: raw.meta.fromCity, sub: 'Departure · ' + raw.meta.from, kind: 'departure', lat: A.lat, lon: A.lon, i: 0, t: 0, pin: true },
  { name: raw.meta.toCity, sub: 'Arrival · ' + raw.meta.to, kind: 'arrival', lat: Bp.lat, lon: Bp.lon, i: n - 1, t: Bp.t, pin: true }
];
cands = cands.filter(c => c.t > 900 && c.t < Bp.t - 900).sort((a, b) => b.score - a.score);
const picked = [];
for (const c of cands) {
  if (picked.length >= MAX_PLACES) break;
  if (picked.every(p => Math.abs(p.t - c.t) >= MIN_SEP_S)) picked.push(c);
}
picked.sort((a, b) => a.t - b.t);
const places = [fixed[0], ...picked, fixed[1]];

// 6. pacing: more video-seconds per flight-second near takeoff/landing and near places
const g = (x, s) => Math.exp(-(x * x) / (2 * s * s));
let cum = 0; res.forEach((p, i) => {
  let w = 1;
  const edge = Math.min(p.t, Bp.t - p.t);
  w += (PACING === 'uniform' ? 2.2 : 7) * g(edge, 900);   // takeoff / landing ~ 15 min
  if (PACING !== 'uniform') for (const pl of picked) w += 4.5 * g(p.t - pl.t, 420); // ~7 min around each place
  p.w = w; cum += w * (i ? DT : 0); p.cv = cum;
});
if (VIDEO_S && (liftI > 0 || downI < res.length - 1)) {            // pin the ground pads to exactly PAD_S video seconds each
  const pf = PAD_S / VIDEO_S, pS = liftI > 0 ? pf : 0, pE = downI < res.length - 1 ? pf : 0, i0 = liftI, i1 = downI, N = res.length - 1, c0 = res[i0].cv, c1 = res[i1].cv;
  res.forEach((p, i) => {
    if (i <= i0) p.v = i0 ? pS * (p.t / res[i0].t) : 0;
    else if (i >= i1) p.v = N > i1 ? 1 - pE + pE * ((p.t - res[i1].t) / (res[N].t - res[i1].t)) : 1;
    else p.v = pS + (1 - pS - pE) * ((p.cv - c0) / (c1 - c0));
    delete p.cv;
  });
} else res.forEach(p => { p.v = p.cv / cum; delete p.cv; });      // v in 0..1 = video progress through the flight

const round = (x, d) => +x.toFixed(d);
const out = {
  meta: { ...raw.meta, durationS: Bp.t, distanceKm: round(dist, 0), maxAltM: Math.max(...res.map(p => p.alt)), dt: DT },
  cleaning: log,
  places: places.map(p => ({ name: p.name, sub: p.sub, kind: p.kind, lat: p.lat, lon: p.lon, t: p.t, i: p.i, pin: !!p.pin })),
  points: res.map(p => ({ t: p.t, lat: round(p.lat, 5), lon: round(p.lon, 5), alt: Math.round(p.alt), gs: Math.round(p.gs), hdg: round(p.hdg, 2), dist: round(p.dist, 1), v: round(p.v, 6), est: p.est ? 1 : 0 }))
};
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`cleaned: ${log.raw} raw -> ${res.length} pts @${DT}s | spikes removed ${log.spikes} | gaps filled ${JSON.stringify(log.gaps)}`);
console.log(`flight ${(Bp.t/3600).toFixed(2)} h, ${out.meta.distanceKm} km`);
console.log('places:'); places.forEach(p => console.log(`  ${String(Math.round(p.t/60)).padStart(4)} min  ${p.name} (${p.kind})`));
