// Rule parameters. Everything a rule idea might change lives here, so the AI Lab
// can play the same game with different values. Values follow docs/rules/regeln.md.

export const DEFAULT_RULES = Object.freeze({
  // Board: 19 rows, even rows have 14 hexes, odd rows 13 (shifted half a hex).
  rows: 19,
  cols: 14,

  base: { energy: 6, regen: 2, ramDamage: 4 },
  ship: { energy: 6, regen: 0, thrust: 1, torpedoes: 2 },
  shipsPerPlayer: 3,

  laser: { damage: 1, cost: 0, spread: 1, edgeBoth: true },
  // edgeBoth: a beam running exactly along the border of two hexes hits both
  torpedo: { damage: 2, radius: 1, thrust: 1, spread: 1, perShip: 0, forwardOnly: true, intercept: true },
  // perShip 0 = any number of torpedoes in flight; forwardOnly: torpedos only accelerate
  // (launch and thrust only into the front half of the flight direction);
  // intercept: enemy torpedoes trigger a torpedo and blasts destroy torpedoes in range
  /** Each ship fires at most one weapon per turn: a laser or a torpedo. */
  oneWeaponPerTurn: true,

  // Rule details and their alternatives (see docs/rules/regeln.md):
  /** A hit destroys a unit when the damage is larger than its energy ("negative") or when energy reaches 0 ("zero"). */
  destroyWhen: "negative",
  /** A ship that ends its move outside the board: "destroy" or "stop" (stays on its last hex inside, momentum 0). */
  edge: "destroy",
  /** Ship moving onto a base: "ram" (ship destroyed, base takes base.ramDamage), "destroyBoth" or "ignore". */
  baseCollision: "ram",
  /** Lasers also damage own units. */
  friendlyFire: true,
  /** Units a player may lose; losing this many loses the game (both in the same turn: more energy wins). */
  lossLimit: 2,
  /** After this many turns the game ends: "draw" or "points" (fewer losses, then more energy wins). */
  maxTurns: 40,
  timeout: "points",
  /** The coloured hexes (4 green, 1 light) are planets: no flying or shooting through them. */
  planets: true,
  /** Players set up base, ships and momentum markers secretly in their own rows (bottom / top). */
  setupRows: 4,
  /** Base position (col,row) of player 1 in the default setup; player 2 is point-mirrored. */
  base1: { col: 6, row: 17 },
});

export function mergeRules(over = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_RULES));
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") Object.assign(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** Set a value by dotted path ("laser.damage") on a rules object (copy). */
export function setRule(rules, path, value) {
  const out = JSON.parse(JSON.stringify(rules));
  const parts = path.split(".");
  let o = out;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
  return out;
}

/** The numeric / choice parameters shown in the AI Lab rule editor. */
export const RULE_FIELDS = [
  ["ship.energy", "Schiff Energie"], ["ship.regen", "Schiff Regeneration"], ["ship.thrust", "Schiff Schub"],
  ["ship.torpedoes", "Schiff Torpedoplätze"], ["shipsPerPlayer", "Schiffe pro Spieler"],
  ["base.energy", "Basis Energie"], ["base.regen", "Basis Regeneration"], ["base.ramDamage", "Basis Schaden durch Rammen"],
  ["laser.damage", "Laser Schaden"], ["laser.cost", "Laser Kosten"], ["laser.spread", "Laser Abweichung"], ["laser.edgeBoth", "Laser auf Feldgrenze trifft beide Felder", [true, false]],
  ["torpedo.damage", "Torpedo Schaden"], ["torpedo.radius", "Torpedo Radius"], ["torpedo.thrust", "Torpedo Schub"],
  ["torpedo.spread", "Torpedo Abweichung"], ["torpedo.forwardOnly", "Torpedo nur Vorwärtsschub", [true, false]], ["oneWeaponPerTurn", "Nur 1 Waffe pro Schiff und Zug", [true, false]], ["torpedo.perShip", "Torpedos gleichzeitig pro Schiff (0 = beliebig)"], ["torpedo.intercept", "Torpedos fangen Torpedos ab", [true, false]],
  ["lossLimit", "Verlorene Einheiten bis Niederlage"], ["maxTurns", "Max. Züge"],
  ["destroyWhen", "Zerstört bei", ["negative", "zero"]],
  ["edge", "Spielfeldrand", ["destroy", "stop"]],
  ["baseCollision", "Schiff fliegt auf Basis", ["ram", "destroyBoth", "ignore"]], ["setupRows", "Reihen der Startzone"], ["planets", "Planeten blockieren", [true, false]],
  ["friendlyFire", "Eigenbeschuss", [true, false]],
  ["timeout", "Nach max. Zügen", ["points", "draw"]],
];
