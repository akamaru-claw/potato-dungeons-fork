# 🥔 Potato Dungeons Fork

Enhanced fork of Potato Dungeons — a roguelike dungeon crawler built with vanilla JS & HTML5 Canvas.

## Features (v0.9)

- ✅ Bug-Fix: rewards.js Template-Literal
- ✅ Dash ability (Space / Double-Tap)
- ✅ Relics as 4th reward type (6 relics)
- ✅ DOM HUD (HP-Bar, XP-Bar, Gold/Kills/Floor/Timer)
- ✅ Weapon-Bar with tier colors & cooldown indicator
- ✅ Elite enemies (Burning, Vampiric, Swift) with golden glow
- ✅ Synergy system (blade, ranged, heavy, fire, nature tags)
- ✅ Shop every 5 floors
- ✅ Room variation (pillars, chests, lava, variable shapes)
- ✅ Low-HP vignette effect
- ✅ Confirm dialog on quit
- ✅ Death recap (killer, build, DPS, kill-streak, time, gold)
- ✅ Settings menu (Volume, Reduced Motion, Auto-Aim, Fullscreen)
- ✅ Lobby clipboard auto-copy
- ✅ Mobile improvements (safe-area, adaptive joystick, grid)
- ✅ Account system (Login/Register, persistent gold, SQLite backend)
- ✅ Shop (Skins, Trails, Characters — purchasable with gold)
- ✅ 8 Character classes with unique stats & abilities
- ✅ Dash cooldown indicator (⚡ ring bottom center)
- ✅ Version number bottom right

## Character Classes

| Class | Price | Bonus | Ability |
|-------|-------|-------|---------|
| Kartoffel | Free | Balanced | None |
| Pommes | 50 Gold | -3HP +25%Speed | Dash cooldown 50% |
| Süßkartoffel | 80 Gold | +2HP +5%LifeSteal | +1 HP every 10 kills |
| Chips | 120 Gold | -4HP +8%Dodge | Extra weapon slot |
| Goldene | 200 Gold | -15%Dmg +8%Crit | 2x Gold, Crit→Gold |
| Schattenknolle | 300 Gold | -4HP +15%Crit | Dash→Crit |
| Regenbogen | 500 Gold | -2HP +5%Dmg/Speed | Every weapon counts for all synergies |
| Teufelskartoffel | 666 Gold | -6HP +30%Dmg | +5%Dmg/weapon, -1MaxHP/floor |

## Tech Stack

- Vanilla JavaScript + HTML5 Canvas
- PHP + SQLite backend (auth_api.php)
- No build tools, no dependencies

## Live Demo

[https://ml-bets.com/potato-dungeons-fork/](https://ml-bets.com/potato-dungeons-fork/)

## Original

Based on [Potato Dungeons](https://ml-bets.com/potato-dungeons/) with bug fixes and major feature additions.

## License

MIT