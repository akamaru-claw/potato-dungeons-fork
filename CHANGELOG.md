# Changelog

## 2026-10-11 — v3.0: komplette Neuentwicklung

Potato Dungeons wurde von Grund auf neu geschrieben. v3 liegt in `v3/` und
teilt keine Zeile Code mit v2. Die alte Fassung bleibt unter `/` bzw. `/v2/`
erreichbar, bis v3 sich im Alltag bewährt hat.

**Warum neu statt reparieren:** v2 hatte 12.644 Zeilen gewachsenen Code, zwei
parallel laufende und gegeneinander arbeitende Reward-Systeme, Reste
versionierter Dateien (`*.v10.js`) und keinerlei Trennung zwischen Daten,
Logik und Darstellung. Jede Änderung hätte drei andere Stellen gebrochen.

### Spielprinzip
- Brotato-Schleife: Wellen mit Timer, automatisch feuernde Waffen, Lager
  zwischen den Wellen, Knollen als Währung.
- Minecraft-Dungeons-Systeme: Rüstung mit Verzauberungs-Fassungen, Artefakte
  als aktive Fähigkeiten auf drei Daumenknöpfen, Biome mit eigenen Bossen.

### Inhalt
- 27 Waffenfamilien zu je 4 Stufen (108 Waffen), 14 Angriffsmuster
- 7 Waffenklassen mit Satz-Boni bei 2, 4 und 6 Waffen
- 30 Verzauberungen (20 für Waffen, 10 für Rüstung), je 3 Stufen
- 12 Artefakte, 54 Shop-Gegenstände, 31 Aufstiegskarten
- 14 Gegnertypen mit 13 Verhaltensmustern, 7 Elite-Varianten
- 5 Bosse mit je 3 Phasen und eigenen Angriffen
- 5 Biome, 6 Raumformen, 4 Bodengefahren, 5 Schwierigkeitsgrade
- 10 spielbare Figuren mit eigenen Eigenheiten
- 6 Einzigartige Rüstungen mit festen Verzauberungen

### Technik
- Reines ES-Modul-Projekt, kein Build, keine Abhängigkeiten
- Alle Grafiken prozedural gezeichnet und gecacht — keine Bilddateien
- Alle Geräusche und die Musik synthetisch über WebAudio — keine Audiodateien
- Feste Objekt-Pools: nach dem Start keine Allokation im Spielbetrieb
- Dunkelheit als halbaufgelöste Maske mit ausgestanzten Lichtquellen
- Arena-Größe folgt dem Bildschirmformat, damit im Hochformat nichts
  unsichtbar von der Seite kommt
- Spielerwerte werden ausschließlich in `recomputeStats()` berechnet
- Offline spielbar über Service Worker, als PWA installierbar
- Automatische Auflösungsabsenkung, wenn die Bildrate einbricht

### Tests
- `dev/soak.js`: 15 Korrektheitsprüfungen, Dauertest über 45.000 Frames,
  Bosstest über alle Phasen aller fünf Bosse. Beim Abschluss alle grün.
- `dev/serve.py`: mehrthreadiger Testserver

### Gefundene und behobene Fehler während der Entwicklung
- Spielschleife starb bei einem einzelnen Fehler in einem Frame
- Beute-Update lief im Menü, wo es noch keinen Spieler gibt
- Säulen-Raumform setzte einen Block genau auf den Startpunkt des Spielers
- Service Worker lieferte beim lokalen Entwickeln dauerhaft alten Code aus

## 2026-08-07 — v2.1
- Reward-Dialog konsolidiert, doppelter Menü-Start behoben
- SQL-Injection in `auth_api.php` geschlossen
- Null-sicheres Ausblenden im UI, Cache-Busting auf `?v=210`
