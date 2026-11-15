#!/usr/bin/env node
// Caption builder for the Flight Viewer page (international audience, neutral wording).
//   node tools/make-caption-global.js out/raw.json out/caption.json
// Same output shape as make-caption.js so tools/buffer-post.js works unchanged.
const fs = require('fs'), path = require('path');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), M = R.meta, P = R.points || [];
const air = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'airlines.json'), 'utf8'));
const name = air[M.airline] || M.airline, from = M.fromCity, to = M.toCity;
const mins = M.takeoffUtc && M.landedUtc ? Math.round((new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000) : Math.round((P[P.length - 1]?.t || 0) / 60);
const m5 = Math.round(mins / 5) * 5, dur = `about ${Math.floor(m5 / 60)} hours${m5 % 60 ? ' and ' + (m5 % 60) + ' minutes' : ''}`;
const hash = s => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7), seed = `${M.flight}${M.date}`;
const choose = (slot, arr) => arr[hash(seed + slot) % arr.length];
const HOOKS = [
  `${from} to ${to}, ${dur}. Watch the real flight path unfold.`,
  `Ever wondered what a flight of ${dur} looks like? This is ${name} from ${from} to ${to}.`,
  `A real flight, tracked live: ${from} → ${to}.`,
  `From ${from} to ${to} in ${dur}. Here is the route the aircraft actually flew.`,
  `Follow ${name}${M.flight ? ' ' + M.flight : ''} across the map from ${from} to ${to}.`,
  `This is what a ${dur} flight looks like from above: ${from} to ${to}.`
];
const CLOSES = [
  'Real flight data, real route. No simulation.',
  'Every line on this map is where the aircraft really flew.',
  'Flight paths are rarely straight lines. Winds, airspace and weather shape every trip.',
  'Tracked with real flight data.'
];
const CTAS = ['👇 Which route should we fly next? Tell us in the comments.', '👇 Where would you like to fly? Drop a city below.', '👇 Follow Flight Viewer for a new real flight every day.'];
const tag = s => '#' + String(s || '').replace(/[^A-Za-z0-9]/g, '');
const tags = [tag(from), tag(to), tag(name), '#Aviation', '#AvGeek', '#Flightradar'].filter((x, i, a) => x.length > 1 && a.indexOf(x) === i);
const SP = require('./fv-facts').special(M), sup = SP.label ? SP : null, supHook = SP.hook;
if (sup) tags.push(({ longest: '#LongestFlight', shortest: '#ShortestFlight', popular: '#BusiestRoute', inaugural: '#InauguralFlight' })[sup.label] || '');
const head = `✈️ ${name} · ${from} → ${to}`;
const body = [supHook ? `${SP.label === 'inaugural' ? '🎉' : '🔥'} ${supHook}` : '', head, SP.label === 'inaugural' && SP.facts[0] ? SP.facts[0] : '', supHook ? '' : choose('hook', HOOKS), choose('close', CLOSES), choose('cta', CTAS)].filter(Boolean).join('\n\n');
const text = body + '\n\n' + tags.filter(Boolean).join(' '), title = `${from} to ${to} on ${name} | Flight Viewer`;
fs.writeFileSync(process.argv[3], JSON.stringify({ facebook: text, youtube: { title: title.slice(0, 100), text: text + ' #Shorts' }, tiktok: { title: (head + ' ' + tags.join(' ')).slice(0, 150) }, tiktokText: text, variants: {} }, null, 1));
console.log(text);
