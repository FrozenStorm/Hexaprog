// Online lobby and game sync over the Firebase Realtime Database.
//
// Database layout (all under /hexaprog, rules in database.rules.json):
//   lobby/{uid}                  { name, status: "free" | "challenging" | "in_game", at }
//   challenges/{to}/{from}       { fromName, status: "pending" | "accepted" | "declined", gameId, at }
//   games/{id}/meta              { p1, p2, name1, name2, created, result }
//   games/{id}/orders/{turn}/p0  orders of player 1 as JSON text (p1 for player 2)
//   games/{id}/presence/{uid}    { online, at }
//
// Simultaneous turns need no host: each player writes their orders for the turn;
// when both are there, both browsers resolve the same turn with the same engine.
// The challenger is Player 1 (bottom), the challenged player Player 2.

const ROOT = "hexaprog/";
const CHALLENGE_TIMEOUT_MS = 60 * 1000;
const KEY_NAME = "hexaprog.online.name";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const ON = {
  db: null, connecting: null, hooks: null,
  name: store.get(KEY_NAME) || "",
  inLobby: false, status: "free", lobby: {}, incoming: {},
  outgoing: null, // { to, unsub, timer }
  unsubs: [],
  game: null,     // { id, meta, me, unsubs, oppOnline }
};

async function connect() {
  if (ON.db) return ON.db;
  if (!ON.connecting) {
    const mock = new URLSearchParams(location.search).get("backend") === "mock";
    ON.connecting = (mock ? import("./backend-mock.js") : import("./backend-firebase.js"))
      .then((m) => m.createBackend())
      .then((raw) => {
        // All paths live under /hexaprog.
        const db = { ...raw };
        for (const f of ["set", "update", "remove", "get", "on", "onDisconnect", "cancelOnDisconnect"]) {
          db[f] = (path, ...a) => raw[f](ROOT + path, ...a);
        }
        ON.db = db;
        db.onConnected((up) => { if (up) announce(); });
        return db;
      })
      .catch((e) => { ON.connecting = null; throw e; });
  }
  return ON.connecting;
}

function announce() {
  const db = ON.db;
  if (!db) return;
  if (ON.inLobby || ON.game) {
    db.onDisconnect(`lobby/${db.uid}`, null);
    db.set(`lobby/${db.uid}`, { name: ON.name, status: ON.status, at: db.TS });
  }
  if (ON.game) {
    const p = `games/${ON.game.id}/presence/${db.uid}`;
    db.onDisconnect(p, { online: false, at: db.TS });
    db.set(p, { online: true, at: db.TS });
  }
}
function setStatus(st) { ON.status = st; announce(); }
const msg = (t) => { $("lobby-msg").textContent = t; };

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function openLobby(hooks) {
  ON.hooks = hooks;
  $("lobby").classList.add("show");
  $("lobby-name").value = ON.name;
  if (ON.name) enter(); else { msg("Wähle einen Namen, um die Lobby zu betreten."); render(); }
}

async function enter() {
  msg("Verbinde…");
  let db;
  try { db = await connect(); } catch (e) {
    console.error(e);
    msg("Keine Verbindung zur Lobby. Prüfe die Internetverbindung.");
    return;
  }
  ON.inLobby = true;
  ON.status = "free";
  msg("");
  announce();
  stopLobby();
  ON.unsubs.push(db.on("lobby", (v) => { ON.lobby = v || {}; render(); }));
  ON.unsubs.push(db.on(`challenges/${db.uid}`, (v) => { ON.incoming = v || {}; render(); }));
  render();
}

function stopLobby() { ON.unsubs.forEach((u) => u()); ON.unsubs = []; }

function leaveLobby() {
  cancelChallenge();
  stopLobby();
  ON.inLobby = false;
  if (ON.db && !ON.game) { ON.db.remove(`lobby/${ON.db.uid}`); ON.db.cancelOnDisconnect(`lobby/${ON.db.uid}`); }
  $("lobby").classList.remove("show");
  $("menu").classList.add("show");
}

function render() {
  const db = ON.db;
  const list = $("lobby-list"), inc = $("lobby-challenges");
  $("lobby-enter").textContent = ON.inLobby ? "Umbenennen" : "Betreten";
  if (!db || !ON.inLobby) { list.innerHTML = ""; inc.innerHTML = ""; return; }
  const now = db.now();
  const incoming = Object.entries(ON.incoming).filter(([, c]) => c && c.status === "pending" && (typeof c.at !== "number" || now - c.at < CHALLENGE_TIMEOUT_MS));
  inc.innerHTML = incoming.map(([from, c]) => `<div class="card" data-from="${esc(from)}" style="margin-top:6px">
      <b>${esc(c.fromName)}</b> fordert dich heraus!
      <div class="row" style="margin-top:6px"><button class="primary" data-act="accept">Annehmen</button><button data-act="decline">Ablehnen</button></div></div>`).join("");
  const others = Object.entries(ON.lobby).filter(([uid, p]) => uid !== db.uid && p && p.name);
  const waiting = ON.outgoing && ON.outgoing.to;
  list.innerHTML = others.length ? others.map(([uid, p]) => {
    const st = p.status === "free" ? "frei" : p.status === "in_game" ? "im Spiel" : "beschäftigt";
    let act = "";
    if (waiting === uid) act = `<button data-act="cancel">Abbrechen</button>`;
    else if (p.status === "free" && !waiting) act = `<button data-act="challenge">Herausfordern</button>`;
    return `<div class="player" data-uid="${esc(uid)}"><span>${esc(p.name)} <span class="hint">${waiting === uid ? "wartet…" : st}</span></span>${act}</div>`;
  }).join("") : `<div class="hint">Noch niemand sonst hier. Lass die Seite offen oder lade jemanden ein.</div>`;
}

async function challenge(to) {
  const db = ON.db;
  if (ON.outgoing) return;
  const path = `challenges/${to}/${db.uid}`;
  ON.outgoing = { to, unsub: null, timer: null };
  db.onDisconnect(path, null);
  await db.set(path, { fromName: ON.name, status: "pending", at: db.TS });
  setStatus("challenging");
  ON.outgoing.timer = setTimeout(() => { msg("Keine Antwort, die Herausforderung ist abgelaufen."); cancelChallenge(); }, CHALLENGE_TIMEOUT_MS);
  let seen = false;
  ON.outgoing.unsub = db.on(path, (v) => {
    if (!ON.outgoing || ON.outgoing.to !== to) return;
    if (v) seen = true;
    if (!v) { if (seen) { msg("Die Herausforderung wurde zurückgezogen."); cancelChallenge(); } }
    else if (v.status === "declined") { msg("Die Herausforderung wurde abgelehnt."); cancelChallenge(); }
    else if (v.status === "accepted" && v.gameId) {
      const id = v.gameId;
      cancelChallenge({ keepStatus: true });
      db.get(`games/${id}/meta`).then((meta) => { if (meta) beginGame(id, meta, 0); });
    }
  });
  render();
}

function cancelChallenge({ keepStatus = false } = {}) {
  const o = ON.outgoing;
  if (!o) return;
  ON.outgoing = null;
  clearTimeout(o.timer);
  if (o.unsub) o.unsub();
  if (ON.db) { const p = `challenges/${o.to}/${ON.db.uid}`; ON.db.remove(p); ON.db.cancelOnDisconnect(p); }
  if (!keepStatus && ON.inLobby) setStatus("free");
  render();
}

async function accept(from) {
  const db = ON.db;
  const c = ON.incoming[from];
  if (!c || c.status !== "pending" || ON.game) return;
  cancelChallenge({ keepStatus: true });
  const id = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const meta = { p1: from, p2: db.uid, name1: c.fromName, name2: ON.name, created: db.TS };
  await db.set(`games/${id}`, { meta });
  await db.update(`challenges/${db.uid}/${from}`, { status: "accepted", gameId: id });
  beginGame(id, meta, 1);
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

function beginGame(id, meta, me) {
  const db = ON.db;
  stopLobby();
  ON.inLobby = false;
  $("lobby").classList.remove("show");
  ON.game = { id, meta, me, unsubs: [], oppOnline: true };
  setStatus("in_game");
  ON.hooks.start({ me, names: [meta.name1, meta.name2] });
  const g = ON.game;
  const opp = me === 0 ? meta.p2 : meta.p1;
  g.unsubs.push(db.on(`games/${id}/orders`, (all) => {
    if (ON.game !== g || !all) return;
    const st = ON.hooks.state();
    const turn = st.state.turn;
    const t = all[turn];
    if (t && t.p0 && t.p1) {
      try { ON.hooks.bothOrders(turn, [JSON.parse(t.p0), JSON.parse(t.p1)]); } catch (e) { console.error(e); }
    }
  }));
  g.unsubs.push(db.on(`games/${id}/presence/${opp}`, (v) => {
    if (ON.game !== g) return;
    g.oppOnline = !v || v.online !== false;
    const s = $("status");
    if (!g.oppOnline && s) s.textContent = `${me === 0 ? meta.name2 : meta.name1} ist offline…`;
  }));
}

/** Write our orders of `turn`. */
export function submitOnlineOrders(turn, orders) {
  const g = ON.game;
  if (!g || !ON.db) return;
  ON.db.set(`games/${g.id}/orders/${turn}/p${g.me}`, JSON.stringify(orders)).catch((e) => console.error(e));
}

/** Leave the online game (e.g. when another mode is started from the menu). */
export function leaveOnlineGame() {
  const g = ON.game;
  if (!g) return;
  ON.game = null;
  g.unsubs.forEach((u) => u());
  if (ON.db) {
    ON.db.cancelOnDisconnect(`games/${g.id}/presence/${ON.db.uid}`);
    ON.db.set(`games/${g.id}/presence/${ON.db.uid}`, { online: false, at: ON.db.TS }).catch(() => {});
    ON.db.remove(`lobby/${ON.db.uid}`);
  }
  ON.status = "free";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$("lobby-enter").onclick = () => {
  const name = $("lobby-name").value.trim().slice(0, 20);
  if (!name) return;
  ON.name = name;
  store.set(KEY_NAME, name);
  if (ON.inLobby) announce(); else enter();
};
$("lobby-close").onclick = leaveLobby;
$("lobby-list").onclick = (e) => {
  const b = e.target.closest("button"), row = e.target.closest("[data-uid]");
  if (!b || !row) return;
  if (b.dataset.act === "challenge") challenge(row.dataset.uid);
  if (b.dataset.act === "cancel") cancelChallenge();
};
$("lobby-challenges").onclick = (e) => {
  const b = e.target.closest("button"), card = e.target.closest("[data-from]");
  if (!b || !card) return;
  if (b.dataset.act === "accept") accept(card.dataset.from);
  if (b.dataset.act === "decline") ON.db.update(`challenges/${ON.db.uid}/${card.dataset.from}`, { status: "declined" });
};
setInterval(() => { if (ON.inLobby) render(); }, 2000);
