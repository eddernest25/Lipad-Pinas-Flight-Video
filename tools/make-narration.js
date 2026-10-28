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
const facts = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data/facts.json'), 'utf8')); } catch (e) { return {}; } })();
const rs = (() => { try { return JSON.parse(fs.readFileSync(opt('route-stats', 'out/route-stats.json'), 'utf8')); } catch (e) { return null; } })();
const entry = (facts.entry || {})[B.cc] || null, fare = (facts.fares || {})[`${M.from}-${M.to}`] || null;
const mins = Math.round((M.takeoffUtc && M.landedUtc ? (new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000 : D.meta.durationS / 60));
const spokenDur = m => { const h = Math.floor(m / 60), r = m % 60; return `${h} hour${h === 1 ? '' : 's'}${r ? ` and ${r} minute${r === 1 ? '' : 's'}` : ''}`; };
const five = m => Math.round(m / 5) * 5;
const nice = n => new Intl.NumberFormat('en-US').format(n);
const km50 = Math.round(distKm / 50) * 50;
// ---- music mode (no voice): short general-info captions spread over the whole video
if (args.includes('--music')) {
  const oth = rs ? rs.airlines.filter(a => a.icao !== M.airline).sort((a, b) => b.n - a.n).map(a => a.airline) : [];
  const L = [`${M.fromCity} to ${M.toCity} is about ${nice(km50)} kilometers`, `Flight time is about ${spokenDur(five(mins))}`];
  if (oth.length) L.push(`Also flies non-stop on ${join(oth)}`);
  if (fare) L.push(fare.usdLow ? `One-way tickets cost about $${fare.usdLow} to $${fare.usdHigh}, or ₱${nice(fare.phpLow)} to ₱${nice(fare.phpHigh)}` : `One-way tickets cost about ₱${nice(fare.phpLow)} to ₱${nice(fare.phpHigh)}`);
  if (entry) { L.push(`Visa: ${entry.visa.replace(/\.$/, '')}`); L.push(entry.rules.replace(/\.$/, '')); }
  const t0 = 2.5, t1 = VIDEO - 2.5, GAP = 0.6, tot = L.reduce((n, x) => n + Math.max(x.length, 34), 0), usable = t1 - t0 - GAP * (L.length - 1);
  let t = t0; const caps = L.map(text => { const d = usable * Math.max(text.length, 34) / tot, c = { s: +t.toFixed(2), e: +(t + d).toFixed(2), text }; t += d + GAP; return c; });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ mode: 'music', captions: caps, sentences: [] }, null, 1));
  console.log(caps.map(c => `[${c.s}-${c.e}s] ${c.text}`).join('\n')); process.exit(0);
}
S.push({ text: `Welcome aboard ${airline} flight ${flightSpoken}, from ${M.fromCity} to ${M.toCity}.` });
S.push({ text: `Today's ${acName} took off from ${M.fromCity}${depT ? ` at ${depT} local time` : ''}, and climbed to its cruising altitude of about ${nice(ft)} feet.` });
S.push({ text: `This flight covered about ${nice(km50)} kilometers in ${spokenDur(mins)}.${rs && rs.avgMin ? ` The average flight time on this route is about ${spokenDur(five(rs.avgMin))}.` : ''}` });
const others = rs ? rs.airlines.filter(a => a.icao !== M.airline).sort((a, b) => b.n - a.n).map(a => a.airline) : [];
if (others.length) S.push({ text: `Besides ${airline}, you can fly ${M.fromCity} to ${M.toCity} non-stop on ${join(others)}.`, opt: 2 });
if (fare) S.push({ text: fare.usdLow ? `One-way tickets on this route usually cost about ${fare.usdLow} to ${fare.usdHigh} U.S. dollars, or roughly ${nice(fare.phpLow)} to ${nice(fare.phpHigh)} pesos, depending on the airline and how early you book.` : `One-way tickets on this route usually cost about ${nice(fare.phpLow)} to ${nice(fare.phpHigh)} pesos, depending on the airline and how early you book.`, opt: 3 });
if (entry) { S.push({ text: `Traveling to ${B.city}? ${entry.visa}`, opt: 4 }); S.push({ text: entry.rules, opt: 5 }); }
S.push({ text: `The aircraft touched down at ${B.name}${arrT ? ` at ${arrT} local time` : ''}.` });
S.push({ text: `Follow us for more flights, travel tips, and Philippine aviation stories.` });
// spread start times evenly by word count; the last line is anchored to the end of the video
{ const w = S.map(s => s.text.split(/\s+/).length), tot = w.reduce((a, b) => a + b, 0); let c = 0; S.forEach((s, i) => { s.want = Math.round((0.3 + (c / tot) * (VIDEO - 0.7 - 4)) * 10) / 10; c += w[i]; }); }
// spoken form for the voice: no hyphens (TTS reads them as 'dash'), flight codes and acronyms spelled out
const digitW = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };
const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'], tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const numWords = n => n < 20 ? ones[n] : n < 100 ? tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') : n < 1000 ? ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : '') : numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
const b7 = { 3: 'thirty', 4: 'forty', 6: 'sixty', 7: 'triple', 8: 'eighty' };
const spoken = t => t
  .replace(/(\bA\d{3}(?:neo|ceo)?)-(\d00)\b/g, '$1, $2')
  .replace(/\b7([34678])7(?:-(\d+)(ER|LR)?)?/g, (m, n, suf, er) => (n === '7' ? 'triple seven' : 'seven ' + b7[n] + ' seven') + (suf ? ' ' + numWords(+suf) : '') + (er ? ' ' + er.split('').join(' ') : ''))
  .replace(/\b([A-Z0-9]{2}) (\d{1,4})\b/g, (m, a, n) => (/^\d/.test(a) ? a.split('').map(c => digitW[c] || c) : a.split('')).join(' ') + ' ' + n.split('').map(c => digitW[c]).join(' '))
  .replace(/\bA(\d{3})(neo|ceo)?\b/g, (m, n, k) => 'A ' + (n.startsWith('3') ? 'three ' + ({ '20': 'twenty', '21': 'twenty one', '30': 'thirty', '33': 'thirty three' }[n.slice(1)] || numWords(+n.slice(1))) : n) + (k ? ' ' + k : ''))
  .replace(/(?<![\w:.])(?<!\bA )(\d{1,3}(?:,\d{3})+|\d{3,6})(?![\w:])/g, (m, n) => { const v = +n.replace(/,/g, ''); return !n.includes(',') && v >= 1900 && v <= 2100 ? n : numWords(v); })
  .replace(/\bSG\b/g, 'S G').replace(/-/g, ' ').replace(/\s+/g, ' ');
for (const s of S) s.say = spoken(s.text);
for (const s of S) s.text = s.text.replace(/\s+/g, ' ').replace(/ ,/g, ',');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ sentences: S }, null, 1));
console.log(S.map(s => `[${s.want}s] ${s.text}`).join('\n'));
console.log('words:', S.reduce((n, s) => n + s.text.split(/\s+/).length, 0));
