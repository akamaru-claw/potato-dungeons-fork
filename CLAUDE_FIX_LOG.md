# Claude Fix Log — Qualitätsaufarbeitung v0.49-dev → v0.50

Datum: 2026-06-29
Durchgeführt von: Claude (Sonnet 4.6) im Auftrag von Akamaru/Kiba

## Methodik

1. Alle 18 geladenen JS-Dateien (`js/*.js`, ohne die unbenutzten `*.v10.js`/`js_backup`-Altlasten) + `index.html` gelesen.
2. Drei parallele Sub-Agenten haben player/weapons/projectiles/enemies/renderer, dungeon/rewards/multiplayer/main bzw. ui.js noch einmal unabhängig auf konkrete Laufzeitfehler durchsucht (jeder Fund wurde von mir selbst nachverifiziert, bevor er gefixt wurde).
3. Headless-Smoke-Tests mit Puppeteer + echtem `google-chrome` (kein gebündeltes Chromium) gegen einen lokalen `php -S`-Server (volle Parität mit Produktion, inkl. SQLite-Backend für `auth_api.php`).
4. Visueller Vergleich per Screenshot vor/nach den HUD-Fixes.

## Gefundene & gefixte Bugs

### 1. Melee-Waffen ignorierten alle Damage-Boni (js/weapons.js:84)
`_meleeHit()` las `player.stats.damagePercent` — ein Property, das in der gesamten Codebase nie geschrieben wird (der echte Stat heißt `player.stats.damage`, siehe `rewards.js:180`, `player.js:76`). Dadurch skalierten Nahkampfwaffen **nicht** mit Charakter-Boni (z.B. Teufelskartoffel +30%), dem Stat-Upgrade „+15% Damage" oder dem Relikt „Ofenhandschuhe". Fernkampfwaffen waren NICHT betroffen, da deren Schaden zusätzlich in `main.js` (Projektil-Treffer) korrekt mit `player.stats.damage` multipliziert wird — dort `projectiles.js` unverändert gelassen, um keine Doppel-Anwendung des Bonus einzuführen.
**Fix:** `player.stats.damagePercent` → `player.stats.damage`.

### 2. Doppeltes/überlappendes HUD (js/renderer.js, sichtbar im Screenshot)
Das DOM-HUD (`#hud` in index.html, gepflegt von `UI.updateHUD()`) und das alte Canvas-HUD (`Renderer.renderHUD()`) zeichneten **gleichzeitig** Floor-Titel, HP-Bar, XP-Bar und Kill-Counter — sichtbar als überlappender, unleserlicher Text mitten im Bild. Vermutlich ein Rest aus der schrittweisen Migration zum DOM-HUD (laut README-Changelog), bei der der alte Canvas-Code nie entfernt wurde.
**Fix:** Canvas-Zeichnung von Floor/HP/XP/Kills entfernt (die DOM-Version ist jetzt alleinige Quelle). Theme-Name + Live-Gegnerzahl (kein DOM-Äquivalent vorhanden) sowie die Waffen-Slot-Anzeige (bewusst weiterhin Canvas-only, siehe `UI.updateWeaponBar()`-Kommentar) bleiben erhalten.

### 3. HP-Text in der Bildschirmmitte statt auf der HP-Bar (index.html)
`<span id="hud-hp-text">` war ein **Geschwister-Element** von `#hud-hp-bar` statt ein Kind-Element. Das CSS (`.hud-hp-text { position:absolute; left:50%; top:50% }`) erwartet aber `#hud-hp-bar` (mit `position:relative`) als Bezugsrahmen — ohne diese Verschachtelung positionierte sich der Text relativ zum nächsten `position`-Vorfahren, dem fullwidth-`#hud`-Container, und landete dadurch in der Bildschirmmitte statt auf der kleinen HP-Bar oben links.
**Fix:** `<span id="hud-hp-text">` als Kind von `<div id="hud-hp-bar">` verschachtelt.

### 4. Multiplayer: `onRewardConfirm`-Handler fehlerhaft verschachtelt (js/ui.js:259-276)
`Multiplayer.onRewardConfirm = ...` stand fälschlich **innerhalb** der Closure von `Multiplayer.onStartGame`, statt als eigenständige Zuweisung daneben. In der Praxis kein reproduzierbarer Hang (da `onStartGame` immer vor der ersten Reward-Runde feuert), aber strukturell falsch und fehleranfällig bei künftigen Änderungen.
**Fix:** Block aus der Closure herausgezogen, jetzt eigenständige Top-Level-Zuweisung wie `onNextFloor`/`onShowReward`.

### 5. Multiplayer: Host hängt nach Waffen-Replace-Dialog in Reward-Screen (js/ui.js:1270)
`_waitForCoopReplaceDialog()` prüfte `Multiplayer._clientRewardConfirmed` — ein Property, das nirgendwo in der Codebase je gesetzt wird (Grep über alle Dateien: 0 Treffer als Setter). Das tatsächlich gepflegte Tracking ist `Multiplayer._confirmedPlayers` (ein `Set` von Connections, siehe `multiplayer.js:457`). Folge: Sobald in einem Co-Op-Spiel mit ≥1 Client eine Belohnung einen Waffen-Replace-Dialog auslöste, wurde `_advanceAfterRewards()` nie aufgerufen — der Host blieb für immer im Reward-Screen stecken.
**Fix:** Auf `Multiplayer._confirmedPlayers` umgestellt (gleiche Logik wie der bereits funktionierende Standard-Reward-Confirm-Pfad).

### 6. `_hideRewardScreen()` war No-Op (js/ui.js:1262)
Suchte nach `#reward-screen`, das Element heißt aber `#screen-reward`. Kein Crash (dank `if (overlay)`-Guard), aber funktionslos — maskiert, weil `Game.finishReward()` im selben Tick ohnehin über `UI.showGame() → _hideAll()` alle Screens korrekt versteckt.
**Fix:** Korrekte ID + `classList.remove('active')` (konsistent mit `showReward()`, das `classList.add('active')` nutzt statt `style.display`).

### 7. Event-Listener-Leak im Menü-Canvas (js/ui.js:398-441)
`startMenuCanvas()` (aufgerufen von `showMenu()`, das bei *jeder* Rückkehr zum Hauptmenü erneut läuft — nach Lobby/Shop/Profil/Highscores/Anleitung „Zurück", Logout, Pause→Menü) registrierte bei jedem Aufruf neue `keydown`/`keyup`-Listener auf `window` sowie neue `touchstart`/`touchmove`/`touchend`-Listener auf dem Menü-Canvas, ohne die alten zu entfernen. Über eine lange Session akkumulieren sich Dutzende Listener (Speicher-/CPU-Leck). Visuell kaum bemerkbar (idempotente State-Updates), aber ein echter Bug.
**Fix:** Guard-Flag `_menuListenersBound`, Listener werden nur einmal registriert (Canvas-Element ist statisch in index.html, bleibt über die gesamte Page-Lifetime gültig).

### 8. Fehlende Absicherung gegen blockiertes `localStorage` (js/account.js, js/ui.js)
Alle direkten `localStorage.getItem/setItem/removeItem`-Aufrufe liefen ungeschützt. In Private-Browsing-Modi, bei vollem Storage-Quota oder restriktiven Browser-Einstellungen kann der Zugriff auf `localStorage` eine `SecurityError`-Exception werfen — das hätte `Account.init()` (läuft beim Start) bzw. den Login/Highscore-Flow hart abstürzen lassen.
**Fix:** Neue Helfer `Utils.storageGet/storageSet/storageRemove` (try/catch, geben bei Fehler `null`/`false` zurück statt zu werfen) in `utils.js`, alle 7 Call-Sites in `account.js`/`ui.js` umgestellt. Verifiziert per Puppeteer-Test mit absichtlich blockiertem `localStorage` (siehe Tests unten) — Spiel lädt, startet und zeigt Game-Over-Screen weiterhin fehlerfrei.

### 9. Versionsnummer/Cache-Busting-Drift (index.html)
`#version-tag` zeigte `v0.49-dev`, alle `?v=` Cache-Busting-Query-Strings (CSS + 18 JS-Dateien) standen aber noch auf `039` (= v0.39) — seit mindestens 10 Versionen nicht mehr mitgezogen. Hätte bei Strato (kein automatisches Cache-Invalidieren) dazu führen können, dass Nutzer alte JS-Stände aus dem Browser-/CDN-Cache bekommen, obwohl der Server neue Dateien hat.
**Fix:** `version-tag` → `v0.50`, alle `?v=039` → `?v=050` (CSS + 18 Script-Tags), damit konsistent.

## Geprüft, aber bewusst NICHT verändert (dokumentiert statt gefixt, wie angewiesen)

- **Relikt-Stacking (player.js `applyRelics()`):** Beim Hinzufügen eines NEUEN Relikts werden die Effekte ALLER bereits besessenen Relikte erneut angewendet (Loop über `this.relics` bei jedem `addRelic()`-Aufruf), statt nur das neue Relikt einmalig zu verarbeiten. Zusätzlich nutzen `speed`/`dodge`/`attackSpeed`-Boni Werte wie `0.1`/`0.3`/`0.15`, während das restliche Stat-System überall mit vollen Prozentpunkten rechnet (z.B. `value:15` = +15%) — die Größenordnung ist also ca. 100× kleiner als die Relikt-Beschreibungen suggerieren ("+30% Dodge" wirkt real wie +0.3%). Die beiden Effekte überlagern sich (winziger Bonus, der bei jedem neuen Relikt nochmal angewendet wird) und sind damit in der Praxis kaum spürbar. Echtes Fixen würde eine Neuberechnung-statt-Akkumulation-Logik erfordern (Balance-Entscheidung, kein reiner Bugfix) — daher hier nur dokumentiert.
- **`Multiplayer.onShowReward`-Callback in ui.js wird nie aufgerufen** (multiplayer.js ruft beim `'showReward'`-Message-Handler direkt `UI.showReward()` auf, nicht `this.onShowReward()`). Toter Code ohne Fehlverhalten — Reward-Screen erscheint trotzdem korrekt.
- `js_backup/`, `js/*.v10.js`: unbenutzte Altstände, werden von keinem `<script>`-Tag referenziert. Nicht gelöscht (außerhalb des Auftrags „keine Rewrite-Show").

## Tests

Setup: `php -S 127.0.0.1:8791` im Projektroot (volle Parität mit Produktions-PHP-Backend, SQLite wird automatisch angelegt) + Puppeteer (`puppeteer-core`) gegen System-`google-chrome` (headless).

**Smoke-Test (`/tmp/pd-puppet/test.js`) — alle Schritte ✅, 0 Konsolenfehler, 0 fehlgeschlagene Requests:**
1. Menü lädt, `#screen-menu` aktiv, Versions-Tag zeigt `v0.50`
2. `Game.startGame()` → Status `PLAYING`, 5 Gegner gespawnt
3. Movement (WASD-Simulation) → Spielerposition ändert sich sichtbar
4. ~3s aktiver Kampf (Auto-Fire-Waffen, Gegner greifen an) → HP sinkt korrekt, kein Crash
5. Reward-Screen erzwungen (`Rewards.generate` + `UI.showReward`) → zeigt Belohnungskarten
6. Game-Over erzwungen (`Game.player.hp=0; Game.gameOver()`) → Game-Over-Screen mit korrektem Floor-Text
7. Retry (`Game.startGame()` erneut) → Status wieder `PLAYING`, kein Hängenbleiben

**localStorage-Robustheit (`/tmp/pd-puppet/test-storage.js`) — 0 Fehler:**
`localStorage`-Zugriff künstlich auf `SecurityError`-Exception umgestellt (simuliert Private-Browsing/Quota-Block) → Menü lädt, Spiel startet, Game-Over-Screen erscheint weiterhin — kein harter Crash mehr (vor Fix #8 hätte das `Account.init()` beim Boot zum Absturz gebracht).

**Visuelle Verifikation:** Screenshots vor/nach Fix #2+#3 bestätigen, dass das HUD jetzt einmalig und korrekt positioniert ist (kein überlappender Text, HP-Text sitzt auf der Bar statt in der Bildschirmmitte).

**Nicht automatisiert getestet** (außerhalb des realistischen Scopes ohne zweiten echten PeerJS-Peer): Live-Co-Op-Verbindung zwischen zwei Browser-Instanzen. Die MP-Fixes (#4, #5) wurden stattdessen durch Code-Verifikation (grep nach Setter/Getter-Konsistenz) abgesichert.

## Versionsmanagement

- `v0.49-dev` → `v0.50`
- Cache-Busting `?v=039` → `?v=050` für `css/style.css` und alle 18 `js/*.js`-Script-Tags
