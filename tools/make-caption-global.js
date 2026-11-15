#!/usr/bin/env node
// Caption builder for the Flight Viewer page (international audience, neutral wording).
//   node tools/make-caption-global.js out/raw.json out/caption.json
// Same output shape as make-caption.js so tools/buffer-post.js works unchanged.
// Hook / closing / call-to-action are picked from large pools and never reuse a variant used in the last posts
// (ids are returned in caption.variants and stored in data/history-flightviewer.json by plan-next --record --variants).
const fs = require('fs'), path = require('path');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), M = R.meta, P = R.points || [];
const root = path.join(__dirname, '..');
const air = JSON.parse(fs.readFileSync(path.join(root, 'data', 'airlines.json'), 'utf8'));
const FVF = require('./fv-facts'), AL = FVF.brand(M.airline), name = air[AL] || AL, from = M.fromCity, to = M.toCity;
const mins = M.takeoffUtc && M.landedUtc ? Math.round((new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000) : Math.round((P[P.length - 1]?.t || 0) / 60);
const m5 = Math.round(mins / 5) * 5, hh = Math.floor(m5 / 60), mm = m5 % 60;
const durShort = (hh ? `${hh} hour${hh > 1 ? 's' : ''}` : '') + (hh && mm ? ' and ' : '') + (mm ? `${mm} minutes` : '');   // e.g. "3 hours and 30 minutes"
const hav = (a, b) => { const r = Math.PI / 180, dp = (b.lat - a.lat) * r, dl = (b.lon - a.lon) * r, h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
let kmFlown = 0; for (let i = 1; i < P.length; i++) kmFlown += hav(P[i - 1], P[i]);
const nice = n => new Intl.NumberFormat('en-US').format(n), km = nice(Math.round(kmFlown / 50) * 50), mi = nice(Math.round(kmFlown * 0.621371 / 50) * 50), hasDist = kmFlown > 100;
const AC = { A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380', A333: 'Airbus A330-300', A332: 'Airbus A330-200', A339: 'Airbus A330-900neo', A321: 'Airbus A321', A20N: 'Airbus A320neo', A320: 'Airbus A320', B789: 'Boeing 787-9', B788: 'Boeing 787-8', B78X: 'Boeing 787-10', B77W: 'Boeing 777-300ER', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B744: 'Boeing 747-400', B748: 'Boeing 747-8', B738: 'Boeing 737-800', B38M: 'Boeing 737 MAX 8' };
const ac = AC[M.aircraft] || '', an = /^[AEIOU]/i.test(ac) ? 'An' : 'A';

// ---- no-repeat picker: skip variants used by the last posts of this page
let H = []; try { H = JSON.parse(fs.readFileSync(path.join(root, 'data', 'history-flightviewer.json'), 'utf8')).posts; } catch (e) {}
const hash = s => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7), seed = `${M.flight}${M.date}${M.fromIcao}${M.toIcao}`, chosen = {};
function pick(slot, pool) {   // pool: [{ id, t, ok? }]
  const usable = pool.filter(p => p.ok !== false), recentN = Math.max(1, Math.min(usable.length - 1, 14));
  const recent = new Set(H.slice(-recentN).map(p => (p.variants || {})[slot]).filter(Boolean));
  const free = usable.filter(p => !recent.has(`${slot}${p.id}`)), from_ = free.length ? free : usable;
  const v = from_[hash(seed + slot) % from_.length]; chosen[slot] = `${slot}${v.id}`; return v.t;
}
const L = (t, ok) => ({ t, ok });
const long = mins >= 480, short = mins < 150;
const HOOKS = [
  L(`${from} to ${to} in ${durShort}. Here is the exact path the aircraft really flew.`),
  L(`Ever wondered what ${durShort} in the air looks like on a map? This is ${name} from ${from} to ${to}.`),
  L(`Tracked from takeoff to touchdown: ${name}, ${from} to ${to}.`),
  L(`${from} to ${to} without a single stop. Watch every minute of the real flight.`),
  L(`Would you take a flight to ${to} that lasts ${durShort}? Here is how ${name} does it.`),
  L(`${hasDist ? `${km} kilometers (${mi} miles)` : 'A long way'} from ${from} to ${to}. This is what it looks like from above.`, hasDist),
  L(`Think ${durShort} is long? Watch ${name} cross ${km} kilometers from ${from} to ${to}.`, hasDist && long),
  L(`How far is ${to} from ${from}? About ${km} kilometers, or ${durShort} on ${name}.`, hasDist),
  L(`Flight paths are never straight lines. See the real route from ${from} to ${to}.`),
  L(`${an} ${ac} just flew ${from} to ${to}. Follow the flight path on the map.`, !!ac),
  L(`Blink and you are there: ${from} to ${to} in just ${durShort}.`, short),
  L(`${durShort} to cross the sky from ${from} to ${to}. Ready for takeoff?`),
  L(`Window seat or map view? Watch ${name} fly ${from} to ${to} in real time.`),
  L(`Real flight, real route: ${from} to ${to}, ${durShort}.`),
  L(`Every long flight has a story. This one ends in ${to}, ${durShort} after leaving ${from}.`, long),
  L(`From ${from} to ${to}: see where ${name} really flew, not just where the line is drawn.`),
  L(`${name} flight ${M.flight || ''} just made the trip from ${from} to ${to}. Here is how it looked.`, !!M.flight)
].map((p, i) => ({ id: i + 1, ...p }));
const CLOSES = [
  'Real flight data, real route. No simulation.',
  'Every line on this map is where the aircraft really flew.',
  'Winds, airspace and weather shape every route.',
  'Tracked with real flight data from takeoff to landing.',
  'Aircraft rarely fly the shortest line on the map.',
  'No animation tricks: this is the real flight path.',
  'Pilots adjust their route for winds, weather and traffic on almost every flight.',
  'What you see is the track the aircraft actually followed.'
].map((t, i) => ({ id: i + 1, t }));
const CTAS = [
  '👇 Which route should we fly next? Tell us in the comments.',
  '👇 Where would you like to fly? Drop a city below.',
  '👇 Have you flown this route? Tell us about it.',
  '👇 Would you take this flight? Yes or no?',
  '👇 Name a route you want to see next.',
  '👇 Tag someone who would love this trip.',
  '👇 Which city is on your travel list? Comment below.',
  '👇 Window or aisle? Let us know.',
  '👇 Drop a ✈️ if you would fly this one.',
  '👇 Send this to your travel buddy.'
].map((t, i) => ({ id: i + 1, t }));

const tag = s => '#' + String(s || '').replace(/[^A-Za-z0-9]/g, '');
const tags = [tag(from), tag(to), tag(name), '#Aviation', '#AvGeek', '#Flightradar'].filter((x, i, a) => x.length > 1 && a.indexOf(x) === i);
const SP = require('./fv-facts').special(M), supHook = SP.hook;
if (SP.label) tags.push(({ longest: '#LongestFlight', shortest: '#ShortestFlight', popular: '#BusiestRoute', inaugural: '#InauguralFlight' })[SP.label] || '');
const head = `✈️ ${name} · ${from} → ${to}`;
const factLine = SP.facts[0] || SP.destFact || '';   // a true fact about the route (or destination airport) makes every caption different
const body = [supHook ? `${SP.label === 'inaugural' ? '🎉' : '🔥'} ${supHook}` : '', head, supHook ? '' : pick('hook', HOOKS), factLine, pick('close', CLOSES), pick('cta', CTAS)].filter(Boolean).join('\n\n');
const text = body + '\n\n' + tags.filter(Boolean).join(' ');
const TITLES = { inaugural: `Inaugural Flight: ${from} to ${to} on ${name}`, longest: `One of the World's Longest Flights: ${from} to ${to} on ${name}`, shortest: `A Short International Hop: ${from} to ${to} on ${name}`, popular: `One of the World's Busiest Routes: ${from} to ${to} on ${name}` };
const title = (TITLES[SP.label] || `${from} to ${to} on ${name}`) + ' | Flight Viewer';
fs.writeFileSync(process.argv[3], JSON.stringify({ facebook: text, youtube: { title: title.slice(0, 100), text: text + ' #Shorts' }, tiktok: { title: (head + ' ' + tags.join(' ')).slice(0, 150) }, tiktokText: text, variants: chosen }, null, 1));
console.log(text);
