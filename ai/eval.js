// Position evaluation from the view of player `me`: positive is good for `me`.
import { add, dist, len, diskCached } from "../engine/hex.js";
import { moveOk, liveUnits } from "../engine/core.js";

export const W = {
  win: 100000,
  unit: 1000,
  energy: 12,
  torpedo: 15,
  doomed: 700,      // ship that cannot avoid leaving the board next turn
  fast: 4,          // per point of speed above 2
  approach: 3,      // per hex distance to the nearest enemy unit (ships only)
  torpApproach: 6,  // per hex distance of an own torpedo to its nearest enemy
  torpThreat: 25,   // enemy torpedo that can reach a unit next turn (times damage)
};

function sideScore(s, p) {
  const R = s.rules;
  const mine = liveUnits(s, p);
  const enemies = liveUnits(s, 1 - p);
  let v = 0;
  for (const u of mine) {
    v += W.energy * u.energy;
    if (u.kind !== "ship") continue;
    v += W.torpedo * u.torpedoes;
    if (R.edge === "destroy") {
      if (!diskCached(R.ship.thrust).some((d) => moveOk(R, u.pos, add(u.vel, d)))) v -= W.doomed;
    }
    const sp = len(u.vel);
    if (sp > 2) v -= W.fast * (sp - 2) * (sp - 2);
    if (enemies.length) {
      const d = Math.min(...enemies.map((e) => dist(e.pos, u.pos)));
      v -= W.approach * Math.max(0, d - 2);
    }
  }
  for (const w of s.weapons) {
    if (w.kind !== "torpedo") continue;
    if (w.owner === p) {
      if (enemies.length) v -= W.torpApproach * Math.min(...enemies.map((e) => dist(e.pos, w.pos)));
    } else {
      // Where the torpedo flies next turn, give or take its thrust and blast radius.
      const reach = R.torpedo.thrust + R.torpedo.radius;
      const next = add(w.pos, w.vel);
      for (const u of mine) if (dist(next, add(u.pos, u.vel)) <= reach) v -= W.torpThreat * R.torpedo.damage;
    }
  }
  return v;
}

export function evaluate(s, me) {
  if (s.over) {
    if (s.winner === "draw") return (s.losses[1 - me] - s.losses[me]) * W.unit;
    return s.winner === me ? W.win - s.turn : -W.win + s.turn;
  }
  return W.unit * (s.losses[1 - me] - s.losses[me]) + sideScore(s, me) - sideScore(s, 1 - me);
}
