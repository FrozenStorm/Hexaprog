// Starting setup of the AI: base in the back rows of its zone, ships spread over
// the width, each with some forward momentum (never into a planet).
import { add, key, dist, toOffset } from "../engine/hex.js";
import { setupZone, inSetupZone, validSetup, defaultSetup, isPlanet, moveOk } from "../engine/core.js";
import { mergeRules } from "../engine/rules.js";

export function chooseSetup(ruleOverrides, p, rng) {
  const rules = mergeRules(ruleOverrides);
  const zone = setupZone(rules, p).filter((c) => !isPlanet(rules, c));
  // Base: not on the outer columns, mostly in the back rows.
  const back = zone.filter((c) => { const o = toOffset(c); return o.col > 1 && o.col < rules.cols - 3 && (p === 0 ? o.row >= rules.rows - 2 : o.row <= 1); });
  const base = rng.pick(back.length ? back : zone);
  const used = new Set([key(base)]);
  const fwd = p === 0 ? [{ q: 0, r: -1 }, { q: 1, r: -1 }] : [{ q: 0, r: 1 }, { q: -1, r: 1 }];
  const ships = [];
  for (let i = 0; i < rules.shipsPerPlayer; i++) {
    // Spread: prefer hexes far from the ships placed so far, not on the outer columns.
    const cands = zone.filter((c) => !used.has(key(c)) && toOffset(c).col > 0 && toOffset(c).col < rules.cols - 2);
    const scored = cands.map((c) => ({ c, v: Math.min(99, ...ships.map((x) => dist(x.pos, c))) + rng() * 3 - (dist(c, base) > 6 ? 2 : 0) }));
    scored.sort((a, b) => b.v - a.v);
    const pos = (scored[0] || { c: zone.find((c) => !used.has(key(c))) }).c;
    used.add(key(pos));
    // Forward momentum of 0 to 2, staying in the zone.
    let mom = pos;
    const steps = rng.int(3);
    for (let k = 0; k < steps; k++) {
      const n = add(mom, rng.pick(fwd));
      if (inSetupZone(rules, p, n) && moveOk(rules, pos, { q: n.q - pos.q, r: n.r - pos.r })) mom = n;
    }
    ships.push({ pos, mom });
  }
  const su = { base, ships };
  return validSetup(rules, p, su) ? su : defaultSetup(rules, p);
}
