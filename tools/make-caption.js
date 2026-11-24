#!/usr/bin/env node
// Builds post text for Facebook / YouTube / TikTok from a rendered flight.
//   node tools/make-caption.js out/raw.json out/caption.json [out/route-stats.json]
const fs = require('fs'), path = require('path'), { pick } = require('./variants');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), M = R.meta, P = R.points || [];
const rd = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const air = rd('airlines.json'), facts = rd('facts.json'), SC = facts.scripts || {};
const mins = M.takeoffUtc && M.landedUtc ? Math.round((new Date(M.landedUtc) - new Date(M.takeoffUtc)) / 60000) : Math.round((P[P.length - 1]?.t || 0) / 60);
const name = air[M.airline] || M.airline, dom = M.fromCountry === M.toCountry, B = M.toCountry, city = M.toCity;
const LP = require('./lp-dest'), D = LP.dest(M), nice = n => new Intl.NumberFormat('en-US').format(n);
const fare = (facts.fares || {})[`${M.from}-${M.to}`], php = n => '₱' + n.toLocaleString('en-US');
const rsFile = process.argv[4], rs = (rsFile && fs.existsSync(rsFile) ? JSON.parse(fs.readFileSync(rsFile, 'utf8')) : null) || R.routeStats || null;   // route stats: file arg, else embedded in raw.json by the render workflow
const spoken = m => { const mm = Math.round(m / 5) * 5; return `about ${Math.floor(mm / 60)} hours${mm % 60 ? " and " + (mm % 60) + " minutes" : ""}`; };
const dur = spoken(mins), avg = spoken(rs && rs.avgMin ? rs.avgMin : mins), km50 = Math.round(LP.distKm(P) / 50) * 50, seed = `${M.flight}${M.date}`;
const fill = t => t.replace(/\{dur\}/g, dur).replace(/\{city\}/g, city).replace(/\{from\}/g, M.fromCity).replace(/\{tag\}/g, D ? D.tag : '');
const slot = (s, pool) => { const v = pick(s, pool, seed, M.date); return fill(v.text); };
// Lipad Pinas captions: Route first, then a destination hook; what the place offers, distance, average flight time and other airlines
const hook = D ? slot('capHookDest', SC.capHookDest) : slot(dom ? 'capHookDom' : 'capHookIntl', dom ? SC.capHookDom : SC.capHookIntl);
const lines = [`${M.fromCity} → ${city} · ${name}`];
if (D) lines.push(`📍 ${D.offers[0]}`);
lines.push(`📏 About ${nice(km50)} km · ⏱️ average flight time ${avg}`);
const others = LP.others(M, rs, air).slice(0, 4);
if (others.length) lines.push(`✈️ Also flies this route non-stop: ${others.join(', ')}`);
if (fare) lines.push(`💸 ` + (fare.phpFrom ? `One-way fares from around ${php(fare.phpFrom)}` : `One-way fares about ${php(fare.phpLow)} to ${php(fare.phpHigh)}`) + ` (estimate; varies by date and airline)`);
if (!dom && M.fromCountry === 'PH') lines.push('✅ Always check the official embassy or immigration site before you book.');
const tag = s => '#' + String(s || '').replace(/[^A-Za-z0-9]/g, '');
const tags = ['#LipadPinas', '#PinoyTravel', '#Travel', ...(B === 'PH' ? ['#Philippines'] : []), tag(city), tag(name)].filter((x, i, a) => x.length > 1 && a.indexOf(x) === i);
const parts = [`✈️ ${lines[0]}`, hook, lines.slice(1).join('\n')].filter(Boolean);
parts.push(slot('capCtaDest', SC.capCtaDest));
parts.push('💬 Comment the route you want to see next!');
const body = parts.join('\n\n'), text = body + '\n\n' + tags.join(' ');
const title = `${M.fromCity} to ${city} on ${name} | Lipad Pinas`;
let variants = {}; try { variants = JSON.parse(fs.readFileSync(process.env.VARIANTS_OUT || path.join(__dirname, '..', 'out', 'variants.json'), 'utf8')); } catch (e) {}
fs.writeFileSync(process.argv[3], JSON.stringify({ facebook: text, youtube: { title: title.slice(0, 100), text: text }, tiktok: { title: (lines[0] + ' · ' + hook + ' ' + tags.join(' ')).slice(0, 150) }, tiktokText: text, variants }, null, 1));
console.log(text);
