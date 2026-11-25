// Rules engine of Hexaprog. Pure functions, no DOM: used by the UI, the AI, the
// AI Lab (Web Workers and Node) and the online sync (both browsers resolve the
// same orders and get the same result).
//
// A turn: both players plan in secret (orders), then resolveTurn() executes
//   2 fire weapons, 3 apply thrust, 4 move ships by momentum,
//   5 move weapons by momentum (damage), 6 regenerate energy, 7 clean up.
//
// Orders of one player:
//   { units: { [shipId]: { thrust: vec|null, laser: vec|null, launch: vec|null } },
//     torps: { [torpedoId]: vec } }
// Every vec is a hex offset {q, r}: thrust moves the momentum marker, laser/launch
// place the weapon relative to the ship's momentum marker, torps steer a torpedo.

import { add, sub, eq, key, len, dist, line, lineSteps, toAxial, toOffset, diskCached, ZERO } from "./hex.js";
import { mergeRules } from "./rules.js";

export const PLAYER_NAMES = ["Spieler 1", "Spieler 2"];

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export const rowLength = (rules, row) => (row & 1 ? rules.cols - 1 : rules.cols);

export function onBoard(rules, a) {
  const { col, row } = toOffset(a);
  return row >= 0 && row < rules.rows && col >= 0 && col < rowLength(rules, row);
}

/** Point mirror of a board hex (player 2 gets the mirrored setup of player 1). */
export function mirror(rules, a) {
  const { col, row } = toOffset(a);
  const r2 = rules.rows - 1 - row;
  return toAxial(rowLength(rules, r2) - 1 - col, r2);
}

export function boardCells(rules) {
  const out = [];
  for (let row = 0; row < rules.rows; row++) {
    for (let col = 0; col < rowLength(rules, row); col++) out.push(toAxial(col, row));
  }
  return out;
}

/** The marked hexes of the printed board: 4 green ones and the light centre. */
export function specialCells(rules) {
  const mid = (rules.rows - 1) / 2;
  const g = [toAxial(3, 3), toAxial(rowLength(rules, 3) - 4, 3)];
  return {
    green: [...g, ...g.map((c) => mirror(rules, c))],
    centre: [toAxial(Math.floor((rowLength(rules, mid) - 1) / 2), mid)],
  };
}

// ---------------------------------------------------------------------------
// Planets: the coloured hexes block ships, lasers and torpedoes
// ---------------------------------------------------------------------------

const PLANETS = new WeakMap();
/** Set of hex keys that are planets (empty when rules.planets is off). */
export function planetSet(rules) {
  let set = PLANETS.get(rules);
  if (!set) {
    const sp = specialCells(rules);
    set = new Set(rules.planets ? [...sp.green, ...sp.centre].map(key) : []);
    PLANETS.set(rules, set);
  }
  return set;
}
export const isPlanet = (rules, a) => planetSet(rules).has(key(a));

/**
 * The hexes a laser beam from a to b touches, up to the first planet. With
 * laser.edgeBoth a beam running exactly along the border of two hexes touches both;
 * if one of them is a planet, the beam stops there (the other hex is still hit).
 */
export function clearLine(rules, a, b) {
  const out = [];
  const steps = rules.laser.edgeBoth ? lineSteps(a, b) : line(a, b).map((c) => [c]);
  for (const step of steps) {
    let blocked = false;
    for (const c of step) {
      if (isPlanet(rules, c)) blocked = true;
      else out.push(c);
    }
    if (blocked) break;
  }
  return out;
}

/** Can a unit at pos fly with momentum vel without leaving the board or hitting a planet? */
export function moveOk(rules, pos, vel) {
  const target = add(pos, vel);
  if (!onBoard(rules, target)) return false;
  const p = planetSet(rules);
  return !line(pos, target).some((c) => p.has(key(c)));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Rows a player may set up in: the bottom rows for player 1, the top rows for player 2. */
export function inSetupZone(rules, p, a) {
  if (!onBoard(rules, a)) return false;
  const { row } = toOffset(a);
  return p === 0 ? row >= rules.rows - rules.setupRows : row < rules.setupRows;
}
export const setupZone = (rules, p) => boardCells(rules).filter((c) => inSetupZone(rules, p, c));

/**
 * A setup: { base: hex, ships: [{ pos: hex, mom: hex }, ...] }. Every unit and every
 * momentum marker lies in the own zone, units on different hexes. Momentum = mom - pos.
 */
export function defaultSetup(ruleOverrides, p) {
  const rules = mergeRules(ruleOverrides);
  const base1 = toAxial(rules.base1.col, rules.base1.row);
  const centre = specialCells(rules).centre[0];
  // Ships on the neighbours of the base that are closest to the centre, momentum 0.
  const around = diskCached(1).filter((d) => len(d) === 1).map((d) => add(base1, d))
    .filter((c) => inSetupZone(rules, 0, c) && !isPlanet(rules, c))
    .sort((a, b) => dist(a, centre) - dist(b, centre) || toOffset(a).col - toOffset(b).col);
  const zone = setupZone(rules, 0).filter((c) => !eq(c, base1) && !isPlanet(rules, c) && !around.some((x) => eq(x, c)));
  const ships = [];
  for (let i = 0; i < rules.shipsPerPlayer; i++) ships.push(around[i] || zone[i]);
  ships.sort((a, b) => toOffset(a).col - toOffset(b).col || a.r - b.r);
  const tf = (c) => (p === 0 ? c : mirror(rules, c));
  return { base: tf(base1), ships: ships.map((c) => ({ pos: tf(c), mom: tf(c) })) };
}

export function validSetup(ruleOverrides, p, setup) {
  const rules = mergeRules(ruleOverrides);
  if (!setup || !setup.base || !Array.isArray(setup.ships) || setup.ships.length !== rules.shipsPerPlayer) return false;
  const cells = [setup.base, ...setup.ships.map((x) => x && x.pos)];
  const hexOk = (c) => c && Number.isInteger(c.q) && Number.isInteger(c.r) && inSetupZone(rules, p, c);
  if (!cells.every(hexOk) || !setup.ships.every((x) => hexOk(x.mom))) return false;
  if (cells.some((c) => isPlanet(rules, c))) return false;
  return new Set(cells.map(key)).size === cells.length;
}

/** New game. `setups` are the two players' starting setups (default setup where missing or invalid). */
export function newGame(ruleOverrides, setups = []) {
  const rules = mergeRules(ruleOverrides);
  const units = [];
  for (const owner of [0, 1]) {
    const su = validSetup(rules, owner, setups[owner]) ? setups[owner] : defaultSetup(rules, owner);
    units.push({ id: `p${owner}b`, owner, kind: "base", n: 0, pos: { ...su.base }, vel: { ...ZERO },
      energy: rules.base.energy, torpedoes: 0, alive: true });
    su.ships.forEach((x, i) => units.push({ id: `p${owner}s${i + 1}`, owner, kind: "ship", n: i + 1, pos: { ...x.pos },
      vel: sub(x.mom, x.pos), energy: rules.ship.energy, torpedoes: rules.ship.torpedoes, alive: true }));
  }
  return { rules, turn: 1, units, weapons: [], losses: [0, 0], over: false, winner: null, endReason: null, nextId: 1 };
}

export const cloneState = (s) => ({
  ...s,
  units: s.units.map((u) => ({ ...u, pos: { ...u.pos }, vel: { ...u.vel } })),
  weapons: s.weapons.map((w) => ({ ...w, pos: { ...w.pos }, vel: { ...w.vel } })),
  losses: [...s.losses],
});

export const unitById = (s, id) => s.units.find((u) => u.id === id);
export const liveShips = (s, owner) => s.units.filter((u) => u.alive && u.kind === "ship" && u.owner === owner);
export const liveUnits = (s, owner) => s.units.filter((u) => u.alive && (owner === undefined || u.owner === owner));
export const torpsOf = (s, shipId) => s.weapons.filter((w) => w.kind === "torpedo" && w.from === shipId);
export const maxEnergy = (rules, u) => (u.kind === "base" ? rules.base.energy : rules.ship.energy);

// ---------------------------------------------------------------------------
// Legal orders
// ---------------------------------------------------------------------------

export const emptyOrders = () => ({ units: {}, torps: {} });

const inDisk = (v, n) => v && Number.isInteger(v.q) && Number.isInteger(v.r) && len(v) <= n;

export const canFireLaser = (s, u) => u.alive && u.kind === "ship" && u.energy >= s.rules.laser.cost;
export const canLaunch = (s, u) => u.alive && u.kind === "ship" && u.torpedoes > 0 && (!s.rules.torpedo.perShip || torpsOf(s, u.id).length < s.rules.torpedo.perShip);

/** Weapon vectors (relative to the ship's momentum marker) that are allowed. A weapon must leave the ship. */
export function weaponOptions(s, u, kind) {
  const spread = kind === "laser" ? s.rules.laser.spread : s.rules.torpedo.spread;
  let opts = diskCached(spread).filter((d) => len(add(u.vel, d)) > 0);
  // Torpedos only accelerate: launched forward of a moving ship, never backwards.
  if (kind === "torpedo" && s.rules.torpedo.forwardOnly && len(u.vel) > 0) opts = opts.filter((d) => forwardOk(d, u.vel));
  return opts;
}

/**
 * Torpedos only accelerate: thrust d is allowed when the flight line from hex centre
 * to hex centre does not get shorter, |v + d| >= |v| (straight on, to the sides,
 * diagonally forward). Lengths in screen space (pointy-top hexes): x = q + r/2, y = r * sqrt(3)/2.
 */
const len2 = (a) => (a.q + a.r / 2) ** 2 + 0.75 * a.r * a.r;
function forwardOk(d, v) {
  return len(d) === 0 || len2(add(v, d)) >= len2(v) - 1e-9;
}

/**
 * Thrust options of a torpedo in flight. Torpedos only accelerate: the momentum
 * marker may only move so that the flight line does not get shorter, or stay.
 */
export function torpThrustOptions(s, w) {
  const all = diskCached(s.rules.torpedo.thrust);
  if (!s.rules.torpedo.forwardOnly || len(w.vel) === 0) return all;
  return all.filter((d) => forwardOk(d, w.vel));
}

/** Keep only the legal parts of a player's orders. */
export function sanitizeOrders(s, owner, orders) {
  const out = emptyOrders();
  const o = orders || {};
  for (const u of liveShips(s, owner)) {
    const uo = (o.units && o.units[u.id]) || {};
    const v = { thrust: null, laser: null, launch: null };
    if (inDisk(uo.thrust, s.rules.ship.thrust)) v.thrust = { q: uo.thrust.q, r: uo.thrust.r };
    if (uo.laser && canFireLaser(s, u) && inDisk(uo.laser, s.rules.laser.spread) && len(add(u.vel, uo.laser)) > 0) v.laser = { q: uo.laser.q, r: uo.laser.r };
    if (uo.launch && canLaunch(s, u) && weaponOptions(s, u, "torpedo").some((d) => eq(d, uo.launch))) v.launch = { q: uo.launch.q, r: uo.launch.r };
    // One weapon per ship and turn: a laser or a torpedo.
    if (s.rules.oneWeaponPerTurn && v.laser && v.launch) v.launch = null;
    out.units[u.id] = v;
  }
  for (const w of s.weapons) {
    if (w.kind !== "torpedo" || w.owner !== owner) continue;
    const t = o.torps && o.torps[w.id];
    if (t && torpThrustOptions(s, w).some((d) => eq(d, t))) out.torps[w.id] = { q: t.q, r: t.r };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turn resolution
// ---------------------------------------------------------------------------

function snapshot(s, phase, effects = []) {
  return {
    phase,
    units: s.units.map((u) => ({ id: u.id, pos: { ...u.pos }, vel: { ...u.vel }, energy: u.energy, torpedoes: u.torpedoes, alive: u.alive })),
    weapons: s.weapons.map((w) => ({ id: w.id, kind: w.kind, owner: w.owner, from: w.from, pos: { ...w.pos }, vel: { ...w.vel } })),
    effects,
  };
}

/**
 * Execute one turn. Returns { state, frames, stats }: the new state, one snapshot per
 * phase for the animation, and counters for the AI Lab.
 * The input state is not changed.
 */
export function resolveTurn(state, ordersBoth, opts = {}) {
  const s = cloneState(state);
  const R = s.rules;
  const rec = opts.frames !== false;
  const frames = [];
  const stats = { lasers: [0, 0], launches: [0, 0], intercepted: [0, 0], destroyed: [] };
  if (s.over) return { state: s, frames, stats };
  const orders = [0, 1].map((p) => sanitizeOrders(s, p, ordersBoth[p]));
  if (rec) frames.push(snapshot(s, "start"));

  // 2. Fire weapons: the weapon marker is placed relative to the ship's momentum
  //    marker; its own momentum is the ship's momentum plus that offset.
  const fresh = new Set();
  for (const u of s.units) {
    if (!u.alive || u.kind !== "ship") continue;
    const o = orders[u.owner].units[u.id];
    if (!o) continue;
    if (o.laser) {
      u.energy -= R.laser.cost;
      const vel = add(u.vel, o.laser);
      s.weapons.push({ id: `L${s.nextId++}`, kind: "laser", owner: u.owner, from: u.id, pos: add(u.pos, vel), vel });
      stats.lasers[u.owner]++;
    }
    if (o.launch) {
      u.torpedoes -= 1;
      const vel = add(u.vel, o.launch);
      const id = `T${s.nextId++}`;
      const spawn = add(u.pos, vel);
      // A torpedo launched into a planet is lost.
      if (!line(u.pos, spawn).some((c) => isPlanet(R, c))) {
        s.weapons.push({ id, kind: "torpedo", owner: u.owner, from: u.id, pos: spawn, vel });
        fresh.add(id);
      }
      stats.launches[u.owner]++;
    }
  }
  if (rec) frames.push(snapshot(s, "fire"));

  // 3. Thrust: moves the momentum marker (ships and torpedoes already in flight).
  for (const u of s.units) {
    if (!u.alive || u.kind !== "ship") continue;
    const o = orders[u.owner].units[u.id];
    if (o && o.thrust) u.vel = add(u.vel, o.thrust);
  }
  for (const w of s.weapons) {
    if (w.kind !== "torpedo" || fresh.has(w.id)) continue;
    const t = orders[w.owner].torps[w.id];
    if (t) w.vel = add(w.vel, t);
  }
  if (rec) frames.push(snapshot(s, "thrust"));

  // 4. Ships move onto their momentum marker.
  const paths = new Map(); // unit id -> hexes passed this turn (incl. start and end)
  const moveFx = [];
  const destroy = (u, cause) => {
    if (!u.alive) return;
    u.alive = false;
    s.losses[u.owner]++;
    stats.destroyed.push({ id: u.id, owner: u.owner, kind: u.kind, cause });
  };
  for (const u of s.units) {
    if (!u.alive) continue;
    if (u.kind === "base") { paths.set(u.id, [u.pos]); continue; }
    const target = add(u.pos, u.vel);
    let path = line(u.pos, target);
    const hitPlanet = path.findIndex((c, i) => i > 0 && isPlanet(R, c));
    const leaves = path.findIndex((c) => !onBoard(R, c));
    if (hitPlanet > 0 && (leaves < 0 || hitPlanet < leaves)) {
      // Crashes into a planet: the ship is lost where it hits.
      const at = path[hitPlanet];
      path = path.slice(0, hitPlanet);
      u.pos = path[path.length - 1];
      destroy(u, "planet");
      moveFx.push({ type: "lost", id: u.id, pos: at });
    } else if (!onBoard(R, target)) {
      if (R.edge === "stop") {
        let i = 0;
        while (i + 1 < path.length && onBoard(R, path[i + 1])) i++;
        path = path.slice(0, i + 1);
        u.pos = path[path.length - 1];
        u.vel = { ...ZERO };
      } else {
        u.pos = target;
        destroy(u, "edge");
        moveFx.push({ type: "lost", id: u.id, pos: target });
      }
    } else {
      u.pos = target;
    }
    paths.set(u.id, path);
  }
  // Collisions: two ships ending on the same hex are both destroyed. A ship flying onto a
  // base is destroyed and rams the base (damage), depending on rules.baseCollision.
  const byHex = new Map();
  for (const u of s.units) {
    if (!u.alive) continue;
    const k = key(u.pos);
    if (!byHex.has(k)) byHex.set(k, []);
    byHex.get(k).push(u);
  }
  for (const group of byHex.values()) {
    if (group.length < 2) continue;
    const ships = group.filter((u) => u.kind === "ship");
    const base = group.find((u) => u.kind === "base");
    if (base && R.baseCollision !== "ignore") {
      for (const u of ships) destroy(u, u.owner === base.owner ? "ram-own" : "ram");
      if (R.baseCollision === "destroyBoth") destroy(base, "ram");
      else {
        base.energy -= R.base.ramDamage * ships.length;
        moveFx.push({ type: "damage", id: base.id, amount: R.base.ramDamage * ships.length });
        if (R.destroyWhen === "zero" ? base.energy <= 0 : base.energy < 0) destroy(base, "ram");
        base.energy = Math.max(0, base.energy);
      }
      moveFx.push({ type: "collision", pos: { ...group[0].pos } });
    } else if (ships.length >= 2) {
      const own = ships.every((u) => u.owner === ships[0].owner);
      for (const u of ships) destroy(u, own ? "collision-own" : "collision");
      moveFx.push({ type: "collision", pos: { ...group[0].pos } });
    }
  }
  // Ending next to the own base refills the torpedoes.
  for (const u of s.units) {
    if (!u.alive || u.kind !== "ship") continue;
    const base = s.units.find((b) => b.kind === "base" && b.owner === u.owner && b.alive);
    if (base && dist(base.pos, u.pos) === 1 && u.torpedoes < R.ship.torpedoes) {
      u.torpedoes = R.ship.torpedoes;
      moveFx.push({ type: "refill", id: u.id });
    }
  }
  if (rec) frames.push(snapshot(s, "move", moveFx));

  // 5. Weapons move by their momentum; damage is checked before and after.
  const damage = new Map(); // unit id -> { amount, causes:Set }
  const hit = (u, amount, cause) => {
    const d = damage.get(u.id) || { amount: 0, causes: new Set() };
    d.amount += amount;
    d.causes.add(cause);
    damage.set(u.id, d);
  };
  const fx = [];
  const alive = s.units.filter((u) => u.alive);
  const enemyNear = (w, pos) => alive.some((u) => u.owner !== w.owner && dist(u.pos, pos) <= R.torpedo.radius);
  // Interception: enemy torpedoes in range also trigger a torpedo, and every
  // detonation destroys the other torpedoes in its blast (they do not explode).
  const intercept = !!R.torpedo.intercept;
  const torpNear = (w, pos, list) => intercept && list.some((t) => t !== w && t.owner !== w.owner && dist(t.pos, pos) <= R.torpedo.radius);
  const detonate = (w, pos) => {
    for (const u of alive) if (dist(u.pos, pos) <= R.torpedo.radius) hit(u, R.torpedo.damage, "torpedo");
    fx.push({ type: "explosion", pos: { ...pos }, radius: R.torpedo.radius, owner: w.owner });
    w.gone = true;
  };
  // All torpedoes of a check detonate together, then the blasts take out the rest in range.
  const blast = (boom, list) => {
    for (const w of boom) detonate(w, w.pos);
    if (!intercept) return;
    for (const t of list) {
      if (t.gone) continue;
      if (boom.some((w) => dist(w.pos, t.pos) <= R.torpedo.radius)) {
        t.gone = true;
        stats.intercepted[t.owner]++;
        fx.push({ type: "intercept", pos: { ...t.pos }, owner: t.owner });
      }
    }
  };
  for (const w of s.weapons) {
    if (w.kind !== "laser") continue;
    const ship = unitById(s, w.from);
    const zone = new Set();
    // Planets block the beam: the zone ends in front of the first planet.
    const z1 = clearLine(R, ship.pos, w.pos);
    for (const c of z1) zone.add(key(c));
    const before = { ...w.pos };
    w.pos = add(w.pos, w.vel);
    const z2 = clearLine(R, ship.pos, w.pos);
    for (const c of z2) zone.add(key(c));
    for (const u of alive) {
      if (u.id === ship.id) continue;
      if (u.owner === w.owner && !R.friendlyFire) continue;
      const path = paths.get(u.id) || [u.pos];
      if (path.some((c) => zone.has(key(c)))) hit(u, R.laser.damage, "laser");
    }
    fx.push({ type: "laser", owner: w.owner, from: { ...ship.pos }, before, to: { ...(z2[z2.length - 1] || ship.pos) } });
  }
  // Torpedoes: check before the move, move, check after the move; each check is simultaneous.
  let torps = s.weapons.filter((w) => w.kind === "torpedo");
  blast(torps.filter((w) => enemyNear(w, w.pos) || torpNear(w, w.pos, torps)), torps);
  torps = torps.filter((w) => !w.gone);
  for (const w of torps) {
    const target = add(w.pos, w.vel);
    const crash = line(w.pos, target).find((c, i) => i > 0 && isPlanet(R, c));
    w.pos = target;
    if (crash) { w.gone = true; fx.push({ type: "fizzle", pos: { ...crash } }); continue; }
    if (!onBoard(R, target)) { w.gone = true; fx.push({ type: "fizzle", pos: { ...target } }); }
  }
  torps = torps.filter((w) => !w.gone);
  blast(torps.filter((w) => alive.some((u) => u.owner === w.owner && eq(u.pos, w.pos)) || enemyNear(w, w.pos) || torpNear(w, w.pos, torps)), torps);
  for (const [id, d] of damage) {
    const u = unitById(s, id);
    u.energy -= d.amount;
    fx.push({ type: "damage", id, amount: d.amount });
    const dead = R.destroyWhen === "zero" ? u.energy <= 0 : u.energy < 0;
    if (dead) destroy(u, [...d.causes].join("+"));
    u.energy = Math.max(0, u.energy);
  }
  if (rec) frames.push(snapshot(s, "weapons", fx));

  // 6. Regenerate energy. 7. Clean up: lasers and detonated torpedoes leave the board.
  for (const u of s.units) {
    if (u.alive) u.energy = Math.min(maxEnergy(R, u), u.energy + (u.kind === "base" ? R.base.regen : R.ship.regen));
  }
  s.weapons = s.weapons.filter((w) => w.kind === "torpedo" && !w.gone);

  // Game end.
  const lost = [0, 1].map((p) => s.losses[p] >= R.lossLimit);
  const energy = (p) => liveUnits(s, p).reduce((a, u) => a + u.energy, 0);
  if (lost[0] || lost[1]) {
    s.over = true;
    s.endReason = "losses";
    if (lost[0] && lost[1]) {
      // Both lost in the same turn: more remaining energy wins, else a draw.
      s.winner = energy(0) === energy(1) ? "draw" : energy(0) > energy(1) ? 0 : 1;
    } else s.winner = lost[0] ? 1 : 0;
  } else if (s.turn >= R.maxTurns) {
    s.over = true;
    s.endReason = "timeout";
    s.winner = "draw";
    if (R.timeout === "points") {
      if (s.losses[0] !== s.losses[1]) s.winner = s.losses[0] < s.losses[1] ? 0 : 1;
      else if (energy(0) !== energy(1)) s.winner = energy(0) > energy(1) ? 0 : 1;
    }
  } else {
    s.turn++;
  }
  if (rec) frames.push(snapshot(s, "end"));
  return { state: s, frames, stats };
}

/** Where a ship will be after this turn's thrust (for previews). */
export const predictedPos = (u, thrust) => add(add(u.pos, u.vel), thrust || ZERO);

/** Laser zone preview: line from the ship's new position to the laser marker after its move. */
export function laserPreview(rules, u, laserVec, thrust) {
  const vel = add(u.vel, laserVec);
  const marker = add(add(u.pos, vel), vel);
  return { from: predictedPos(u, thrust), spawn: add(u.pos, vel), to: marker, cells: clearLine(rules, predictedPos(u, thrust), marker) };
}

export { sub };
