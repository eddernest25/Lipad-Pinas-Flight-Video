#!/usr/bin/env node
// Picks the next video: style (cycle), route and airline, following Ned's rules. Prints JSON; --record appends it to data/history.json.
//   node tools/plan-next.js [--date YYYY-MM-DD] [--skip RPLL-OBBI:GFA,...]   (skip = candidates already found to have no flight)
//   node tools/plan-next.js --record --flight PR123 --style local-music --from RPLL --to RPVM --airline CEB --date 2026-10-31
// Rules: style cycle local-voice -> intl-music -> local-music -> intl-voice; no repeated route (each direction counts separately, but the same city pair is not reused within 4 posts) or flight; airline differs from the last 2 posts. Local = any Philippine airport to any other; international includes flights back to the Philippines.
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const HF = path.join(__dirname, '..', 'data', 'history.json'), H = JSON.parse(fs.readFileSync(HF, 'utf8'));
const CYCLE = ['local-voice', 'intl-music', 'local-music', 'intl-voice'];
if (a.includes('--record')) {
  H.posts.push({ date: opt('date'), style: opt('style'), flight: opt('flight'), airline: opt('airline'), from: opt('from'), to: opt('to'), note: opt('note', '') });
  fs.writeFileSync(HF, JSON.stringify(H, null, 1)); console.log('recorded'); process.exit(0);
}
const last = H.posts[H.posts.length - 1], style = CYCLE[(CYCLE.indexOf(last.style) + 1) % 4], type = style.startsWith('local') ? 'local' : 'intl';
const key = (f, t) => `${f}-${t}`, pair = (f, t) => [f, t].sort().join('-');   // a route is directional (X->Y and Y->X are different videos)
const used = new Set(H.posts.map(p => key(p.from, p.to))), recentPairs = new Set(H.posts.slice(-4).map(p => pair(p.from, p.to)));   // but the same city pair is not reused within 4 posts
const recentAir = H.posts.slice(-2).map(p => p.airline), skip = new Set((opt('skip', '') || '').split(',').filter(Boolean));
const uses = al => H.posts.filter(p => p.airline === al).length;
const C = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'candidates.json'), 'utf8')).candidates
  .filter(c => c.type === type && !used.has(key(c.from, c.to)) && !recentPairs.has(pair(c.from, c.to)) && !recentAir.includes(c.airline) && !skip.has(`${c.from}-${c.to}:${c.airline}`))
  .sort((x, y) => uses(x.airline) - uses(y.airline) || (x.to < y.to ? -1 : 1));
if (!C.length) { console.error('no candidate left that satisfies the rules'); process.exit(1); }
const m = C[0];
console.log(JSON.stringify({ style, music: style.endsWith('music'), route: `${m.from}-${m.to}`, airline: m.airline, from: m.from, to: m.to, alternatives: C.slice(1, 4).map(c => `${c.from}-${c.to}:${c.airline}`) }, null, 1));
