// End-to-end test of the online lobby with two browsers (Playwright).
// The Firebase database is replaced by an in-process mock that follows the same
// access rules as database.rules.json (index.html?backend=mock).
//
// Run: npm run test:online   (needs Playwright: npm i -D playwright)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (p.endsWith("/")) p += "index.html";
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/index.html?backend=mock`;

// ---------------------------------------------------------------------------
// Mock database with the access rules of database.rules.json
// ---------------------------------------------------------------------------
const db = { root: {} };
const split = (p) => p.split("/").filter(Boolean);
function getAt(obj, parts) {
  let o = obj;
  for (const k of parts) { if (o == null || typeof o !== "object") return null; o = o[k]; }
  return o === undefined ? null : o;
}
function setAt(obj, parts, val) {
  if (!parts.length) return val == null ? {} : val;
  const [k, ...rest] = parts;
  const copy = { ...(obj && typeof obj === "object" ? obj : {}) };
  const child = setAt(copy[k], rest, val);
  if (child == null || (typeof child === "object" && !Object.keys(child).length)) delete copy[k];
  else copy[k] = child;
  return copy;
}
const stamp = (v) => (v && typeof v === "object"
  ? (v[".sv"] === "timestamp" ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stamp(x)])))
  : v);
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

function canRead(uid, parts) {
  const [app, top, a, b] = parts;
  if (app !== "hexaprog") return false;
  if (top === "lobby") return true;
  if (top === "challenges") return a === uid || (b !== undefined && b === uid);
  if (top === "games" && a) {
    const meta = getAt(db.root, ["hexaprog", "games", a, "meta"]);
    return !!meta && (meta.p1 === uid || meta.p2 === uid);
  }
  return false;
}
function canWrite(uid, parts, newRoot) {
  const [app, top, a, b, c, d] = parts;
  if (app !== "hexaprog") return false;
  if (top === "lobby") {
    if (a !== uid) return false;
    const n = getAt(newRoot, ["hexaprog", "lobby", a]);
    return n == null || (typeof n.name === "string" && n.name.length > 0 && n.name.length <= 20 && typeof n.status === "string");
  }
  if (top === "challenges") {
    if (!(a === uid || b === uid) || b === undefined) return false;
    const n = getAt(newRoot, ["hexaprog", "challenges", a, b]);
    return n == null || (typeof n.fromName === "string" && typeof n.status === "string");
  }
  if (top === "games" && a) {
    const old = getAt(db.root, ["hexaprog", "games", a]);
    const neu = getAt(newRoot, ["hexaprog", "games", a]);
    const ok = old ? (old.meta && (old.meta.p1 === uid || old.meta.p2 === uid)) : !!(neu && neu.meta && neu.meta.p2 === uid);
    if (!ok) return false;
    if (b === "orders" && c && d) {
      const meta = getAt(db.root, ["hexaprog", "games", a, "meta"]);
      const owner = d === "p0" ? meta.p1 : d === "p1" ? meta.p2 : null;
      if (owner !== uid) return false;
      if (getAt(db.root, parts) != null) return false; // orders cannot be changed
      return typeof getAt(newRoot, parts) === "string";
    }
    return true;
  }
  return false;
}

const sessions = new Map();
const pageSess = new Map();
const errors = [];
async function emitAll() {
  for (const [, s] of sessions) {
    for (const [id, l] of s.listeners) {
      const parts = split(l.path);
      if (!canRead(s.uid, parts)) continue;
      const val = clone(getAt(db.root, parts));
      const json = JSON.stringify(val);
      if (json === l.last) continue;
      l.last = json;
      s.page.evaluate(([i, v]) => window.__mockEmit && window.__mockEmit(i, v), [id, val]).catch((e) => { if (!/closed|destroyed/.test(e.message)) errors.push("emit: " + e.message); });
    }
  }
}
function write(uid, p, val) {
  const parts = split(p);
  const newRoot = setAt(db.root, parts, stamp(clone(val)));
  if (!canWrite(uid, parts, newRoot)) throw new Error(`PERMISSION_DENIED: ${uid} ${p}`);
  db.root = newRoot;
}
function disconnect(sess) {
  const s = sessions.get(sess);
  if (!s) return;
  sessions.delete(sess);
  for (const { path: p, val } of s.onDisc) { try { write(s.uid, p, val); } catch (e) { /* rules */ } }
  emitAll();
}
async function handle(page, msg) {
  const { op, uid, sess } = msg;
  if (op === "hello") {
    const prev = pageSess.get(page);
    if (prev && prev !== sess) disconnect(prev);
    pageSess.set(page, sess);
    sessions.set(sess, { page, uid, listeners: new Map(), onDisc: [] });
    return null;
  }
  const s = sessions.get(sess);
  if (!s) throw new Error("unknown session");
  switch (op) {
    case "set": write(uid, msg.path, msg.val); await emitAll(); return null;
    case "update":
      for (const [k, v] of Object.entries(msg.val)) write(uid, `${msg.path}/${k}`, v);
      await emitAll(); return null;
    case "get":
      if (!canRead(uid, split(msg.path))) throw new Error("PERMISSION_DENIED read " + msg.path);
      return clone(getAt(db.root, split(msg.path)));
    case "on": s.listeners.set(msg.id, { path: msg.path, last: undefined });
      if (canRead(uid, split(msg.path))) {
        const val = clone(getAt(db.root, split(msg.path)));
        s.listeners.get(msg.id).last = JSON.stringify(val);
        page.evaluate(([i, v]) => window.__mockEmit(i, v), [msg.id, val]).catch(() => {});
      }
      return null;
    case "off": s.listeners.delete(msg.id); return null;
    case "onDisconnect":
      s.onDisc = s.onDisc.filter((o) => o.path !== msg.path);
      s.onDisc.push({ path: msg.path, val: msg.val });
      return null;
    case "cancelOnDisconnect": s.onDisc = s.onDisc.filter((o) => o.path !== msg.path); return null;
    default: throw new Error("bad op " + op);
  }
}

// ---------------------------------------------------------------------------
// Two browsers play three turns
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
async function player(label) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.exposeBinding("__mockDb", ({ page }, msg) => handle(page, msg));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("close", () => { const s = pageSess.get(page); if (s) disconnect(s); });
  await page.goto(BASE);
  return page;
}
async function enter(page, name) {
  await page.click("#menu [data-mode=online]");
  await page.fill("#lobby-name", name);
  await page.click("#lobby-enter");
}
const stateOf = (page) => page.evaluate(() => JSON.stringify(window.__hexaprog.state));

try {
  const a = await player("A"), b = await player("B");
  await enter(a, "Anna");
  await enter(b, "Ben");
  await a.waitForSelector("#lobby-list [data-act=challenge]");
  await a.click("#lobby-list [data-act=challenge]");
  await b.waitForSelector("#lobby-challenges [data-act=accept]");
  await b.click("#lobby-challenges [data-act=accept]");
  await a.waitForFunction(() => window.__hexaprog.mode === "online");
  await b.waitForFunction(() => window.__hexaprog.mode === "online");
  assert.equal(await a.evaluate(() => window.__hexaprog.online.me), 0);
  assert.equal(await b.evaluate(() => window.__hexaprog.online.me), 1);

  // Secret setup: one player takes the standard setup, the other a random one.
  for (const [page, label] of [[a, "Standard"], [b, "Zufällig"]]) {
    await page.click(`#side button:text-is("${label}")`);
    await page.click("#side button.primary");
  }
  await a.waitForFunction(() => window.__hexaprog.phase === "play");
  await b.waitForFunction(() => window.__hexaprog.phase === "play");
  assert.equal(await stateOf(a), await stateOf(b), "setups differ");

  for (let turn = 1; turn <= 3; turn++) {
    // Each player gives ship 1 some thrust (towards the centre) and fires a laser.
    for (const [page, vec] of [[a, { q: 0, r: -1 }], [b, { q: 0, r: 1 }]]) {
      await page.evaluate((v) => {
        const G = window.__hexaprog;
        const id = `p${G.online.me}s1`;
        G.orders[G.online.me].units[id] = { thrust: v, laser: v, launch: null };
      }, vec);
      await page.click("#side button.primary");
    }
    await a.waitForFunction((t) => window.__hexaprog.state.turn === t + 1 && !window.__hexaprog.busy, turn, { timeout: 20000 });
    await b.waitForFunction((t) => window.__hexaprog.state.turn === t + 1 && !window.__hexaprog.busy, turn, { timeout: 20000 });
    assert.equal(await stateOf(a), await stateOf(b), `states differ after turn ${turn}`);
  }
  // An order cannot be overwritten by the other player.
  const gid = Object.keys(db.root.hexaprog.games)[0];
  assert.throws(() => write([...sessions.values()][0].uid, `hexaprog/games/${gid}/orders/1/p1`, "{}"));
  assert.deepEqual(errors, []);
  console.log("online e2e: ok");
} finally {
  await browser.close();
  server.close();
}
