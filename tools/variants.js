// Picks a text variant for a slot so the same line is not reused within 90 days (history.json records the ids used).
const fs = require('fs'), path = require('path');
const HF = path.join(__dirname, '..', 'data', 'history.json'), OUT = process.env.VARIANTS_OUT || path.join(__dirname, '..', 'out', 'variants.json');
const hash = s => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
function pick(slot, pool, seed, date, days = 90) {
  let posts = []; try { posts = JSON.parse(fs.readFileSync(HF, 'utf8')).posts; } catch (e) {}
  const d0 = Date.parse(date || new Date().toISOString().slice(0, 10)), last = {};
  for (const p of posts) { const v = (p.variants || {})[slot]; if (v) last[v] = Math.max(last[v] || 0, Date.parse(p.date)); }
  const ids = pool.map((_, i) => `${slot}${i + 1}`), free = ids.filter(id => !last[id] || (d0 - last[id]) / 864e5 >= days);
  let id;
  if (free.length) id = free[hash(seed + slot) % free.length];
  else { id = ids.slice().sort((a, b) => (last[a] || 0) - (last[b] || 0))[0]; console.error(`WARN variants: pool "${slot}" exhausted within ${days} days; reusing oldest (${id})`); }
  let rec = {}; try { rec = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  rec[slot] = id; fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(rec));
  return { id, text: pool[ids.indexOf(id)] };
}
module.exports = { pick };
