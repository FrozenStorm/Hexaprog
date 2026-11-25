// AI opponent for simultaneous turns.
//
// The AI does not know the opponent's orders. It samples a few likely opponent
// plans, then improves its own plan one decision at a time (thrust, laser,
// torpedo of each ship, steering of each torpedo): for every option it resolves
// the turn against all sampled opponent plans and keeps the option with the best
// average (Hard and Expert also weigh the worst case).
//
// Levels: easy | medium | hard | expert (measured in tools/labrun.mjs: each level wins
// clearly more often than it loses against the level below).

import { add, len, dist, diskCached, line, key } from "../engine/hex.js";
import {
  resolveTurn, liveShips, liveUnits, emptyOrders, canFireLaser, canLaunch, weaponOptions, onBoard, torpThrustOptions,
} from "../engine/core.js";
import { evaluate } from "./eval.js";
import { makeRng } from "./rng.js";

export const LEVELS = {
  easy:   { samples: 2, sweeps: 1, worst: 0, noise: 400, rounds: 0 },
  medium: { samples: 6, sweeps: 2, worst: 0.1, noise: 0, rounds: 0 },
  hard:   { samples: 6, sweeps: 2, worst: 0.1, noise: 0, rounds: 1 },
  expert: { samples: 10, sweeps: 3, worst: 0.1, noise: 0, rounds: 3 },
};
export const LEVEL_NAMES = { easy: "Leicht", medium: "Mittel", hard: "Schwer", expert: "Experte" };

const ZERO = { q: 0, r: 0 };
const clonePlan = (o) => JSON.parse(JSON.stringify(o));

/** Quick reflex plan: keep on the board, fire lasers where an enemy might be. Used for opponent samples. */
export function reflexPlan(s, p, rng, chaos = 0.5) {
  const R = s.rules;
  const o = emptyOrders();
  const enemies = liveUnits(s, 1 - p);
  for (const u of liveShips(s, p)) {
    const thrusts = diskCached(R.ship.thrust).filter((d) => {
      const n = add(add(u.pos, u.vel), d);
      return onBoard(R, n) && onBoard(R, add(n, add(u.vel, d)));
    });
    let thrust = rng.pick(thrusts.length ? thrusts : diskCached(R.ship.thrust));
    if (rng() > chaos && enemies.length) {
      // Steer towards the nearest enemy, keeping speed moderate.
      const e = enemies.reduce((a, b) => (dist(a.pos, u.pos) <= dist(b.pos, u.pos) ? a : b));
      const pick = (thrusts.length ? thrusts : diskCached(R.ship.thrust))
        .map((d) => ({ d, v: dist(add(add(u.pos, u.vel), d), e.pos) + Math.max(0, len(add(u.vel, d)) - 2) * 2 }))
        .sort((a, b) => a.v - b.v)[0];
      thrust = pick.d;
    }
    const uo = { thrust, laser: null, launch: null };
    const end = add(add(u.pos, u.vel), thrust);
    if (canFireLaser(s, u)) {
      let best = null, bestN = 0;
      for (const d of weaponOptions(s, u, "laser")) {
        const vel = add(u.vel, d);
        const zone = new Set(line(end, add(add(u.pos, vel), vel)).map(key));
        let n = 0;
        for (const e of enemies) {
          if (zone.has(key(e.pos)) || zone.has(key(add(e.pos, e.vel)))) n++;
        }
        if (n > bestN) { bestN = n; best = d; }
      }
      if (best && rng() < 0.85) uo.laser = best;
    }
    if (canLaunch(s, u) && enemies.length && rng() < 0.35) {
      const opts = weaponOptions(s, u, "torpedo");
      const e = enemies[rng.int(enemies.length)];
      uo.launch = opts.reduce((a, b) => (dist(add(u.pos, add(u.vel, a)), e.pos) <= dist(add(u.pos, add(u.vel, b)), e.pos) ? a : b));
    }
    o.units[u.id] = uo;
  }
  for (const w of s.weapons) {
    if (w.kind !== "torpedo" || w.owner !== p || !enemies.length) continue;
    const e = enemies.reduce((a, b) => (dist(a.pos, w.pos) <= dist(b.pos, w.pos) ? a : b));
    o.torps[w.id] = torpThrustOptions(s, w).reduce((a, b) =>
      (dist(add(w.pos, add(w.vel, a)), e.pos) <= dist(add(w.pos, add(w.vel, b)), e.pos) ? a : b));
  }
  return o;
}

/** All single decisions of player p, each with its options. */
function decisions(s, p) {
  const R = s.rules;
  const out = [];
  for (const u of liveShips(s, p)) {
    out.push({ unit: u.id, field: "thrust", options: diskCached(R.ship.thrust) });
    if (canFireLaser(s, u)) out.push({ unit: u.id, field: "laser", options: [null, ...weaponOptions(s, u, "laser")] });
    if (canLaunch(s, u)) out.push({ unit: u.id, field: "launch", options: [null, ...weaponOptions(s, u, "torpedo")] });
  }
  for (const w of s.weapons) {
    if (w.kind === "torpedo" && w.owner === p) out.push({ torp: w.id, options: torpThrustOptions(s, w) });
  }
  return out;
}

function setDecision(plan, dec, val) {
  if (dec.torp) plan.torps[dec.torp] = val;
  else {
    if (!plan.units[dec.unit]) plan.units[dec.unit] = { thrust: ZERO, laser: null, launch: null };
    plan.units[dec.unit][dec.field] = val;
  }
}
const getDecision = (plan, dec) => (dec.torp ? plan.torps[dec.torp] : plan.units[dec.unit] && plan.units[dec.unit][dec.field]);

function score(s, p, plan, oppPlans, cfg) {
  let sum = 0, worst = Infinity;
  for (const op of oppPlans) {
    const both = p === 0 ? [plan, op] : [op, plan];
    const v = evaluate(resolveTurn(s, both, { frames: false }).state, p);
    sum += v;
    if (v < worst) worst = v;
  }
  const mean = sum / oppPlans.length;
  return mean * (1 - cfg.worst) + worst * cfg.worst;
}

/** Improve `plan` for player p against the given opponent plans (coordinate descent). */
function improve(s, p, plan, oppPlans, cfg, rng) {
  const decs = decisions(s, p);
  let best = score(s, p, plan, oppPlans, cfg);
  for (let sweep = 0; sweep < cfg.sweeps; sweep++) {
    let changed = false;
    for (const dec of decs) {
      const cur = getDecision(plan, dec);
      let bestVal = cur, bestScore = best;
      for (const opt of dec.options) {
        if (JSON.stringify(opt) === JSON.stringify(cur ?? null)) continue;
        setDecision(plan, dec, opt);
        const v = score(s, p, plan, oppPlans, cfg) + (cfg.noise ? (rng() - 0.5) * cfg.noise : 0);
        if (v > bestScore) { bestScore = v; bestVal = opt; }
      }
      setDecision(plan, dec, bestVal);
      if (bestVal !== cur) changed = true;
      best = bestScore;
    }
    if (!changed) break;
  }
  return plan;
}

/**
 * Choose the orders of player p.
 * Hard and Expert play a few rounds of "fictitious play": the opponent's best
 * answer to our current plan joins the pool of opponent plans, then our plan is
 * improved against the whole pool again.
 */
export function chooseOrders(s, p, opts = {}) {
  const cfg = (typeof opts.level === "object" ? opts.level : LEVELS[opts.level || "medium"]) || LEVELS.medium;
  const rng = opts.rng || makeRng(opts.seed ?? (Date.now() ^ (p * 7919)));
  if (s.over) return emptyOrders();
  const opp = 1 - p;
  const oppPlans = [reflexPlan(s, opp, rng, 1)];
  while (oppPlans.length < cfg.samples) oppPlans.push(reflexPlan(s, opp, rng, 0.4));
  let plan = improve(s, p, clonePlan(reflexPlan(s, p, rng, 0.2)), oppPlans, cfg, rng);
  const myPool = [plan, reflexPlan(s, p, rng, 0.4)];
  const oppCfg = { ...LEVELS.medium, sweeps: 1 };
  for (let i = 0; i < cfg.rounds; i++) {
    const answer = improve(s, opp, clonePlan(oppPlans[1 + (i % (oppPlans.length - 1))]), myPool, oppCfg, rng);
    oppPlans.push(answer, answer); // counts double: it is the most likely answer
    plan = improve(s, p, clonePlan(plan), oppPlans, cfg, rng);
    myPool.push(clonePlan(plan));
  }
  return plan;
}
