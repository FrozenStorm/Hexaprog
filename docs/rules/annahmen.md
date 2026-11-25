# Offene Punkte des ersten Regelsets und Entscheidungen

Daniel hat die Punkte am 25.11.2026 beantwortet. Die Spalte „Parameter“ nennt den Schalter in `engine/rules.js`, mit dem man im KI-Lab Alternativen testen kann.

| # | Frage | Entscheidung | Parameter |
|---|---|---|---|
| 1 | Wann ist eine Einheit zerstört? | Wenn der Schaden grösser ist als die verbleibende Energie. Eine Einheit mit 0 Energie lebt noch, der nächste Treffer zerstört sie. | `destroyWhen` (`negative`, Alternative `zero`) |
| 2 | Maximale Energie | Regeneration füllt höchstens bis zum Startwert (6) auf. | – |
| 3 | Wo liegt ein abgefeuerter Waffen-Marker? | Auf dem Feld „Schwung-Marker des Schiffs ± 1“. Sein Schwung ist der Abstand Schiff → Marker; in Schritt 5 fliegt er nochmals um diesen Schwung weiter. Die Waffe darf nicht auf dem Schiff selbst liegen. | `laser.spread`, `torpedo.spread` |
| 4 | Laser-Schadenszone | Linie vom Schiff (nach seiner Bewegung) zum Laser-Marker, vor und nach der Bewegung des Lasers. Getroffen wird jede Einheit, deren Flugweg in diesem Zug ein Feld einer dieser Zonen berührt, ausser das feuernde Schiff. | – |
| 5 | Trifft der Laser eigene Einheiten? | Ja. | `friendlyFire` |
| 6 | Wie viele Torpedos gleichzeitig? | **Beliebig viele** pro Schiff (begrenzt nur durch den Vorrat von 2, aufgefüllt an der Basis). | `torpedo.perShip` (0 = beliebig) |
| 7 | Schub eines neuen Torpedos | Im Zug des Abschusses kein zusätzlicher Schub, danach Schub 1. **Nur Vorwärtsschub** (Ergänzung vom 25.11.): der Schub darf nur in die vordere Hälfte der Flugrichtung gelegt werden, also bei sechs Richtungen geradeaus oder 60° schräg nach vorne (Winkel unter 90°). | `torpedo.forwardOnly` |
| 8 | Torpedo-Prüfung | Vor der Bewegung: Gegner im Radius → Detonation. Nach der Bewegung: auf eigener Einheit oder Gegner im Radius → Detonation. Torpedos, die das Feld verlassen, sind weg. | – |
| 9 | Spielfeldrand | Ein Schiff, dessen Ziel ausserhalb liegt, ist zerstört. | `edge` (`destroy`, Alternative `stop`) |
| 10 | Schiff fliegt auf eine Basis | **Das Schiff ist zerstört, die Basis erleidet 4 Schaden.** | `baseCollision` (`ram`, Alternativen `destroyBoth`, `ignore`), `base.ramDamage` |
| 11 | Beide verlieren im selben Zug ihre zweite Einheit | **Wer mehr verbleibende Energie hat, gewinnt**; bei Gleichstand unentschieden. | – |
| 12 | Spiel ohne Ende | Nach 40 Zügen gewinnt, wer weniger Einheiten verloren hat, dann wer mehr Energie hat; sonst unentschieden. | `maxTurns`, `timeout` |
| 13 | Startaufstellung | **Jeder Spieler stellt verdeckt Basis, Schiffe und die Schwung-Marker der Schiffe frei in seiner Zone auf** (unterste bzw. oberste 4 Reihen). Die KI stellt zufällig, aber sinnvoll auf (Basis meist auf einem grünen Feld, Schiffe verteilt, etwas Schwung nach vorne). | `setupRows` |
| 14 | Grüne Felder und helles Mittelfeld | Zuerst nur Orientierungshilfen; **seit 25.11. Planeten**, die nicht durchflogen oder durchschossen werden können. Annahmen dazu: Ein Schiff, das in einen Planeten fliegt, ist zerstört (wie am Spielfeldrand). Ein Torpedo, der in einen Planeten fliegt, geht ohne Detonation verloren. Ein Laser endet vor dem Planeten. | `planets` |
| 15 | Feuert die Basis? | Nein. | – |
| 16 | Reihenfolge in Schritt 4 | Alle Schiffe ziehen gleichzeitig, danach Kollisionen, dann Torpedos auffüllen. | – |
| 17 | Schaden in Schritt 5 | Alle Waffen prüfen gleichzeitig; Schaden wird summiert und danach angewendet. | – |

Zu Punkt 13: Auch die **Basis** wird frei in der eigenen Zone aufgestellt (bestätigt am 25.11.), aber nicht auf einem Planeten.

## Spätere Änderungen

- **25.11.2026:** Schiffe regenerieren keine Energie mehr, dafür kosten Laser keine Energie (`ship.regen: 0`, `laser.cost: 0`). Die Basis regeneriert weiter +2.
- **25.11.2026:** Pro Zug feuert jedes Schiff höchstens eine Waffe, einen Laser oder einen Torpedo (`oneWeaponPerTurn`); mehrere Torpedos dürfen gleichzeitig fliegen. Torpedos können nur beschleunigen: auch der Abschuss aus einem fliegenden Schiff geht nur nach vorne (`torpedo.forwardOnly`).
