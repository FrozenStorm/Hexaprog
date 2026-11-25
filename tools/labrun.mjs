// Developer tool: plays an AI Lab series in Node on all CPU cores and prints the
// statistics per rule variant. Optional: writes all rows as CSV.
//
//   node tools/labrun.mjs --a hard --b medium --games 40 [--seed 1] [--csv out.csv]
//     [--variant "Laser 2" laser.damage=2 --variant "Schub 2" ship.thrust=2]
//
// Without --variant only the standard rules are played. Sides alternate every game.
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import os from "node:os";
import fs from "node:fs";
import { expandGames, playGame, summarize, toCSV } from "../lab/runner.js";
import { setRule, DEFAULT_RULES } from "../engine/rules.js";

if (!isMainThread) {
  parentPort.on("message", (game) => {
    try { parentPort.postMessage(playGame(game).row); } catch (e) { parentPort.postMessage({ error: String(e.stack || e) }); }
  });
} else {
  const argv = process.argv.slice(2);
  const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : argv[i + 1]; };
  // Variants: --variant NAME key=value key=value ...
  const variants = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--variant") continue;
    const name = argv[++i];
    let rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    while (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      const [k, v] = argv[++i].split("=");
      const val = v === "true" ? true : v === "false" ? false : Number.isNaN(Number(v)) ? v : Number(v);
      rules = setRule(rules, k, val);
    }
    variants.push({ name, rules });
  }
  if (!variants.length) variants.push({ name: "Standard", rules: {} });
  const games = expandGames({
    variants, games: Number(arg("games", 20)), levels: [arg("a", "medium"), arg("b", "medium")],
    seed: Number(arg("seed", 1)), swapSides: true,
  });
  const rows = [];
  const t0 = Date.now();
  const n = Math.min(os.cpus().length, games.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url));
    const feed = () => { if (next < games.length) w.postMessage(games[next++]); else { w.terminate(); resolve(); } };
    w.on("message", (row) => {
      if (row.error) { reject(new Error(row.error)); return; }
      rows.push(row);
      process.stderr.write(`\r${rows.length}/${games.length}`);
      feed();
    });
    w.on("error", reject);
    feed();
  })));
  process.stderr.write("\n");
  const A = arg("a", "medium"), B = arg("b", "medium");
  for (const sum of summarize(rows)) {
    const rs = rows.filter((r) => r.variant === sum.variant);
    const winsA = rs.filter((r) => (r.winner === 1 && r.level1 === A) || (r.winner === 2 && r.level2 === A)).length;
    console.log(`${sum.variant}: ${sum.games} Spiele, Sieg Spieler 1 ${(sum.win1 * 100).toFixed(0)}%, Spieler 2 ${(sum.win2 * 100).toFixed(0)}%, ` +
      `unentschieden ${(sum.draw * 100).toFixed(0)}%, ${A !== B ? `${A} gewinnt ${(winsA / sum.games * 100).toFixed(0)}%, ` : ""}` +
      `Ø ${sum.turns.toFixed(1)} Züge, Zeitlimit ${(sum.timeouts * 100).toFixed(0)}%, ` +
      `Verluste/Spiel: Laser ${sum.byLaser.toFixed(2)} Torpedo ${sum.byTorpedo.toFixed(2)} Kollision ${sum.byCollision.toFixed(2)} (eigene ${sum.ownCollision.toFixed(2)}) Rand ${sum.byEdge.toFixed(2)}`);
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const csv = arg("csv", null);
  if (csv) fs.writeFileSync(csv, toCSV(rows));
}
