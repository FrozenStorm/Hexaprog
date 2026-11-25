// AI Lab: plays complete AI-vs-AI games with given rules. Used by the Lab screen
// (Web Workers) and by tools/labrun.mjs (Node worker threads).
import { newGame, resolveTurn } from "../engine/core.js";
import { chooseOrders } from "../ai/ai.js";
import { makeRng } from "../ai/rng.js";
import { chooseSetup } from "../ai/setup.js";

/**
 * game = { id, variant, rules (overrides), levels: [lvl1, lvl2], seed }
 * Returns a result row and a replay ({ rules, orders: [[o1, o2], ...] }).
 */
export function playGame(game) {
  const rng = makeRng(game.seed);
  const setups = [0, 1].map((p) => chooseSetup(game.rules, p, rng));
  let s = newGame(game.rules, setups);
  const replay = { rules: s.rules, setups, levels: game.levels, seed: game.seed, orders: [] };
  const row = {
    id: game.id, variant: game.variant, level1: game.levels[0], level2: game.levels[1], seed: game.seed,
    winner: null, turns: 0, endReason: null, losses1: 0, losses2: 0,
    lasers1: 0, lasers2: 0, torpedoes1: 0, torpedoes2: 0, intercepted: 0,
    byLaser: 0, byTorpedo: 0, byCollision: 0, byEdge: 0, byPlanet: 0, ownLosses: 0,
  };
  while (!s.over) {
    const o = [0, 1].map((p) => chooseOrders(s, p, { level: game.levels[p], rng }));
    replay.orders.push(o);
    const r = resolveTurn(s, o, { frames: false });
    row.lasers1 += r.stats.lasers[0]; row.lasers2 += r.stats.lasers[1];
    row.torpedoes1 += r.stats.launches[0]; row.torpedoes2 += r.stats.launches[1];
    row.intercepted += r.stats.intercepted[0] + r.stats.intercepted[1];
    for (const d of r.stats.destroyed) {
      if (d.cause.includes("laser")) row.byLaser++;
      if (d.cause.includes("torpedo")) row.byTorpedo++;
      if (d.cause.startsWith("collision") || d.cause.startsWith("ram")) row.byCollision++;
      if (d.cause === "collision-own" || d.cause === "ram-own") row.ownLosses++;
      if (d.cause === "edge") row.byEdge++;
      if (d.cause === "planet") row.byPlanet++;
    }
    s = r.state;
  }
  row.winner = s.winner === "draw" ? "draw" : s.winner + 1;
  row.turns = s.turn;
  row.endReason = s.endReason;
  row.losses1 = s.losses[0];
  row.losses2 = s.losses[1];
  return { row, replay };
}

/** Expand a lab config into single games. Each variant plays `games` games, sides alternate. */
export function expandGames(cfg) {
  const out = [];
  let id = 0;
  cfg.variants.forEach((v) => {
    for (let i = 0; i < cfg.games; i++) {
      const swap = cfg.swapSides && i % 2 === 1;
      out.push({
        id: id++, variant: v.name, rules: v.rules,
        levels: swap ? [cfg.levels[1], cfg.levels[0]] : [cfg.levels[0], cfg.levels[1]],
        seed: (cfg.seed || 1) * 100003 + id,
      });
    }
  });
  return out;
}

/** Statistics per variant. */
export function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.variant)) by.set(r.variant, []);
    by.get(r.variant).push(r);
  }
  return [...by].map(([variant, rs]) => {
    const n = rs.length;
    const avg = (f) => rs.reduce((a, r) => a + f(r), 0) / n;
    return {
      variant, games: n,
      win1: rs.filter((r) => r.winner === 1).length / n,
      win2: rs.filter((r) => r.winner === 2).length / n,
      draw: rs.filter((r) => r.winner === "draw").length / n,
      timeouts: rs.filter((r) => r.endReason === "timeout").length / n,
      turns: avg((r) => r.turns),
      lasers: avg((r) => r.lasers1 + r.lasers2),
      torpedoes: avg((r) => r.torpedoes1 + r.torpedoes2),
      intercepted: avg((r) => r.intercepted || 0),
      byLaser: avg((r) => r.byLaser), byTorpedo: avg((r) => r.byTorpedo),
      byCollision: avg((r) => r.byCollision), ownCollision: avg((r) => r.ownLosses), byEdge: avg((r) => r.byEdge), byPlanet: avg((r) => r.byPlanet || 0),
    };
  });
}

export function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => (typeof v === "string" && /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
