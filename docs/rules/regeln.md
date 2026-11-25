# Hexaprog – Spielregeln (Flugvariante)

Ein rundenbasiertes Weltraum-Strategiespiel, bei welchem die Spieler ihre Züge gleichzeitig planen und ausführen, um mit geschicktem Fliegen die gegnerischen Einheiten zu zerstören.

Quelle: *Spielregeln_Flugvariante.docx* (erstes Regelset) und Daniels Antworten auf die offenen Punkte vom 25.11.2026, gesammelt in [annahmen.md](annahmen.md). Varianten sind im KI-Lab umschaltbar. Alle Zahlen sind Parameter in `engine/rules.js`.

## Spielfeld

Hexagon-Karte mit 14 × 19 Feldern: 19 Reihen, gerade Reihen mit 14 Feldern, ungerade mit 13 (um ein halbes Feld versetzt). Die vier grünen Felder (zwei pro Seite) und das helle Mittelfeld sind **Planeten**: sie können weder durchflogen noch durchschossen werden.

- Ein Schiff, dessen Flugweg in einen Planeten führt, prallt auf und ist zerstört.
- Ein Laser endet vor dem Planeten; Felder dahinter liegen nicht in der Schadenszone.
- Ein Torpedo, der in einen Planeten fliegt (auch beim Abschuss), geht verloren, ohne zu detonieren.
- Auf Planeten darf nichts aufgestellt werden.

## Aufstellung

Zu Beginn stellt jeder Spieler verdeckt seine Basis, seine drei Schiffe und den Schwung-Marker jedes Schiffs frei in seiner eigenen Zone auf: die untersten vier Reihen (Spieler 1) bzw. die obersten vier (Spieler 2). Einheiten brauchen je ein eigenes Feld; liegt der Schwung-Marker auf dem Schiff, startet es mit Schwung 0. Dann werden die Aufstellungen gleichzeitig aufgedeckt.

## Kommandokarte

Jeder Spieler hat eine Hexagon-Kommandokarte pro Einheit: Schiff 1–3, Laser 1–3, Torpedo 1–3. Das mittlere Feld ist die relative Position der Einheit bzw. ihres Schwung-Plättchens. In der WebApp wird direkt auf dem Spielfeld geplant: die wählbaren Felder rund um den Schwung-Marker werden markiert.

## Einheiten

Jeder Spieler hat zu Beginn **3 Schiffe und 1 Basis**.

| | Basis | Schiff |
|---|---|---|
| Energiepunkte | 6 | 6 |
| Energieregeneration | +2 / Zug | keine |
| Schub | 0 (kann sich nicht bewegen) | 1 |
| Torpedoplätze | – | 2 |

Beendet ein Schiff seine Bewegung angrenzend an die eigene Basis, werden seine Torpedos aufgefüllt. Die Basis hat keine Waffen.

Fliegt ein Schiff auf das Feld einer Basis (auch der eigenen), wird das Schiff zerstört und die Basis erleidet 4 Schaden.

## Allgemeine Regeln

- Treffer verbrauchen Energie, da sich die Schiffe mit einem Energieschild schützen.
- Laser abzufeuern kostet keine Energie (Änderung vom 25.11.2026; vorher 1). Dafür regenerieren Schiffe keine Energie mehr, nur die Basis.
- Jedes Schiff hat begrenzten Laderaum für Torpedos.
- Jeder Spieler plant seinen Zug geheim auf seiner Kommandokarte, anschliessend führen beide Spieler alle weiteren Punkte gleichzeitig aus.
- Wer zuerst **zwei Einheiten** (Basen oder Schiffe) verliert, hat das Spiel verloren. Verlieren beide im selben Zug ihre zweite Einheit, gewinnt, wer mehr verbleibende Energie hat; bei Gleichstand unentschieden.
- Eine Einheit ist zerstört, wenn ein Treffer mehr Schaden macht, als sie Energie hat. Regeneration füllt höchstens bis zum Startwert auf.
- Ein Schiff, dessen Ziel ausserhalb des Spielfelds liegt, ist zerstört.
- Nach 40 Zügen gewinnt, wer weniger Einheiten verloren hat, dann wer mehr Energie hat.
- **Schwung** wird mit einem Marker pro Einheit dargestellt und zeigt, wohin sich die Einheit im nächsten Zug bewegen würde. Mit Schub kann dieser Marker verschoben werden.
- Abgefeuerte Waffen werden als Marker auf dem Spielfeld dargestellt.

## Zugreihenfolge

1. **Zug planen** – Schub und Waffenplättchen auf die Kommandokarte legen.
2. **Waffe abfeuern** – Laser/Torpedo-Marker werden gelegt (Schwung des Schiffs ±1).
3. **Schub anwenden** – das Schwung-Plättchen wird um den Schub verschoben.
4. **Schiffe gemäss Schwung bewegen** – alle Schiffe rücken auf ihr Schwung-Plättchen vor, das Plättchen wird relativ zur Schiffposition gleich wie zuvor ausgelegt. Zwei Schiffe, die so auf dasselbe Feld ziehen, werden beide zerstört.
5. **Waffen gemäss Schwung bewegen** – wie Schiffe, aber vor und nach dem Bewegen wird geprüft, ob Einheiten in der Schadenszone sind; diese erleiden Schaden. Jeder Laser kann jeder Einheit nur 1× pro Zug Schaden zufügen.
6. **Energie regenerieren** – die Basis +2, Schiffe nicht.
7. **Aufräumen** – Plättchen auf den Kommandokarten zurücknehmen, abgefeuerte Laser kommen vom Spielplan.

## Waffen

### Laser
- Schaden 1, keine Energiekosten.
- Schadenszone: alle Felder in gerader Linie zwischen Schiff und Laser-Marker.
- Initialer Schwung: Schwung des Schiffs ±1.
- Verschwindet am Ende des Zuges. Trifft alle Einheiten, die sich in diesem Zug über oder auf ein Feld der Schadenszone bewegen.

### Torpedo
- Schaden 2, Schadenszone 1 Feld Radius um den Torpedo-Marker.
- Initialer Schwung: Schwung des Schiffs ±1, danach Schub 1 (wird jeden Zug auf der Torpedo-Kommandokarte geplant). Torpedos werden wie Schiffe über Schub gesteuert, haben aber nur Vorwärtsschub: der Schub darf nur in die vordere Hälfte der aktuellen Flugrichtung gelegt werden (geradeaus oder schräg nach vorne).
- Kosten: 1 Torpedo aus dem Schiffsvorrat. Ein Schiff darf beliebig viele Torpedos gleichzeitig im Flug haben.
- Fliegt weiter wie ein Schiff und detoniert automatisch, wenn eine gegnerische Einheit in seiner Schadenszone ist oder wenn er direkt auf eine eigene Einheit fliegt. In beiden Fällen erleiden alle Einheiten in der Schadenszone Schaden.
