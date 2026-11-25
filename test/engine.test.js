import test from "node:test";
import assert from "node:assert/strict";
import { newGame, resolveTurn, onBoard, boardCells, mirror, unitById, sanitizeOrders, specialCells, validSetup, defaultSetup } from "../engine/core.js";
import { line, dist, toAxial, toOffset, sub } from "../engine/hex.js";

const V = (q, r) => ({ q, r });
const place = (s, id, pos, vel = V(0, 0)) => { const u = unitById(s, id); u.pos = pos; u.vel = vel; return u; };
const orders = (units = {}, torps = {}) => ({ units, torps });
/** Move all units far apart in a neutral spot so a test only looks at the units it places. */
function quiet(s) {
  s.units.forEach((u, i) => { u.pos = toAxial(i % 2 ? 12 : 0, 2 * Math.floor(i / 2)); });
  return s;
}

test("board has 14/13 hexes per row and 257 cells", () => {
  const s = newGame();
  assert.equal(boardCells(s.rules).length, 10 * 14 + 9 * 13);
  assert.ok(onBoard(s.rules, toAxial(13, 0)));
  assert.ok(!onBoard(s.rules, toAxial(13, 1)));
  assert.ok(!onBoard(s.rules, toAxial(0, 19)));
});

test("offset/axial round trip and point mirror", () => {
  const s = newGame();
  for (const c of boardCells(s.rules)) {
    const o = toOffset(c);
    assert.deepEqual(toAxial(o.col, o.row), c);
    assert.ok(onBoard(s.rules, mirror(s.rules, c)));
    assert.deepEqual(mirror(s.rules, mirror(s.rules, c)), c);
  }
  const sp = specialCells(s.rules);
  assert.deepEqual(toOffset(sp.centre[0]), { col: 6, row: 9 });
  assert.deepEqual(sp.green.map(toOffset).map((o) => `${o.col},${o.row}`).sort(), ["3,15", "3,3", "9,15", "9,3"]);
});

test("setup: 1 base and 3 ships each, mirrored", () => {
  const s = newGame();
  assert.equal(s.units.length, 8);
  const b0 = unitById(s, "p0b"), b1 = unitById(s, "p1b");
  assert.deepEqual(toOffset(b0.pos), { col: 6, row: 17 });
  assert.deepEqual(toOffset(b1.pos), { col: 6, row: 1 });
  for (const u of s.units) if (u.kind === "ship") assert.equal(dist(u.pos, unitById(s, `p${u.owner}b`).pos), 1);
});

test("line drawing has dist+1 hexes", () => {
  assert.equal(line(V(0, 0), V(3, -1)).length, 4);
  assert.deepEqual(line(V(0, 0), V(0, 0)), [V(0, 0)]);
});

test("momentum: thrust shifts the marker, ship keeps flying", () => {
  const s = quiet(newGame());
  place(s, "p0s1", toAxial(5, 11));
  let r = resolveTurn(s, [orders({ p0s1: { thrust: V(1, 0) } }), orders()]);
  let u = unitById(r.state, "p0s1");
  assert.deepEqual(u.vel, V(1, 0));
  assert.deepEqual(u.pos, add(toAxial(5, 11), V(1, 0)));
  r = resolveTurn(r.state, [orders(), orders()]);
  u = unitById(r.state, "p0s1");
  assert.deepEqual(u.pos, add(toAxial(5, 11), V(2, 0)));
  assert.equal(r.state.turn, 3);
});

function add(a, b) { return { q: a.q + b.q, r: a.r + b.r }; }

test("thrust larger than the ship's thrust is ignored", () => {
  const s = quiet(newGame());
  const o = sanitizeOrders(s, 0, orders({ p0s1: { thrust: V(2, 0) } }));
  assert.equal(o.units.p0s1.thrust, null);
});

test("two ships on the same hex are both destroyed", () => {
  const s = quiet(newGame());
  const c = toAxial(5, 11);
  place(s, "p0s1", add(c, V(-1, 0)), V(1, 0));
  place(s, "p1s1", add(c, V(1, 0)), V(-1, 0));
  const r = resolveTurn(s, [orders(), orders()]);
  assert.equal(unitById(r.state, "p0s1").alive, false);
  assert.equal(unitById(r.state, "p1s1").alive, false);
  assert.deepEqual(r.state.losses, [1, 1]);
});

test("leaving the board destroys the ship", () => {
  const s = quiet(newGame());
  place(s, "p0s1", toAxial(0, 9), V(-1, 0));
  const r = resolveTurn(s, [orders(), orders()]);
  assert.equal(unitById(r.state, "p0s1").alive, false);
  assert.equal(r.stats.destroyed[0].cause, "edge");
});

test("laser hits a unit standing in the zone; lasers cost nothing, ships do not regenerate", () => {
  const s = quiet(newGame());
  const c = toAxial(4, 10);
  place(s, "p0s1", c, V(1, 0));
  // laser vel = (2,0): spawn at c+2, after move at c+4; ship ends at c+1 -> zone c+1..c+4
  place(s, "p1s1", add(c, V(3, 0)));
  const r = resolveTurn(s, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  assert.equal(unitById(r.state, "p1s1").energy, 5); // 6 - 1, no regeneration
  assert.equal(unitById(r.state, "p0s1").energy, 6); // firing is free
  const fx = r.frames.find((f) => f.phase === "weapons").effects;
  assert.ok(fx.some((e) => e.type === "damage" && e.id === "p1s1" && e.amount === 1));
  assert.equal(r.state.weapons.length, 0);
});

test("laser hits a ship that flies through the zone, only once", () => {
  const s = quiet(newGame());
  const c = toAxial(4, 10);
  place(s, "p0s1", c, V(1, 0));
  // Enemy crosses the zone vertically.
  place(s, "p1s1", add(c, V(3, -1)), V(0, 2));
  const r = resolveTurn(s, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  const dmg = r.frames.find((f) => f.phase === "weapons").effects.filter((e) => e.type === "damage" && e.id === "p1s1");
  assert.equal(dmg.length, 1);
  assert.equal(dmg[0].amount, 1);
});

test("torpedo flies and detonates next to an enemy, damage 2 in radius 1", () => {
  const s = quiet(newGame());
  const c = toAxial(3, 10);
  place(s, "p0s1", c);
  place(s, "p1s2", add(c, V(4, 0)));
  // Launch with vel (1,0): spawn c+1; moves to c+2 (enemy at c+4 not in radius) ...
  let r = resolveTurn(s, [orders({ p0s1: { launch: V(1, 0) } }), orders()]);
  assert.equal(unitById(r.state, "p0s1").torpedoes, 1);
  assert.equal(r.state.weapons.length, 1);
  const t = r.state.weapons[0];
  assert.deepEqual(t.pos, add(c, V(2, 0)));
  // ... next turn moves to c+3, enemy adjacent -> boom.
  r = resolveTurn(r.state, [orders({}, {}), orders()]);
  assert.equal(r.state.weapons.length, 0);
  assert.equal(unitById(r.state, "p1s2").energy, 4); // 6 - 2
});

test("torpedo flying onto an own unit detonates", () => {
  const s = quiet(newGame());
  const c = toAxial(3, 10);
  place(s, "p0s1", c);
  place(s, "p0s2", add(c, V(2, 0)));
  const r = resolveTurn(s, [orders({ p0s1: { launch: V(1, 0) } }), orders()]);
  assert.equal(r.state.weapons.length, 0);
  assert.equal(unitById(r.state, "p0s2").energy, 4);
});

test("refill torpedoes next to own base", () => {
  const s = quiet(newGame());
  const b = unitById(s, "p0b");
  b.pos = toAxial(6, 12);
  const u = place(s, "p0s1", add(b.pos, V(2, 0)), V(-1, 0));
  u.torpedoes = 0;
  const r = resolveTurn(s, [orders(), orders()]);
  assert.equal(unitById(r.state, "p0s1").torpedoes, 2);
});

test("losing two units loses the game", () => {
  const s = quiet(newGame());
  place(s, "p0s1", toAxial(0, 9), V(-1, 0));
  place(s, "p0s2", toAxial(0, 11), V(-1, 0));
  const r = resolveTurn(s, [orders(), orders()]);
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 1);
});

test("hit destroys only when damage exceeds energy (default)", () => {
  const s = quiet(newGame());
  const c = toAxial(4, 10);
  place(s, "p0s1", c, V(1, 0));
  const e = place(s, "p1s1", add(c, V(3, 0)));
  e.energy = 1;
  let r = resolveTurn(s, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  assert.equal(unitById(r.state, "p1s1").alive, true);
  e.energy = 0;
  r = resolveTurn(s, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  assert.equal(unitById(r.state, "p1s1").alive, false);
});

test("resolution is deterministic and does not change the input", () => {
  const s = newGame();
  const json = JSON.stringify(s);
  const o = [orders({ p0s1: { thrust: V(0, -1), laser: V(0, -1) } }), orders({ p1s2: { thrust: V(0, 1), launch: V(0, 1) } })];
  const a = resolveTurn(s, o), b = resolveTurn(s, o);
  assert.equal(JSON.stringify(s), json);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test("ship flying onto a base is destroyed, base takes 4 damage", () => {
  const s = quiet(newGame());
  const b = unitById(s, "p1b");
  b.pos = toAxial(5, 11);
  place(s, "p0s1", add(b.pos, V(-2, 0)), V(2, 0));
  const r = resolveTurn(s, [orders(), orders()]);
  assert.equal(unitById(r.state, "p0s1").alive, false);
  assert.equal(unitById(r.state, "p1b").alive, true);
  assert.equal(unitById(r.state, "p1b").energy, 4); // 6 - 4 + 2 regen
  assert.equal(r.stats.destroyed[0].cause, "ram");
});

test("both players lose their second unit: more energy wins, equal energy is a draw", () => {
  const s = quiet(newGame());
  place(s, "p0s1", toAxial(0, 9), V(-1, 0));
  place(s, "p0s2", toAxial(0, 11), V(-1, 0));
  place(s, "p1s1", toAxial(13, 8), V(1, 0));
  place(s, "p1s2", toAxial(13, 10), V(1, 0));
  let r = resolveTurn(s, [orders(), orders()]);
  assert.equal(r.state.winner, "draw");
  unitById(s, "p1b").energy = 3;
  r = resolveTurn(s, [orders(), orders()]);
  assert.equal(r.state.winner, 0);
});

test("any number of torpedoes in flight per ship", () => {
  const s = quiet(newGame());
  const c = toAxial(5, 11);
  place(s, "p0s1", c, V(0, 0));
  let r = resolveTurn(s, [orders({ p0s1: { launch: V(0, -1) } }), orders()]);
  r = resolveTurn(r.state, [orders({ p0s1: { launch: V(-1, 0) } }), orders()]);
  assert.equal(r.state.weapons.filter((w) => w.kind === "torpedo").length, 2);
  assert.equal(unitById(r.state, "p0s1").torpedoes, 0);
});

test("free setup in the own zone with momentum markers", () => {
  const R = newGame().rules;
  const su = { base: toAxial(5, 17), ships: [
    { pos: toAxial(2, 16), mom: toAxial(2, 15) },
    { pos: toAxial(6, 16), mom: toAxial(6, 16) },
    { pos: toAxial(10, 18), mom: toAxial(11, 15) },
  ] };
  assert.ok(validSetup(R, 0, su));
  assert.ok(!validSetup(R, 1, su));
  assert.ok(!validSetup(R, 0, { ...su, base: toAxial(5, 14) }));
  assert.ok(!validSetup(R, 0, { ...su, base: toAxial(2, 16) }));
  assert.ok(!validSetup(R, 0, { ...su, ships: [su.ships[0], su.ships[1], { pos: toAxial(10, 18), mom: toAxial(10, 14) }] }));
  const g = newGame({}, [su, null]);
  assert.deepEqual(unitById(g, "p0s1").vel, sub(toAxial(2, 15), toAxial(2, 16)));
  assert.deepEqual(unitById(g, "p0b").pos, toAxial(5, 17));
  assert.deepEqual(toOffset(unitById(g, "p1b").pos), { col: 6, row: 1 }); // default for a missing setup
  for (const p of [0, 1]) assert.ok(validSetup(R, p, defaultSetup(R, p)));
});

test("torpedo thrust never makes the flight line shorter", async () => {
  const { torpThrustOptions } = await import("../engine/core.js");
  const s = newGame();
  const opts = (vel) => torpThrustOptions(s, { vel }).map((d) => `${d.q},${d.r}`).sort();
  // Straight up (screen): left and right count too, the two backward hexes do not.
  assert.deepEqual(opts(V(1, -2)), ["0,0", "-1,0", "1,0", "0,-1", "1,-1"].sort());
  // Speed 2 to the right: straight on and diagonally forward.
  assert.deepEqual(opts(V(2, 0)), ["0,0", "1,-1", "1,0", "0,1"].sort());
  // Speed 1: turning by 60 degrees keeps the length, only straight back is out.
  assert.deepEqual(opts(V(1, 0)), ["0,0", "1,-1", "1,0", "0,1", "0,-1", "-1,1"].sort());
  const w = { vel: V(1, 0) };
  const t = { id: "T1", kind: "torpedo", owner: 0, from: "p0s1", pos: toAxial(5, 11), vel: V(1, 0) };
  s.weapons.push(t);
  assert.equal(sanitizeOrders(s, 0, orders({}, { T1: V(-1, 0) })).torps.T1, undefined);
  assert.deepEqual(sanitizeOrders(s, 0, orders({}, { T1: V(0, 1) })).torps.T1, V(0, 1));
});

test("planets: ships crash, lasers are blocked, torpedoes are lost", async () => {
  const { isPlanet, clearLine } = await import("../engine/core.js");
  const s = quiet(newGame());
  const planet = toAxial(6, 9);
  assert.ok(isPlanet(s.rules, planet));
  // Ship flying through the planet.
  place(s, "p0s1", add(planet, V(-1, 0)), V(2, 0));
  let r = resolveTurn(s, [orders(), orders()]);
  assert.equal(unitById(r.state, "p0s1").alive, false);
  assert.equal(r.stats.destroyed[0].cause, "planet");
  // Laser behind a planet does not hit.
  const s2 = quiet(newGame());
  place(s2, "p0s1", add(planet, V(-2, 0)), V(1, 0));
  place(s2, "p1s1", add(planet, V(1, 0)));
  r = resolveTurn(s2, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  assert.equal(unitById(r.state, "p1s1").energy, 6);
  assert.equal(clearLine(s2.rules, add(planet, V(-2, 0)), add(planet, V(2, 0))).length, 2);
  // Without planets the same laser hits.
  const s3 = quiet(newGame({ planets: false }));
  place(s3, "p0s1", add(planet, V(-2, 0)), V(1, 0));
  place(s3, "p1s1", add(planet, V(1, 0)));
  r = resolveTurn(s3, [orders({ p0s1: { laser: V(1, 0) } }), orders()]);
  assert.ok(r.frames.find((f) => f.phase === "weapons").effects.some((e) => e.type === "damage" && e.id === "p1s1"));
  // Units cannot be set up on a planet.
  const su = defaultSetup(s.rules, 0);
  assert.ok(!validSetup(s.rules, 0, { ...su, base: toAxial(3, 15) }));
});

test("one weapon per ship and turn; torpedoes launch only forwards of a moving ship", async () => {
  const { weaponOptions } = await import("../engine/core.js");
  const s = quiet(newGame());
  const u = place(s, "p0s1", toAxial(4, 11), V(1, 0));
  const o = sanitizeOrders(s, 0, orders({ p0s1: { laser: V(1, 0), launch: V(1, 0) } })).units.p0s1;
  assert.deepEqual(o.laser, V(1, 0));
  assert.equal(o.launch, null);
  const launches = weaponOptions(s, u, "torpedo").map((d) => `${d.q},${d.r}`).sort();
  assert.deepEqual(launches, ["0,0", "0,1", "1,-1", "1,0", "0,-1", "-1,1"].sort());
  // Two torpedoes in flight from the same ship, fired on consecutive turns.
  let r = resolveTurn(s, [orders({ p0s1: { launch: V(0, 0) } }), orders()]);
  r = resolveTurn(r.state, [orders({ p0s1: { launch: V(0, 0) } }), orders()]);
  assert.equal(r.state.weapons.filter((w) => w.from === "p0s1").length, 2);
});

test("torpedoes intercept enemy torpedoes; blasts destroy torpedoes in range", async () => {
  const { setRule } = await import("../engine/rules.js");
  const run = (intercept) => {
    const s = quiet(newGame());
    if (!intercept) s.rules = setRule(s.rules, "torpedo.intercept", false);
    const c = toAxial(3, 10);
    // Two torpedoes flying head-on, far from all units: after the move they are adjacent.
    s.weapons.push({ id: "T1", kind: "torpedo", owner: 0, from: "p0s1", pos: c, vel: V(1, 0) });
    s.weapons.push({ id: "T2", kind: "torpedo", owner: 1, from: "p1s1", pos: add(c, V(3, 0)), vel: V(-1, 0) });
    // An own torpedo next to T1's target: caught in the blast, it does not explode itself.
    s.weapons.push({ id: "T3", kind: "torpedo", owner: 0, from: "p0s2", pos: add(c, V(0, 1)), vel: V(0, 0) });
    return resolveTurn(s, [orders(), orders()], { frames: true });
  };
  let r = run(true);
  assert.equal(r.state.weapons.length, 0);
  assert.deepEqual(r.stats.intercepted, [1, 0]);
  assert.ok(r.state.units.every((u) => u.energy === unitById(newGame(), u.id).energy));
  // Without interception they fly past each other.
  r = run(false);
  assert.equal(r.state.weapons.length, 3);
  assert.deepEqual(r.stats.intercepted, [0, 0]);
});

test("laser along the border of two hexes hits both", async () => {
  const { clearLine } = await import("../engine/core.js");
  const { setRule } = await import("../engine/rules.js");
  const s = newGame();
  const c = toAxial(2, 8);
  const cells = clearLine(s.rules, c, add(c, V(1, 1))).map((x) => `${x.q - c.q},${x.r - c.r}`).sort();
  assert.deepEqual(cells, ["0,0", "0,1", "1,0", "1,1"].sort());
  const off = clearLine(setRule(s.rules, "laser.edgeBoth", false), c, add(c, V(1, 1)));
  assert.equal(off.length, 3);
  // In a real turn: two enemies left and right of the border line both take damage.
  const g = quiet(newGame());
  // Ship flies with momentum (1,1) and fires straight ahead: the beam runs from c+(1,1)
  // to c+(2,2), exactly along the border of c+(2,1) and c+(1,2).
  place(g, "p0s1", c, V(1, 1));
  place(g, "p1s1", add(c, V(2, 1)));
  place(g, "p1s2", add(c, V(1, 2)));
  const r = resolveTurn(g, [orders({ p0s1: { laser: V(0, 0) } }), orders()]);
  assert.ok(r.state.weapons.length === 0);
  assert.equal(unitById(r.state, "p1s1").energy, 5);
  assert.equal(unitById(r.state, "p1s2").energy, 5);
});
