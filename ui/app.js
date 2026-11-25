// Game screen: planning on the board, animated execution, game modes
// (against the AI, duel on one device, AI vs AI, online, replay).
import { add, sub, eq, key, len, diskCached, line } from "../engine/hex.js";
import {
  newGame, resolveTurn, torpThrustOptions, inSetupZone, isPlanet, clearLine, laserPreview, setupZone, defaultSetup, validSetup, liveShips, unitById, torpsOf, emptyOrders, canFireLaser, canLaunch,
  weaponOptions, maxEnergy, PLAYER_NAMES,
} from "../engine/core.js";
import { Board } from "./board.js";
import { LEVEL_NAMES } from "../ai/ai.js";
import { chooseSetup } from "../ai/setup.js";
import { makeRng } from "../ai/rng.js";
import { openLab } from "./lab.js";
import { openLobby, submitOnlineOrders, submitOnlineSetup, leaveOnlineGame } from "../net/online.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const TOOL_NAMES = { thrust: "Schub", laser: "Laser", launch: "Torpedo", steer: "Steuern" };
const CAUSE = { ram: "Basis gerammt", "ram-own": "eigene Basis gerammt", laser: "Laser", torpedo: "Torpedo", "laser+torpedo": "Laser und Torpedo", "torpedo+laser": "Torpedo und Laser",
  collision: "Kollision", "collision-own": "Kollision mit eigenem Schiff", edge: "Spielfeldrand verlassen", planet: "auf Planet geprallt" };

const G = {
  mode: null,        // ai | duel | watch | online | replay
  state: null,
  board: null,
  info: null,        // unit id -> { owner, kind, n, maxEnergy }
  orders: [emptyOrders(), emptyOrders()],
  planner: 0,        // whose orders are edited right now
  humans: [true, false],
  sel: null,         // { id, tool, torp }
  busy: false,
  level: store.get("hexaprog.level") || "medium",
  log: [],
  ruleOverrides: null,
  online: null,      // { me, submitted, opponentName }
  replay: null,      // { states, frames, idx, levels }
  history: [],       // played turns: [{ before, orders }]
  view: null,        // index into history while looking back, null = live
  watchTimer: null,
  epoch: 0,          // changes when a new game starts or the game is left: running animations stop
};
window.__hexaprog = G; // for debugging and tests

// ---------------------------------------------------------------------------
// AI worker
// ---------------------------------------------------------------------------
let worker = null, reqId = 0;
const pending = new Map();
function aiOrders(state, player, level) {
  if (!worker) {
    try {
      worker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data.orders); } };
    } catch (e) { worker = false; }
  }
  if (!worker) return import("../ai/ai.js").then((m) => m.chooseOrders(state, player, { level }));
  const id = ++reqId;
  return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ id, state, player, level }); });
}

// ---------------------------------------------------------------------------
// Start / modes
// ---------------------------------------------------------------------------

export function startGame(mode, opts = {}) {
  stopWatch();
  G.epoch++;
  G.mode = mode;
  G.ruleOverrides = opts.rules || null;
  G.state = opts.state || newGame(G.ruleOverrides);
  G.humans = mode === "ai" ? [true, false] : mode === "duel" ? [true, true] : mode === "online" ? [opts.me === 0, opts.me === 1] : [false, false];
  G.online = mode === "online" ? { me: opts.me, submitted: false, names: opts.names || PLAYER_NAMES } : null;
  G.replay = mode === "replay" ? opts.replay : null;
  G.levels = opts.levels || [G.level, G.level];
  G.planner = mode === "online" ? opts.me : 0;
  G.orders = [emptyOrders(), emptyOrders()];
  G.sel = null;
  G.busy = false;
  G.log = [];
  G.history = [];
  G.view = null;
  G.histPlaying = false;
  G.info = new Map(G.state.units.map((u) => [u.id, { owner: u.owner, kind: u.kind, n: u.n, maxEnergy: maxEnergy(G.state.rules, u) }]));
  G.board = new Board($("board"), G.state.rules, { onCell });
  ["menu", "gameover", "handover", "lobby", "lab"].forEach((id) => $(id).classList.remove("show"));
  $("menu-resume").style.display = "";
  G.phase = "play";
  if (opts.state) { render(); return; }
  // Setup: every player places base, ships and momentum markers secretly in the own zone.
  G.phase = "setup";
  const rng = makeRng(Date.now());
  G.setups = [0, 1].map((p) => (G.humans[p] ? null : chooseSetup(G.state.rules, p, rng)));
  if (mode === "online") G.setups = [null, null];
  G.planner = mode === "online" ? opts.me : G.humans[0] ? 0 : 1;
  newDraft();
  if (!G.humans[0] && !G.humans[1]) beginPlay();
  else render();
}

// ---------------------------------------------------------------------------
// Setup phase
// ---------------------------------------------------------------------------

/** Items placed in order: base, then each ship followed by its momentum marker. */
function setupItems() {
  const items = [{ kind: "base", label: "Basis" }];
  for (let i = 0; i < G.state.rules.shipsPerPlayer; i++) {
    items.push({ kind: "ship", i, label: `Schiff ${i + 1}` }, { kind: "mom", i, label: `Schwung ${i + 1}` });
  }
  return items;
}
function newDraft() {
  G.draft = { base: null, ships: Array.from({ length: G.state.rules.shipsPerPlayer }, () => ({ pos: null, mom: null })) };
  G.setupStep = 0;
}
const draftGet = (it) => (it.kind === "base" ? G.draft.base : it.kind === "ship" ? G.draft.ships[it.i].pos : G.draft.ships[it.i].mom);
function draftSet(it, c) {
  if (it.kind === "base") G.draft.base = c;
  else if (it.kind === "ship") G.draft.ships[it.i].pos = c;
  else G.draft.ships[it.i].mom = c;
}
const draftComplete = () => setupItems().every((it) => draftGet(it));

function setupView() {
  const p = G.planner;
  const units = [];
  if (G.draft.base) units.push({ id: `p${p}b`, pos: G.draft.base, vel: { q: 0, r: 0 }, energy: G.state.rules.base.energy, torpedoes: 0, alive: true });
  G.draft.ships.forEach((x, i) => {
    if (!x.pos) return;
    const vel = x.mom ? { q: x.mom.q - x.pos.q, r: x.mom.r - x.pos.r } : { q: 0, r: 0 };
    units.push({ id: `p${p}s${i + 1}`, pos: x.pos, vel, energy: G.state.rules.ship.energy, torpedoes: G.state.rules.ship.torpedoes, alive: true });
  });
  return { units, weapons: [] };
}

function onSetupCell(c) {
  if (!inSetupZone(G.state.rules, G.planner, c)) return;
  const items = setupItems();
  const it = items[G.setupStep];
  if (!it) return;
  if (it.kind !== "mom" && isPlanet(G.state.rules, c)) return;
  if (it.kind !== "mom") {
    // Units need their own hex.
    const taken = [G.draft.base, ...G.draft.ships.map((x) => x.pos)].some((x, k) => x && eq(x, c) && !(it.kind === "base" ? k === 0 : k === it.i + 1));
    if (taken) return;
  }
  draftSet(it, c);
  if (it.kind === "ship" && !G.draft.ships[it.i].mom) G.draft.ships[it.i].mom = c;
  const next = items.findIndex((x, k) => k > G.setupStep && (!draftGet(x) || (x.kind === "mom" && eq(draftGet(x), G.draft.ships[x.i].pos))));
  G.setupStep = next >= 0 ? next : items.findIndex((x) => !draftGet(x));
  if (G.setupStep < 0) G.setupStep = items.length;
  render();
}

function renderSetupSide(side) {
  const p = G.planner;
  const items = setupItems();
  const h = document.createElement("div");
  h.className = "hint";
  h.innerHTML = `<b class="p${p}c">${playerLabel(p)}</b>: Stelle verdeckt deine Basis, deine Schiffe und ihre Schwung-Marker in deiner Zone auf (${p === 0 ? "unterste" : "oberste"} ${G.state.rules.setupRows} Reihen). Der Schwung-Marker zeigt, wohin das Schiff im ersten Zug fliegt; auf dem Schiff selbst heisst Schwung 0.`;
  side.appendChild(h);
  const card = document.createElement("div");
  card.className = "card";
  const grid = document.createElement("div");
  grid.className = "tools";
  items.forEach((it, k) => {
    const b = document.createElement("button");
    b.textContent = it.label;
    if (draftGet(it)) b.classList.add("set");
    if (k === G.setupStep) b.classList.add("on");
    b.disabled = it.kind === "mom" && !G.draft.ships[it.i].pos;
    b.onclick = () => { G.setupStep = k; render(); };
    grid.appendChild(b);
  });
  card.appendChild(grid);
  side.appendChild(card);
  const row = document.createElement("div");
  row.className = "row";
  const mk = (label, fn, primary, disabled) => {
    const b = document.createElement("button");
    b.textContent = label; b.onclick = fn; b.disabled = !!disabled;
    if (primary) b.className = "primary";
    row.appendChild(b);
  };
  const load = (su) => { G.draft = JSON.parse(JSON.stringify(su)); G.setupStep = items.length; render(); };
  mk("Standard", () => load(defaultSetup(G.state.rules, p)));
  mk("Zufällig", () => load(chooseSetup(G.state.rules, p, makeRng(Date.now()))));
  mk("Leeren", () => { newDraft(); render(); });
  side.appendChild(row);
  const done = document.createElement("button");
  done.className = "primary";
  done.textContent = "Aufstellung fertig";
  done.disabled = !draftComplete() || !validSetup(G.state.rules, p, G.draft);
  done.onclick = confirmSetup;
  side.appendChild(done);
}

function confirmSetup() {
  const p = G.planner;
  const su = JSON.parse(JSON.stringify(G.draft));
  if (!validSetup(G.state.rules, p, su)) return;
  G.setups[p] = su;
  if (G.mode === "online") {
    G.online.submitted = true;
    render();
    submitOnlineSetup(su);
    return;
  }
  const other = 1 - p;
  if (!G.setups[other] && G.humans[other]) {
    G.planner = other;
    newDraft();
    $("handover-title").textContent = `${PLAYER_NAMES[other]} stellt auf`;
    $("handover-text").textContent = `Gib das Gerät weiter. Die Aufstellung von ${PLAYER_NAMES[p]} bleibt verdeckt.`;
    $("handover").classList.add("show");
    render();
    return;
  }
  beginPlay();
}

function beginPlay() {
  G.state = newGame(G.ruleOverrides, G.setups);
  G.phase = "play";
  G.planner = G.mode === "online" ? G.online.me : 0;
  if (G.online) G.online.submitted = false;
  G.sel = null;
  render();
  if (G.mode === "watch") scheduleWatch();
}

function playerLabel(p) {
  if (G.mode === "online") return `${G.online.names[p]}`;
  if (G.mode === "ai") return p === 0 ? "Du" : `KI (${LEVEL_NAMES[G.levels[1]]})`;
  if (G.mode === "watch" || G.mode === "replay") return `${PLAYER_NAMES[p]} (KI ${LEVEL_NAMES[G.levels[p]] || G.levels[p]})`;
  return PLAYER_NAMES[p];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function liveView(s) {
  return { units: s.units.filter((u) => u.alive), weapons: s.weapons };
}

function render() {
  const s = G.state;
  if (G.phase === "setup") {
    const hidden = G.online && G.online.submitted;
    G.board.show(hidden ? { units: [], weapons: [] } : setupView(), G.info);
    G.board.clearOverlay();
    if (!hidden) G.board.options(setupZone(s.rules, G.planner).filter((c) => !isPlanet(s.rules, c)), "setup", null);
    const side = $("side");
    side.innerHTML = "";
    if (hidden) side.innerHTML = `<div class="hint">Warte auf die Aufstellung von ${G.online.names[1 - G.online.me]}…</div>`;
    else renderSetupSide(side);
    $("status").textContent = `Aufstellung · ${playerLabel(G.planner)}`;
    return;
  }
  if (G.view !== null) return renderHistory();
  G.board.show(liveView(s), G.info);
  for (const [id, g] of G.board.unitEls) g.classList.toggle("sel", !!(G.sel && G.sel.id === id));
  renderOverlay();
  renderSide();
  const who = G.mode === "watch" || G.mode === "replay" ? "" : planningHuman() ? ` · ${playerLabel(G.planner)} plant` : "";
  $("status").textContent = s.over ? "Spiel vorbei" : `Zug ${s.turn}${who} · Verluste ${s.losses[0]}:${s.losses[1]} (verloren bei ${s.rules.lossLimit})`;
}

const planningHuman = () => G.view === null && !G.busy && !G.state.over && G.humans[G.planner] && !(G.online && G.online.submitted);

/** Option cells of the selected tool: [{ cell, vec }]. */
function toolOptions() {
  const s = G.state;
  if (!G.sel || !planningHuman()) return [];
  const u = unitById(s, G.sel.id);
  if (!u || !u.alive) return [];
  const mom = add(u.pos, u.vel);
  if (G.sel.tool === "thrust") return diskCached(s.rules.ship.thrust).map((d) => ({ cell: add(mom, d), vec: d }));
  if (G.sel.tool === "laser") {
    const base = s.rules.laser.mode === "ship" ? u.pos : mom;
    return canFireLaser(s, u) ? weaponOptions(s, u, "laser").map((d) => ({ cell: add(base, d), vec: d })) : [];
  }
  if (G.sel.tool === "launch") return canLaunch(s, u) ? weaponOptions(s, u, "torpedo").map((d) => ({ cell: add(mom, d), vec: d })) : [];
  if (G.sel.tool === "steer") {
    const w = s.weapons.find((x) => x.id === G.sel.torp);
    if (!w) return [];
    const m = add(w.pos, w.vel);
    return torpThrustOptions(s, w).map((d) => ({ cell: add(m, d), vec: d }));
  }
  return [];
}

function unitOrders(p, id) {
  const o = G.orders[p];
  if (!o.units[id]) o.units[id] = { thrust: { q: 0, r: 0 }, laser: null, launch: null };
  return o.units[id];
}

function renderOverlay() {
  const b = G.board, s = G.state;
  b.clearOverlay();
  if (!planningHuman()) return;
  const p = G.planner;
  const markers = []; // weapon symbols, drawn last so option cells and zones do not cover them
  // Previews of all planned orders of the planning player.
  for (const u of liveShips(s, p)) {
    const o = unitOrders(p, u.id);
    const end = add(add(u.pos, u.vel), o.thrust || { q: 0, r: 0 });
    const vel = add(u.vel, o.thrust || { q: 0, r: 0 });
    if (o.laser) {
      const lp = laserPreview(s.rules, u, o.laser, end);
      b.zone(lp.cells, "laser");
      b.arrow(lp.spawn, lp.to, "laser");
      markers.push([lp.spawn, "laser", sub(lp.to, lp.spawn)]);
    }
    b.arrow(u.pos, end, `p${p}`, p);
    if (!eq(u.pos, end)) b.ghost(end, `p${p}`);
    if (len(vel)) b.arrow(end, add(end, vel), "torp", undefined);
    if (o.launch) {
      const tv = add(u.vel, o.launch), spawn = add(u.pos, tv);
      b.arrow(spawn, add(spawn, tv), "torp");
      markers.push([spawn, "torpedo", tv]);
    }
  }
  for (const w of s.weapons) {
    if (w.kind !== "torpedo" || w.owner !== p) continue;
    const t = G.orders[p].torps[w.id] || { q: 0, r: 0 };
    b.arrow(w.pos, add(add(w.pos, w.vel), t), "torp");
  }
  // Options of the selected tool.
  const opts = toolOptions();
  if (opts.length) {
    const u = unitById(s, G.sel.id);
    let cur = null;
    if (G.sel.tool === "steer") cur = G.orders[p].torps[G.sel.torp] || { q: 0, r: 0 };
    else cur = unitOrders(p, u.id)[G.sel.tool];
    const selCell = cur ? opts.find((o) => eq(o.vec, cur)) : null;
    b.options(opts.map((o) => o.cell), G.sel.tool, selCell ? key(selCell.cell) : null);
  }
  for (const [c, kind, vel] of markers) b.marker(c, kind, p, vel);
}

function renderSide() {
  const side = $("side");
  const s = G.state;
  side.innerHTML = "";
  if (G.mode === "replay") return renderReplaySide(side);
  if (G.mode === "watch") return renderWatchSide(side);
  if (G.history.length) side.appendChild(historyBar());
  if (planningHuman()) {
    const p = G.planner;
    const h = document.createElement("div");
    h.className = "hint";
    h.innerHTML = `<b class="p${p}c">${playerLabel(p)}</b>: Schiff wählen, dann Schub, Laser oder Torpedo und ein markiertes Feld antippen.`;
    side.appendChild(h);
    for (const u of liveShips(s, p)) side.appendChild(shipCard(u, p));
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = G.mode === "duel" && p === 0 ? "Planung fertig" : "Zug ausführen";
    btn.onclick = confirmPlan;
    side.appendChild(btn);
  } else if (!s.over) {
    const h = document.createElement("div");
    h.className = "hint";
    h.textContent = G.online && G.online.submitted ? `Warte auf ${G.online.names[1 - G.online.me]}…` : G.busy ? "Zug wird ausgeführt…" : "";
    side.appendChild(h);
  }
  side.appendChild(statusCards());
  side.appendChild(logBox());
}

function shipCard(u, p) {
  const s = G.state;
  const o = unitOrders(p, u.id);
  const card = document.createElement("div");
  card.className = "card" + (G.sel && G.sel.id === u.id ? " sel" : "");
  const torps = torpsOf(s, u.id);
  card.innerHTML = `<div class="head"><span class="name p${p}c">Schiff ${u.n}</span>
    <span class="meta">Energie ${u.energy}/${s.rules.ship.energy} · Torpedos ${u.torpedoes} · Tempo ${len(u.vel)}</span></div>`;
  card.querySelector(".head").onclick = () => select(u.id, (G.sel && G.sel.id === u.id && G.sel.tool) || "thrust");
  const tools = document.createElement("div");
  tools.className = "tools";
  const mk = (tool, label, enabled, isSet, torp) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !enabled;
    if (isSet) b.classList.add("set");
    if (G.sel && G.sel.id === u.id && G.sel.tool === tool && (!torp || G.sel.torp === torp)) b.classList.add("on");
    b.onclick = () => select(u.id, tool, torp);
    tools.appendChild(b);
  };
  mk("thrust", "Schub", true, o.thrust && len(o.thrust) > 0);
  mk("laser", "Laser", canFireLaser(s, u), !!o.laser);
  mk("launch", "Torpedo", canLaunch(s, u), !!o.launch);
  card.appendChild(tools);
  if (torps.length) {
    const t2 = document.createElement("div");
    t2.className = "tools";
    torps.forEach((w, i) => {
      const b = document.createElement("button");
      b.textContent = `Torpedo ${i + 1} steuern`;
      if (G.sel && G.sel.tool === "steer" && G.sel.torp === w.id) b.classList.add("on");
      const t = G.orders[p].torps[w.id];
      if (t && len(t)) b.classList.add("set");
      b.onclick = () => select(u.id, "steer", w.id);
      t2.appendChild(b);
    });
    card.appendChild(t2);
  }
  return card;
}

function statusCards(s = G.state) {
  const box = document.createElement("div");
  box.className = "card";
  const rows = [0, 1].map((p) => {
    const units = s.units.filter((u) => u.owner === p);
    const txt = units.map((u) => {
      const n = u.kind === "base" ? "Basis" : `S${u.n}`;
      return u.alive ? `${n} ${u.energy}⚡${u.kind === "ship" ? ` ${u.torpedoes}T` : ""}` : `<s>${n}</s>`;
    }).join(" · ");
    return `<div><b class="p${p}c">${playerLabel(p)}</b> <span class="meta">${txt}</span></div>`;
  });
  box.innerHTML = rows.join("");
  return box;
}

function logBox() {
  const box = document.createElement("div");
  box.className = "log";
  box.innerHTML = G.log.slice(-30).reverse().join("<br>");
  return box;
}

// ---------------------------------------------------------------------------
// Planning input
// ---------------------------------------------------------------------------

function select(id, tool, torp) {
  if (!planningHuman()) return;
  G.sel = { id, tool, torp };
  render();
}

function onCell(c) {
  if (G.phase === "setup") { if (!(G.online && G.online.submitted)) onSetupCell(c); return; }
  if (!planningHuman()) return;
  const p = G.planner;
  const opt = toolOptions().find((o) => eq(o.cell, c));
  if (opt) {
    if (G.sel.tool === "steer") {
      G.orders[p].torps[G.sel.torp] = opt.vec;
    } else {
      const o = unitOrders(p, G.sel.id);
      const cur = o[G.sel.tool];
      if (G.sel.tool === "thrust") o.thrust = opt.vec;
      else {
        o[G.sel.tool] = cur && eq(cur, opt.vec) ? null : opt.vec; // tap again to cancel
        // One weapon per turn: choosing a laser cancels the torpedo and vice versa.
        if (G.state.rules.oneWeaponPerTurn && o[G.sel.tool]) o[G.sel.tool === "laser" ? "launch" : "laser"] = null;
      }
    }
    render();
    return;
  }
  const u = liveShips(G.state, p).find((x) => eq(x.pos, c));
  if (u) select(u.id, G.sel && G.sel.id !== u.id ? G.sel.tool === "steer" ? "thrust" : G.sel.tool : "thrust");
  else { G.sel = null; render(); }
}

async function confirmPlan() {
  const p = G.planner;
  G.sel = null;
  if (G.mode === "duel" && p === 0) {
    G.planner = 1;
    $("handover-title").textContent = `${PLAYER_NAMES[1]} ist dran`;
    $("handover-text").textContent = `Gib das Gerät weiter. Die Planung von ${PLAYER_NAMES[0]} bleibt verdeckt.`;
    $("handover").classList.add("show");
    render();
    return;
  }
  if (G.mode === "online") {
    G.online.submitted = true;
    render();
    submitOnlineOrders(G.state.turn, G.orders[p]);
    return;
  }
  G.busy = true;
  render();
  const epoch = G.epoch;
  if (G.mode === "ai") G.orders[1] = await aiOrders(G.state, 1, G.levels[1]);
  if (G.epoch === epoch) await executeTurn(G.orders);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

async function executeTurn(orders, { animate = true } = {}) {
  G.busy = true;
  G.sel = null;
  // A turn coming in (online, watch) ends looking back.
  if (G.histPlaying) { G.histPlaying = false; G.epoch++; }
  G.view = null;
  const before = G.state;
  const r = resolveTurn(before, orders);
  if (animate && !(await animateTurn(before, r))) return r;
  logTurn(before, r);
  if (G.mode !== "replay") G.history.push({ before, orders });
  G.state = r.state;
  G.orders = [emptyOrders(), emptyOrders()];
  G.planner = G.mode === "online" ? G.online.me : 0;
  if (G.online) G.online.submitted = false;
  G.busy = false;
  render();
  if (G.state.over) showGameOver();
  return r;
}
/** Plays the frames of a resolved turn on the board; false if the game was left meanwhile. */
async function animateTurn(before, r) {
  const epoch = G.epoch;
  G.board.clearOverlay();
  for (const f of r.frames.slice(1)) {
    G.board.show(f, G.info);
    G.board.fx(f.effects, G.info);
    $("status").textContent = `Zug ${before.turn} · ${PHASES[f.phase]}`;
    await sleep(f.phase === "weapons" ? 1100 : f.phase === "end" ? 350 : 650);
    if (G.epoch !== epoch) return false;
  }
  G.board.clearFx();
  return true;
}
const PHASES = { fire: "Waffen abfeuern", thrust: "Schub", move: "Schiffe bewegen", weapons: "Waffen bewegen", end: "Energie und Aufräumen" };

function logTurn(before, r) {
  const lines = [];
  const name = (id) => {
    const m = G.info.get(id);
    return `<span class="p${m.owner}c">${m.kind === "base" ? "Basis" : `Schiff ${m.n}`}</span>`;
  };
  const fx = r.frames.find((f) => f.phase === "weapons");
  if (fx) for (const e of fx.effects) if (e.type === "damage") lines.push(`${name(e.id)} nimmt ${e.amount} Schaden`);
  for (const d of r.stats.destroyed) lines.push(`${name(d.id)} zerstört (${CAUSE[d.cause] || d.cause})`);
  const shots = r.stats.lasers[0] + r.stats.lasers[1], launches = r.stats.launches[0] + r.stats.launches[1];
  const head = `<b>Zug ${before.turn}</b>: ${shots} Laser, ${launches} Torpedo${launches === 1 ? "" : "s"} gestartet`;
  G.log.push([head, ...lines].join("<br>"));
}

function showGameOver() {
  const s = G.state;
  let title;
  if (s.winner === "draw") title = "Unentschieden";
  else if (G.mode === "ai") title = s.winner === 0 ? "Sieg!" : "Niederlage";
  else if (G.mode === "online") title = s.winner === G.online.me ? "Sieg!" : "Niederlage";
  else title = `${playerLabel(s.winner)} gewinnt`;
  $("gameover-title").textContent = title;
  $("gameover-text").textContent = s.endReason === "timeout"
    ? `Nach ${s.rules.maxTurns} Zügen entschieden (Verluste ${s.losses[0]}:${s.losses[1]}).`
    : `Nach ${s.turn} Zügen, Verluste ${s.losses[0]}:${s.losses[1]}.`;
  $("gameover-again").style.display = G.mode === "online" ? "none" : "";
  $("gameover").classList.add("show");
}

// ---------------------------------------------------------------------------
// History: step back and forward through the turns already played
// ---------------------------------------------------------------------------

/** Start of turn `i` (i = history.length is the live position). */
const histState = (i) => (i < G.history.length ? G.history[i].before : G.state);

function historyBar() {
  const n = G.history.length;
  const at = G.view === null ? n : G.view;
  const c = document.createElement("div");
  c.className = "row history";
  const prev = document.createElement("button"); prev.textContent = "◀ Zurück"; prev.title = "Einen Zug zurück";
  const next = document.createElement("button"); next.textContent = "Vor ▶"; next.title = "Nächsten Zug abspielen";
  const info = document.createElement("span"); info.className = "hint grow";
  info.textContent = G.view === null ? `Verlauf: ${n} Zug${n === 1 ? "" : "e"}` : `Verlauf: Zug ${histState(at).turn} von ${G.state.turn}`;
  prev.disabled = at === 0 || G.busy || G.histPlaying;
  next.disabled = G.view === null || G.busy || G.histPlaying;
  prev.onclick = () => showHistory(at - 1);
  next.onclick = () => stepHistory();
  c.append(prev, info, next);
  if (G.view !== null) {
    const live = document.createElement("button");
    live.className = "primary";
    live.textContent = "Zurück ins Spiel";
    live.onclick = () => showHistory(null);
    c.appendChild(live);
  }
  return c;
}

function showHistory(i) {
  if (G.busy || G.histPlaying) return;
  if (i !== null && G.mode === "watch" && !G.watchPaused) { G.watchPaused = true; stopWatch(); }
  G.view = i === null || i >= G.history.length ? null : Math.max(0, i);
  G.sel = null;
  G.board.clearFx();
  render();
}

/** Plays the viewed turn as an animation and moves one turn forward. */
async function stepHistory() {
  if (G.view === null || G.busy || G.histPlaying) return;
  const h = G.history[G.view];
  G.histPlaying = true;
  render();
  const ok = await animateTurn(h.before, resolveTurn(h.before, h.orders));
  if (!ok || !G.histPlaying) return;
  G.histPlaying = false;
  showHistory(G.view + 1);
}

function renderHistory() {
  const s = histState(G.view);
  G.board.show(liveView(s), G.info);
  G.board.clearOverlay();
  const side = $("side");
  side.innerHTML = "";
  side.appendChild(historyBar());
  const h = document.createElement("div");
  h.className = "hint";
  h.textContent = G.histPlaying ? "Zug wird abgespielt…" : "Du siehst einen früheren Zug. „Vor“ spielt ihn ab, „Zurück ins Spiel“ zeigt wieder den aktuellen Stand.";
  side.appendChild(h);
  side.appendChild(statusCards(s));
  side.appendChild(logBox());
  if (!G.histPlaying) $("status").textContent = `Verlauf · Zug ${s.turn} · Verluste ${s.losses[0]}:${s.losses[1]}`;
}

// ---------------------------------------------------------------------------
// Watch (AI vs AI) and replay
// ---------------------------------------------------------------------------

function stopWatch() { if (G.watchTimer) clearTimeout(G.watchTimer); G.watchTimer = null; }
function scheduleWatch() {
  stopWatch();
  if (G.mode !== "watch" || G.state.over || G.watchPaused) return;
  G.watchTimer = setTimeout(watchStep, 400);
}
async function watchStep() {
  if (G.busy || G.state.over) return;
  G.busy = true;
  render();
  const epoch = G.epoch;
  const o = await Promise.all([aiOrders(G.state, 0, G.levels[0]), aiOrders(G.state, 1, G.levels[1])]);
  if (G.epoch !== epoch) return;
  await executeTurn(o);
  scheduleWatch();
}
function renderWatchSide(side) {
  const c = document.createElement("div");
  c.className = "row";
  const b = document.createElement("button");
  b.textContent = G.watchPaused ? "Weiter" : "Pause";
  b.onclick = () => { G.watchPaused = !G.watchPaused; if (!G.watchPaused) scheduleWatch(); else stopWatch(); render(); };
  const n = document.createElement("button");
  n.textContent = "Nächster Zug";
  n.disabled = !G.watchPaused || G.busy;
  n.onclick = () => watchStep();
  c.append(b, n);
  side.appendChild(c);
  if (G.history.length) side.appendChild(historyBar());
  side.appendChild(statusCards());
  side.appendChild(logBox());
}

/** Replay of an AI Lab game: { rules, levels, orders: [[o1, o2], ...] }. */
export function startReplay(replay) {
  const states = [newGame(replay.rules, replay.setups || [])];
  for (const o of replay.orders) states.push(resolveTurn(states[states.length - 1], o, { frames: false }).state);
  startGame("replay", { replay: { ...replay, states, idx: 0 }, levels: replay.levels, rules: replay.rules, state: states[0] });
}
function renderReplaySide(side) {
  const R = G.replay;
  const c = document.createElement("div");
  c.className = "row";
  const prev = document.createElement("button"); prev.textContent = "◀";
  const next = document.createElement("button"); next.textContent = "▶";
  const info = document.createElement("span"); info.className = "hint grow";
  info.textContent = `Replay: Zug ${R.idx + 1} von ${R.orders.length}`;
  prev.disabled = R.idx === 0 || G.busy;
  next.disabled = R.idx >= R.orders.length || G.busy;
  prev.onclick = () => { R.idx--; G.state = R.states[R.idx]; G.log.pop(); render(); };
  next.onclick = async () => { await executeTurn(R.orders[R.idx]); R.idx++; G.state = R.states[R.idx]; render(); };
  c.append(prev, info, next);
  side.appendChild(c);
  side.appendChild(statusCards());
  side.appendChild(logBox());
}

// ---------------------------------------------------------------------------
// Online hooks (called by net/online.js)
// ---------------------------------------------------------------------------

export const onlineHooks = {
  start({ me, names, rules }) { startGame("online", { me, names, rules }); },
  /** Both setups are known: the game begins. */
  bothSetups(setups) {
    if (G.mode !== "online" || G.phase !== "setup") return;
    G.setups = setups;
    beginPlay();
  },
  /** Both players' orders of the current turn are known. */
  async bothOrders(turn, orders) {
    if (G.mode !== "online" || turn !== G.state.turn || G.busy) return;
    await executeTurn(orders);
  },
  state: () => G,
};

// ---------------------------------------------------------------------------
// Menu and buttons
// ---------------------------------------------------------------------------

$("menu-level").value = G.level;
$("menu-level").onchange = (e) => { G.level = e.target.value; store.set("hexaprog.level", G.level); };
for (const b of document.querySelectorAll("#menu [data-mode]")) {
  b.onclick = () => {
    const m = b.dataset.mode;
    if (m === "lab") { leaveGame(); $("menu").classList.remove("show"); openLab({ onReplay: startReplay }); return; }
    if (m === "online") { leaveGame(); $("menu").classList.remove("show"); openLobby(onlineHooks); return; }
    if (G.mode === "online") leaveOnlineGame();
    G.watchPaused = false;
    startGame(m, { levels: [G.level, G.level] });
  };
}
$("menu-resume").onclick = () => $("menu").classList.remove("show");
$("btn-menu").onclick = () => $("menu").classList.add("show");
$("btn-rules").onclick = () => $("rules").classList.add("show");
$("rules-close").onclick = () => $("rules").classList.remove("show");
$("handover-go").onclick = () => { $("handover").classList.remove("show"); render(); };
$("gameover-board").onclick = () => $("gameover").classList.remove("show");
$("gameover-menu").onclick = () => { $("gameover").classList.remove("show"); $("menu").classList.add("show"); };
$("gameover-again").onclick = () => startGame(G.mode === "replay" ? "watch" : G.mode, { levels: G.levels, rules: G.ruleOverrides });

/** Stop the running game (lab or lobby opened): no more animations or AI turns. */
function leaveGame() {
  stopWatch();
  G.epoch++;
  G.busy = false;
  if (G.mode === "online") leaveOnlineGame();
  G.mode = null;
  $("menu-resume").style.display = "none";
}

// Show an empty board behind the menu.
G.state = newGame();
G.info = new Map(G.state.units.map((u) => [u.id, { owner: u.owner, kind: u.kind, n: u.n, maxEnergy: maxEnergy(G.state.rules, u) }]));
G.board = new Board($("board"), G.state.rules, { onCell });
G.board.show(liveView(G.state), G.info);
