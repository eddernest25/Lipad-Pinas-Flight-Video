#!/usr/bin/env node
// Builds the narration script for a flight from FACTS in the processed track (no invented content).
//   node tools/make-narration.js out/track.json out/narration.json --video-secs 64
// Output: { sentences:[{ text, want, opt }] }   want = video second at which the sentence should ideally start
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [inFile, outFile] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const VIDEO = +opt('video-secs', 64);
const D = JSON.parse(fs.readFileSync(inFile, 'utf8')), M = D.meta, P = D.points;
const root = path.join(__dirname, '..');
const airports = JSON.parse(fs.readFileSync(path.join(root, 'data/airports.json'), 'utf8'));
const airlines = JSON.parse(fs.readFileSync(path.join(root, 'data/airlines.json'), 'utf8'));
const polys = JSON.parse(fs.readFileSync(path.join(root, 'data/countries-poly.json'), 'utf8'));
const MD = JSON.parse(fs.readFileSync(path.join(root, 'viewer/mapdata.json'), 'utf8'));

const AC = { A320: 'Airbus A320', A20N: 'Airbus A320neo', A321: 'Airbus A321', A21N: 'Airbus A321neo', A319: 'Airbus A319', A332: 'Airbus A330-200', A333: 'Airbus A330-300', A338: 'Airbus A330-800neo', A339: 'Airbus A330-900neo', A343: 'Airbus A340-300', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380', BCS3: 'Airbus A220-300', B737: 'Boeing 737', B738: 'Boeing 737-800', B739: 'Boeing 737-900', B38M: 'Boeing 737 MAX 8', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B77W: 'Boeing 777-300ER', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', B744: 'Boeing 747-400', B748: 'Boeing 747-8', B763: 'Boeing 767-300', DH8D: 'Dash 8 Q400', AT76: 'ATR 72-600', AT72: 'ATR 72' };
const acName = AC[M.aircraft] || M.aircraft || 'aircraft';
const airline = airlines[M.airline] || M.airline || 'the airline';
const flightSpoken = (M.flight || '').replace(/^([A-Z0-9]{2})(\d+)$/, (m, a, n) => `${a} ${n}`).replace(/\b0+/g, '');
const ICAO = icao => airports[icao];
const byIata = Object.values(airports).reduce((o, a) => (a.iata && (o[a.iata] = a), o), {});
const A = byIata[M.from] || { name: M.fromCity + ' airport', city: M.fromCity, tz: 'UTC' }, B = byIata[M.to] || { name: M.toCity + ' airport', city: M.toCity, tz: 'UTC' };

const fmtTime = (iso, tz) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz || 'UTC' }).format(new Date(iso)); } catch (e) { return ''; } };
const fmtDate = (iso, tz) => { try { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: tz || 'UTC' }).format(new Date(iso)); } catch (e) { return ''; } };
const depT = fmtTime(M.takeoffUtc, A.tz), arrT = fmtTime(M.landedUtc, B.tz), dateS = fmtDate(M.takeoffUtc || M.date + 'T12:00:00Z', A.tz);

// ---- which countries / seas does the track pass over? (point-in-polygon on real borders; seas by nearest named water within 450 km)
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h));
const bbox = polys.map(c => c.p.map(poly => { let a = 1e9, b = -1e9, c2 = 1e9, d = -1e9; for (const [x, y] of poly[0]) { a = Math.min(a, x); b = Math.max(b, x); c2 = Math.min(c2, y); d = Math.max(d, y); } return [a, b, c2, d]; }));
const countryAt = (lon, lat) => { lon = ((lon + 540) % 360) - 180; for (let i = 0; i < polys.length; i++) for (let k = 0; k < polys[i].p.length; k++) { const b = bbox[i][k]; if (lon < b[0] || lon > b[1] || lat < b[2] || lat > b[3]) continue; if (inPoly(lon, lat, polys[i].p[k])) return polys[i].n; } return null; };
const km = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180, dl = t(d - b), dp = t(c - a); const h = Math.sin(dp / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const waterAt = (lat, lon) => { let best = null, bd = 450; for (const w of MD.water) { const d = km(lat, lon, w.lat, w.lon); if (d < bd) { bd = d; best = w.n; } } return best; };

const air = P.filter(p => p.alt > 3000), seg = [];            // only while airborne above 3,000 m (cruise-ish) to avoid airport-area noise
const step = Math.max(1, Math.round(60 / (D.meta.dt || 10)));
for (let i = 0; i < P.length; i += step) { const p = P[i]; if (p.alt < 1500) continue; const c = countryAt(p.lon, p.lat), name = c ? { t: 'c', n: c } : (waterAt(p.lat, p.lon) ? { t: 'w', n: waterAt(p.lat, p.lon) } : null); if (!name) continue; const last = seg[seg.length - 1]; if (last && last.n === name.n) last.v1 = p.v; else seg.push({ ...name, v0: p.v, v1: p.v }); }
const merged = seg.filter(s => s.v1 - s.v0 > 0.012 || s.t === 'c' || true);
const entities = []; for (const s of merged) if (!entities.some(e => e.n === s.n)) entities.push(s);
const depC = countryAt(P[0].lon, P[0].lat), arrC = countryAt(P[P.length - 1].lon, P[P.length - 1].lat);
const mid = entities.filter(e => e.n !== depC && e.n !== arrC || e.t === 'w');
const names = e => (e.t === 'w' && !/Ocean|Sea|Gulf|Strait|Bay/.test(e.n)) ? e.n : e.n;
const the = e => /^(Philippines|Netherlands|United States.*|United Arab Emirates|United Kingdom|Maldives|Bahamas)$/.test(e.n) ? 'the ' + e.n : e.n;
const join = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

// ---- numbers
const distKm = D.meta.distanceKm, hrs = D.meta.durationS / 3600;
const cruise = P.filter(p => p.alt > 0.9 * D.meta.maxAltM), cruiseKmh = Math.round(cruise.reduce((s, p) => s + p.gs, 0) / Math.max(1, cruise.length) * 1.852 / 10) * 10;
const ft = Math.round(D.meta.maxAltM * 3.28084 / 1000) * 1000;
const hh = Math.floor(hrs), mm = Math.round((hrs - hh) * 60);
const dur = (hh ? `${hh} hour${hh > 1 ? 's' : ''}` : '') + (hh && mm ? ' and ' : '') + (mm ? `${mm} minutes` : '');
const num = n => Math.round(n / 10) * 10 >= 1000 ? new Intl.NumberFormat('en-US').format(Math.round(n / 10) * 10) : String(Math.round(n / 10) * 10);

// cities the track passes close to (pop >= 250k, within 35 km, while airborne)
const nearC = [];
for (let i = 0; i < P.length; i += step) { const p = P[i]; if (p.alt < 1000) continue; let best = null, bd = 35; for (const c of MD.cities) { if (c[3] < 250000) break; const d = km(p.lat, p.lon, c[1], c[2]); if (d < bd) { bd = d; best = c; } }
  if (best && !nearC.some(x => x.n === best[0]) && km(best[1], best[2], P[0].lat, P[0].lon) > 60 && km(best[1], best[2], P[P.length - 1].lat, P[P.length - 1].lon) > 60) nearC.push({ n: best[0], v: p.v }); }
const maxGs = Math.round(Math.max(...P.map(p => p.gs)) * 1.852 / 10) * 10;
// video second when the plane is over entity e
const vsec = v => Math.round(v * VIDEO * 10) / 10;
const S = [];
S.push({ text: `Kumusta, mga kabayan! Welcome aboard ${airline} flight ${flightSpoken}, from ${M.fromCity} to ${M.toCity}.`, want: 0.4 });
S.push({ text: `This ${acName}${''} took off from ${A.name}${depT ? ` at ${depT}` : ''} local time${dateS ? ` on ${dateS}` : ''}.`, want: 3.2 });
const routeEnt = mid.slice(0, 5);
if (routeEnt.length >= 2) {
  const first = routeEnt.slice(0, 2), rest = routeEnt.slice(2);
  S.push({ text: `Climbing to ${ft.toLocaleString('en-US')} feet, it left ${the({ n: depC || M.fromCity })} and crossed ${join(first.map(e => (e.t === 'w' ? 'the ' : '') + the(e)))}.`.replace(/the the/g, 'the'), want: Math.max(9, vsec(first[0].v0)) });
  if (rest.length) S.push({ text: `Further along, the flight passed over ${join(rest.map(e => (e.t === 'w' ? 'the ' : '') + the(e)))}.`.replace(/the the/g, 'the'), want: Math.min(36, Math.max(22, vsec(rest[0].v0))), opt: 2 });
} else if (routeEnt.length === 1) S.push({ text: `Cruising at ${ft.toLocaleString('en-US')} feet, it crossed ${(routeEnt[0].t === 'w' ? 'the ' : '') + the(routeEnt[0])}.`.replace(/the the/g, 'the'), want: 12 });
if (nearC.length) S.push({ text: `It flew close to ${join(nearC.slice(0, 3).map(c => c.n))} along the way.`, want: Math.min(30, Math.max(14, vsec(nearC[0].v) - 1)), opt: 4 });
S.push({ text: `In all, it covered about ${num(distKm)} kilometers in ${dur}, cruising at around ${cruiseKmh} kilometers an hour.${maxGs - cruiseKmh >= 40 ? ` Its fastest ground speed reached about ${maxGs} kilometers an hour.` : ''}`, want: 36, opt: 1 });
S.push({ text: `Now descending toward ${B.city}, lining up for the final approach.`, want: Math.max(44, VIDEO - 17), opt: 3 });
S.push({ text: `It touched down at ${B.name}${arrT ? ` at ${arrT}` : ''} local time.`, want: VIDEO - 10 });
S.push({ text: `Follow Lipad Pinas for more flights across the Philippines and the world.`, want: VIDEO - 5.2 });
for (const s of S) s.text = s.text.replace(/\s+/g, ' ').replace(/ ,/g, ',');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ sentences: S }, null, 1));
console.log(S.map(s => `[${s.want}s] ${s.text}`).join('\n'));
console.log('words:', S.reduce((n, s) => n + s.text.split(/\s+/).length, 0));
