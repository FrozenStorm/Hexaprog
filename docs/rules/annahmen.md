# Annahmen zum ersten Regelset

Diese Punkte sind im Regelset noch offen. Die WebApp nimmt die Variante in **fett**; wo es ein Parameter ist, kann man im KI-Lab die anderen Varianten testen (`engine/rules.js`).

| # | Frage | Annahme | Parameter |
|---|---|---|---|
| 1 | Wann ist eine Einheit zerstört? | **Wenn der Schaden grösser ist als die verbleibende Energie** (Energie würde unter 0 fallen). Eine Einheit mit 0 Energie lebt also noch, der nächste Treffer zerstört sie. Alternative: zerstört, sobald die Energie 0 erreicht. | `destroyWhen`: `negative` / `zero` |
| 2 | Maximale Energie | Regeneration füllt höchstens bis zum Startwert (6) auf. | – |
| 3 | Wo liegt ein abgefeuerter Waffen-Marker? | **Auf dem Feld „Schwung-Marker des Schiffs ± 1“** (so wie er auf der Kommandokarte gelegt wird). Sein Schwung ist der Abstand Schiff → Marker, d.h. Schiffsschwung ± 1. In Schritt 5 fliegt er nochmals um diesen Schwung weiter. Die Waffe darf nicht auf dem Schiff selbst liegen (Schwung 0). | `laser.spread`, `torpedo.spread` |
| 4 | Laser-Schadenszone | Linie vom Schiff (nach seiner Bewegung) zum Laser-Marker, einmal vor und einmal nach der Bewegung des Lasers. Getroffen wird jede Einheit, deren Flugweg in diesem Zug (Linie Start → Ziel, inkl. Stillstehen) ein Feld einer dieser Zonen berührt, ausser das feuernde Schiff selbst. | – |
| 5 | Trifft der Laser eigene Einheiten? | **Ja** (die Regel sagt „allen Einheiten“). | `friendlyFire` |
| 6 | Wie viele Torpedos gleichzeitig? | **1 pro Schiff** (es gibt eine Torpedo-Karte pro Schiff). Solange er fliegt, steuert die Karte den Torpedo; erst danach kann das Schiff den nächsten abfeuern. | `torpedo.perShip` |
| 7 | Schub eines neuen Torpedos | Im Zug des Abschusses kein zusätzlicher Schub; ab dem nächsten Zug Schub 1. | – |
| 8 | Torpedo-Prüfung | Vor der Bewegung: Gegner im Radius → Detonation am Ort. Nach der Bewegung: landet er auf einer eigenen Einheit oder ist ein Gegner im Radius → Detonation. Torpedos, die das Spielfeld verlassen, sind weg. Der Flugweg selbst wird nicht geprüft. | – |
| 9 | Spielfeldrand | **Ein Schiff, dessen Ziel ausserhalb liegt, ist zerstört.** Alternative: es hält am letzten Feld im Spielfeld an (Schwung 0). | `edge`: `destroy` / `stop` |
| 10 | Schiff fliegt auf eine Basis | **Beide zerstört**, wie zwei Schiffe auf einem Feld. Alternative: nichts passiert. | `baseCollision` |
| 11 | Beide verlieren im gleichen Zug ihre zweite Einheit | Unentschieden. | – |
| 12 | Spiel ohne Ende | Nach **40 Zügen** gewinnt, wer weniger Einheiten verloren hat, dann wer mehr Energie hat; sonst unentschieden. | `maxTurns`, `timeout` |
| 13 | Startaufstellung | Basis von Spieler 1 auf dem grünen Feld unten links (Spalte 4, Reihe 16), Spieler 2 punktgespiegelt oben rechts. Die drei Schiffe starten auf den Nachbarfeldern der Basis, die am nächsten zur Mitte liegen, mit Schwung 0. | `base1` |
| 14 | Die zwei anderen grünen Felder und das helle Mittelfeld | Nur markiert, ohne Regelwirkung. | – |
| 15 | Feuert die Basis? | Nein, sie hat keine Waffen. | – |
| 16 | Reihenfolge in Schritt 4 | Alle Schiffe ziehen gleichzeitig; danach Kollisionen, dann Torpedos auffüllen (Schiff endet neben der eigenen Basis). | – |
| 17 | Schaden in Schritt 5 | Alle Laser und Torpedos prüfen gleichzeitig; Schaden wird summiert und erst danach angewendet. | – |
