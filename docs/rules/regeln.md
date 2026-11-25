# Hexaprog – Spielregeln (Flugvariante)

Ein rundenbasiertes Weltraum-Strategiespiel für zwei Spieler. Beide planen ihre Züge geheim und führen sie gleichzeitig aus. Ziel ist es, mit geschicktem Fliegen die gegnerischen Einheiten zu zerstören.

## Spielziel

Wer zuerst **zwei Einheiten** (Schiffe oder Basis) verliert, hat verloren. Verlieren beide Spieler im selben Zug ihre zweite Einheit, gewinnt, wer mehr Energie übrig hat; bei Gleichstand endet das Spiel unentschieden.

Nach **40 Zügen** endet das Spiel ebenfalls: Es gewinnt, wer weniger Einheiten verloren hat, bei Gleichstand wer mehr Energie hat, sonst unentschieden.

## Spielfeld

Hexagon-Karte mit 19 Reihen: gerade Reihen haben 14 Felder, ungerade 13 (um ein halbes Feld versetzt).

Die vier grünen Felder (zwei pro Seite) und das helle Mittelfeld sind **Planeten**. Sie können weder durchflogen noch durchschossen werden:

- Ein Schiff, dessen Flugweg in einen Planeten führt, prallt auf und ist zerstört.
- Ein Laser endet vor dem Planeten; Felder dahinter gehören nicht zur Schadenszone.
- Ein Torpedo, der in einen Planeten fliegt (auch direkt beim Abschuss), geht verloren, ohne zu detonieren.
- Auf Planeten darf nichts aufgestellt werden.

Ein Schiff, dessen Ziel ausserhalb des Spielfelds liegt, ist zerstört. Ein Torpedo, der das Spielfeld verlässt, ist weg.

## Einheiten

Jeder Spieler hat **1 Basis und 3 Schiffe**.

| | Basis | Schiff |
|---|---|---|
| Energie zu Beginn (= Maximum) | 6 | 6 |
| Energieregeneration | +2 pro Zug | keine |
| Schub | 0 (bewegt sich nicht) | 1 |
| Torpedovorrat | – | 2 |
| Waffen | keine | Laser, Torpedo |

- Die Energie ist zugleich der Schild: Treffer ziehen Energie ab. Eine Einheit ist zerstört, wenn ein Treffer mehr Schaden macht, als sie Energie hat. Mit 0 Energie lebt sie also noch.
- Regeneration füllt höchstens bis zum Startwert auf.
- Beendet ein Schiff seine Bewegung angrenzend an die eigene Basis, wird sein Torpedovorrat aufgefüllt.
- Fliegt ein Schiff auf das Feld einer Basis (auch der eigenen), ist das Schiff zerstört und die Basis erleidet **4 Schaden**.
- Ziehen zwei Schiffe auf dasselbe Feld, sind beide zerstört (auch zwei eigene).

## Aufstellung

Zu Beginn stellt jeder Spieler **verdeckt** seine Basis, seine drei Schiffe und den Schwung-Marker jedes Schiffs frei in seiner Zone auf: die untersten vier Reihen (Spieler 1) bzw. die obersten vier (Spieler 2). Jede Einheit braucht ein eigenes Feld, Planeten sind tabu. Liegt der Schwung-Marker auf dem Schiff, startet es mit Schwung 0. Dann werden beide Aufstellungen gleichzeitig aufgedeckt.

## Schwung und Schub

Jedes Schiff und jeder Torpedo hat einen **Schwung-Marker**. Er zeigt, auf welches Feld die Einheit im nächsten Zug fliegt. Mit **Schub** wird der Marker vor der Bewegung verschoben (Schiffe und Torpedos: um höchstens 1 Feld). Nach der Bewegung wird der Marker wieder im gleichen Abstand und in der gleichen Richtung vor die Einheit gelegt: die Geschwindigkeit bleibt erhalten.

Geplant wird auf einer Hexagon-Kommandokarte pro Einheit, deren Mittelfeld der Schwung-Marker ist. In der WebApp wird direkt auf dem Spielfeld geplant: die wählbaren Felder werden markiert.

## Waffen

Pro Zug feuert jedes Schiff **höchstens eine Waffe**: einen Laser oder einen Torpedo. Waffen treffen auch eigene Einheiten.

### Laser

- Schaden 1, kostet keine Energie.
- Der Laser-Marker wird **relativ zum Schiff** auf ein beliebiges Feld im Radius 3 um das Schiff gelegt (nicht auf das Schiff selbst).
- Der Laser bewegt sich in diesem Zug mit dem Schiff mit: der Marker behält seine Lage relativ zum Schiff.
- Schaden macht der Laser nur an der **Zielposition** des Schiffs: Schadenszone sind alle Felder in gerader Linie vom Schiff (nach seiner Bewegung) zum Laser-Marker. Wird das Schiff beim Bewegen zerstört, feuert der Laser nicht.
- Verläuft der Strahl genau auf der Grenze zwischen zwei Feldern, gehören **beide** Felder zur Schadenszone. Ist eines davon ein Planet, endet der Strahl dort; das andere Feld wird noch getroffen.
- Getroffen wird jede Einheit, deren Flugweg in diesem Zug ein Feld der Schadenszone berührt, ausser das feuernde Schiff. Ein Laser trifft jede Einheit höchstens einmal pro Zug.
- Der Laser verschwindet am Ende des Zuges.

### Torpedo

- Der Torpedo-Marker wird auf den Schwung-Marker des Schiffs oder ein angrenzendes Feld gelegt, nie auf das Schiff selbst. Sein Schwung ist der Abstand vom Schiff zum Marker; in Schritt 5 fliegt er nochmals um diesen Schwung weiter.
- Schaden 2 an allen Einheiten im Radius 1 um den Torpedo.
- Kostet 1 Torpedo aus dem Vorrat des Schiffs. Ein Schiff darf beliebig viele Torpedos gleichzeitig im Flug haben (begrenzt nur durch den Vorrat).
- Torpedos können **nur beschleunigen**: Der Schwung-Pfeil des Torpedos (von Feldmitte zu Feldmitte) darf durch den Schub nur gleich lang bleiben oder länger werden. Das gilt schon beim Abschuss aus einem fliegenden Schiff (gemessen am Schwung des Schiffs) und ab dem Folgezug für den Schub 1, mit dem jeder Torpedo wie ein Schiff gesteuert wird. Erlaubt sind also geradeaus, schräg nach vorne und, wo die Linie dadurch nicht kürzer wird, auch zur Seite: Fliegt ein Torpedo z. B. gerade nach oben, darf er auch nach links oder rechts. Mit Schwung 1 darf er um 60° abbiegen, weil die Linie gleich lang bleibt; nur zurück geht nie.
- Detonation: vor der Bewegung, wenn eine gegnerische Einheit oder ein gegnerischer Torpedo im Radius ist; nach der Bewegung ebenso, oder wenn der Torpedo direkt auf eine eigene Einheit fliegt. Bei einer Detonation erleiden alle Einheiten im Radius Schaden.
- **Abfangen:** Jede Detonation zerstört alle anderen Torpedos im Radius (auch eigene); diese explodieren nicht selbst. So kann ein Torpedo gezielt einem gegnerischen Torpedo entgegengesteuert werden. Alle Torpedos werden gleichzeitig geprüft: zwei Torpedos, die sich gegenseitig auslösen, detonieren beide.

## Zugablauf

1. **Zug planen** – beide Spieler legen geheim Schub und Waffen fest.
2. **Waffen abfeuern** – Laser-Marker werden relativ zum Schiff gelegt, Torpedo-Marker auf den Schwung-Marker des Schiffs oder ein angrenzendes Feld.
3. **Schub anwenden** – die Schwung-Marker der Schiffe und Torpedos werden verschoben.
4. **Schiffe bewegen** – alle Schiffe ziehen gleichzeitig auf ihren Schwung-Marker, ihre Laser-Marker ziehen mit. Danach werden Zusammenstösse, Aufprall auf Planeten, Rammen von Basen und der Spielfeldrand ausgewertet, dann Torpedos an der Basis aufgefüllt.
5. **Waffen auswerten und Torpedos bewegen** – Laser treffen alles, was in diesem Zug ihre Schadenszone berührt hat. Torpedos ziehen gleichzeitig gemäss ihrem Schwung; vor und nach der Bewegung wird geprüft, welche Einheiten in ihrem Radius sind. Der Schaden aller Waffen wird zusammengezählt und erst dann abgezogen.
6. **Energie regenerieren** – jede Basis +2 (bis zum Maximum), Schiffe nicht.
7. **Aufräumen** – Laser kommen vom Spielplan, Torpedos fliegen weiter.

## Varianten im KI-Lab

Alle Zahlen und Schalter stehen in `engine/rules.js` und lassen sich im KI-Lab verändern, um Regelideen zu testen. Die wichtigsten Alternativen:

| Regel | Schalter | Alternativen |
|---|---|---|
| Zerstörung | `destroyWhen` | `zero`: schon bei 0 Energie zerstört |
| Spielfeldrand | `edge` | `stop`: Schiff bleibt am Rand stehen |
| Schiff auf Basis | `baseCollision`, `base.ramDamage` | `destroyBoth`, `ignore` |
| Laser Schaden an | `laser.sweep` | `both`: auch an der Startposition des Schiffs |
| Laser platzieren | `laser.mode`, `laser.range` | `momentum`: wie früher neben den Schwung-Marker (±1), fliegt weiter |
| Laser auf Feldgrenze | `laser.edgeBoth` | aus: nur eines der beiden Felder |
| Eine Waffe pro Zug | `oneWeaponPerTurn` | aus: Laser und Torpedo im selben Zug |
| Torpedos nur vorwärts | `torpedo.forwardOnly` | aus: Schub in alle Richtungen |
| Torpedos fangen Torpedos ab | `torpedo.intercept` | aus: Torpedos ignorieren sich |
| Torpedos pro Schiff im Flug | `torpedo.perShip` | 0 = beliebig viele |
| Planeten | `planets` | aus: farbige Felder nur Orientierung |
| Eigenbeschuss | `friendlyFire` | aus |
| Spiellänge | `maxTurns`, `timeout` | |
