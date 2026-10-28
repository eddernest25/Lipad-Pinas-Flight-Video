// Small geodesy helpers (spherical earth is plenty accurate for video work)
const R = 6371.0088; // km
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

function toVec(lat, lon) {
  const la = rad(lat), lo = rad(lon);
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}
function toLatLon(v) {
  const n = Math.hypot(...v);
  return { lat: deg(Math.asin(v[2] / n)), lon: deg(Math.atan2(v[1], v[0])) };
}
function distKm(a, b) {
  const va = toVec(a.lat, a.lon), vb = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, va[0]*vb[0] + va[1]*vb[1] + va[2]*vb[2]));
  return Math.acos(dot) * R;
}
function bearing(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
// point a fraction f of the way along the great circle a -> b
function interpGC(a, b, f) {
  const va = toVec(a.lat, a.lon), vb = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, va[0]*vb[0] + va[1]*vb[1] + va[2]*vb[2]));
  const w = Math.acos(dot);
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const s = Math.sin(w), k1 = Math.sin((1 - f) * w) / s, k2 = Math.sin(f * w) / s;
  return toLatLon([k1*va[0] + k2*vb[0], k1*va[1] + k2*vb[1], k1*va[2] + k2*vb[2]]);
}
const KT_TO_KMH = 1.852;
module.exports = { R, rad, deg, distKm, bearing, interpGC, KT_TO_KMH };
