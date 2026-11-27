// Shared lookup for the Flight Viewer page: hook / label / facts for a flight (inaugural flight, longest/shortest/busiest route, route and airport facts).
const fs = require('fs'), path = require('path');
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8')); } catch (e) { return null; } };
const day = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
function special(M) {
  const RF = rd('route-facts-global.json') || { pairs: {}, airports: {}, superlatives: {} }, INA = (rd('inaugural-flightviewer.json') || { entries: [] }).entries;
  const key = [M.fromIcao, M.toIcao].sort().join('-');
  const ina = INA.find(e => e.from === M.fromIcao && e.to === M.toIcao && (!e.airline || e.airline === M.airline) && Math.abs(day(M.date) - day(e.date)) <= 1);
  const sup = (RF.superlatives || {})[key], fill = t => t.replace('{from}', M.fromCity).replace('{to}', M.toCity);
  const busy = (rd('candidates-flightviewer.json') || { candidates: [] }).candidates.some(c => c.cat === 'popular' && [c.from, c.to].sort().join('-') === key) || (sup && sup.label === 'popular');
  return { busy: !!busy, key, label: ina ? 'inaugural' : sup ? sup.label : '', hook: ina ? fill(ina.hook) : sup ? fill(sup.hook) : '',
    facts: [...(ina ? ina.facts : []), ...((RF.pairs || {})[key] || [])], destFact: (RF.airports || {})[M.toIcao] || '', reason: (RF.reasons || {})[key] || '' };
}
// Regional operators fly under a mainline brand (the brand is what passengers see and what the page names)
const BRAND = { EDV: 'DAL', SKW: 'UAL', RPA: 'UAL', ASH: 'AAL', ENY: 'AAL', PDT: 'AAL', PSA: 'AAL', JIA: 'AAL', GJS: 'UAL', CPZ: 'UAL', QXE: 'ASA', SCX: 'SCX', JZA: 'ACA', ASQ: 'DAL' };
const brand = c => BRAND[c] || c;
// Airlines we have vetted as flying a pair non-stop (curated candidate list, either direction). Anything else seen in flight data (cargo, positioning, charters) is NOT announced as a way to fly the route.
function vetted(M) {
  const key = [M.fromIcao, M.toIcao].sort().join('-'), C = (rd('candidates-flightviewer.json') || { candidates: [] }).candidates;
  return new Set(C.filter(c => [c.from, c.to].sort().join('-') === key).map(c => c.airline));
}
// Other airlines flying the pair non-stop (never includes the operating airline) + busiest-route daily flight count.
const norm = n => String(n || '').toLowerCase().replace(/airlines?|airways|air lines|international|royal dutch|air$/g, '').replace(/[^a-z0-9]/g, ''), ALIAS = { ana: 'allnippon', egyptair: 'egyptair', aeromexico: 'aeromexico' };
const nn = n => { const x = norm(n); return ALIAS[x] || x; };
function others(M, selfIcao, airlinesMap) {
  const key = [M.fromIcao, M.toIcao].sort().join('-'), RA = (rd('route-airlines.json') || {})[key], self = nn(airlinesMap[selfIcao] || selfIcao);
  const names = RA ? RA.airlines : [...vetted(M)].map(c => airlinesMap[c] || c);
  return names.filter((n, i, a) => nn(n) !== self && a.findIndex(x => nn(x) === nn(n)) === i);
}
function busy(M) {   // { daily, from, to } | null  (daily = scheduled flights per day in the stated direction, all airlines)
  const key = [M.fromIcao, M.toIcao].sort().join('-'), RA = (rd('route-airlines.json') || {})[key];
  if (!RA || !RA.daily) return null;
  const fromCity = RA.dir === M.fromIcao ? M.fromCity : M.toCity, toCity = RA.dir === M.fromIcao ? M.toCity : M.fromCity;
  return { daily: RA.daily, from: fromCity, to: toCity };
}
module.exports = { special, brand, vetted, others, busy };
