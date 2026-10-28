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
if (!id && (!flight || !/^\d{4}-\d\d-\d\d$/.test(date))) { console.error('need --flight PR127 --date YYYY-MM-DD (or --id)'); process.exit(2); }
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
    const j = await api('/flight-summary/full', { flights: flight, flight_datetime_from: f(from), flight_datetime_to: f(to), sort: 'asc', limit: 20 });
    if (!j) return;
    const list = rows(j).filter(x => x.datetime_landed || x.flight_ended !== false);
    console.log(`${list.length} completed flight(s) found for ${flight}:`);
    for (const x of list) console.log(' ', x.fr24_id, x.orig_icao, '->', x.dest_icao_actual || x.dest_icao, x.datetime_takeoff, x.reg || '', x.type || '');
    if (flag('list')) return;
    // prefer the one whose local takeoff date matches (PHT-agnostic: match UTC date first, then +8h date)
    const dOf = (x, h) => new Date(+new Date(x.datetime_takeoff) + h * 36e5).toISOString().slice(0, 10);
    summary = list.find(x => x.datetime_takeoff && dOf(x, 0) === date) || list.find(x => x.datetime_takeoff && dOf(x, 8) === date) || list[0];
    if (!summary) { console.error('no completed flight found for that number/date'); process.exit(1); }
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
    source: 'Flightradar24 API (fr24_id ' + id + ')'
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ meta, points }));
  console.log(`wrote ${out}: ${points.length} points, ${meta.from} ${meta.fromCity} -> ${meta.to} ${meta.toCity}, ${(points[points.length - 1].t / 3600).toFixed(2)} h`);
  if (!summary || !summary.orig_icao) console.log('NOTE: origin/destination missing from lookup; pass a flight number+date (not --id) so cities and flags are filled.');
})().catch(e => { console.error(e); process.exit(1); });
