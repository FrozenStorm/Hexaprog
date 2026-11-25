// Hex geometry: axial coordinates {q, r} (pointy-top hexes).
// The board uses "odd-r" offset rows (col, row): odd rows are shifted half a hex to the right.

export const DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export const ZERO = Object.freeze({ q: 0, r: 0 });
export const add = (a, b) => ({ q: a.q + b.q, r: a.r + b.r });
export const sub = (a, b) => ({ q: a.q - b.q, r: a.r - b.r });
export const scale = (a, k) => ({ q: a.q * k, r: a.r * k });
export const eq = (a, b) => a.q === b.q && a.r === b.r;
export const key = (a) => `${a.q},${a.r}`;
export const len = (a) => (Math.abs(a.q) + Math.abs(a.r) + Math.abs(a.q + a.r)) / 2;
export const dist = (a, b) => len(sub(a, b));

/** All hex vectors with length <= n (n = 1 gives the centre and its 6 neighbours). */
export function disk(n) {
  const out = [];
  for (let q = -n; q <= n; q++) {
    for (let r = Math.max(-n, -q - n); r <= Math.min(n, -q + n); r++) out.push({ q, r });
  }
  return out;
}
const DISKS = [];
export function diskCached(n) { return DISKS[n] || (DISKS[n] = disk(n)); }

export const neighbours = (a) => DIRS.map((d) => add(a, d));

function cubeRound(x, z) {
  const y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return { q: rx + 0, r: rz + 0 };
}

/** All hexes on the straight line from a to b, both included (standard hex line drawing). */
export function line(a, b) {
  const n = dist(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const out = [];
  // Tiny nudge so lines along hex edges always pick the same side.
  const aq = a.q + 1e-6, ar = a.r + 2e-6, bq = b.q + 1e-6, br = b.r + 2e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(cubeRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}

// ---- offset <-> axial ----
export const toAxial = (col, row) => ({ q: col - (row - (row & 1)) / 2, r: row });
export function toOffset(a) {
  return { col: a.q + (a.r - (a.r & 1)) / 2, row: a.r };
}

/** Pixel centre of a hex (size = distance centre to corner). */
export function toPixel(a, size) {
  return { x: size * Math.sqrt(3) * (a.q + a.r / 2), y: size * 1.5 * a.r };
}
export function corners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + size * Math.cos(ang), cy + size * Math.sin(ang)]);
  }
  return pts;
}
