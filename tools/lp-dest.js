// Lipad Pinas helper: destination highlights, vetted "other airlines" and flown distance (shared by make-caption.js and make-narration.js).
const fs = require('fs'), path = require('path');
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8')); } catch (e) { return null; } };
const DEST = rd('destinations.json') || {};
const dest = M => DEST[M.toIcao] || null;                       // { tag, offers:[..] } or null
// Other airlines on the same non-stop route: curated candidate list (either direction, passenger carriers only) first, then airlines seen in the 7-day flight data that are also vetted.
// With no curated entry for the pair, fall back to the flight data (domestic: real Philippine passenger carriers only).
function others(M, rs, airlines) {
  const C = (rd('candidates.json') || { candidates: [] }).candidates, key = [M.fromIcao, M.toIcao].sort().join('-');
  const vetted = [...new Set(C.filter(c => [c.from, c.to].sort().join('-') === key).map(c => c.airline))];
  const dom = M.fromCountry === M.toCountry, seen = rs ? rs.airlines.filter(a => a.n >= 2).sort((a, b) => b.n - a.n).map(a => a.icao) : [];
  let codes;
  if (vetted.length) codes = [...seen.filter(c => vetted.includes(c)), ...vetted.filter(c => !seen.includes(c))];
  else codes = seen.filter(c => !dom || ['CEB', 'PAL', 'GAP', 'APG'].includes(c));
  return codes.filter(c => c !== M.airline).map(c => airlines[c] || c).filter((n, i, a) => a.indexOf(n) === i);
}
// flown distance in km (sum of great-circle legs over the raw track)
function distKm(points) {
  const r = Math.PI / 180; let d = 0;
  for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; d += 6371 * Math.acos(Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r))) || 0; }
  return d;
}
module.exports = { dest, others, distKm };
