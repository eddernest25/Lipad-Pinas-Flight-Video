// Generates a SYNTHETIC raw track (great circle + realistic climb/cruise/descent) with
// deliberately messy data: jittery timestamps, noise, one GPS spike and one oceanic gap.
// It stands in for a real FlightAware/FR24/OpenSky pull while we test the pipeline.
const fs = require('fs');
const { distKm, bearing, interpGC, KT_TO_KMH } = require('./geo');
const PRESETS = {
  'mnl-ceb': { A: { lat: 14.5086, lon: 121.0194 }, B: { lat: 10.3075, lon: 123.9794 }, hours: 1.25, cruise: 9000, climb: 900, desc: 1200,
    meta: { airline: 'Sample Air', flight: 'XX591', reg: 'SAMPLE', aircraft: 'Airbus A320', from: 'MNL', fromCity: 'Manila', fromCountry: 'PH', to: 'CEB', toCity: 'Cebu', toCountry: 'PH' } },
  'mnl-lax': { A: { lat: 14.5086, lon: 121.0194 }, B: { lat: 33.9425, lon: -118.4081 }, hours: 13.2,
    meta: { airline: 'Sample Air', flight: 'XX102', reg: 'SAMPLE', aircraft: 'Boeing 777-300ER', from: 'MNL', fromCity: 'Manila', fromCountry: 'PH', to: 'LAX', toCity: 'Los Angeles', toCountry: 'US' } },
  'mnl-kwi': { A: { lat: 14.5086, lon: 121.0194 }, B: { lat: 29.2266, lon: 47.9689 }, hours: 9.0,
    meta: { airline: 'Sample Air', flight: 'XX416', reg: 'SAMPLE', aircraft: 'Boeing 777-300ER', from: 'MNL', fromCity: 'Manila', fromCountry: 'PH', to: 'KWI', toCity: 'Kuwait', toCountry: 'KW' } }
};
const PRE = PRESETS[process.argv[3] || 'mnl-lax'];
const A = PRE.A, B = PRE.B;
const total = distKm(A, B);
const CRUISE = PRE.cruise || 11000;
function altAt(t, T) { // t seconds since takeoff
  const climb = PRE.climb || 1500, desc = PRE.desc || 2100;
  if (t < climb) return CRUISE * Math.pow(t / climb, 0.8);
  if (t > T - desc) return CRUISE * Math.pow(Math.max(0, (T - t) / desc), 0.8);
  return CRUISE;
}
// integrate along-track distance using altitude-dependent ground speed
const T_guess = PRE.hours * 3600;
let t = 0, s = 0, pts = [];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
while (s < total) {
  const alt = altAt(t, T_guess);
  const gs = 150 + (alt / CRUISE) * 345;               // knots
  const f = Math.min(1, s / total);
  const p = interpGC(A, B, f);
  pts.push({ t: Math.round(t), lat: p.lat + (rnd() - .5) * 0.002, lon: p.lon + (rnd() - .5) * 0.002,
             alt: Math.round(alt), gs: Math.round(gs + (rnd() - .5) * 6) });
  const dt = 20 + Math.round(rnd() * 50);               // irregular reporting interval
  s += gs * KT_TO_KMH / 3600 * dt; t += dt;
}
pts.push({ t: Math.round(t), lat: B.lat, lon: B.lon, alt: 0, gs: 140 });
// messy data: GPS spike + 40 minute oceanic coverage gap
pts[Math.floor(pts.length * 0.3)].lat += 3.2;
const gapFrom = 6.0 * 3600, gapTo = 6.67 * 3600;
const raw = pts.filter(p => p.t < gapFrom || p.t > gapTo);
const out = {
  meta: { ...PRE.meta, date: '2026-10-20', source: 'SYNTHETIC great-circle test track (not a real flight)' },
  points: raw
};
fs.writeFileSync(process.argv[2] || 'data/sample-raw.json', JSON.stringify(out));
console.log(`raw points: ${raw.length}, duration ${(t/3600).toFixed(2)} h, distance ${total.toFixed(0)} km`);
