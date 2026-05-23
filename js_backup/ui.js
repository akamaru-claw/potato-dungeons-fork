// ============================================================
// UI.JS — Screen management for Potato Dungeons
// ============================================================
const UI = {
  _screens: {
    menu: 'screen-menu',
    game: null, // canvas only
    gameover: 'screen-gameover',
    pause: 'screen-pause',
    reward: 'screen-reward',
    lobby: 'screen-lobby',
    highscores: 'screen-highscores',
  },

  init() {
    document.getElementById('btn-play').addEventListener('click', () => Game.startGame());
    document.getElementById('btn-coop').addEventListener('click', () => this.showLobby());
    document.getElementById('btn-retry').addEventListener('click', () => Game.startGame());
    document.getElementById('btn-pause').addEventListener('click', () => Game.togglePause());
    // Weapon panel close
    document.getElementById('weapon-panel-close')?.addEventListener('click', () => {
      document.getElementById('weapon-panel').style.display = 'none';
    });
    document.getElementById('btn-resume').addEventListener('click', () => Game.resumeGame());
    document.getElementById('btn-pause-quit').addEventListener('click', () => {
      Game.state = 'MENU'; Game.player = null;
      Multiplayer.disconnect();
      this.showMenu();
    });
    // Highscore
    document.getElementById('btn-submit-score')?.addEventListener('click', () => this._submitScore());
    document.getElementById('input-playername')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitScore();
    });
    document.getElementById('btn-highscores')?.addEventListener('click', () => this.showHighscores());
    document.getElementById('btn-menu-highscores')?.addEventListener('click', () => this.showHighscores());
    document.getElementById('btn-hs-back')?.addEventListener('click', () => {
      this.showMenu();
    });
    const savedName = localStorage.getItem('pd_playername');
    if (savedName) {
      const ni = document.getElementById('input-playername');
      if (ni) ni.value = savedName;
    }
    document.getElementById('btn-wc-upgrade')?.addEventListener('click', () => Game.chooseWeaponUpgrade());
    document.getElementById('btn-wc-new')?.addEventListener('click', () => Game.chooseWeaponNew());
    document.getElementById('btn-wc-cancel')?.addEventListener('click', () => {
      Game._pendingWeaponChoice = null;
      UI.hideWeaponChoiceDialog();
    });
    // Lobby buttons
    document.getElementById('btn-host').addEventListener('click', () => this._hostRoom());
    document.getElementById('btn-join').addEventListener('click', () => this._joinRoom());
    document.getElementById('btn-lobby-back').addEventListener('click', () => {
      Multiplayer.disconnect();
      this.showMenu();
    });
  },

  async _hostRoom() {
    const statusEl = document.getElementById('lobby-status');
    statusEl.textContent = 'Erstelle Raum...';
    statusEl.className = 'lobby-status';

    try {
      const roomId = await Multiplayer.createRoom();
      document.getElementById('lobby-code').textContent = roomId;
      document.getElementById('lobby-room-code').style.display = 'flex';
      statusEl.textContent = 'Warte auf Mitspieler...';
      statusEl.className = 'lobby-status';

      Multiplayer.onConnect = () => {
        statusEl.textContent = '🤝 Verbunden! Starte Spiel...';
        statusEl.className = 'lobby-status success';
        setTimeout(() => {
          Game.startCoop();
        }, 800);
      };
      Multiplayer.onDisconnect = () => {
        statusEl.textContent = '⚠️ Mitspieler hat die Verbindung getrennt';
        statusEl.className = 'lobby-status error';
      };
    } catch(e) {
      statusEl.textContent = 'Fehler: ' + e.message;
      statusEl.className = 'lobby-status error';
    }
  },

  async _joinRoom() {
    const roomInput = document.getElementById('input-room');
    const roomId = roomInput.value.trim();
    if (roomId.length < 3) {
      roomInput.style.borderColor = '#ff4466';
      return;
    }

    const statusEl = document.getElementById('lobby-status');
    statusEl.textContent = 'Verbinde...';
    statusEl.className = 'lobby-status';

    try {
      await Multiplayer.joinRoom(roomId);
      statusEl.textContent = '🤝 Verbunden! Warte auf Host...';
      statusEl.className = 'lobby-status success';

      // When host starts the game, also start on client
      Multiplayer.onStartGame = (roomData) => {
        statusEl.textContent = '⚔️ Spiel startet!';
        statusEl.className = 'lobby-status success';
        setTimeout(() => {
          Game.startCoop(roomData);
        }, 300);
      };

      // When host goes to next floor, client follows
      Multiplayer.onNextFloor = (roomData) => {
        if (roomData) {
          const pxW = roomData.cols * roomData.tileWidth;
          const pxH = roomData.rows * roomData.tileWidth;
          Dungeon.currentFloor = roomData.floorNum || (Dungeon.currentFloor + 1);
          Dungeon.cleared = false;
          Dungeon.doorOpen = false;
          Dungeon.doorPos = roomData.doorPos;
          Dungeon.room = {
            tiles: roomData.tiles,
            cols: roomData.cols,
            rows: roomData.rows,
            tileWidth: roomData.tileWidth,
            theme: roomData.theme,
            isBoss: roomData.isBoss,
            wallColor: roomData.theme.wallColor,
            floorColor: roomData.theme.floorColor,
            pixelWidth: pxW,
            pixelHeight: pxH
          };
          CONFIG.ROOM_WIDTH = pxW;
          CONFIG.ROOM_HEIGHT = pxH;
          Game.player.hp = Game.player.getMaxHp();
          Game.player.x = pxW / 2;
          Game.player.y = pxH - CONFIG.WALL_THICKNESS - Game.player.size - 10;
          // Recalculate zoom for new room
          const fitZoomW = Renderer.canvas.width / pxW;
          const fitZoomH = Renderer.canvas.height / pxH;
          const mobileFactor = Input.isMobile() ? 0.78 : 0.85;
          const fitZoom = Math.min(fitZoomW, fitZoomH) * mobileFactor;
          Renderer.camera.targetZoom = Utils.clamp(fitZoom, CONFIG.CAMERA.MIN_ZOOM, CONFIG.CAMERA.MAX_ZOOM);
          Renderer.camera.x = Game.player.x;
          Renderer.camera.y = Game.player.y;
          Game.state = 'PLAYING';
          UI.showGame();
          UI.announceFloor(roomData.floorNum, roomData.isBoss);
        }
      };

      // When host shows reward screen
      Multiplayer.onShowReward = (choices) => {
        // Client also shows reward screen (simplified)
        const simpleChoices = choices.map(c => ({ ...c, stat: c.stat || 'damage', value: c.value || 5, percent: c.percent || false, weaponKey: c.weaponKey || '', healAmount: c.healAmount || 5 }));
        Game.state = 'REWARD';
        Game.pendingReward = simpleChoices;
        UI.showReward(simpleChoices);
      };

      Multiplayer.onDisconnect = () => {
        statusEl.textContent = '⚠️ Verbindung getrennt';
        statusEl.className = 'lobby-status error';
      };
    } catch(e) {
      statusEl.textContent = 'Raum nicht gefunden — Code falsch?';
      statusEl.className = 'lobby-status error';
    }
  },

  showLobby() { this.showScreen('lobby'); },

  showScreen(key) {
    this._hideAll();
    const el = document.getElementById(this._screens[key]);
    if (el) el.classList.add('active');
    if (key === 'game') {
      const pb = document.getElementById('btn-pause');
      if (pb) pb.classList.add('visible');
    }
  },

  _hideAll() {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('btn-pause')?.classList.remove('visible');
    document.getElementById('weapon-bar').style.display = 'none';
    this.hideWeaponPanel();
  },

  showMenu() { this.showScreen('menu'); },

  updateWeaponBar(player) {
    // Weapon display is now on canvas — just update the data ref
    // No HTML weapon bar needed
  },

  showWeaponPanel(weapon) {
    const panel = document.getElementById('weapon-panel');
    if (!panel) return;

    const def = CONFIG.WEAPON_DEFS[weapon.defKey];
    const level = (weapon.tier || 0) + 1;
    const currentDmg = weapon.def.baseDamage;
    const currentSpeed = weapon.def.attackSpeed;
    const currentRange = weapon.def.range;
    const player = Game.player;
    const critChance = player ? (5 + (player.stats.critChance || 0)) : 5;
    const critMult = 1.8;
    const effectiveDPS = currentDmg * currentSpeed * (1 + critChance / 100 * (critMult - 1));

    const tierColors = ['#888', '#44cc66', '#4488ff', '#bb55ee', '#ff8800', '#ff4444', '#ff2222', '#ff00ff'];
    const rarityColor = tierColors[Math.min(weapon.tier, tierColors.length - 1)];
    const rarityNames = ['Gewöhnlich', 'Ungewöhnlich', 'Selten', 'Episch', 'Legendär', 'Mythisch', 'Göttlich', 'Transzendent'];
    const rarityName = rarityNames[Math.min(weapon.tier, rarityNames.length - 1)];

    document.getElementById('weapon-panel-icon').textContent = weapon.def.icon || '⚔️';
    const nameEl = document.getElementById('weapon-panel-name');
    nameEl.textContent = `${def.name}`;
    nameEl.style.color = rarityColor;

    const isMelee = def.type === 'melee';
    const nextDmg = def.baseDamage * (1 + level * 0.5);
    const nextSpeed = def.attackSpeed * (1 + level * 0.08);

    const statsDiv = document.getElementById('weapon-panel-stats');
    statsDiv.innerHTML = `
      <div class="wp-level-badge" style="color:${rarityColor}">⭐ Level ${level} — ${rarityName}</div>
      <div class="wp-stat"><span class="wp-stat-label">⚔️ Schaden</span><span class="wp-stat-value" style="color:${currentDmg > def.baseDamage ? '#ffdd44' : ''}">${Math.round(currentDmg)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">⚡ Angriffe/Sek</span><span class="wp-stat-value">${currentSpeed.toFixed(2)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">💥 DPS</span><span class="wp-stat-value" style="color:#ff9944">${Math.round(effectiveDPS)}</span></div>
      <div class="wp-stat"><span class="wp-stat-label">📏 Reichweite</span><span class="wp-stat-value" style="color:${currentRange > def.range ? '#ffdd44' : ''}">${Math.round(currentRange)}</span></div>
      ${isMelee ? `<div class="wp-stat"><span class="wp-stat-label">📐 Schwungbogen</span><span class="wp-stat-value">${(def.arc * 180 / Math.PI).toFixed(0)}°</span></div>` : ''}
      ${!isMelee ? `<div class="wp-stat"><span class="wp-stat-label">🎯 Projektile</span><span class="wp-stat-value">${def.pellets || 1}</span></div>` : ''}
      ${def.pierce ? `<div class="wp-stat"><span class="wp-stat-label">🗡️ Durchschlag</span><span class="wp-stat-value">${def.pierce}</span></div>` : ''}
      <div class="wp-stat"><span class="wp-stat-label">🎯 Krit-Chance</span><span class="wp-stat-value">${critChance}%</span></div>
      <div class="wp-stat"><span class="wp-stat-label">💥 Krit-Schaden</span><span class="wp-stat-value">${critMult}x</span></div>
      <div class="wp-stat" style="margin-top:8px;font-size:11px;color:var(--text-dim);padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);">
        <span>⬆️ Nächstes Lv: ${Math.round(nextDmg)} Dmg, ${nextSpeed.toFixed(2)}/s</span>
      </div>
    `;

    panel.style.display = 'block';
    panel.dataset.weaponKey = weapon.defKey;
    panel.dataset.weaponTier = weapon.tier || 0;
  },

  hideWeaponPanel() {
    const panel = document.getElementById('weapon-panel');
    if (panel) panel.style.display = 'none';
  },
  showGame() {
    this._hideAll();
    document.getElementById('btn-pause')?.classList.add('visible');
    const bar = document.getElementById('weapon-bar');
    if (bar) bar.style.display = 'flex';
  },
  showGameOver(player, floorNum) {
    this.showScreen('gameover');
    // Reset highscore UI
    document.getElementById('highscore-submit').style.display = 'flex';
    document.getElementById('highscore-saved').style.display = 'none';
    document.getElementById('gameover-floor').textContent = `Ebene ${floorNum} erreicht`;
    document.getElementById('gameover-stats').innerHTML = `
      <div class="endscreen-stat"><span>Kills</span><strong>${player.kills}</strong></div>
      <div class="endscreen-stat"><span>Ebene</span><strong>${floorNum}</strong></div>
      <div class="endscreen-stat"><span>Waffen</span><strong>${player.weapons.length}</strong></div>
    `;
    this._lastScore = { floor: floorNum, kills: player.kills, weapons: player.weapons.length };
  },

  _submitScore() {
    const nameInput = document.getElementById('input-playername');
    const name = (nameInput?.value || '').trim();
    if (!name) {
      nameInput?.focus();
      return;
    }
    if (!this._lastScore) {
      console.error('No score data to submit');
      return;
    }

    localStorage.setItem('pd_playername', name);
    const btn = document.getElementById('btn-submit-score');
    if (btn) btn.textContent = '⏳...';

    fetch('highscore_api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        floor: this._lastScore.floor,
        kills: this._lastScore.kills,
        weapons: this._lastScore.weapons,
        mode: Multiplayer.connected ? 'coop' : 'solo'
      })
    })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data.ok) {
        document.getElementById('highscore-submit').style.display = 'none';
        document.getElementById('highscore-saved').style.display = 'block';
        document.getElementById('highscore-rank').textContent = data.rank ? `Platz ${data.rank}!` : '';
      }
    })
    .catch(e => {
      console.error('Highscore save failed:', e);
      if (btn) btn.textContent = '❌ Fehler';
      setTimeout(() => { if (btn) btn.textContent = '💾 Speichern'; }, 2000);
    });
  },

  showHighscores() {
    this.showScreen('highscores');

    const listEl = document.getElementById('highscore-list');
    if (!listEl) { console.error('highscore-list element missing!'); return; }
    listEl.innerHTML = '<div class="hs-empty">Laden...</div>';

    fetch('highscore_api.php?limit=30')
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(scores => {
        if (!scores || !scores.length) {
          listEl.innerHTML = '<div class="hs-empty">Noch keine Einträge 🏆</div>';
          return;
        }
        listEl.innerHTML = scores.map((s, i) => {
          const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
          const modeIcon = s.mode === 'coop' ? '🤝' : '⚔️';
          return `
            <div class="hs-row ${rankClass}">
              <div class="hs-rank">${medal}</div>
              <div class="hs-name">${this._escHtml(s.name)}</div>
              <div class="hs-info">
                <div class="hs-floor">🏰 ${s.floor} ${modeIcon}</div>
                <div class="hs-date">💀${s.kills} ⚔️${s.weapons} · ${s.date || ''}</div>
              </div>
            </div>
          `;
        }).join('');
      })
      .catch(e => {
        console.error('Highscore load error:', e);
        listEl.innerHTML = '<div class="hs-empty">Fehler: ' + this._escHtml(e.message) + '</div>';
      });
  },

  _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  showWeaponChoiceDialog(reward) {
    const dialog = document.getElementById('weapon-choice-dialog');
    if (!dialog) return;
    const def = CONFIG.WEAPON_DEFS[reward.weaponKey];
    const existingWeapon = Game.player?.weapons?.find(w => w.defKey === reward.weaponKey);
    const nextLevel = existingWeapon ? existingWeapon.tier + 2 : 1;
    document.getElementById('wcd-icon').textContent = def.icon;
    document.getElementById('wcd-title').textContent = `${def.name} — Lv.${nextLevel} oder 2. Waffe?`;
    dialog.style.display = 'flex';
  },

  hideWeaponChoiceDialog() {
    const dialog = document.getElementById('weapon-choice-dialog');
    if (dialog) dialog.style.display = 'none';
  },

  showPause() { document.getElementById('screen-pause')?.classList.add('active'); },
  hidePause() { document.getElementById('screen-pause')?.classList.remove('active'); },

  showReward(choices) {
    this._hideAll();
    document.getElementById('screen-reward')?.classList.add('active');
    const container = document.getElementById('reward-choices');
    container.innerHTML = '';
    choices.forEach((reward, i) => {
      const card = document.createElement('div');
      card.className = `reward-card rarity-${reward.type === 'weapon' ? 'rare' : reward.type === 'heal' ? 'common' : 'uncommon'}`;
      card.id = `reward-card-${i}`;
      card.innerHTML = `
        <div class="reward-icon">${reward.icon}</div>
        <div class="reward-name">${reward.name}</div>
        <div class="reward-type">${reward.type === 'weapon' ? '⚔️ Waffe' : reward.type === 'heal' ? '❤️ Heilung' : '📈 Upgrade'}</div>
      `;
      card.addEventListener('click', () => {
        this._hideRewardTooltip();
        Game.selectReward(i);
      });

      // Long press / hover for tooltip
      let pressTimer = null;
      card.addEventListener('pointerdown', (e) => {
        pressTimer = setTimeout(() => {
          this._showRewardTooltip(i, reward, card);
        }, 400);
      });
      card.addEventListener('pointerup', () => { clearTimeout(pressTimer); });
      card.addEventListener('pointerleave', () => { clearTimeout(pressTimer); });
      card.addEventListener('pointercancel', () => { clearTimeout(pressTimer); });
      container.appendChild(card);
    });
    // Update pick counter
    this._updateRewardInfo();
  },

  _showRewardTooltip(index, reward, cardEl) {
    this._hideRewardTooltip();
    const tooltip = document.createElement('div');
    tooltip.className = 'reward-tooltip';
    tooltip.id = 'reward-tooltip';

    let statsHtml = '';
    if (reward.type === 'weapon') {
      const def = CONFIG.WEAPON_DEFS[reward.weaponKey];
      const isMelee = def.type === 'melee';
      const existingWeapon = Game.player?.weapons?.find(w => w.defKey === reward.weaponKey);
      const baseDmg = def.baseDamage;
      const baseSpeed = def.attackSpeed;
      const baseRange = def.range;
      const nextTier = existingWeapon ? existingWeapon.tier + 1 : 0;
      const nextDmg = Math.round(CONFIG.WEAPON_DEFS[reward.weaponKey].baseDamage * (1 + nextTier * 0.5));
      const nextSpeed = (CONFIG.WEAPON_DEFS[reward.weaponKey].attackSpeed * (1 + nextTier * 0.08)).toFixed(2);
      const dps = Math.round(baseDmg * baseSpeed);

      statsHtml = `
        <div class="rt-stat"><span>⚔️ Schaden</span><strong>${Math.round(baseDmg)}${nextTier > 0 ? ` → ${nextDmg}` : ''}</strong></div>
        <div class="rt-stat"><span>⚡ Angriffe/Sek</span><strong>${baseSpeed.toFixed(2)}${nextTier > 0 ? ` → ${nextSpeed}` : ''}</strong></div>
        <div class="rt-stat"><span>💥 DPS</span><strong>${dps}</strong></div>
        <div class="rt-stat"><span>📏 Reichweite</span><strong>${Math.round(baseRange)}</strong></div>
        ${isMelee ? `<div class="rt-stat"><span>📐 Schwungbogen</span><strong>${(def.arc * 180 / Math.PI).toFixed(0)}°</strong></div>` : ''}
        ${!isMelee && def.pellets ? `<div class="rt-stat"><span>🎯 Projektile</span><strong>${def.pellets}</strong></div>` : ''}
        ${def.pierce ? `<div class="rt-stat"><span>🗡️ Durchschlag</span><strong>${def.pierce}</strong></div>` : ''}
        ${existingWeapon ? `<div class="rt-hint">⬆️ Upgrade: Lv.${existingWeapon.tier + 1} → Lv.${existingWeapon.tier + 2}</div>` : ''}
        ${existingWeapon ? `<div class="rt-hint">➕ Oder als 2. Waffe ausrüsten</div>` : ''}
      `;
    } else if (reward.type === 'stat') {
      const valStr = reward.percent ? `${reward.value}%` : `+${reward.value}`;
      statsHtml = `
        <div class="rt-stat"><span>📈 Effekt</span><strong>${reward.stat === 'maxHp' ? '❤️ Max HP' : reward.stat === 'damage' ? '⚔️ Schaden' : reward.stat === 'attackSpeed' ? '⚡ Angriffstempo' : reward.stat === 'critChance' ? '💥 Krit-Chance' : reward.stat === 'armor' ? '🛡️ Rüstung' : reward.stat === 'speed' ? '👟 Tempo' : reward.stat === 'lifeSteal' ? '🧛 Lebensraub' : reward.stat}</strong></div>
        <div class="rt-stat"><span>📊 Wert</span><strong>${valStr}</strong></div>
      `;
    }

    tooltip.innerHTML = `
      <div class="rt-header">${reward.icon} ${reward.name}</div>
      ${statsHtml}
    `;
    document.body.appendChild(tooltip);

    // Position tooltip near the card
    const rect = cardEl.getBoundingClientRect();
    const tipW = Math.min(260, window.innerWidth - 20);
    tooltip.style.width = tipW + 'px';
    const tipLeft = Math.max(10, Math.min(rect.left, window.innerWidth - tipW - 10));
    const tipTop = rect.bottom + 6;
    tooltip.style.left = tipLeft + 'px';
    tooltip.style.top = tipTop + 'px';
  },

  _hideRewardTooltip() {
    const existing = document.getElementById('reward-tooltip');
    if (existing) existing.remove();
  },

  _updateRewardInfo() {
    let infoEl = document.getElementById('reward-info');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'reward-info';
      const container = document.querySelector('.reward-container');
      container.insertBefore(infoEl, document.getElementById('reward-choices'));
    }
    const picksLeft = Rewards.maxPicks - Rewards.pickedCount;
    const rerolls = Rewards.rerollsLeft;
    infoEl.innerHTML = `
      <div class="reward-counter">Wähle bis zu <strong>${Rewards.maxPicks}</strong> Belohnungen (${picksLeft} übrig)${Rewards.maxPicks > 2 ? ' ✨' : ''}</div>
      <button id="btn-reroll" class="btn btn-secondary btn-reroll">${rerolls > 0 ? '🔄 Reroll' : '🔄 Reroll (0)'}</button>
      <button id="btn-continue" class="btn btn-primary btn-continue">▶️ Weiter</button>
    `;
    document.getElementById('btn-reroll')?.addEventListener('click', () => Game.rerollReward());
    document.getElementById('btn-continue')?.addEventListener('click', () => Game.finishReward());
  },

  _markCardPicked(index) {
    const card = document.getElementById(`reward-card-${index}`);
    if (card) {
      card.classList.add('picked');
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    }
  },

  announceFloor(floorNum, isBoss) {
    const el = document.getElementById('floor-announce');
    if (!el) return;
    const theme = Dungeon.getTheme(floorNum);
    const text = isBoss ? `⚔️ BOSS — Ebene ${floorNum}` : `🏰 Ebene ${floorNum} — ${theme.name}`;
    el.textContent = text;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 2200);
  }
};