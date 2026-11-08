// The main colors of a book cover, by k-means on a small copy of it. Used by the
// color shelf on the home page and /members/almanac. Covers are served from our own
// /covers route, so the canvas can read their pixels.
export function palette(img, k = 4) {
  const c = document.createElement('canvas'); c.width = 30; c.height = 45;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 30, 45);
  const d = g.getImageData(0, 0, 30, 45).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  let cents = [...Array(k).keys()].map((i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let assign = [];
  for (let it = 0; it < 8; it++) {
    assign = px.map((p) => { let best = 0, bd = Infinity; cents.forEach((cc, j) => { const dd = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2; if (dd < bd) { bd = dd; best = j; } }); return best; });
    cents = cents.map((cc, j) => { const m = px.filter((_, i) => assign[i] === j); return m.length ? [0, 1, 2].map((ch) => m.reduce((s, p) => s + p[ch], 0) / m.length) : cc; });
  }
  const sizes = cents.map((_, j) => assign.filter((a) => a === j).length);
  // lightest first (drawn on top), darkest last
  return cents.map((cc, j) => ({ rgb: cc.map(Math.round), share: sizes[j] / px.length })).filter((p) => p.share > 0.02)
    .sort((a, b) => (b.rgb[0] + b.rgb[1] + b.rgb[2]) - (a.rgb[0] + a.rgb[1] + a.rgb[2]));
}

const load = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });

// One palette per cover URL (null where there is no cover or it can't be read).
export const coverPalettes = (urls) => Promise.all(urls.map(async (u) => {
  if (!u) return null;
  const im = await load(u);
  try { return im ? palette(im) : null; } catch { return null; }
}));
