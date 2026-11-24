# Hexaprog – Spielregeln (Flugvariante)

Ein rundenbasiertes Weltraum-Strategiespiel, bei welchem die Spieler ihre Züge gleichzeitig planen und ausführen, um mit geschicktem Fliegen die gegnerischen Einheiten zu zerstören.

Quelle: *Spielregeln_Flugvariante.docx* (erstes Regelset). Was dort offen ist, steht in [annahmen.md](annahmen.md) und ist im KI-Lab umschaltbar. Alle Zahlen sind Parameter in `engine/rules.js`.

## Spielfeld

Hexagon-Karte mit 14 × 19 Feldern: 19 Reihen, gerade Reihen mit 14 Feldern, ungerade mit 13 (um ein halbes Feld versetzt). Vier grüne Felder (zwei pro Seite) und ein helles Mittelfeld sind markiert.

## Kommandokarte

Jeder Spieler hat eine Hexagon-Kommandokarte pro Einheit: Schiff 1–3, Laser 1–3, Torpedo 1–3. Das mittlere Feld ist die relative Position der Einheit bzw. ihres Schwung-Plättchens. In der WebApp wird direkt auf dem Spielfeld geplant: die wählbaren Felder rund um den Schwung-Marker werden markiert.

## Einheiten

Jeder Spieler hat zu Beginn **3 Schiffe und 1 Basis**.

| | Basis | Schiff |
|---|---|---|
| Energiepunkte | 6 | 6 |
| Energieregeneration | +2 / Zug | +1 / Zug |
| Schub | 0 (kann sich nicht bewegen) | 1 |
| Torpedoplätze | – | 2 |

Beendet ein Schiff seine Bewegung angrenzend an die eigene Basis, werden seine Torpedos aufgefüllt.

## Allgemeine Regeln

- Treffer verbrauchen Energie, da sich die Schiffe mit einem Energieschild schützen.
- Laser abzufeuern kostet Energiepunkte.
- Jedes Schiff hat begrenzten Laderaum für Torpedos.
- Jeder Spieler plant seinen Zug geheim auf seiner Kommandokarte, anschliessend führen beide Spieler alle weiteren Punkte gleichzeitig aus.
- Wer zuerst **zwei Einheiten** (Basen oder Schiffe) verliert, hat das Spiel verloren.
- **Schwung** wird mit einem Marker pro Einheit dargestellt und zeigt, wohin sich die Einheit im nächsten Zug bewegen würde. Mit Schub kann dieser Marker verschoben werden.
- Abgefeuerte Waffen werden als Marker auf dem Spielfeld dargestellt.

## Zugreihenfolge

1. **Zug planen** – Schub und Waffenplättchen auf die Kommandokarte legen.
2. **Waffe abfeuern** – Laser/Torpedo-Marker werden gelegt (Schwung des Schiffs ±1).
3. **Schub anwenden** – das Schwung-Plättchen wird um den Schub verschoben.
4. **Schiffe gemäss Schwung bewegen** – alle Schiffe rücken auf ihr Schwung-Plättchen vor, das Plättchen wird relativ zur Schiffposition gleich wie zuvor ausgelegt. Zwei Schiffe, die so auf dasselbe Feld ziehen, werden beide zerstört.
5. **Waffen gemäss Schwung bewegen** – wie Schiffe, aber vor und nach dem Bewegen wird geprüft, ob Einheiten in der Schadenszone sind; diese erleiden Schaden. Jeder Laser kann jeder Einheit nur 1× pro Zug Schaden zufügen.
6. **Energie regenerieren** – alle Einheiten gemäss Typ.
7. **Aufräumen** – Plättchen auf den Kommandokarten zurücknehmen, abgefeuerte Laser kommen vom Spielplan.

## Waffen

### Laser
- Schaden 1, Kosten 1 Energie.
- Schadenszone: alle Felder in gerader Linie zwischen Schiff und Laser-Marker.
- Initialer Schwung: Schwung des Schiffs ±1.
- Verschwindet am Ende des Zuges. Trifft alle Einheiten, die sich in diesem Zug über oder auf ein Feld der Schadenszone bewegen.

### Torpedo
- Schaden 2, Schadenszone 1 Feld Radius um den Torpedo-Marker.
- Initialer Schwung: Schwung des Schiffs ±1, danach Schub 1 (wird jeden Zug auf der Torpedo-Kommandokarte geplant).
- Kosten: 1 Torpedo aus dem Schiffsvorrat.
- Fliegt weiter wie ein Schiff und detoniert automatisch, wenn eine gegnerische Einheit in seiner Schadenszone ist oder wenn er direkt auf eine eigene Einheit fliegt. In beiden Fällen erleiden alle Einheiten in der Schadenszone Schaden.
