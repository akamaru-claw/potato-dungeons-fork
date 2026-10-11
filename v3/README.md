# Potato Dungeons v3

Wellen-Roguelike fürs Handy. Das Spielprinzip von **Brotato** (Wellen,
automatisch feuernde Waffen, Laden dazwischen) kombiniert mit den Systemen aus
**Minecraft Dungeons** (Ausrüstung mit Verzauberungs-Fassungen, Artefakte als
aktive Fähigkeiten, Biome mit eigenen Bossen).

Komplett neu geschrieben — teilt sich keine Zeile mit v2.

## Spielen

Einfach `index.html` auf einem Webserver öffnen. Kein Build, keine
Abhängigkeiten, keine Bilddateien — alle Grafiken und Geräusche entstehen zur
Laufzeit im Browser.

Lokal zum Entwickeln:

```bash
python3 dev/serve.py        # http://127.0.0.1:8777
```

## Steuerung

| Was | Handy | Tastatur |
|-----|-------|----------|
| Laufen | Linke Bildschirmhälfte, Daumen auflegen und ziehen | WASD / Pfeiltasten |
| Angreifen | passiert automatisch | automatisch |
| Rollen | ↻ unten rechts | Leertaste / Shift |
| Artefakte | drei Knöpfe über dem Rollen-Knopf | 1, 2, 3 |
| Pause | ❚❚ oben rechts | Esc / P |

Der Stick entsteht dort, wo der Daumen aufsetzt — keine feste Position. Für
Linkshänder lässt sich die Seite in den Einstellungen tauschen.

## Aufbau

```
index.html            Gerüst, HUD-Markup
css/style.css         gesamte Oberfläche
sw.js                 Offline-Cache (nur auf dem echten Host aktiv)
src/
  main.js             verdrahtet alles, startet die Schleife
  core/
    math.js           Vektoren, Kollision, Easing
    rng.js            deterministischer Zufall (Startwert je Lauf)
    storage.js        Spielstand in localStorage
    audio.js          sämtliche Geräusche + Musik synthetisch über WebAudio
    input.js          Touch, Tastatur, Gamepad, dynamischer Stick
    sprites.js        alle Grafiken prozedural, gecacht
    fx.js             Partikel, Schadenszahlen, Wackeln — feste Pools
  data/
    weapons.js        27 Waffenfamilien × 4 Stufen = 108 Waffen
    enchants.js       30 Verzauberungen
    artifacts.js      12 aktive Artefakte
    items.js          54 Shop-Gegenstände
    enemies.js        14 Gegner, 7 Elite-Varianten, 5 Bosse
    biomes.js         5 Biome, 4 Gefahrenarten, 5 Schwierigkeitsgrade
    characters.js     10 Figuren, 31 Aufstiegskarten
  game/
    entities.js       Objekt-Pools (nach dem Start keine Allokation mehr)
    state.js          Laufzustand, Werte-Berechnung an genau einer Stelle
    dungeon.js        Arena-Erzeugung, Kollision, Boden/Wände zeichnen
    combat.js         Waffenmuster, Schadensformel, Statuseffekte
    ai.js             Gegnerverhalten und Boss-Phasen
    loot.js           Rüstung, Drops, Aufsammeln, Shop-Auslage
    run.js            Spielschleife, Wellen, Rendering
  ui/
    dom.js            Mini-Helfer statt Framework
    cards.js          Karten für Waffen/Gegenstände/Artefakte/Rüstung
    hud.js            Balken und Zähler im DOM
    camp.js           Lager: Laden, Schmiede, Ausrüstung
    screens.js        Menü, Laufvorbereitung, Pause, Tod, Sieg, Einstellungen
dev/
  serve.py            Testserver
  soak.js             Dauertest, Bosstest, Zustandsprüfung
```

## Systeme

**Waffen** gibt es in Familien zu je vier Stufen. Zwei gleiche Waffen derselben
Stufe lassen sich im Lager zur nächsten verschmelzen — bis Legendär. Vier
Plätze zwingen zur Entscheidung: breit sammeln für Klassen-Boni oder eindampfen
für rohe Zahlen.

**Waffenklassen** (Klinge, Wucht, Stich, Fernkampf, Elementar, Konstrukt,
Natur) geben ab 2, 4 und 6 Waffen wachsende Boni.

**Verzauberungen** sitzen in Fassungen auf Waffen und Rüstung. Pro Fassung
werden drei Runen angeboten, gewählt wird eine — endgültig. Punkte gibt es bei
jeder dritten Stufe.

**Artefakte** sind die drei Daumenknöpfe: Heiltotem, Feuerwerksrakete,
Eisnebel, Beschwörungshorn und acht weitere.

**Biome** haben eigene Gegnerpools, Farbwelten, Bodengefahren und Bosse. Jedes
freigeschaltete Biom öffnet das nächste und eine neue Figur.

## Tests

In der Browser-Konsole:

```js
const m = await import('./dev/soak.js');
console.log(await m.checks());      // 15 Korrektheitsprüfungen
console.log(await m.soak());        // 5 Läufe ohne Oberfläche, sammelt Fehler
console.log(await m.soakBosses());  // alle Bosse, alle Phasen
```

## Technische Entscheidungen

- **Keine Assets.** Sprites werden beim ersten Gebrauch in Offscreen-Canvases
  gezeichnet und gecacht, Geräusche aus Oszillatoren und Rauschen gebaut. Das
  Spiel lädt in unter 200 KB und ist sofort da.
- **Keine Allokation im Spielbetrieb.** Gegner, Projektile, Partikel und
  Beute liegen in festen Pools. Der Garbage Collector ist auf Handys die
  häufigste Ruckel-Ursache.
- **Die Arena richtet sich nach dem Bildschirm.** Im Hochformat wäre ein
  quadratischer Raum unfair — man sähe seitlich nichts kommen.
- **Dunkelheit als Maske.** Die Welt wird normal gezeichnet, darüber liegt eine
  halbaufgelöste Maske, in die Fackeln, Spieler und Gegner Löcher brennen.
- **Werte an einer Stelle.** `recomputeStats()` ist die einzige Funktion, die
  Spielerwerte schreibt. Balance-Fehler haben dadurch genau einen Fundort.
