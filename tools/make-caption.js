#!/usr/bin/env node
// Builds post text for Facebook / YouTube / TikTok from a rendered flight.
//   node tools/make-caption.js out/raw.json out/caption.json
const fs = require('fs'), path = require('path');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), M = R.meta, P = R.points || [];
const air = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'airlines.json'), 'utf8'));
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'facts.json'), 'utf8'));
const rad = d => d * Math.PI / 180;
let km = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dl = rad(b.lon - a.lon), dp = rad(b.lat - a.lat);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2; km += 12742 * Math.asin(Math.sqrt(h)); }
km = Math.round(km / 10) * 10;
const mins = M.takeoffUtc && M.landedUtc ? Math.round((new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000) : Math.round((P[P.length - 1]?.t || 0) / 60);
const dur = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
const name = air[M.airline] || M.airline, dom = M.fromCountry === M.toCountry, B = M.toCountry;
const entry = (facts.entry || {})[B], fare = (facts.fares || {})[`${M.from}-${M.to}`];
const php = n => 'PHP ' + n.toLocaleString('en-US');
let body_extra = '';
const lines = [`✈️ ${name} ${M.flight}: ${M.fromCity} → ${M.toCity}`, `${km.toLocaleString('en-US')} km · ${dur} non-stop · real flight on ${M.date}`];
const rsFile = process.argv[4], rs = rsFile && fs.existsSync(rsFile) ? JSON.parse(fs.readFileSync(rsFile, 'utf8')) : null;
const others = rs ? rs.airlines.filter(a => a.icao !== M.airline && a.n >= 2 && (!dom || ['CEB','PAL','GAP','APG'].includes(a.icao))).sort((a, b) => b.n - a.n).map(a => a.airline).slice(0, 4) : [];
if (others.length) lines.push(`Also flies non-stop on: ${others.join(', ')}.`);
if (fare) lines.push(fare.phpFrom ? `Fares start around ${php(fare.phpFrom)} one-way (estimate).` : `Typical one-way fare: ${php(fare.phpLow)} to ${php(fare.phpHigh)} (estimate).`);
if (!dom && entry && M.fromCountry === 'PH') lines.push(entry.ofw ? entry.ofw[0] + '.' : entry.visa);
if (!dom && M.fromCountry === 'PH') lines.push('Always check the official embassy or immigration site before you book.');
const tag = s => '#' + String(s || '').replace(/[^A-Za-z0-9]/g, '');
const tags = ['#LipadPinas', '#Aviation', '#PinoyTravel', '#FlightPath', tag(name), tag(M.toCity)].filter((x, i, a) => x.length > 1 && a.indexOf(x) === i);
let body, text;
const ofw = !dom && M.fromCountry === 'PH' && (facts.ofwCountries || []).includes(B), pick = (a, seed) => a[[...seed].reduce((n, c) => n + c.charCodeAt(0), 0) % a.length];
const seed = `${M.flight}${M.date}`, city = M.toCity, hrs = Math.round(mins / 60);
const HOOKS_DOM = [`Tara, lipad tayo papuntang ${city}! ✈️`, `${dur} lang, nasa ${city} ka na! 🇵🇭`, `Alam mo ba kung gaano kabilis ang lipad papuntang ${city}?`];
const HOOKS_INTL = [`${hrs} oras sa himpapawid. Isang destinasyon: ${city}. 🌏`, `Saan kaya papunta? Sagot: ${city}! ✈️`, `Abangan ang buong lipad papuntang ${city} ✈️🔥`, `Hindi ito simulation. Totoong lipad ito papuntang ${city}.`];
const HOOKS_OFW = [`Para sa bawat kabayan na lumilipad papuntang ${city}. 💙🇵🇭`, `${hrs} oras na lipad, isang buong pamilya ang inspirasyon. ✈️💙`, `Kabayan, ito ang lipad ng sakripisyo at pangarap. 🇵🇭`];
const hook = pick(dom ? HOOKS_DOM : ofw ? HOOKS_OFW : HOOKS_INTL, seed);
if (ofw) tags.splice(1, 0, '#OFW', '#Kabayan');
if (ofw) { const ins = pick((facts.inspire || {}).caption || [], seed); if (ins) { body_extra = ins; } }
body = lines.join('\n') + (body_extra ? '\n\n' + body_extra : ''); text = body + '\n\n' + tags.join(' ');
const title = `${M.fromCity} to ${M.toCity} on ${name} | Lipad Pinas`;
fs.writeFileSync(process.argv[3], JSON.stringify({ facebook: hook + ' ' + text, youtube: { title: title.slice(0, 100), text: text + ' #Shorts' }, tiktok: { title: (hook + ' ' + body.split('\n')[0] + ' ' + tags.join(' ')).slice(0, 150) }, tiktokText: hook + '\n' + text }, null, 1));
console.log(text);
