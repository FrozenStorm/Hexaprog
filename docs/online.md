# Online-Lobby

Spieler geben einen Namen ein und landen in einer gemeinsamen Lobby. Man kann einen freien Spieler herausfordern; nimmt er an, startet das Spiel für beide. Wer herausfordert, ist Spieler 1 (unten).

- Code: `net/online.js` (Lobby, Herausforderungen, Befehle), `net/backend-firebase.js` (Firebase Realtime Database + anonyme Anmeldung), `net/firebase-config.js`.
- Jeder Spieler schreibt seine Befehle für den Zug nach `hexaprog/games/{id}/orders/{zug}/p0` bzw. `p1`. Sobald beide da sind, rechnen beide Browser den Zug mit derselben Engine aus (sie ist deterministisch), es gibt also keinen Host.
- Befehle können nicht mehr geändert werden, sobald sie geschrieben sind.
- Noch nicht eingebaut (Test-Phase): Wiederaufnahme nach Neuladen, Aufgeben, Sieg bei Verbindungsabbruch. Technisch kann ein Spieler die Befehle des Gegners lesen, bevor er selbst abgibt.

## Firebase einrichten

Hexaprog nutzt dasselbe Firebase-Projekt wie DiceWar (`dicewar-85fda`); alle Daten liegen unter `/hexaprog`, DiceWar bleibt unberührt. Die Domain `frozenstorm.github.io` ist dort schon freigegeben.

Die Datenbankregeln gelten pro Projekt. Deshalb muss der Knoten `"hexaprog"` aus `database.rules.json` **in die bestehenden DiceWar-Regeln eingefügt** werden: Firebase-Konsole → Realtime Database → Regeln → den `"hexaprog": {…}`-Block neben `"lobby"`, `"challenges"` und `"games"` einfügen → Veröffentlichen.

Wer lieber ein eigenes Projekt will: neues Firebase-Projekt mit Realtime Database und anonymer Anmeldung anlegen, die Werte in `net/firebase-config.js` ersetzen und `database.rules.json` unverändert veröffentlichen.

## Tests

`npm run test:online` spielt mit zwei Browsern gegen einen Mock der Datenbank, der dieselben Regeln prüft (`index.html?backend=mock`). Braucht Playwright (`npm i -D playwright`).
