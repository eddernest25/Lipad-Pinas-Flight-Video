#!/usr/bin/env node
// Builds post text for Facebook / YouTube / TikTok from a rendered flight.
//   node tools/make-caption.js out/raw.json out/caption.json [out/route-stats.json]
const fs = require('fs'), path = require('path'), { pick } = require('./variants');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), M = R.meta, P = R.points || [];
const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const air = rd('airlines.json'), facts = rd('facts.json'), SC = facts.scripts || {};
const mins = M.takeoffUtc && M.landedUtc ? Math.round((new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000) : Math.round((P[P.length - 1]?.t || 0) / 60);
const name = air[M.airline] || M.airline, dom = M.fromCountry === M.toCountry, B = M.toCountry, city = M.toCity;
const fare = (facts.fares || {})[`${M.from}-${M.to}`], php = n => '₱' + n.toLocaleString('en-US');
const ofw = !dom && M.fromCountry === 'PH' && (facts.ofwCountries || []).includes(B);
const dur = `${Math.floor(mins / 60)} hours${mins % 60 ? ' and ' + (mins % 60) + ' minutes' : ''}`, seed = `${M.flight}${M.date}`, fill = t => t.replace('{dur}', dur).replace(/\{city\}/g, city);
const slot = (s, pool) => { const v = pick(s, pool, seed, M.date); return fill(v.text); };
const hook = slot(ofw ? 'capHookOfw' : dom ? 'capHookDom' : 'capHookIntl', ofw ? SC.capHookOfw : dom ? SC.capHookDom : SC.capHookIntl);
const lines = [`${name} · ${M.fromCity} → ${city}`];
const rsFile = process.argv[4], rs = rsFile && fs.existsSync(rsFile) ? JSON.parse(fs.readFileSync(rsFile, 'utf8')) : null;
const others = rs ? rs.airlines.filter(a => a.icao !== M.airline && a.n >= 2 && (!dom || ['CEB', 'PAL', 'GAP', 'APG'].includes(a.icao))).sort((a, b) => b.n - a.n).map(a => a.airline).slice(0, 4) : [];
if (others.length) lines.push(`✈️ Also flies this route: ${others.join(', ')}`);
if (fare) lines.push(`💸 ` + (fare.phpFrom ? `One-way fares from around ${php(fare.phpFrom)}` : `One-way fares about ${php(fare.phpLow)} to ${php(fare.phpHigh)}`) + ` (estimate; varies by date and airline)`);
if (ofw) lines.push('✅ Heading abroad to work? Use a licensed agency and make sure your OEC and DMW papers are complete before you fly.');
else if (!dom && M.fromCountry === 'PH') lines.push('✅ Always check the official embassy or immigration site before you book.');
const tag = s => '#' + String(s || '').replace(/[^A-Za-z0-9]/g, '');
const tags = ['#LipadPinas', ...(ofw ? ['#OFW', '#Kabayan', '#BagongBayani'] : ['#Aviation', '#PinoyTravel']), tag(name), tag(city)].filter((x, i, a) => x.length > 1 && a.indexOf(x) === i);
const parts = [`✈️ ${lines[0]}`, hook, lines.slice(1).join('\n')].filter(Boolean);
if (ofw) { parts.push(slot('capCloseOfw', SC.capCloseOfw)); parts.push(slot('capCta', SC.capCta)); }
const body = parts.join('\n\n'), text = body + '\n\n' + tags.join(' ');
const title = `${M.fromCity} to ${city} on ${name} | Lipad Pinas`;
let variants = {}; try { variants = JSON.parse(fs.readFileSync(process.env.VARIANTS_OUT || path.join(__dirname, '..', 'out', 'variants.json'), 'utf8')); } catch (e) {}
fs.writeFileSync(process.argv[3], JSON.stringify({ facebook: text, youtube: { title: title.slice(0, 100), text: text + ' #Shorts' }, tiktok: { title: (lines[0] + ' · ' + hook + ' ' + tags.join(' ')).slice(0, 150) }, tiktokText: text, variants }, null, 1));
console.log(text);
