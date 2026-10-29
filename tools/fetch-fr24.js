#!/usr/bin/env node
// Fetch a real, recorded flight track from the Flightradar24 API and write the pipeline's raw track JSON.
//   FR24_API_KEY=... node tools/fetch-fr24.js --flight PR127 --date 2026-10-20 --out out/raw.json
//   or: --id <fr24_id>   (skip the lookup)   --list  (just print matching flights, no track download)
//   --dry  (print what would be called, no request)
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const KEY = process.env.FR24_API_KEY;
const BASE = process.env.FR24_BASE || 'https://fr24api.flightradar24.com/api';
const flight = (opt('flight', '') || '').toUpperCase().replace(/\s+/g, ''), date = opt('date', ''), out = opt('out', 'out/raw.json');
let id = opt('id', '');
const airlineOpt = (opt('airline', '') || '').toUpperCase(), routeOpt = opt('route', '');
if (!id && ((!flight && !(airlineOpt && routeOpt)) || !/^\d{4}-\d\d-\d\d$/.test(date))) { console.error('need --flight PR127 --date YYYY-MM-DD (or --id)'); process.exit(2); }
if (!KEY) { console.error('FR24_API_KEY is not set'); process.exit(2); }

async function api(p, params) {
  const url = BASE + p + '?' + new URLSearchParams(params);
  if (flag('dry')) { console.log('GET', url); return null; }
  const r = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Version': 'v1', Authorization: 'Bearer ' + KEY } });
  const txt = await r.text();
  if (!r.ok) { console.error(`FR24 API ${r.status} for ${p}: ${txt.slice(0, 300)}`); process.exit(1); }
  return JSON.parse(txt);
}
const rows = j => Array.isArray(j) ? j : (j && (j.data || j.results || j.flights)) || [];
const ap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/airports.json'), 'utf8'));
const place = icao => ap[icao] || { name: icao, city: icao, cc: '', iata: icao };

(async () => {
  let summary = null;
  if (!id) {
    // look the flight up for a +/- 1 day UTC window around the date, then keep the one that actually took off on that date
    const d0 = new Date(date + 'T00:00:00Z'), from = new Date(d0 - 864e5), to = new Date(+d0 + 2 * 864e5 - 1000);
    const f = d => d.toISOString().slice(0, 19) + 'Z';
    const j = await api('/flight-summary/full', Object.assign(flight ? { flights: flight } : { routes: routeOpt, airlines: airlineOpt }, { flight_datetime_from: f(from), flight_datetime_to: f(to), sort: 'asc', limit: 30 }));
    if (!j) return;
    let list = rows(j).filter(x => x.datetime_landed || x.flight_ended !== false);
    if (!flight && airlineOpt) { const own = list.filter(x => [x.operating_as, x.painted_as].includes(airlineOpt)); console.log(`airline filter ${airlineOpt}: ${own.length}/${list.length}`); if (!own.length) { console.error('no completed ' + airlineOpt + ' flight on that route/date'); process.exit(1); } list = own; }
    if (!flight && list.length > 2) {   // airline+route mode: skip anomalous flights (holding, go-arounds, diversions) - keep those within 0.8x-1.25x of the median duration
      const dur = x => (new Date(x.datetime_landed) - new Date(x.datetime_takeoff)) / 60000, ds = list.map(dur).filter(v => v > 0).sort((p, q) => p - q), med = ds[Math.floor(ds.length / 2)];
      const ok = list.filter(x => dur(x) >= 0.8 * med && dur(x) <= 1.25 * med); if (ok.length) { console.log(`median ${med.toFixed(0)} min; keeping ${ok.length}/${list.length} typical-duration flights`); list = ok; }
    }
    console.log(`${list.length} completed flight(s) found for ${flight || routeOpt + ' ' + airlineOpt}:`);
    for (const x of list) console.log(' ', x.fr24_id, x.orig_icao, '->', x.dest_icao_actual || x.dest_icao, x.datetime_takeoff, x.reg || '', x.type || '');
    if (flag('list')) return;
    // prefer the one whose local takeoff date matches (PHT-agnostic: match UTC date first, then +8h date)
    const dOf = (x, h) => new Date(+new Date(x.datetime_takeoff) + h * 36e5).toISOString().slice(0, 10);
    summary = list.find(x => x.datetime_takeoff && dOf(x, 0) === date) || list.find(x => x.datetime_takeoff && dOf(x, 8) === date) || list[0];
    if (!summary) {
      console.error('no completed flight found for that number/date');
      const route = opt('route', '');
      if (route) { const j2 = await api('/flight-summary/light', { routes: route, flight_datetime_from: f(from), flight_datetime_to: f(to), sort: 'asc', limit: 50 });
        console.error('flights on route ' + route + ' in that window:'); for (const x of rows(j2 || [])) console.error(' ', x.flight || x.callsign, x.fr24_id, x.datetime_takeoff, x.reg || ''); }
      process.exit(1);
    }
    id = summary.fr24_id;
  }
  const tj = await api('/flight-tracks', { flight_id: id });
  if (!tj) return;
  const first = rows(tj)[0] || tj;
  const tracks = first.tracks || first.track || [];
  if (!tracks.length) { console.error('no track points returned for', id, JSON.stringify(tj).slice(0, 300)); process.exit(1); }
  const T = p => Math.floor(new Date(p.timestamp).getTime() / 1000);
  const t0 = T(tracks[0]);
  const points = tracks.filter(p => p.lat != null && p.lon != null).map(p => ({
    t: T(p) - t0, lat: p.lat, lon: p.lon, alt: Math.round((p.alt || 0) * 0.3048), gs: Math.round(p.gspeed || 0)
  }));
  const s = summary || {};
  const A = place(s.orig_icao || ''), B = place(s.dest_icao_actual || s.dest_icao || '');
  const meta = {
    airline: s.operating_as || s.painted_as || '', flight: s.flight || flight, reg: s.reg || '', aircraft: s.type || '',
    date: date || (s.datetime_takeoff || '').slice(0, 10),
    from: A.iata || s.orig_iata || '', fromCity: A.city, fromCountry: A.cc,
    to: B.iata || s.dest_iata || '', toCity: B.city, toCountry: B.cc,
    fromIcao: s.orig_icao || '', toIcao: s.dest_icao_actual || s.dest_icao || '', takeoffUtc: s.datetime_takeoff || '', landedUtc: s.datetime_landed || '',
    source: 'Flightradar24 API (fr24_id ' + id + ')'
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // airline logo (by ICAO airline code) from the open Jxck-S/airline-logos collection -> <out dir>/airline.png (optional; the video just omits it if missing)
  for (const code of [s.operating_as, s.painted_as].filter(Boolean)) {
    let ok = false;
    for (const dir of ['flightaware_logos', 'radarbox_logos']) {
      try { const r = await fetch(`https://raw.githubusercontent.com/Jxck-S/airline-logos/main/${dir}/${code}.png`); if (r.ok) { fs.writeFileSync(path.join(path.dirname(out), 'airline.png'), Buffer.from(await r.arrayBuffer())); console.log('airline logo:', dir, code); ok = true; break; } } catch (e) {}
    }
    if (ok) break;
  }
  fs.writeFileSync(out, JSON.stringify({ meta, points }));
  console.log(`wrote ${out}: ${points.length} points, ${meta.from} ${meta.fromCity} -> ${meta.to} ${meta.toCity}, ${(points[points.length - 1].t / 3600).toFixed(2)} h`);
  if (!summary || !summary.orig_icao) console.log('NOTE: origin/destination missing from lookup; pass a flight number+date (not --id) so cities and flags are filled.');
})().catch(e => { console.error(e); process.exit(1); });
