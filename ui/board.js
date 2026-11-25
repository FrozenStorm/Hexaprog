// SVG board: static hex cells, units and weapons as persistent elements (so
// position changes animate with CSS transitions), an overlay for planning and
// an effects layer for lasers, explosions and damage numbers.
import { toPixel, corners, key, add, len, eq } from "../engine/hex.js";
import { boardCells, specialCells } from "../engine/core.js";

const NS = "http://www.w3.org/2000/svg";
export const SIZE = 20;
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const px = (a) => toPixel(a, SIZE);
const poly = (a, s = SIZE) => { const p = px(a); return corners(p.x, p.y, s).map((c) => c.map((n) => n.toFixed(2)).join(",")).join(" "); };
/** Direction angle in degrees of a hex vector (0 = right, clockwise in screen space). */
const angleOf = (v) => { const p = px(v); return (Math.atan2(p.y, p.x) * 180) / Math.PI; };

export class Board {
  constructor(svg, rules, { onCell } = {}) {
    this.svg = svg;
    this.rules = rules;
    this.onCell = onCell;
    svg.innerHTML = "";
    const cells = boardCells(rules);
    const xs = cells.map((c) => px(c).x), ys = cells.map((c) => px(c).y);
    const pad = SIZE * 1.1;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    svg.setAttribute("viewBox", `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`);
    const defs = el("defs", {}, svg);
    for (const [id, a, b] of [["pg-green", "#8fe0cf", "#1f5f55"], ["pg-centre", "#fff6dc", "#9a8a5e"]]) {
      const g = el("radialGradient", { id, cx: "35%", cy: "35%", r: "70%" }, defs);
      el("stop", { offset: "0%", "stop-color": a }, g);
      el("stop", { offset: "100%", "stop-color": b }, g);
    }
    for (const [id, color] of [["arrow0", "var(--p0)"], ["arrow1", "var(--p1)"], ["arrowW", "var(--ink)"]]) {
      const m = el("marker", { id, viewBox: "0 0 10 10", refX: 7, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", fill: color }, m);
    }
    this.gCells = el("g", { class: "cells" }, svg);
    this.gMom = el("g", { class: "moms" }, svg);
    this.gOverlay = el("g", { class: "overlay" }, svg);
    this.gWeapons = el("g", { class: "weapons" }, svg);
    this.gUnits = el("g", { class: "units" }, svg);
    this.gFx = el("g", { class: "fx" }, svg);
    this.gHit = el("g", { class: "hit" }, svg);
    const sp = specialCells(rules);
    const green = new Set(sp.green.map(key)), centre = new Set(sp.centre.map(key));
    this.cellEls = new Map();
    for (const c of cells) {
      const cls = green.has(key(c)) ? "cell green" : centre.has(key(c)) ? "cell centre" : "cell";
      el("polygon", { points: poly(c, SIZE - 0.6), class: cls }, this.gCells);
      if (rules.planets && cls !== "cell") {
        // Planets: a globe on the coloured hex.
        const p = px(c);
        el("circle", { cx: p.x, cy: p.y, r: SIZE * 0.78, class: `planet ${cls.split(" ")[1]}` }, this.gCells);
        el("circle", { cx: p.x - SIZE * 0.25, cy: p.y - SIZE * 0.25, r: SIZE * 0.3, class: "planet-shine" }, this.gCells);
      }
      const hit = el("polygon", { points: poly(c), class: "cell-hit" }, this.gHit);
      hit.addEventListener("click", () => this.onCell && this.onCell(c));
      this.cellEls.set(key(c), hit);
    }
    this.unitEls = new Map();
    this.weaponEls = new Map();
  }

  // ---- units and weapons ----

  /** Show a frame / state: { units: [...], weapons: [...] } plus static unit info (owner, kind, n). */
  show(view, info) {
    const seen = new Set();
    for (const u of view.units) {
      const meta = info.get(u.id);
      let g = this.unitEls.get(u.id);
      if (!g) {
        g = el("g", { class: `unit p${meta.owner} ${meta.kind}` }, this.gUnits);
        const body = el("g", { class: "body" }, g);
        if (meta.kind === "base") {
          el("circle", { r: SIZE * 0.72, class: "hull" }, body);
          el("circle", { r: SIZE * 0.38, class: "core" }, body);
        } else {
          el("path", { d: `M ${SIZE * 0.78} 0 L ${-SIZE * 0.55} ${SIZE * 0.55} L ${-SIZE * 0.3} 0 L ${-SIZE * 0.55} ${-SIZE * 0.55} Z`, class: "hull" }, body);
        }
        const label = el("text", { class: "label", y: 4 }, g);
        label.textContent = meta.kind === "base" ? "B" : String(meta.n);
        el("g", { class: "pips" }, g);
        g._mom = el("g", { class: `momg p${meta.owner}` }, this.gMom);
        el("circle", { class: "mom", r: SIZE * 0.32 }, g._mom);
        g._line = el("line", { class: "momline" }, g._mom);
        this.unitEls.set(u.id, g);
      }
      seen.add(u.id);
      const p = px(u.pos);
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      g.classList.toggle("dead", !u.alive);
      const body = g.querySelector(".body");
      if (meta.kind === "ship") {
        const ang = len(u.vel) ? angleOf(u.vel) : meta.owner === 0 ? -90 : 90;
        body.style.transform = `rotate(${ang}deg)`;
      }
      // Energy pips and torpedoes.
      const pips = g.querySelector(".pips");
      const max = meta.maxEnergy;
      if (pips._sig !== `${u.energy}/${max}/${u.torpedoes}`) {
        pips._sig = `${u.energy}/${max}/${u.torpedoes}`;
        pips.innerHTML = "";
        const w = 3.2;
        for (let i = 0; i < max; i++) el("rect", { x: (i - max / 2) * w, y: SIZE * 0.78, width: w - 0.8, height: 3, class: i < u.energy ? "pip on" : "pip" }, pips);
        for (let i = 0; i < (u.torpedoes || 0); i++) el("circle", { cx: (i - (u.torpedoes - 1) / 2) * 5, cy: -SIZE * 0.86, r: 1.7, class: "tpip" }, pips);
      }
      // Momentum marker (where the unit will be next turn without thrust).
      const showMom = u.alive && meta.kind === "ship" && len(u.vel) > 0;
      g._mom.style.display = showMom ? "" : "none";
      if (showMom) {
        const m = px(add(u.pos, u.vel));
        g._mom.firstChild.setAttribute("cx", m.x); g._mom.firstChild.setAttribute("cy", m.y);
        g._line.setAttribute("x1", p.x); g._line.setAttribute("y1", p.y);
        g._line.setAttribute("x2", m.x); g._line.setAttribute("y2", m.y);
      }
    }
    for (const [id, g] of this.unitEls) if (!seen.has(id)) { g._mom.remove(); g.remove(); this.unitEls.delete(id); }

    const wseen = new Set();
    for (const w of view.weapons) {
      let g = this.weaponEls.get(w.id);
      if (!g) {
        g = el("g", { class: `weapon p${w.owner} ${w.kind}` }, this.gWeapons);
        if (w.kind === "torpedo") {
          el("path", { d: "M 6 0 L 0 4 L -6 0 L 0 -4 Z", class: "torp" }, g);
        } else {
          el("circle", { r: 4, class: "lasermark" }, g);
        }
        g._vec = el("line", { class: "wvec" }, this.gWeapons);
        this.weaponEls.set(w.id, g);
      }
      wseen.add(w.id);
      const p = px(w.pos), m = px(add(w.pos, w.vel));
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      g._vec.setAttribute("x1", p.x); g._vec.setAttribute("y1", p.y);
      g._vec.setAttribute("x2", m.x); g._vec.setAttribute("y2", m.y);
      g._vec.setAttribute("class", `wvec p${w.owner}`);
    }
    for (const [id, g] of this.weaponEls) if (!wseen.has(id)) { g._vec.remove(); g.remove(); this.weaponEls.delete(id); }
  }

  // ---- planning overlay ----

  clearOverlay() { this.gOverlay.innerHTML = ""; }

  /** Highlight option cells; `selected` is a cell key. */
  options(cells, cls, selectedKey) {
    for (const c of cells) {
      el("polygon", { points: poly(c, SIZE - 2.5), class: `opt ${cls}${key(c) === selectedKey ? " sel" : ""}` }, this.gOverlay);
    }
  }
  zone(cells, cls) { for (const c of cells) el("polygon", { points: poly(c, SIZE - 1.5), class: `zone ${cls}` }, this.gOverlay); }
  arrow(a, b, cls, owner) {
    if (eq(a, b)) return;
    const p = px(a), q = px(b);
    el("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: `arrow ${cls}`, "marker-end": `url(#arrow${owner ?? "W"})` }, this.gOverlay);
  }
  ghost(c, cls) { const p = px(c); el("circle", { cx: p.x, cy: p.y, r: SIZE * 0.45, class: `ghost ${cls}` }, this.gOverlay); }
  ring(c, cls) { const p = px(c); el("circle", { cx: p.x, cy: p.y, r: SIZE * 0.8, class: `ring ${cls}` }, this.gOverlay); }

  // ---- effects ----

  clearFx() { this.gFx.innerHTML = ""; }
  fx(effects, info) {
    for (const f of effects) {
      if (f.type === "laser") {
        const a = px(f.from), b = px(f.to);
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `beam p${f.owner}` }, this.gFx);
      } else if (f.type === "explosion") {
        const p = px(f.pos);
        el("circle", { cx: p.x, cy: p.y, r: SIZE * (f.radius + 0.6) * 1.5, class: "boom" }, this.gFx);
      } else if (f.type === "collision" || f.type === "lost" || f.type === "intercept") {
        const p = px(f.pos);
        el("circle", { cx: p.x, cy: p.y, r: SIZE * 1.1, class: "boom small" }, this.gFx);
      } else if (f.type === "damage") {
        const g = this.unitEls.get(f.id);
        if (!g) continue;
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(g.style.transform);
        if (!m) continue;
        const t = el("text", { x: m[1], y: Number(m[2]) - SIZE * 0.9, class: "dmg" }, this.gFx);
        t.textContent = `−${f.amount}`;
      } else if (f.type === "refill") {
        const g = this.unitEls.get(f.id);
        if (g) { g.classList.add("refill"); setTimeout(() => g.classList.remove("refill"), 900); }
      }
    }
  }
}
