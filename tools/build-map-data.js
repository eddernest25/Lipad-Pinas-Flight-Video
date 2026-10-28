// Builds viewer/mapdata.json from open data: Natural Earth (world-atlas) + GeoNames (all-the-cities).
// Used for (a) the crisp vector stand-in base map and (b) our own country / sea / city labels drawn over ANY base (incl. Google tiles).
const fs = require('fs'), path = require('path');
const topo = require('topojson-client');
const atlas = require('world-atlas/countries-50m.json');
const landTopo = require('world-atlas/land-50m.json');
const cities = require('all-the-cities');
const r2 = x => Math.round(x * 100) / 100;

const land = topo.feature(landTopo, landTopo.objects.land);
const polys = [];
for (const f of land.features) {
  const g = f.geometry, list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of list) polys.push(poly.map(ring => ring.map(([x, y]) => [r2(x), r2(y)])));
}
const borders = topo.mesh(atlas, atlas.objects.countries, (a, b) => a !== b);
const lines = borders.coordinates.map(l => l.map(([x, y]) => [r2(x), r2(y)]));

// country label = centroid of the biggest ring; rank = bbox area (bigger countries get priority / larger font)
const countries = [];
for (const f of topo.feature(atlas, atlas.objects.countries).features) {
  const g = f.geometry; if (!g) continue;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null, bestA = -1;
  for (const poly of list) {
    const ring = poly[0]; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [x, y] of ring) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const a = (maxx - minx) * (maxy - miny);
    if (a > bestA) { bestA = a; let sx = 0, sy = 0; ring.forEach(([x, y]) => { sx += x; sy += y; }); best = [sy / ring.length, sx / ring.length]; }
  }
  if (f.properties && f.properties.name) countries.push({ n: f.properties.name, lat: r2(best[0]), lon: r2(best[1]), a: Math.round(bestA) });
}
// a few countries whose naive centroid lands badly (islands / long shapes)
const fix = { 'United States of America': [39.5, -98.5], 'Russia': [61, 95], 'Canada': [60, -105], 'Philippines': [12.5, 122.5], 'Indonesia': [-2.5, 115], 'Japan': [36.5, 138.5], 'India': [22.5, 79], 'China': [35, 103], 'Malaysia': [4, 109.5], 'Vietnam': [14.5, 108], 'Kuwait': [29.3, 47.6], 'United Arab Emirates': [24, 54.5], 'Saudi Arabia': [24, 44.5], 'Iran': [32.5, 54], 'Oman': [20.8, 56.5], 'Pakistan': [29.5, 69.5], 'Myanmar': [21.5, 96.5], 'Thailand': [15.3, 101] };
countries.forEach(c => { if (fix[c.n]) { c.lat = fix[c.n][0]; c.lon = fix[c.n][1]; } });
const shortName = { 'United States of America': 'United States', 'Dem. Rep. Congo': 'DR Congo' };
countries.forEach(c => { c.n = shortName[c.n] || c.n; });

const water = [
  ['South China Sea', 12.5, 114.5], ['Philippine Sea', 18, 131], ['Bay of Bengal', 14, 88], ['Arabian Sea', 14.5, 65], ['Andaman Sea', 11.5, 96.5],
  ['Gulf of Thailand', 9.5, 101.8], ['Persian Gulf', 27.2, 51.2], ['Gulf of Oman', 24.6, 58.4], ['Indian Ocean', -8, 80], ['Pacific Ocean', 25, 150],
  ['North Pacific Ocean', 42, -160], ['East China Sea', 28.5, 126], ['Sea of Japan', 40, 134], ['Sulu Sea', 8.8, 120.0], ['Celebes Sea', 3.5, 122.5],
  ['Red Sea', 20.5, 38.5], ['Gulf of Alaska', 57, -145], ['Bering Sea', 58, -175], ['Sea of Okhotsk', 55, 150], ['Luzon Strait', 20.5, 121.5],
  ['Strait of Malacca', 3.5, 100.2], ['Gulf of Aden', 12.2, 48], ['Taiwan Strait', 24, 119.5], ['Mediterranean Sea', 35, 18]
].map(([n, lat, lon]) => ({ n, lat, lon }));

const cityList = cities.filter(c => c.population >= 15000)
  .sort((a, b) => b.population - a.population)
  .map(c => [c.name, r2(c.loc.coordinates[1]), r2(c.loc.coordinates[0]), c.population, c.country]);

const out = { land: polys, borders: lines, countries, water, cities: cityList };
fs.writeFileSync(path.join(__dirname, '../viewer/mapdata.json'), JSON.stringify(out));
console.log('land polys', polys.length, 'border lines', lines.length, 'countries', countries.length, 'cities', cityList.length, 'size MB', (fs.statSync(path.join(__dirname, '../viewer/mapdata.json')).size / 1e6).toFixed(1));
