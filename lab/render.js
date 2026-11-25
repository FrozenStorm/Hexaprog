// Renders a whole game (AI Lab replay) into an animated GIF: one frame after the
// ships moved, one with lasers and explosions, one at the end of every turn.
// Needs OffscreenCanvas (browser main thread or Web Worker).
import { toPixel, corners, len } from "../engine/hex.js";
import { newGame, resolveTurn, boardCells, specialCells, maxEnergy } from "../engine/core.js";
import { encodeGif } from "./gif.js";

const PALETTE = [
  [21, 23, 28], [43, 51, 61], [109, 90, 58], [61, 154, 140], [217, 206, 176], [79, 195, 255], [255, 138, 76],
  [233, 226, 207], [11, 13, 16], [255, 222, 138], [255, 75, 75], [224, 184, 106], [121, 210, 122], [42, 107, 143],
  [143, 74, 42], [85, 85, 85],
];
const hex = (i) => `rgb(${PALETTE[i].join(",")})`;
const C = { bg: 0, cell: 1, edge: 2, green: 3, centre: 4, p: [5, 6], ink: 7, black: 8, boom: 9, red: 10, brass: 11, ok: 12 };

export function renderGameGif(replay, { size = 9 } = {}) {
  let s = newGame(replay.rules, replay.setups || []);
  const R = s.rules;
  const cells = boardCells(R);
  const sp = specialCells(R);
  const px = (a) => toPixel(a, size);
  const xs = cells.map((c) => px(c).x), ys = cells.map((c) => px(c).y);
  const top = 14;
  const ox = -Math.min(...xs) + size * 1.1, oy = -Math.min(...ys) + size * 1.1 + top;
  const W = Math.ceil(Math.max(...xs) + ox + size * 1.1), H = Math.ceil(Math.max(...ys) + oy + size * 1.1);
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext("2d", { willReadFrequently: true });
  const P = (a) => { const p = px(a); return [p.x + ox, p.y + oy]; };
  const info = new Map(s.units.map((u) => [u.id, { owner: u.owner, kind: u.kind, max: maxEnergy(R, u) }]));
  const green = new Set(sp.green.map((c) => `${c.q},${c.r}`)), centre = new Set(sp.centre.map((c) => `${c.q},${c.r}`));

  // Static board, drawn once.
  g.fillStyle = hex(C.bg); g.fillRect(0, 0, W, H);
  for (const c of cells) {
    const [x, y] = P(c);
    const k = `${c.q},${c.r}`;
    const special = green.has(k) ? C.green : centre.has(k) ? C.centre : null;
    g.beginPath();
    corners(x, y, size - 0.5).forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
    g.closePath();
    g.fillStyle = hex(special !== null && !R.planets ? special : C.cell); g.fill();
    g.strokeStyle = hex(C.edge); g.lineWidth = 1; g.stroke();
    if (special !== null && R.planets) {
      g.beginPath(); g.arc(x, y, size * 0.75, 0, Math.PI * 2); g.fillStyle = hex(special); g.fill();
    }
  }
  const board = g.getImageData(0, 0, W, H);

  const frames = [];
  const cache = new Map();
  const quantize = () => {
    const d = g.getImageData(0, 0, W, H).data;
    const out = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let v = cache.get(key);
      if (v === undefined) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < PALETTE.length; k++) {
          const p = PALETTE[k];
          const e = (p[0] - d[i]) ** 2 + (p[1] - d[i + 1]) ** 2 + (p[2] - d[i + 2]) ** 2;
          if (e < bd) { bd = e; best = k; }
        }
        cache.set(key, (v = best));
      }
      out[j] = v;
    }
    return out;
  };

  const draw = (view, effects, label, delay) => {
    g.putImageData(board, 0, 0);
    g.fillStyle = hex(C.ink); g.font = "bold 11px sans-serif"; g.textBaseline = "top";
    g.fillText(label, 4, 2);
    for (const w of view.weapons) {
      const [x, y] = P(w.pos);
      g.fillStyle = hex(C.p[w.owner]);
      if (w.kind === "torpedo") { g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x, y + 3); g.lineTo(x - 4, y); g.lineTo(x, y - 3); g.fill(); }
    }
    for (const u of view.units) {
      if (!u.alive) continue;
      const m = info.get(u.id);
      const [x, y] = P(u.pos);
      g.fillStyle = hex(C.p[m.owner]);
      g.strokeStyle = hex(C.black); g.lineWidth = 1;
      if (m.kind === "base") {
        g.beginPath(); g.arc(x, y, size * 0.7, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = hex(C.black); g.beginPath(); g.arc(x, y, size * 0.3, 0, Math.PI * 2); g.fill();
      } else {
        const v = len(u.vel) ? px(u.vel) : { x: 0, y: m.owner === 0 ? -1 : 1 };
        const a = Math.atan2(v.y, v.x);
        g.save(); g.translate(x, y); g.rotate(a);
        g.beginPath(); g.moveTo(size * 0.8, 0); g.lineTo(-size * 0.55, size * 0.55); g.lineTo(-size * 0.3, 0); g.lineTo(-size * 0.55, -size * 0.55); g.closePath();
        g.fill(); g.stroke(); g.restore();
      }
      // Energy bar.
      const frac = Math.max(0, u.energy) / m.max;
      g.fillStyle = hex(C.black); g.fillRect(x - size * 0.7, y + size * 0.75, size * 1.4, 2);
      g.fillStyle = hex(frac > 0.5 ? C.ok : frac > 0.2 ? C.brass : C.red); g.fillRect(x - size * 0.7, y + size * 0.75, size * 1.4 * frac, 2);
    }
    for (const f of effects) {
      if (f.type === "laser") {
        const [a, b] = P(f.from), [c, d] = P(f.to);
        g.strokeStyle = hex(C.p[f.owner]); g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
      } else if (f.type === "explosion" || f.type === "collision" || f.type === "lost" || f.type === "intercept") {
        const [x, y] = P(f.pos);
        g.strokeStyle = hex(f.type === "explosion" ? C.boom : C.red); g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, size * (f.type === "explosion" ? (f.radius || 1) * 1.6 + 0.6 : 1), 0, Math.PI * 2); g.stroke();
      }
    }
    frames.push({ pixels: quantize(), delay });
  };

  draw(s, [], "Aufstellung", 80);
  for (const o of replay.orders) {
    const turn = s.turn;
    const r = resolveTurn(s, o);
    const move = r.frames.find((f) => f.phase === "move");
    const weap = r.frames.find((f) => f.phase === "weapons");
    draw(move, move.effects, `Zug ${turn}`, 25);
    draw(weap, weap.effects, `Zug ${turn}`, 45);
    s = r.state;
  }
  const res = s.winner === "draw" ? "Unentschieden" : s.winner === 0 ? "Sieg Spieler 1" : s.winner === 1 ? "Sieg Spieler 2" : "";
  draw(s, [], `Ende: ${res} (${s.losses[0]}:${s.losses[1]})`, 300);
  return encodeGif(W, H, PALETTE, frames);
}
