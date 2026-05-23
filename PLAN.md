# 🥔 Potato Dungeons — Projektplan

## Konzept
Mix aus **Minecraft Dungeons Turm-Modus** und **Brotato**:
- Top-Down Arena-Survivor (wie Brotato)
- Statt offener Arena: **Dungeon-Räume/Ebenen** (wie Turm in Minecraft Dungeons)
- Jede Ebene = 1 Raum mit Gegnern → alle killn → Tür öffnet sich → nächste Ebene
- Nach jeder Ebene: **Belohnung wählen** (Waffe/Upgrade/Heilung)
- Immer schwieriger werdende Ebenen (wie Turm: höher = schwerer)
- Roguelike: Tod = von vorne

## Tower-Modus Prinzipien (aus Minecraft Dungeons)
1. **Feste Ebenen-Reihenfolge** — keine Random-Map-Generierung, sondern vorgegebene Ebenen
2. **Nach jeder Ebene: 3 Belohnungen zur Wahl** (wie Brotato Level-Up)
3. **Kein Gold/Shop** — Belohnungen sind das einzige Progression-System
4. **Schwierigkeit steigt** — neue Gegnertypen erscheinen auf höheren Ebenen
5. **Ein Leben** — Permadeath, Roguelike

## Technischer Aufbau
- Eigenständige HTML/CSS/JS-App (wie Brotato)
- Gleiche Engine-Basis (Canvas, Input, Renderer)
- Eigene URL: https://ml-bets.com/potato-dungeons/

## Aufgabenliste

### Phase 1: Grundgerüst
- [ ] Projekt-Ordner + index.html + CSS + JS-Struktur erstellen
- [ ] Canvas + Renderer + Camera (mit Zoom) aus Brotato übernehmen
- [ ] Input-System (Touch + Keyboard) aus Brotato übernehmen
- [ ] Config.js für Dungeons-Konfiguration
- [ ] Player (Kartoffel) mit Movement + HP

### Phase 2: Dungeon-Ebenen-System
- [ ] DungeonFloor-System: Ebenen-Definition (Größe, Gegner, Theme)
- [ ] Raum-Generierung: Wände, Türen, Hindernisse pro Ebene
- [ ] Tür-System: Alle Gegner tot → Tür leuchtet → Berühren = nächste Ebene
- [ ] Ebenen-Progression: 1→2→3... mit steigender Schwierigkeit
- [ ] Floor-Counter HUD ("Ebene 5/∞")

### Phase 3: Kampf-System
- [ ] Weapon-System aus Brotato adaptieren
- [ ] Projectile-System aus Brotato adaptieren
- [ ] Enemy-System mit Dungeon-spezifischen Gegner-Typen
- [ ] Collision-System (Gegner/Wand/Projektil)
- [ ] Partikel- + FloatingText-System

### Phase 4: Belohnungs-System
- [ ] Nach jeder Ebene: 3 Belohnungen zur Wahl
- [ ] Waffen-Belohnungen (neue Waffen)
- [ ] Stat-Upgrades (mehr HP, Speed, Damage, etc.)
- [ ] Heilungs-Belohnungen
- [ ] Belohnungs-Screen UI

### Phase 5: Gegner + Dungeon-Themes
- [ ] Grund-Gegner (Skeleton, Slime, Bat, Spider)
- [ ] Elite-Gegner ab höhren Ebenen
- [ ] Boss-Gegner alle 10 Ebenen
- [ ] Dungeon-Themes (Dungeon, Höhle, Festung, Nether-ähnlich)
- [ ] Neue Gegner-Typen pro Theme

### Phase 6: Visuals + Polish
- [ ] Dungeon-Tile-Rendering (Boden, Wände)
- [ ] Kartoffel-Skins
- [ ] Tür-Animationen (aufleuchten, öffnen)
- [ ] Ebenen-Übergang-Animation
- [ ] Boss-Intro-Animation
- [ ] Vignette + Damage Flash + Partikel

### Phase 7: Meta-Systeme
- [ ] Persistent Highscore (localStorage)
- [ ] Game Over Screen mit Stats
- [ ] Menü + Skin-Auswahl
- [ ] Audio/SFX
- [ ] Mobile-Optimierung

### Phase 8: Deployment
- [ ] Auf Strato hochladen
- [ ] Cache-Busting
- [ ] Testing auf Mobile