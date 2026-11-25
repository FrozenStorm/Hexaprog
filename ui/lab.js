// AI Lab screen: define rule variants, let the AI play many games per variant in
// background workers, compare the statistics, download the results and watch
// single games as replays.
import { DEFAULT_RULES, RULE_FIELDS, setRule } from "../engine/rules.js";
import { expandGames, summarize, toCSV } from "../lab/runner.js";
import { LEVEL_NAMES } from "../ai/ai.js";
import { makeZip } from "../lab/zip.js";

const $ = (id) => document.getElementById(id);
const KEY = "hexaprog.lab.config";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x) => `${Math.round(x * 100)}%`;
const getPath = (o, path) => path.split(".").reduce((a, k) => a[k], o);

const lab = {
  cfg: null,
  results: [],   // { row, replay }
  workers: [],
  running: false,
  total: 0,
  startedAt: 0,
  onReplay: null,
};

function defaultConfig() {
  return {
    levels: ["medium", "medium"], games: 40, swapSides: true, seed: 1, gif: true,
    variants: [{ name: "Standard", rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) }],
  };
}
function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && c.variants) {
      // New rule fields get their default value.
      c.variants.forEach((v) => { v.rules = { ...JSON.parse(JSON.stringify(DEFAULT_RULES)), ...v.rules }; });
      if (c.gif === undefined) c.gif = true;
      return c;
    }
  } catch (e) { /* ignore */ }
  return defaultConfig();
}
const saveConfig = () => { try { localStorage.setItem(KEY, JSON.stringify(lab.cfg)); } catch (e) { /* ignore */ } };

export function openLab({ onReplay }) {
  lab.onReplay = onReplay;
  if (!lab.cfg) lab.cfg = loadConfig();
  $("lab").classList.add("show");
  render();
}

function close() { $("lab").classList.remove("show"); $("menu").classList.add("show"); }

function render() {
  const body = $("lab-body");
  const c = lab.cfg;
  const levelSel = (i) => `<select data-level="${i}">${Object.entries(LEVEL_NAMES).map(([k, n]) => `<option value="${k}"${c.levels[i] === k ? " selected" : ""}>${n}</option>`).join("")}</select>`;
  body.innerHTML = `
    <div class="row"><h2 class="grow">KI-Lab</h2><button id="lab-close">✕</button></div>
    <p class="hint">Jede Regelvariante wird von der KI gegen sich selbst gespielt. Werte, die vom Standard abweichen, sind hervorgehoben.
    Die Spieler wechseln jedes Spiel die Seite, wenn „Seiten tauschen“ aktiv ist.</p>
    <div class="row" style="margin-bottom:8px">
      <label class="hint">KI Spieler 1 ${levelSel(0)}</label>
      <label class="hint">KI Spieler 2 ${levelSel(1)}</label>
      <label class="hint">Spiele pro Variante <input id="lab-games" type="number" min="1" max="5000" value="${c.games}" style="width:80px"></label>
      <label class="hint"><input id="lab-swap" type="checkbox"${c.swapSides ? " checked" : ""}> Seiten tauschen</label>
      <label class="hint">Seed <input id="lab-seed" type="number" value="${c.seed}" style="width:70px"></label>
      <label class="hint"><input id="lab-gif" type="checkbox"${c.gif ? " checked" : ""}> Video (GIF) pro Spiel speichern</label>
    </div>
    <div class="lab-variants" id="lab-variants"></div>
    <div class="row">
      <button id="lab-add">+ Variante</button>
      <button id="lab-reset">Zurücksetzen</button>
      <span class="grow"></span>
      ${lab.running ? '<button id="lab-stop">Stoppen</button>' : '<button class="primary" id="lab-run">Starten</button>'}
    </div>
    <div id="lab-progress" style="margin-top:10px"></div>
    <div id="lab-results" style="margin-top:10px; overflow-x:auto"></div>`;
  const vbox = $("lab-variants");
  c.variants.forEach((v, vi) => {
    const d = document.createElement("div");
    d.className = "variant";
    d.innerHTML = `<div class="row" style="margin-bottom:6px"><input value="${esc(v.name)}" data-vname="${vi}" class="grow">
      ${c.variants.length > 1 ? `<button data-vdel="${vi}">Entfernen</button>` : ""}<button data-vdup="${vi}">Kopieren</button></div>
      <div class="lab-fields">${RULE_FIELDS.map(([path, label, choices]) => {
        const val = getPath(v.rules, path);
        const changed = JSON.stringify(val) !== JSON.stringify(getPath(DEFAULT_RULES, path));
        const input = choices
          ? `<select data-v="${vi}" data-path="${path}">${choices.map((ch) => `<option value="${ch}"${String(ch) === String(val) ? " selected" : ""}>${ch}</option>`).join("")}</select>`
          : `<input type="number" data-v="${vi}" data-path="${path}" value="${val}">`;
        return `<label class="${changed ? "changed" : ""}">${label} ${input}</label>`;
      }).join("")}</div>`;
    vbox.appendChild(d);
  });
  body.querySelectorAll("[data-level]").forEach((s) => { s.onchange = () => { c.levels[+s.dataset.level] = s.value; saveConfig(); }; });
  $("lab-games").onchange = (e) => { c.games = Math.max(1, Math.min(5000, +e.target.value || 1)); saveConfig(); };
  $("lab-swap").onchange = (e) => { c.swapSides = e.target.checked; saveConfig(); };
  $("lab-seed").onchange = (e) => { c.seed = +e.target.value || 1; saveConfig(); };
  $("lab-gif").onchange = (e) => { c.gif = e.target.checked; saveConfig(); };
  body.querySelectorAll("[data-vname]").forEach((i) => { i.onchange = () => { c.variants[+i.dataset.vname].name = i.value || `Variante ${+i.dataset.vname + 1}`; saveConfig(); }; });
  body.querySelectorAll("[data-vdel]").forEach((b) => { b.onclick = () => { c.variants.splice(+b.dataset.vdel, 1); saveConfig(); render(); }; });
  body.querySelectorAll("[data-vdup]").forEach((b) => {
    b.onclick = () => {
      const v = c.variants[+b.dataset.vdup];
      c.variants.push({ name: `${v.name} (Kopie)`, rules: JSON.parse(JSON.stringify(v.rules)) });
      saveConfig(); render();
    };
  });
  body.querySelectorAll("[data-path]").forEach((inp) => {
    inp.onchange = () => {
      const v = c.variants[+inp.dataset.v];
      let val = inp.value;
      if (val === "true") val = true; else if (val === "false") val = false;
      else if (inp.type === "number") val = Number(val);
      v.rules = setRule(v.rules, inp.dataset.path, val);
      saveConfig(); render();
    };
  });
  $("lab-add").onclick = () => { c.variants.push({ name: `Variante ${c.variants.length + 1}`, rules: JSON.parse(JSON.stringify(DEFAULT_RULES)) }); saveConfig(); render(); };
  $("lab-reset").onclick = () => { if (!lab.running) { lab.cfg = defaultConfig(); saveConfig(); render(); } };
  $("lab-close").onclick = close;
  if (lab.running) $("lab-stop").onclick = stop; else $("lab-run").onclick = run;
  renderResults();
}

function run() {
  const c = lab.cfg;
  // Names must be unique for the statistics.
  const seen = new Map();
  c.variants.forEach((v) => { const n = seen.get(v.name) || 0; seen.set(v.name, n + 1); if (n) v.name = `${v.name} ${n + 1}`; });
  const games = expandGames(c).map((g) => ({ ...g, gif: !!c.gif }));
  lab.results = [];
  lab.total = games.length;
  lab.running = true;
  lab.startedAt = Date.now();
  const n = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, games.length, 8));
  const queue = [...games];
  let active = 0;
  const done = () => { if (--active === 0) { lab.running = false; terminate(); render(); } };
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL("../lab/lab-worker.js", import.meta.url), { type: "module" });
    lab.workers.push(w);
    active++;
    const feed = () => { if (queue.length && lab.running) w.postMessage(queue.shift()); else done(); };
    w.onmessage = (e) => {
      if (e.data.error) console.error(e.data.error);
      else lab.results.push(e.data);
      renderResults();
      feed();
    };
    w.onerror = (e) => { console.error(e); done(); };
    feed();
  }
  render();
}

function terminate() { lab.workers.forEach((w) => w.terminate()); lab.workers = []; }
function stop() { lab.running = false; terminate(); render(); }

let lastRender = 0;
function renderResults() {
  const now = Date.now();
  if (lab.running && now - lastRender < 300 && lab.results.length < lab.total) return;
  lastRender = now;
  const prog = $("lab-progress"), res = $("lab-results");
  if (!prog) return;
  if (!lab.total) { prog.innerHTML = ""; res.innerHTML = ""; return; }
  const k = lab.results.length;
  const secs = (Date.now() - lab.startedAt) / 1000;
  const eta = k ? (secs / k) * (lab.total - k) : 0;
  prog.innerHTML = `<div class="hint">${k} / ${lab.total} Spiele${lab.running ? ` · noch ca. ${Math.ceil(eta)} s` : ""}</div>
    <div class="bar"><div style="width:${(k / lab.total) * 100}%"></div></div>`;
  const rows = lab.results.map((r) => r.row);
  const sums = summarize(rows);
  const lv = (r) => `${LEVEL_NAMES[r.level1]} – ${LEVEL_NAMES[r.level2]}`;
  res.innerHTML = `
    <table><thead><tr><th>Variante</th><th>Spiele</th><th>Sieg S1</th><th>Sieg S2</th><th>Unent.</th><th>Ø Züge</th><th>Zeitlimit</th>
      <th>Laser/Spiel</th><th>Torpedos/Spiel</th><th>Abgefangen</th><th>Verluste: Laser</th><th>Torpedo</th><th>Kollision</th><th>Rand</th><th>Planet</th></tr></thead>
    <tbody>${sums.map((s) => `<tr><td>${esc(s.variant)}</td><td>${s.games}</td><td>${pct(s.win1)}</td><td>${pct(s.win2)}</td><td>${pct(s.draw)}</td>
      <td>${s.turns.toFixed(1)}</td><td>${pct(s.timeouts)}</td><td>${s.lasers.toFixed(1)}</td><td>${s.torpedoes.toFixed(1)}</td><td>${s.intercepted.toFixed(1)}</td>
      <td>${s.byLaser.toFixed(2)}</td><td>${s.byTorpedo.toFixed(2)}</td><td>${s.byCollision.toFixed(2)}</td><td>${s.byEdge.toFixed(2)}</td><td>${s.byPlanet.toFixed(2)}</td></tr>`).join("")}</tbody></table>
    <p class="hint">Verluste sind zerstörte Einheiten pro Spiel nach Ursache (beide Spieler zusammen). „Sieg S1“ ist Spieler 1 (unten).</p>
    ${!lab.running && k ? `<div class="row"><button id="lab-csv">Tabelle (CSV)</button><button id="lab-json">Alle Replays (JSON)</button>${lab.results.some((r) => r.gif) ? '<button id="lab-gifs">Alle Videos (ZIP)</button>' : ""}</div>
    <h3 style="margin-top:12px">Einzelne Spiele</h3>
    <table><thead><tr><th>#</th><th>Variante</th><th>KI</th><th>Sieger</th><th>Züge</th><th>Verluste</th><th></th><th></th></tr></thead><tbody>
    ${lab.results.slice().sort((a, b) => a.row.id - b.row.id).slice(0, 300).map((r) => `<tr><td>${r.row.id + 1}</td><td>${esc(r.row.variant)}</td><td>${lv(r.row)}</td>
      <td>${r.row.winner === "draw" ? "–" : `S${r.row.winner}`}</td><td>${r.row.turns}</td><td>${r.row.losses1}:${r.row.losses2}</td>
      <td>${r.gif ? `<button data-gif="${r.row.id}">▶ Video</button>` : ""}</td>
      <td><button data-replay="${r.row.id}">Im Spiel ansehen</button></td></tr>`).join("")}
    </tbody></table>` : ""}`;
  const dl = (name, text, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const csv = $("lab-csv"), json = $("lab-json");
  if (csv) csv.onclick = () => dl("hexaprog-lab.csv", toCSV(rows), "text/csv");
  if (json) json.onclick = () => dl("hexaprog-lab-replays.json", JSON.stringify({ config: lab.cfg, summary: sums, games: lab.results.map(({ gif, ...r }) => r) }), "application/json");
  const gifs = $("lab-gifs");
  if (gifs) {
    gifs.onclick = async () => {
      gifs.disabled = true;
      const files = lab.results.filter((r) => r.gif).sort((a, b) => a.row.id - b.row.id)
        .map((r) => ({ name: gifName(r), data: r.gif }));
      const zip = await makeZip(files, { compress: false });
      dl("hexaprog-lab-videos.zip", zip, "application/zip");
      gifs.disabled = false;
    };
  }
  res.querySelectorAll("[data-gif]").forEach((b) => {
    b.onclick = () => showVideo(lab.results.find((x) => x.row.id === +b.dataset.gif));
  });
  res.querySelectorAll("[data-replay]").forEach((b) => {
    b.onclick = () => {
      const r = lab.results.find((x) => x.row.id === +b.dataset.replay);
      $("lab").classList.remove("show");
      lab.onReplay(r.replay);
    };
  });
}

const gifName = (r) => `spiel-${String(r.row.id + 1).padStart(4, "0")}-${r.row.variant.replace(/[^\w-]+/g, "_")}.gif`;

/** Video of one game: the GIF in a dialog, with download and replay buttons. */
function showVideo(r) {
  let ov = document.getElementById("lab-video");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "lab-video";
    ov.className = "overlay-screen";
    ov.style.zIndex = 20;
    document.body.appendChild(ov);
  }
  if (ov._url) URL.revokeObjectURL(ov._url);
  ov._url = URL.createObjectURL(new Blob([r.gif], { type: "image/gif" }));
  const who = r.row.winner === "draw" ? "Unentschieden" : `Sieg Spieler ${r.row.winner}`;
  ov.innerHTML = `<div class="dialog" style="text-align:center">
    <div class="row"><h3 class="grow" style="text-align:left">Spiel ${r.row.id + 1} · ${esc(r.row.variant)}</h3><button data-act="close">✕</button></div>
    <p class="hint">${LEVEL_NAMES[r.row.level1]} gegen ${LEVEL_NAMES[r.row.level2]} · ${who} nach ${r.row.turns} Zügen · Verluste ${r.row.losses1}:${r.row.losses2}</p>
    <img src="${ov._url}" alt="Spielverlauf" style="width:100%; max-width:480px; image-rendering:pixelated; border-radius:8px">
    <div class="row" style="justify-content:center; margin-top:8px">
      <a href="${ov._url}" download="${gifName(r)}"><button>GIF herunterladen</button></a>
      <button data-act="replay">Im Spiel ansehen</button>
    </div></div>`;
  ov.classList.add("show");
  ov.querySelector("[data-act=close]").onclick = () => ov.classList.remove("show");
  ov.querySelector("[data-act=replay]").onclick = () => {
    ov.classList.remove("show");
    $("lab").classList.remove("show");
    lab.onReplay(r.replay);
  };
}
