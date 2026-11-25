# Hexaprog

Ein rundenbasiertes Weltraum-Strategiespiel: beide Spieler planen ihre Züge gleichzeitig und verdeckt, dann fliegen alle Einheiten gleichzeitig. Wer mit geschicktem Fliegen zuerst zwei gegnerische Einheiten zerstört, gewinnt.

Diese WebApp dient dazu, die Regeln des Brettspiels online und mit einem KI-Lab zu testen.

**▶ Spielen: https://frozenstorm.github.io/Hexaprog/** (sobald GitHub Pages aktiviert ist)

## Funktionen

- **Regel-Engine** nach dem ersten Regelset (Flugvariante): Hex-Feld 14 × 19, Schwung und Schub, Laser, Torpedos, Energieschilde, Basis, Torpedos auffüllen. Regeldetails sind als Parameter im KI-Lab umschaltbar.
- **Planung direkt auf dem Brett:** Schiff wählen, Schub / Laser / Torpedo antippen, markiertes Feld wählen. Flugbahn, nächster Schwung und Laser-Zone werden als Vorschau gezeigt.
- **Animierte Ausführung** in den Schritten des Zugablaufs (Feuern, Schub, Schiffe bewegen, Waffen bewegen, Energie).
- **Spielmodi:** gegen die KI (Leicht, Mittel, Schwer, Experte), Duell auf einem Gerät (verdeckte Planung nacheinander), KI gegen KI zuschauen, online.
- **KI-Lab:** beliebig viele Regelvarianten (alle Zahlen und Schalter aus `engine/rules.js`) von der KI gegeneinander spielen lassen, Statistik vergleichen (Siegquote pro Seite, Unentschieden, Spieldauer, Verluste nach Ursache), CSV und Replays herunterladen, jedes Spiel als Replay ansehen.
- **Online-Lobby** über Firebase: Namen eingeben, Gegner herausfordern, gleichzeitige Züge.
- **PWA:** installierbar, funktioniert offline (ausser online).

## Projektstruktur

Statische Seite (HTML und ES-Module, kein Build), gehostet auf GitHub Pages – wie DiceWar.

- `index.html` – Spielseite
- `docs/rules/` – Regeln (`regeln.md`)
- `docs/online.md` – Online-Lobby und Firebase-Einrichtung
- `engine/` – Regel-Engine: `hex.js` (Hex-Geometrie), `rules.js` (alle Regelparameter), `core.js` (Aufstellung, Zugauflösung)
- `ai/` – KI: `ai.js` (Stufen; Gegnerpläne samplen, eigenen Plan Entscheidung für Entscheidung verbessern), `eval.js` (Stellungsbewertung), `rng.js`
- `lab/` – KI-Lab: `runner.js` (ganze Partien KI gegen KI, Statistik), `lab-worker.js`
- `ui/` – `app.js` (Spielablauf, Planung, Modi), `board.js` (SVG-Brett und Animation), `lab.js` (KI-Lab-Bildschirm), `ai-worker.js`
- `net/` – Online-Lobby über Firebase (`online.js`, `backend-firebase.js`, `backend-mock.js` für Tests)
- `tools/labrun.mjs` – KI-Lab auf allen CPU-Kernen in Node
- `test/` – automatische Tests

## Entwicklung

Lokal mit einem statischen Webserver starten, z.B. `npx serve .` oder `python3 -m http.server`, und die angezeigte Adresse öffnen.

- `npm test` – Engine-, KI- und Lab-Tests (Node.js 20 oder neuer, keine Abhängigkeiten)
- `npm run test:online` – Online-Lobby mit zwei Browsern gegen eine Mock-Datenbank (braucht Playwright: `npm i -D playwright`)
- KI-Lab in Node, z.B. drei Varianten mit je 100 Spielen:

  ```
  node tools/labrun.mjs --a hard --b hard --games 100 \
    --variant Standard \
    --variant "Laser 2 Schaden" laser.damage=2 \
    --variant "Rand stoppt" edge=stop
  ```

## Credits

Spielidee und Regeln: FrozenStorm. Web-Umsetzung im Stil von [DiceWar](https://github.com/FrozenStorm/DiceWar).
