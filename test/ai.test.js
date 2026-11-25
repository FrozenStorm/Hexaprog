import test from "node:test";
import assert from "node:assert/strict";
import { newGame, sanitizeOrders } from "../engine/core.js";
import { chooseOrders, LEVELS } from "../ai/ai.js";
import { playGame, expandGames, summarize } from "../lab/runner.js";
import { makeRng } from "../ai/rng.js";

test("AI orders are legal at every level", () => {
  const s = newGame();
  for (const level of Object.keys(LEVELS)) {
    for (const p of [0, 1]) {
      const o = chooseOrders(s, p, { level, rng: makeRng(5) });
      assert.deepEqual(sanitizeOrders(s, p, o), JSON.parse(JSON.stringify(sanitizeOrders(s, p, o))));
      for (const [id, uo] of Object.entries(o.units)) {
        const clean = sanitizeOrders(s, p, o).units[id];
        assert.deepEqual(clean.laser, uo.laser ?? null, `${level} laser`);
        assert.deepEqual(clean.launch, uo.launch ?? null, `${level} launch`);
      }
    }
  }
});

test("AI games end and are repeatable with the same seed", () => {
  const g = { id: 0, variant: "x", rules: { maxTurns: 25 }, levels: ["easy", "medium"], seed: 42 };
  const a = playGame(g), b = playGame(g);
  assert.ok(a.row.turns <= 25);
  assert.ok(["draw", 1, 2].includes(a.row.winner));
  assert.deepEqual(a.row, b.row);
  assert.equal(a.replay.orders.length, a.row.turns);
});

test("lab expands variants and summarizes", () => {
  const games = expandGames({ variants: [{ name: "A", rules: {} }, { name: "B", rules: { laser: { damage: 2 } } }], games: 2, levels: ["easy", "easy"], swapSides: true, seed: 1 });
  assert.equal(games.length, 4);
  assert.deepEqual(games[1].levels, ["easy", "easy"]);
  const rows = games.map((g) => playGame({ ...g, rules: { ...g.rules, maxTurns: 10 } }).row);
  const sum = summarize(rows);
  assert.equal(sum.length, 2);
  assert.equal(sum[0].games, 2);
});

test("AI setups are valid for both players", async () => {
  const { chooseSetup } = await import("../ai/setup.js");
  const { validSetup } = await import("../engine/core.js");
  const rng = makeRng(3);
  for (let i = 0; i < 50; i++) for (const p of [0, 1]) assert.ok(validSetup({}, p, chooseSetup({}, p, rng)));
});
