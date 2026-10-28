#!/usr/bin/env node
// Which airlines fly a route non-stop, and the real average block time, from the last N days of Flightradar24 history.
//   FR24_API_KEY=... node tools/route-stats.js --route RPLL-WSSS --to 2026-10-26 --days 7 [--out out/route-stats.json]
const fs = require('fs');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const KEY = process.env.FR24_API_KEY, route = opt('route', ''), to = new Date((opt('to', new Date().toISOString().slice(0, 10))) + 'T23:59:59Z'), days = +opt('days', 7);
const airlines = JSON.parse(fs.readFileSync(__dirname + '/../data/airlines.json', 'utf8'));
(async () => {
  const from = new Date(+to - days * 864e5), f = d => d.toISOString().slice(0, 19) + 'Z';
  const r = await fetch('https://fr24api.flightradar24.com/api/flight-summary/full?' + new URLSearchParams({ routes: route, flight_datetime_from: f(from), flight_datetime_to: f(to), sort: 'asc', limit: '300' }), { headers: { Accept: 'application/json', 'Accept-Version': 'v1', Authorization: 'Bearer ' + KEY } });
  const j = await r.json(); if (!r.ok) { console.error('FR24', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
  const rows = (j.data || j).filter(x => x.datetime_takeoff && x.datetime_landed && x.dest_icao_actual !== undefined ? true : x.datetime_takeoff && x.datetime_landed);
  const by = {}, all = [];
  const durs = rows.map(x => (new Date(x.datetime_landed) - new Date(x.datetime_takeoff)) / 60000).filter(m => m >= 20 && m <= 900).sort((a, b) => a - b), med = durs.length ? durs[Math.floor(durs.length / 2)] : 0;   // median-based outlier filter (diversions, bad records)
  for (const x of rows) { const m = (new Date(x.datetime_landed) - new Date(x.datetime_takeoff)) / 60000; if (m < 20 || m > 900 || (med && (m < med * 0.6 || m > med * 1.6))) continue; const k = x.operating_as || x.painted_as || '?'; if (k === '?') continue; (by[k] = by[k] || { airline: airlines[k] || k, icao: k, flights: new Set(), mins: [] }); by[k].flights.add(x.flight); by[k].mins.push(m); all.push(m); }
  const out = { route, days, flights: all.length, avgMin: Math.round(all.reduce((a, b) => a + b, 0) / all.length), airlines: Object.values(by).map(a => ({ airline: a.airline, icao: a.icao, flightNumbers: [...a.flights].sort(), n: a.mins.length, avgMin: Math.round(a.mins.reduce((x, y) => x + y, 0) / a.mins.length) })) };
  fs.mkdirSync('out', { recursive: true }); fs.writeFileSync(opt('out', 'out/route-stats.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  console.log('::notice title=Route stats::' + JSON.stringify(out));
})();
