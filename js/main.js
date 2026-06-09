// ============================================================
// MAIN.JS — Game state machine & main loop — Potato Dungeons
// ============================================================
const Game = {
  state: 'MENU',
  player: null,
  pendingReward: null,
  lastTime: 0,
  xpOrbs: [],
  multiplayerDoorTriggered: false,
  _mpSyncTimer: 0,
  _lastEnemyCount: -1,
  _magnetUnlimited: false,

  async init() {
    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    Input.init(canvas);
    SFX.init();
    EnemySystem.init();
    UI.init();
    Account.init();
    UI.showMenu();
    Assets.loadAll(() => { UI.showMenu(); });
    this.loop(0);
  },

  startGame() {
    Multiplayer.disconnect();
    this.state = 'PLAYING';
    this.player = Player.create();
    this.player.applyCharacterStats();
    this.pendingReward = null;
    this.xpOrbs = [];
    this.multiplayerDoorTriggered = false;
    this._lastEnemyCount = -1;
    this._magnetUnlimited = false;
    EnemySystem.clear();
    ProjectileSystem.clear();
    ParticleSystem.clear();
    FloatingText.clear();

    const startWeapon = WeaponSystem.create('knife');
    WeaponSystem.addWeapon(this.player, startWeapon);

    Dungeon.startFloor(1, this.player);
    Renderer.camera.x = this.player.x;
    Renderer.camera.y = this.player.y;

    const fitZoomW = Renderer._width / CONFIG.ROOM_WIDTH;
    const fitZoomH = Renderer._height / CONFIG.ROOM_HEIGHT;
    const fitZoom = Math.min(fitZoomW, fitZoomH) * 0.9;
    const startZoom = Utils.clamp(fitZoom, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM);
    Renderer.camera.zoom = startZoom;
    Renderer.camera.targetZoom = startZoom;

    UI.showGame();
    UI.announceFloor(1, 1 % CONFIG.TOWER.BOSS_EVERY === 0);
  },

  startCoop(roomData) {
    this.state = 'PLAYING';
    this.player = Player.create();
    this.pendingReward = null;
    this.xpOrbs = [];
    this.multiplayerDoorTriggered = false;
    this._lastEnemyCount = -1;
    this._magnetUnlimited = false;
    EnemySystem.clear();
    ProjectileSystem.clear();
    ParticleSystem.clear();
    FloatingText.clear();
    if (!Multiplayer.peer) Multiplayer.init();

    const startWeapon = WeaponSystem.create('knife');
    WeaponSystem.addWeapon(this.player, startWeapon);

    if (roomData) {
      // Client: use host's room data
      console.log('[COOP] Client received roomData:', JSON.stringify(roomData).substring(0, 200));
      Dungeon.currentFloor = roomData.floorNum || 1;
      Dungeon.cleared = false;
      Dungeon.doorOpen = false;
      Dungeon.doorPos = roomData.doorPos;
      const pxW = roomData.cols * roomData.tileWidth;
      const pxH = roomData.rows * roomData.tileWidth;
      Dungeon.room = {
        tiles: roomData.tiles, cols: roomData.cols, rows: roomData.rows,
        tileWidth: roomData.tileWidth, theme: roomData.theme,
        isBoss: roomData.isBoss,
        wallColor: roomData.theme.wallColor,
        floorColor: roomData.theme.floorColor,
        pixelWidth: pxW,
        pixelHeight: pxH
      };
      CONFIG.ROOM_WIDTH = pxW;
      CONFIG.ROOM_HEIGHT = pxH;
      this.player.x = pxW / 2;
      this.player.y = pxH - CONFIG.WALL_THICKNESS - this.player.size - 10;
      // Spawn enemies from roomData
      if (roomData.enemies && roomData.enemies.length > 0) {
        for (const e of roomData.enemies) {
          const def = CONFIG.ENEMY_DEFS[e.defKey];
          if (def) {
            EnemySystem.enemies.push({
              defKey: e.defKey, def: def,
              x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp || e.hp,
              size: e.size || def.size, color: e.color || def.color,
              colorDark: e.colorDark || def.colorDark, shape: e.shape || def.shape,
              speed: e.speed || def.speed, damage: e.damage || def.damage,
              xp: e.xp || def.xp, attackCooldown: e.attackCooldown || 0,
              alive: true
            });
          }
        }
      }
      console.log('[COOP] Client room set:', pxW, 'x', pxH, 'enemies:', EnemySystem.enemies.length, 'player:', this.player.x, this.player.y);
      // Debug overlay
      this._showDebugBanner('CLIENT: Room ' + pxW + 'x' + pxH + ' E:' + EnemySystem.enemies.length);
    } else {
      // Host: generate room and send to client
      const isBoss = 1 % CONFIG.TOWER.BOSS_EVERY === 0;
      Dungeon.startFloor(1, this.player);

      const rd = Dungeon.room ? {
        tiles: Dungeon.room.tiles, cols: Dungeon.room.cols, rows: Dungeon.room.rows,
        tileWidth: Dungeon.room.tileWidth, theme: Dungeon.room.theme,
        isBoss: Dungeon.room.isBoss, floorNum: 1, doorPos: Dungeon.doorPos,
        enemies: EnemySystem.enemies.map(e => ({
          defKey: e.defKey, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
          size: e.size, color: e.color, colorDark: e.colorDark, shape: e.shape,
          speed: e.speed, damage: e.damage, xp: e.xp, attackCooldown: e.attackCooldown || 0
        }))
      } : null;
      Multiplayer.send({ type: 'startGame', roomData: rd });
      console.log('[COOP] Host sent startGame, enemies:', rd ? rd.enemies.length : 0);
      this._showDebugBanner('HOST: ' + (rd ? rd.cols + 'x' + rd.rows + ' E:' + rd.enemies.length : 'no room'));
    }

    const rw = Dungeon.room?.pixelWidth || CONFIG.ROOM_WIDTH;
    const rh = Dungeon.room?.pixelHeight || CONFIG.ROOM_HEIGHT;
    const fitZoomW = Renderer._width / rw;
    const fitZoomH = Renderer._height / rh;
    // On mobile, use tighter zoom to ensure the room is fully visible
    const mobileFactor = Input.isMobile() ? 0.78 : 0.85;
    const fitZoom = Math.min(fitZoomW, fitZoomH) * mobileFactor;
    const startZoom = Utils.clamp(fitZoom, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM);
    Renderer.camera.zoom = startZoom;
    Renderer.camera.targetZoom = startZoom;
    Renderer.camera.x = this.player.x;
    Renderer.camera.y = this.player.y;

    UI.showGame();
    UI.announceFloor(1, Dungeon.room?.isBoss || false);
  },

  togglePause() {
    if (this.state === 'PLAYING') { this.state = 'PAUSED'; UI.showPause(); }
    else if (this.state === 'PAUSED') { this.resumeGame(); }
  },

  resumeGame() { this.state = 'PLAYING'; UI.hidePause(); UI.showGame(); },

  gameOver() { this.state = 'GAMEOVER'; this._debugBanner = null; UI.showGameOver(this.player, Dungeon.currentFloor); },

  _debugBanner: null,
  _debugBannerTimer: 0,
  _showDebugBanner(text) {
    this._debugBanner = text;
    this._debugBannerTimer = 5; // 5 seconds
  },

  selectReward(index, mode) {
    if (!Rewards.currentChoices || !Rewards.currentChoices[index]) return;
    if (Rewards.pickedCount >= Rewards.maxPicks) return;
    const reward = Rewards.currentChoices[index];

    // If weapon and player already has it, show choice dialog
    if (reward.type === 'weapon' && reward.isUpgrade && !mode) {
      this._pendingWeaponChoice = { index, reward };
      UI.showWeaponChoiceDialog(reward);
      return;
    }

    this._applyReward(index, reward, mode);
  },

  _applyReward(index, reward, mode) {
    Rewards.apply(reward, this.player, mode || (reward.type === 'weapon' && !reward.isUpgrade ? 'new' : undefined));
    Rewards.pickedCount++;
    UI._markCardPicked(index);
    UI._updateRewardInfo();
  },

  chooseWeaponUpgrade() {
    if (!this._pendingWeaponChoice) return;
    const { index, reward } = this._pendingWeaponChoice;
    this._applyReward(index, reward, 'upgrade');
    this._pendingWeaponChoice = null;
    UI.hideWeaponChoiceDialog();
  },

  chooseWeaponNew() {
    if (!this._pendingWeaponChoice) return;
    const { index, reward } = this._pendingWeaponChoice;
    this._applyReward(index, reward, 'new');
    this._pendingWeaponChoice = null;
    UI.hideWeaponChoiceDialog();
  },

  rerollReward() {
    if (Rewards.reroll()) { UI.showReward(Rewards.currentChoices); }
  },

  finishReward() {
    this.pendingReward = null;
    this.nextFloor();
  },

  nextFloor() {
    const nextFloor = Dungeon.currentFloor + 1;
    const isBoss = nextFloor % CONFIG.TOWER.BOSS_EVERY === 0;
    // Revive host player (in case they were in spectator/dead mode from co-op)
    this.player.hp = this.player.getMaxHp();
    this.player.alive = true;
    this.player.visible = true;
    this.player.invulFrames = 60;
    this.player.tookDamageThisFloor = false; // Reset für neue Ebene
    // Revive remote player in co-op
    if (Multiplayer.connected) {
      Multiplayer.remotePlayers.forEach(rp => {
        rp.remotePlayer.alive = true;
        rp.remotePlayer.hp = rp.remotePlayer.maxHp;
      });
      // Send newFloor to client to revive them too
      Multiplayer.send({ type: 'newFloor', floor: nextFloor });
    }
    // Devil Bargain: -1 HP per floor
    const charDef = CONFIG.CHARACTERS?.[this.player.skin];
    if (charDef?.ability === 'devil_bargain') {
      this.player.maxHpBonus -= 1;
      this.player.hp = Math.min(this.player.hp, this.player.getMaxHp());
      if (this.player.hp <= 0) this.player.hp = 1; // Don't die from bargain
      FloatingText.add(this.player.x, this.player.y - 20, '😈 -1 Max HP', '#ff4466', 14, 1.5);
    }
    ParticleSystem.heal(this.player.x, this.player.y);
    this._magnetUnlimited = false;
    Dungeon.startFloor(nextFloor, this.player);

    const fitZoomW = Renderer._width / (Dungeon.room?.pixelWidth || CONFIG.ROOM_WIDTH);
    const fitZoomH = Renderer._height / (Dungeon.room?.pixelHeight || CONFIG.ROOM_HEIGHT);
    const mobileFactor = Input.isMobile() ? 0.78 : 0.9;
    Renderer.camera.targetZoom = Utils.clamp(Math.min(fitZoomW, fitZoomH) * mobileFactor, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM);
    this.state = 'PLAYING';
    UI.showGame();
    UI.announceFloor(nextFloor, isBoss);

    if (Multiplayer.connected && Multiplayer.isHost) {
      const rd = Dungeon.room ? {
        tiles: Dungeon.room.tiles, cols: Dungeon.room.cols, rows: Dungeon.room.rows,
        tileWidth: Dungeon.room.tileWidth, theme: Dungeon.room.theme,
        isBoss: Dungeon.room.isBoss, floorNum: nextFloor, doorPos: Dungeon.doorPos
      } : null;
      Multiplayer.send({ type: 'nextFloor', roomData: rd });
      setTimeout(() => Multiplayer.sendFullSync(), 200);
    }
  },

  updateReward(dt) {
    // Allow movement + multiplayer sync even in reward mode
    if (!this.player || !this.player.alive) return;
    const player = this.player;
    Input.updateWorldMouse(Renderer.getCameraWithShake());
    player.update(dt);
    if (Dungeon.room) Dungeon.constrainToRoom(player);
    ParticleSystem.update(dt);
    FloatingText.update(dt);
    Renderer.updateCamera(player, dt);
    // Track time
    if (this.player) this.player.timeSurvived = (this.player.timeSurvived || 0) + dt;

    // Multiplayer sync
    if (Multiplayer.connected) {
      Multiplayer.syncPlayer(player);
      if (Multiplayer.isHost) {
        this._mpSyncTimer = (this._mpSyncTimer || 0) + dt;
        if (this._mpSyncTimer > 0.05) {
          this._mpSyncTimer = 0;
          Multiplayer.syncGameState();
        }
      }
    }
  },

  loop(timestamp) {
    requestAnimationFrame(t => this.loop(t));
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    if (this.state === 'PLAYING') this.update(dt);
    else if (this.state === 'REWARD') this.updateReward(dt);
    this.render();
  },

  update(dt) {
    // In co-op: game over only if BOTH players are dead
    if (!this.player || !this.player.alive) {
      if (Multiplayer.connected) {
        const otherAlive = Multiplayer.remotePlayers.some(rp => rp.remotePlayer && rp.remotePlayer.alive);
        if (otherAlive) {
          // One player died but other is alive — continue as spectator (invisible)
          if (this.player) {
            this.player.visible = false;
            this.player.invulFrames = 999999;
          }
          // Notify other player of our death
          if (Multiplayer.isHost) {
            Multiplayer.send({ type: 'hostDead' });
          } else {
            Multiplayer.send({ type: 'clientDead' });
          }
          // Fall through — game continues with alive player
        } else {
          // Both players dead — game over
          this.gameOver();
          return;
        }
      } else {
        // Single player death
        this.gameOver();
        return;
      }
    }
    const player = this.player;
    Input.updateWorldMouse(Renderer.getCameraWithShake());
    player.update(dt);
    if (Dungeon.room) Dungeon.constrainToRoom(player);

    const isHost = !Multiplayer.connected || Multiplayer.isHost;

    // === BOTH: Weapons + Projectiles ===
    WeaponSystem.update(player.weapons, player, EnemySystem.enemies, dt);
    ProjectileSystem.update(dt);

    if (isHost) {
      // === HOST: Enemy AI + combat ===
      EnemySystem.update(dt, player);

      // Host projectiles vs Enemies
      for (let i = ProjectileSystem.projectiles.length - 1; i >= 0; i--) {
        const p = ProjectileSystem.projectiles[i];
        for (const e of EnemySystem.enemies) {
          if (!e.alive) continue;
          if (p.piercedEnemies && p.piercedEnemies.has(e)) continue;
          if (Utils.circleCollisionDist(p, e) < p.size + e.size) {
            const dir = Utils.vecNormalize(Utils.vecSub(e, p));
            const isCrit = Math.random() * 100 < (player.stats.critChance || 0);
            // Shadow Strike ability: first hit after dash is always crit
            let shadowCrit = false;
            if (player.shadowStrikeActive) { shadowCrit = true; player.shadowStrikeActive = false; }
            const finalCrit = isCrit || shadowCrit;
            // Devil Bargain: +5% damage per weapon
            let devilDmgBonus = 1;
            const charDef2 = CONFIG.CHARACTERS?.[player.skin];
            if (charDef2?.ability === 'devil_bargain') devilDmgBonus += player.weapons.length * 0.05;
            const dmgMult = (finalCrit ? 2 : 1) * (1 + (player.stats.damage || 0) / 100) * devilDmgBonus;
            const dmg = Math.round(p.damage * dmgMult);
            e.takeDamage(dmg, dir, p.knockback, finalCrit);
            // Send damage text to client
            if (Multiplayer.connected) {
              Multiplayer.send({ type: 'damageText', x: e.x, y: e.y - e.size, text: (isCrit ? '💥 ' : '') + '-' + dmg, color: isCrit ? CONFIG.COLORS.CRIT_COLOR : '#fff', size: isCrit ? 24 : 16, particle: !e.alive ? 'death' : 'hit', particleColor: e.color });
            }
            if (player.stats.lifeSteal > 0) player.heal(player.stats.lifeSteal * 0.1);
            if (p.piercing > 0) { p.piercing--; if (p.piercedEnemies) p.piercedEnemies.add(e); }
            else ProjectileSystem.projectiles.splice(i, 1);
            if (!e.alive) {
              player.kills++;
              player.killStreak = (player.killStreak || 0) + 1;
              player.maxKillStreak = Math.max(player.maxKillStreak || 0, player.killStreak);
              player.killCount = (player.killCount || 0) + 1;
              this.xpOrbs.push({ x: e.x, y: e.y, value: e.xpValue, isGold: false });

              // Character abilities on kill
              const charKey = player.skin;
              const charDef = CONFIG.CHARACTERS?.[charKey];
              if (charDef?.ability === 'life_drain' && player.killCount % 10 === 0) {
                player.hp = Math.min(player.hp + 1, player.getMaxHp());
                ParticleSystem.heal(player.x, player.y);
                FloatingText.add(player.x, player.y - 20, '+1 HP', '#44ff88', 14, 1.0);
              }
              if (charDef?.ability === 'devil_bargain') {
                // -1 HP per floor handled in startFloor
              }

              // Gold drops
              let goldChance = 25;
              let goldMult = 1;
              if (charDef?.ability === 'gold_rush') { goldChance = 50; goldMult = 2; }
              if (Utils.chance(goldChance)) {
                const goldVal = Math.ceil(1 * goldMult);
                this.xpOrbs.push({ x: e.x + Utils.rand(-10, 10), y: e.y + Utils.rand(-10, 10), value: goldVal, isGold: true });
              }

              // Gold rush: crits give gold
              if (charDef?.ability === 'gold_rush' && isCrit) {
                this.xpOrbs.push({ x: e.x, y: e.y - 10, value: Math.ceil(Math.random() * 3) + 1, isGold: true });
              }

              // Magnet pull: when last enemy dies, unlimited magnet range
              if (EnemySystem.enemies.filter(e2 => e2.alive).length <= 1) {
                this._magnetUnlimited = true;
                // Visual feedback: burst particles at player position
                ParticleSystem.levelUpBurst(player.x, player.y);
                FloatingText.add(player.x, player.y - 30, '🧲 MAGNET', '#ffdd44', 18, 1.2);
              }
            }
            break;
          }
        }
      }
    } else {
      // === CLIENT: Send damage to host ===
      for (let i = ProjectileSystem.projectiles.length - 1; i >= 0; i--) {
        const p = ProjectileSystem.projectiles[i];
        for (let ei = 0; ei < EnemySystem.enemies.length; ei++) {
          const e = EnemySystem.enemies[ei];
          if (!e.alive) continue;
          if (Utils.circleCollisionDist(p, e) < p.size + e.size) {
            const dir = Utils.vecNormalize(Utils.vecSub(e, p));
            const isCrit = Math.random() * 100 < (player.stats.critChance || 0);
            const dmgMult = isCrit ? 2 : 1 + (player.stats.damage || 0) / 100;
            Multiplayer.send({ type: 'dealDamage', enemyIdx: ei, damage: p.damage * dmgMult, dir: { x: dir.x, y: dir.y }, knockback: p.knockback, isCrit });
            if (isCrit) FloatingText.add(e.x, e.y - e.size, '💥', CONFIG.COLORS.CRIT_COLOR, 20);
            ParticleSystem.hit(e.x, e.y, e.color);
            if (p.piercing > 0) p.piercing--;
            else ProjectileSystem.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    // === BOTH: Take damage from enemies ===
    // Player trail effect
    if (Account.loggedIn && Account.trail && Account.TRAILS[Account.trail]) {
      const trailDef = Account.TRAILS[Account.trail];
      if (Math.random() < 0.5) {
        const trailColor = trailDef.color === 'rainbow' ? `hsl(${(Date.now()/5)%360},80%,60%)` : trailDef.color;
        // Spawn trail particles at the back edge of the character (opposite to movement direction)
        const trailX = player.x - (player.lastDx || 0) * player.size + Utils.rand(-3, 3);
        const trailY = player.y - (player.lastDy || 0) * player.size + Utils.rand(-3, 3);
        ParticleSystem.trail(trailX, trailY, trailColor);
      }
    }
    for (const e of EnemySystem.enemies) {
      if (!e.alive || e.hitCooldown > 0) continue;
      if (Utils.circleCollisionDist(e, player) < e.size + player.size) {
        player.takeDamage(e.damage, e);
        e.hitCooldown = 0.5;
      }
    }

    // === BOTH: Enemy projectiles ===
    for (let i = ProjectileSystem.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = ProjectileSystem.enemyProjectiles[i];
      if (Utils.circleCollisionDist(p, player) < p.size + player.size) {
        player.takeDamage(p.damage, p);
        ProjectileSystem.enemyProjectiles.splice(i, 1);
      }
    }

    // === HOST ONLY: XP + Dungeon logic ===
    if (isHost) {
      const magnetRange = this._magnetUnlimited ? Infinity : 140;
      const magnetSpeed = this._magnetUnlimited ? 800 : 350;
      for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
        const orb = this.xpOrbs[i];
        const dist = Utils.vecDist(orb, player);
        if (dist < magnetRange) {
          const dir = Utils.vecNormalize(Utils.vecSub(player, orb));
          orb.x += dir.x * magnetSpeed * dt; orb.y += dir.y * magnetSpeed * dt;
        }
        if (dist < player.size + 10) {
          if (orb.isGold) { player.gold += orb.value; ParticleSystem.goldCollect(orb.x, orb.y); }
          else {
            const m = 1 + (player.stats.harvesting || 0) / 100;
            player.xp += Math.ceil(orb.value * m);
            while (player.xp >= player.xpToLevel) {
              player.xp -= player.xpToLevel; player.level++;
              player.xpToLevel = Math.ceil(CONFIG.XP.BASE_TO_LEVEL * Math.pow(CONFIG.XP.SCALING, player.level - 1));
              player.maxHpBonus = (player.maxHpBonus || 0) + 1;
              player.hp = Math.min(player.hp + 1, player.getMaxHp());
              ParticleSystem.levelUpBurst(player.x, player.y);
              FloatingText.add(player.x, player.y - 30, '⬆️ Lv.' + player.level + ' (+1 Max HP)', '#ffdd44', 16, 1.5);
            }
            ParticleSystem.xpCollect(orb.x, orb.y);
          }
          this.xpOrbs.splice(i, 1);
        }
      }

      // Reset magnet once all orbs collected
      if (this._magnetUnlimited && this.xpOrbs.length === 0) {
        this._magnetUnlimited = false;
      }

      const result = Dungeon.update(dt, player);
      // Check if ANY player reached the door
      let doorTriggered = (result === 'floor_complete');
      if (!doorTriggered && Multiplayer.remotePlayers.some(rp => rp.remotePlayer && rp.remotePlayer.alive) && Dungeon.doorOpen && Dungeon.doorPos) {
        if (Multiplayer.remotePlayers.some(rp => Utils.vecDist(rp.remotePlayer, Dungeon.doorPos) < 40)) doorTriggered = true;
      }
      if (this.multiplayerDoorTriggered) { doorTriggered = true; this.multiplayerDoorTriggered = false; }
      if (doorTriggered && this.state !== 'REWARD') {
        this.player.tookDamageThisFloor = this.player.tookDamageThisFloor; // preserve state
        this.state = 'REWARD';
        this.pendingReward = Rewards.generate(Dungeon.currentFloor, !this.player.tookDamageThisFloor);
        UI.showReward(this.pendingReward);
        // Flawless overlay
        if (!this.player.tookDamageThisFloor) {
          FloatingText.add(this.player.x, this.player.y - 40, '✨ FLAWLESS! +1 Wahl', '#ffdd44', 20, 2.5);
        }
        Multiplayer.sendFullSync();
        // Send full reward data so client can show weapon choice dialogs
        Multiplayer.send({ type: 'showReward', choices: this.pendingReward.map(r => {
          const base = { type: r.type, name: r.name, icon: r.icon };
          if (r.type === 'weapon') {
            base.weaponKey = r.weaponKey;
            base.isUpgrade = r.isUpgrade;
            base.offerTier = r.offerTier;
          } else if (r.type === 'stat') {
            base.stat = r.stat;
            base.value = r.value;
            base.percent = r.percent;
          } else if (r.type === 'relic') {
            base.relicKey = r.relicKey;
            base.desc = r.desc;
          }
          return base;
        }), numRewards: Rewards.maxPicks });
      }
    } else {
      // Client: notify host when touching door
      if (Dungeon.doorOpen && Dungeon.doorPos && this.player.alive) {
        if (Utils.vecDist(this.player, Dungeon.doorPos) < 40) {
          Multiplayer.send({ type: 'doorTouch' });
        }
      }
    }

    // === BOTH: Visual ===
    ParticleSystem.update(dt);
    FloatingText.update(dt);
    Renderer.updateCamera(player, dt);

    // === Multiplayer sync ===
    if (Multiplayer.connected) {
      Multiplayer.syncPlayer(player);
      if (Multiplayer.isHost) {
        this._mpSyncTimer = (this._mpSyncTimer || 0) + dt;
        if (this._mpSyncTimer > 0.05) { // 50ms = 20fps sync
          this._mpSyncTimer = 0;
          Multiplayer.syncGameState();
        }
      }
    }
  },

  render() {
    const ctx = Renderer.ctx;
    if (!ctx) return;
    const camera = Renderer.getCameraWithShake();
    const zoom = camera.zoom || 1;

    ctx.fillStyle = '#0a0914';
    ctx.fillRect(0, 0, (ctx.canvas._cssWidth || ctx.canvas.width), (ctx.canvas._cssHeight || ctx.canvas.height));

    if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'REWARD') {
      Dungeon.render(ctx, camera);

      if (this.xpOrbs) {
        const time = Date.now() / 1000;
        for (const orb of this.xpOrbs) {
          const sx = (orb.x - camera.x) * zoom + (ctx.canvas._cssWidth || ctx.canvas.width) / 2;
          const sy = (orb.y - camera.y) * zoom + (ctx.canvas._cssHeight || ctx.canvas.height) / 2;
          const pulse = 1 + Math.sin(time * 5) * 0.25;
          const size = CONFIG.XP.ORB_SIZE * pulse * zoom;
          const glowColor = orb.isGold ? 'rgba(255,215,0,' : 'rgba(102,255,170,';
          ctx.fillStyle = glowColor + (0.15 * pulse) + ')';
          ctx.beginPath(); ctx.arc(sx, sy, size * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = orb.isGold ? CONFIG.COLORS.GOLD : CONFIG.COLORS.XP_ORB;
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      EnemySystem.render(ctx, camera);
      if (Multiplayer.connected) {
        Multiplayer.renderRemote(ctx, camera);
      }
      if (this.player) {
        Player.render(ctx, camera, this.player);
        WeaponSystem.renderMeleeSwing(ctx, camera, this.player, this.player.weapons);
      }
      ProjectileSystem.render(ctx, camera);
      ParticleSystem.render(ctx, camera);
      FloatingText.render(ctx, camera);

      Renderer.renderDamageFlash(ctx);
      Renderer.renderVignette(ctx);
      if (this.player) Renderer.renderHUD(ctx, this.player);
      // Update weapon bar HUD
      if (this.player && this._weaponBarTimer === undefined) this._weaponBarTimer = 0;
      if (this.player) {
        const now = performance.now() / 1000;
        if (!this._lastWeaponBarUpdate) this._lastWeaponBarUpdate = now;
        if (now - this._lastWeaponBarUpdate > 0.5) {
          this._lastWeaponBarUpdate = now;
          UI.updateWeaponBar(this.player);
        }
      }

      if (Multiplayer.connected) {
        ctx.fillStyle = '#44ff88';
        ctx.font = "bold 12px 'Outfit', sans-serif";
        ctx.textAlign = 'left';
        ctx.fillText('🤝 Co-Op Verbunden', 55, 28);
      }

      // Low HP vignette
      if (this.player && this.player.alive) {
        const hpPct = this.player.hp / this.player.getMaxHp();
        if (hpPct < 0.25) {
          const intensity = (0.25 - hpPct) / 0.25;
          const pulse = 0.5 + Math.sin(Date.now() / 200) * 0.3;
          ctx.save();
          const vg = ctx.createRadialGradient((ctx.canvas._cssWidth || ctx.canvas.width)/2, (ctx.canvas._cssHeight || ctx.canvas.height)/2, (ctx.canvas._cssWidth || ctx.canvas.width) * 0.3,
            (ctx.canvas._cssWidth || ctx.canvas.width)/2, (ctx.canvas._cssHeight || ctx.canvas.height)/2, (ctx.canvas._cssWidth || ctx.canvas.width) * 0.7);
          vg.addColorStop(0, 'rgba(200,0,0,0)');
          vg.addColorStop(1, `rgba(200,0,0,${intensity * 0.4 * pulse})`);
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, (ctx.canvas._cssWidth || ctx.canvas.width), (ctx.canvas._cssHeight || ctx.canvas.height));
          ctx.restore();
        }
      }

      // HUD update
      UI.updateHUD(this.player, Dungeon.currentFloor);

      // Debug banner
      if (this._debugBanner && this._debugBannerTimer > 0) {
        this._debugBannerTimer -= dt;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const bw = ctx.measureText(this._debugBanner).width + 20;
        ctx.fillRect(10, (ctx.canvas._cssHeight || ctx.canvas.height) - 40, bw + 10, 30);
        ctx.fillStyle = '#ffdd44';
        ctx.font = "bold 13px monospace";
        ctx.textAlign = 'left';
        ctx.fillText(this._debugBanner, 15, (ctx.canvas._cssHeight || ctx.canvas.height) - 20);
        if (this._debugBannerTimer <= 0) this._debugBanner = null;
      }

      // Always-on co-op state debug (top right)
      if (Multiplayer.connected) {
        const info = `S:${this.state} R:${Dungeon.room ? '✓' : '✗'} Z:${Renderer.camera.zoom?.toFixed(2)} P:${this.player ? Math.round(this.player.x)+','+Math.round(this.player.y) : '?'}`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = "10px monospace";
        const tw = ctx.measureText(info).width;
        ctx.fillRect((ctx.canvas._cssWidth || ctx.canvas.width) - tw - 16, 2, tw + 12, 16);
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'right';
        ctx.fillText(info, (ctx.canvas._cssWidth || ctx.canvas.width) - 10, 13);
        ctx.textAlign = 'left';
      }

      if (Input.isMobile() || Input.touch.active) Input.renderJoystick(ctx);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => Game.init());