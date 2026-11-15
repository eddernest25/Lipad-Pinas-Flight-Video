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
    facts: [...(ina ? ina.facts : []), ...((RF.pairs || {})[key] || [])], destFact: (RF.airports || {})[M.toIcao] || '' };
}
module.exports = { special };
