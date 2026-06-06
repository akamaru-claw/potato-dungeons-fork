// ============================================================
// MULTIPLAYER.JS — Peer-to-Peer co-op via WebRTC (PeerJS)
// One player hosts (creates room), up to 3 others join with code.
// Supports 2-4 players (1 host + up to 3 clients).
// No backend server needed — PeerJS handles signaling.
// ============================================================
const Multiplayer = {
  peer: null,
  conns: [],         // Array of DataConnections to clients (host) or single conn (client)
  isHost: false,
  roomId: null,
  connected: false,
  remotePlayers: [], // Array of { x, y, hp, maxHp, size, alive, facingAngle, weapons, kills, level, flashTimer, invincible, playerIndex, color, _remoteBob }
  remoteReady: [],   // Array of booleans per client
  onConnect: null,
  onDisconnect: null,
  onRemoteUpdate: null,
  onRemoteSelectReward: null,
  onStartGame: null,
  onNextFloor: null,
  onRewardConfirm: null,

  // Player colors: index 0 = host, 1-3 = clients
  PLAYER_COLORS: [null, '#6ec6ff', '#ff9f43', '#a48aff'],
  PLAYER_COLOR_NAMES: [null, 'Blau', 'Orange', 'Lila'],

  init() {
    this.peer = null;
    this.conns = [];
    this.isHost = false;
    this.roomId = null;
    this.connected = false;
    this.remotePlayers = [];
    this.remoteReady = [];
  },

  // Number of connected clients
  get clientCount() {
    return this.conns.filter(c => c && c.open).length;
  },

  // Total player count (host + clients)
  get playerCount() {
    return 1 + this.clientCount;
  },

  // Create a room — this player is the host
  async createRoom() {
    this.disconnect();
    // Generate short room ID
    this.roomId = this._generateRoomId();
    this.isHost = true;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer('pd-' + this.roomId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              { urls: 'turn:global.relay.metered.ca:80', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' },
              { urls: 'turn:global.relay.metered.ca:443', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' },
              { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' }
            ]
          }
        });

        // Timeout: if no open event in 10s, reject
        const timeout = setTimeout(() => {
          this.peer?.destroy();
          reject(new Error('Verbindungstimeout — PeerJS Server nicht erreichbar'));
        }, 10000);

        this.peer.on('open', (id) => {
          clearTimeout(timeout);
          console.log('[MP] Room created:', id);
          resolve(this.roomId);
        });

        this.peer.on('connection', (conn) => {
          console.log('[MP] Player joining...');
          if (this.conns.length >= 3) {
            console.log('[MP] Room full, rejecting connection');
            conn.on('open', () => {
              conn.send({ type: 'roomFull' });
              setTimeout(() => conn.close(), 500);
            });
            return;
          }
          this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
          clearTimeout(timeout);
          console.error('[MP] Peer error:', err);
          if (err.type === 'unavailable-id') {
            // Room ID taken, try another
            this.createRoom().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });

      } catch(e) {
        reject(e);
      }
    });
  },

  // Join an existing room
  async joinRoom(roomId) {
    this.disconnect();
    this.roomId = roomId.toUpperCase().trim();
    this.isHost = false;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(undefined, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              { urls: 'turn:global.relay.metered.ca:80', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' },
              { urls: 'turn:global.relay.metered.ca:443', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' },
              { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'e8dd65f92f7db8a1a1f1f170', credential: 'F5kb1k2o5SC8y+g' }
            ]
          }
        });

        // Timeout: if no connection in 15s, reject
        const timeout = setTimeout(() => {
          this.peer?.destroy();
          reject(new Error('Verbindungstimeout — Raum nicht gefunden. Code korrekt?'));
        }, 15000);

        this.peer.on('open', () => {
          console.log('[MP] Connecting to room pd-' + this.roomId);
          const conn = this.peer.connect('pd-' + this.roomId, { reliable: true });
          this._setupConnection(conn);
          conn.on('open', () => {
            clearTimeout(timeout);
            console.log('[MP] Connected to host!');
            this.connected = true;
            resolve();
          });
          conn.on('error', (err) => {
            clearTimeout(timeout);
            console.error('[MP] Connection error:', err);
            reject(new Error('Verbindung fehlgeschlagen — Raum nicht gefunden'));
          });
        });

        this.peer.on('error', (err) => {
          clearTimeout(timeout);
          console.error('[MP] Peer error:', err);
          reject(err);
        });

      } catch(e) {
        reject(e);
      }
    });
  },

  _setupConnection(conn) {
    if (this.isHost) {
      // Assign player index to this connection
      const playerIndex = this._nextPlayerIndex();
      conn._playerIndex = playerIndex;
      conn._color = this.PLAYER_COLORS[playerIndex];

      conn.on('open', () => {
        console.log('[MP] Client connected as Player', playerIndex + 1);
        this.conns.push(conn);
        this.connected = true;

        // Create remote player entry
        const rp = this._createRemotePlayer(playerIndex);
        this.remotePlayers.push(rp);
        this.remoteReady.push(false);

        // Assign player index and color to client
        conn.send({ type: 'assignPlayer', playerIndex, color: conn._color, colorName: this.PLAYER_COLOR_NAMES[playerIndex] });

        // If game is running, send full state
        if (Game.state === 'PLAYING' || Game.state === 'REWARD') {
          setTimeout(() => {
            this.sendTo(this.conns.indexOf(conn), {
              type: 'assignPlayer', playerIndex, color: conn._color, colorName: this.PLAYER_COLOR_NAMES[playerIndex]
            });
            this.sendFullSyncTo(this.conns.indexOf(conn));
            // Send all current remote player states to the new client
            this.sendTo(this.conns.indexOf(conn), {
              type: 'allPlayerStates',
              players: this.remotePlayers.map(p => ({
                x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
                facingAngle: p.facingAngle, weapons: p.weapons, kills: p.kills,
                level: p.level, playerIndex: p.playerIndex, color: p.color
              }))
            });
          }, 200);
        }

        // Notify existing clients about new player
        this.broadcastExcept(this.conns.indexOf(conn), {
          type: 'playerJoined',
          playerIndex,
          color: conn._color,
          colorName: this.PLAYER_COLOR_NAMES[playerIndex]
        });

        if (this.onConnect) this.onConnect();
        // Send initial hello
        conn.send({ type: 'hello' });
      });

      conn.on('data', (data) => {
        this._handleMessage(data, conn);
      });

      conn.on('close', () => {
        console.log('[MP] Player', playerIndex + 1, 'disconnected');
        const idx = this.conns.indexOf(conn);
        if (idx >= 0) {
          this.conns.splice(idx, 1);
          this.remotePlayers.splice(idx, 1);
          this.remoteReady.splice(idx, 1);
        }
        // Notify remaining clients
        this.broadcast({ type: 'playerLeft', playerIndex });
        // Re-assign player indices for remaining connections
        this._reindexConnections();
        if (this.conns.length === 0) {
          this.connected = false;
        }
        if (Game.state === 'PLAYING' || Game.state === 'REWARD') {
          UI.showToast(`⚠️ Spieler ${playerIndex + 1} hat die Verbindung getrennt`, 'error');
        }
        if (this.onDisconnect) this.onDisconnect();
      });

      conn.on('error', (err) => {
        console.error('[MP] Connection error:', err);
      });
    } else {
      // Client: single connection to host
      this.conns = [conn];

      conn.on('open', () => {
        this.connected = true;
        if (this.onConnect) this.onConnect();
        this.send({ type: 'hello' });
      });

      conn.on('data', (data) => {
        this._handleMessage(data, conn);
      });

      conn.on('close', () => {
        console.log('[MP] Connection to host closed');
        this.connected = false;
        this.remotePlayers = [];
        this.remoteReady = [];
        this.conns = [];
        if (Game.state === 'PLAYING' || Game.state === 'REWARD') {
          UI.showToast('⚠️ Verbindung zum Host getrennt', 'error');
        }
        if (this.onDisconnect) this.onDisconnect();
      });

      conn.on('error', (err) => {
        console.error('[MP] Connection error:', err);
      });
    }
  },

  // Get the next available player index (1-3)
  _nextPlayerIndex() {
    const usedIndices = this.conns.map(c => c._playerIndex);
    for (let i = 1; i <= 3; i++) {
      if (!usedIndices.includes(i)) return i;
    }
    return this.conns.length + 1; // fallback
  },

  // Re-assign indices after a disconnect (keep them stable though — only fix conns array)
  _reindexConnections() {
    // Player indices stay as assigned — no re-assignment to avoid confusion
  },

  _handleMessage(data, conn) {
    if (!data || !data.type) return;

    switch(data.type) {
      case 'roomFull':
        if (!this.isHost) {
          UI.showToast('❌ Raum ist voll (4/4 Spieler)', 'error');
          this.disconnect();
        }
        break;

      case 'hello':
        if (this.isHost) {
          const idx = this.conns.indexOf(conn);
          if (idx >= 0 && idx < this.remoteReady.length) {
            this.remoteReady[idx] = true;
          }
        } else {
          // Client received hello from host
          this.remoteReady = [true];
        }
        break;

      case 'assignPlayer':
        // Client receives their assigned player index and color
        if (!this.isHost) {
          this._myPlayerIndex = data.playerIndex;
          this._myColor = data.color;
          this._myColorName = data.colorName;
          console.log('[MP] Assigned as Player', data.playerIndex + 1, 'color:', data.color);
        }
        break;

      case 'playerJoined':
        // Client learns another client joined
        if (!this.isHost) {
          // Add a remote player entry for the new player
          // We'll get their state via playerUpdate soon
        }
        break;

      case 'playerLeft':
        // Client learns a player left
        if (!this.isHost && data.playerIndex !== undefined) {
          const removeIdx = this.remotePlayers.findIndex(p => p.playerIndex === data.playerIndex);
          if (removeIdx >= 0) {
            this.remotePlayers.splice(removeIdx, 1);
          }
          UI.showToast(`⚠️ Spieler ${data.playerIndex + 1} hat verlassen`, 'error');
        }
        break;

      case 'allPlayerStates':
        // Client receives all current remote player states
        if (!this.isHost && data.players) {
          this.remotePlayers = data.players.map(p => {
            const existing = this.remotePlayers.find(rp => rp.playerIndex === p.playerIndex);
            if (existing) {
              Object.assign(existing, p);
              return existing;
            }
            const rp = this._createRemotePlayer(p.playerIndex);
            rp.color = p.color || this.PLAYER_COLORS[p.playerIndex];
            Object.assign(rp, p);
            return rp;
          });
        }
        break;

      case 'startGame':
        // Host told client to start — includes room data
        if (!this.isHost) {
          if (this.onStartGame) this.onStartGame(data.roomData);
        }
        break;

      case 'playerUpdate':
        if (this.isHost) {
          // Find which client sent this
          const senderIdx = this.conns.indexOf(conn);
          if (senderIdx >= 0 && senderIdx < this.remotePlayers.length) {
            Object.assign(this.remotePlayers[senderIdx], data.state);
            // Relay this player's state to all OTHER clients
            this.broadcastExcept(senderIdx, {
              type: 'remotePlayerUpdate',
              playerIndex: this.remotePlayers[senderIdx].playerIndex,
              state: data.state
            });
          }
          if (this.onRemoteUpdate) this.onRemoteUpdate(data.state, senderIdx);
        } else {
          // Client receives remote player updates from host
          if (data.playerIndex !== undefined) {
            let rp = this.remotePlayers.find(p => p.playerIndex === data.playerIndex);
            if (rp) {
              Object.assign(rp, data.state);
            }
          } else if (this.remotePlayers.length > 0) {
            // Legacy: update first remote player
            Object.assign(this.remotePlayers[0], data.state);
          }
          if (this.onRemoteUpdate) this.onRemoteUpdate(data.state);
        }
        break;

      case 'remotePlayerUpdate':
        // Client receives update about a specific remote player
        if (!this.isHost && data.playerIndex !== undefined) {
          let rp = this.remotePlayers.find(p => p.playerIndex === data.playerIndex);
          if (rp) {
            Object.assign(rp, data.state);
          }
        }
        break;

      case 'gameState':
        // Host sends full game state (enemies, door, etc.)
        if (!this.isHost && data.enemies) {
          EnemySystem.enemies = data.enemies.map(e => ({
            ...e,
            alive: e.hp > 0,
            def: CONFIG.ENEMY_DEFS[e.type] || {},
            flashTimer: 0, hitAnim: 0,
            knockbackVx: 0, knockbackVy: 0,
            spawnAnim: 0, pulsePhase: Math.random() * Math.PI * 2,
            takeDamage() {}, die() {},
            xpValue: (CONFIG.ENEMY_DEFS[e.type] || {}).xp || 5
          }));
        }
        if (data.doorOpen !== undefined) {
          Dungeon.doorOpen = data.doorOpen;
          Dungeon.cleared = data.cleared;
        }
        if (data.floor) {
          Dungeon.currentFloor = data.floor;
        }
        break;

      case 'selectReward':
        if (this.onRemoteSelectReward) this.onRemoteSelectReward(data.index);
        break;

      case 'nextFloor':
        // Host tells client to go to next floor
        if (!this.isHost && data.roomData) {
          // Revive dead client player before going to next floor
          if (Game.player) {
            Game.player.hp = Game.player.getMaxHp();
            Game.player.alive = true;
            Game.player.invulFrames = 60;
            Game.player.visible = true;
            Game.player.flashTimer = 0;
          }
          // Client receives new room data for next floor
          if (this.onNextFloor) this.onNextFloor(data.roomData);
        }
        break;

      case 'showReward':
        // Host entered reward screen — show it to client too with full choices
        if (!this.isHost) {
          if (data.choices) {
            // Enrich remote choices into proper reward objects
            Rewards.currentChoices = data.choices.map(r => {
              if (r.type === 'weapon') {
                const existingWeapon = Game.player?.weapons?.find(w => w.defKey === r.weaponKey);
                const def = CONFIG.WEAPON_DEFS[r.weaponKey];
                return {
                  type: 'weapon',
                  name: r.name,
                  icon: r.icon,
                  weaponKey: r.weaponKey,
                  isUpgrade: !!existingWeapon,
                  offerTier: existingWeapon ? existingWeapon.tier + 1 : 0
                };
              } else if (r.type === 'stat') {
                return { type: 'stat', name: r.name, icon: r.icon, stat: r.stat, value: r.value, percent: r.percent };
              } else if (r.type === 'relic') {
                return { type: 'relic', name: r.name, icon: r.icon, relicKey: r.relicKey, desc: r.desc };
              }
              return r;
            });
            if (data.numRewards) {
              Rewards.maxPicks = data.numRewards;
              Rewards.pickedCount = 0;
              Rewards.rerollsLeft = 0;
            }
            UI.showReward(Rewards.currentChoices);
          }
        }
        break;

      case 'rewardPick':
        // Client picked a reward — host tracks it
        if (this.isHost && data.rewardIdx !== undefined) {
          const senderIdx = this.conns.indexOf(conn);
          if (senderIdx >= 0) {
            this._clientRewardPicks = this._clientRewardPicks || {};
            this._clientRewardPicks[senderIdx] = data.rewardIdx;
          }
        }
        break;

      case 'rewardConfirm':
        // A client confirmed reward selection
        if (this.isHost) {
          const senderIdx = this.conns.indexOf(conn);
          if (senderIdx >= 0) {
            this._clientRewardConfirmed = this._clientRewardConfirmed || [false, false, false];
            this._clientRewardConfirmed[senderIdx] = true;
            if (this._hostRewardConfirmed) {
              this._checkAllRewardsConfirmed();
            }
          }
        } else {
          // Client received host's confirm
          if (this.onRewardConfirm) this.onRewardConfirm();
        }
        break;

      case 'clientDead':
        // Client tells host they died
        if (this.isHost) {
          const senderIdx = this.conns.indexOf(conn);
          if (senderIdx >= 0 && senderIdx < this.remotePlayers.length) {
            this.remotePlayers[senderIdx].alive = false;
            this.remotePlayers[senderIdx].hp = 0;
          }
          // Check if ALL players are dead now
          this._checkGameOver();
        }
        break;

      case 'hostDead':
        // Host died — client notes it
        if (!this.isHost) {
          this._hostDied = true;
        }
        break;

      case 'newFloor':
        // New floor — revive all players
        if (!this.isHost) {
          Game.floor = data.floor || Game.floor + 1;
          // Reset client player — revive if dead, full heal
          if (Game.player) {
            Game.player.hp = Game.player.getMaxHp();
            Game.player.alive = true;
            Game.player.invulFrames = 60; // brief invul after revive
            Game.player.visible = true;
            Game.player.flashTimer = 0;
          }
          // Reset remote players
          for (const rp of this.remotePlayers) {
            rp.alive = true;
            rp.hp = rp.maxHp;
          }
        }
        break;

      case 'damageText':
        // Host sends damage floating text to client
        if (!this.isHost && data.x !== undefined) {
          FloatingText.add(data.x, data.y, data.text, data.color || '#fff', data.size || 16, data.duration || 0.9);
          if (data.particle === 'hit') ParticleSystem.hit(data.x, data.y, data.particleColor || '#fff');
          if (data.particle === 'death') ParticleSystem.explosion(data.x, data.y, data.particleColor || '#fff', 15);
        }
        break;

      case 'dealDamage':
        // Client tells host to apply damage to an enemy
        if (this.isHost && data.enemyIdx !== undefined) {
          const e = EnemySystem.enemies[data.enemyIdx];
          if (e && e.alive) {
            e.takeDamage(data.damage, data.dir, data.knockback, data.isCrit);
          }
        }
        break;

      case 'doorTouch':
        // Client touched the door — host checks and advances floor
        if (this.isHost && Dungeon.doorOpen) {
          Game.multiplayerDoorTriggered = true;
        }
        break;

      case 'fullSync':
        // Full enemy data — sent when count changes (new floor, enemy spawns/dies)
        if (!this.isHost && data.enemies) {
          EnemySystem.enemies = data.enemies.map(e => ({
            ...e,
            alive: e.hp > 0,
            def: CONFIG.ENEMY_DEFS[e.type] || {},
            flashTimer: 0, hitAnim: 0,
            hitCooldown: e.hitCooldown || 0,
            knockbackVx: 0, knockbackVy: 0,
            spawnAnim: 0, pulsePhase: Math.random() * Math.PI * 2,
            takeDamage() {}, die() {}
          }));
        }
        if (data.doorOpen !== undefined) {
          Dungeon.doorOpen = data.doorOpen;
          Dungeon.cleared = data.cleared;
        }
        if (data.floor) {
          Dungeon.currentFloor = data.floor;
        }
        // Also receive all remote player states
        if (data.allPlayers) {
          this.remotePlayers = data.allPlayers.map(p => {
            let rp = this.remotePlayers.find(r => r.playerIndex === p.playerIndex);
            if (rp) {
              Object.assign(rp, p);
              return rp;
            }
            rp = this._createRemotePlayer(p.playerIndex);
            rp.color = p.color || this.PLAYER_COLORS[p.playerIndex];
            Object.assign(rp, p);
            return rp;
          });
        }
        break;
    }
  },

  // Check if all players are dead → game over
  _checkGameOver() {
    if (!this.isHost) return;
    const hostAlive = Game.player && Game.player.alive;
    const anyClientAlive = this.remotePlayers.some(rp => rp.alive);
    if (!hostAlive && !anyClientAlive) {
      setTimeout(() => Game.gameOver(), 500);
    }
  },

  // Check if ALL clients confirmed rewards
  _checkAllRewardsConfirmed() {
    if (!this.isHost) return;
    const allConfirmed = this.conns.every((conn, idx) => {
      return this._clientRewardConfirmed && this._clientRewardConfirmed[idx] === true;
    });
    if (allConfirmed && this._hostRewardConfirmed) {
      this._advanceAfterRewards();
    }
  },

  // Broadcast data to ALL connected clients
  broadcast(data) {
    for (const conn of this.conns) {
      if (conn && conn.open) {
        try {
          conn.send(data);
        } catch(e) {
          console.error('[MP] Broadcast error:', e);
        }
      }
    }
  },

  // Send data to a specific client by connection index
  sendTo(connIdx, data) {
    if (connIdx >= 0 && connIdx < this.conns.length && this.conns[connIdx] && this.conns[connIdx].open) {
      try {
        this.conns[connIdx].send(data);
      } catch(e) {
        console.error('[MP] sendTo error:', e);
      }
    }
  },

  // Broadcast to all clients EXCEPT one
  broadcastExcept(excludeIdx, data) {
    for (let i = 0; i < this.conns.length; i++) {
      if (i === excludeIdx) continue;
      if (this.conns[i] && this.conns[i].open) {
        try {
          this.conns[i].send(data);
        } catch(e) {
          console.error('[MP] broadcastExcept error:', e);
        }
      }
    }
  },

  // Send data (client-side: send to host via first connection)
  send(data) {
    if (!this.isHost && this.conns.length > 0 && this.conns[0] && this.conns[0].open) {
      try {
        this.conns[0].send(data);
      } catch(e) {
        console.error('[MP] Send error:', e);
      }
    } else if (this.isHost) {
      // Host sending to all clients
      this.broadcast(data);
    }
  },

  // Broadcast player state (called every frame)
  syncPlayer(player) {
    if (!this.connected) return;
    const state = {
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      hp: player.hp,
      maxHp: player.getMaxHp(),
      alive: player.alive,
      facingAngle: player.weapons.length > 0 ? player.weapons[0].angle : 0,
      weapons: player.weapons.map(w => ({
        defKey: w.defKey,
        tier: w.tier,
        angle: w.angle,
        swingProgress: w.swingProgress
      })),
      kills: player.kills,
      level: player.level
    };

    if (this.isHost) {
      // Host broadcasts its own state to all clients
      this.broadcast({
        type: 'playerUpdate',
        playerIndex: 0, // host is player 0
        state
      });
    } else {
      // Client sends to host
      this.send({
        type: 'playerUpdate',
        state
      });
    }
  },

  // Host syncs game state — full enemy data every sync
  syncGameState() {
    if (!this.isHost || !this.connected) return;
    this.broadcast({
      type: 'gameState',
      floor: Dungeon.currentFloor,
      enemies: EnemySystem.enemies.map(e => ({
        type: e.type,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: Math.round(e.hp),
        maxHp: e.maxHp,
        damage: Math.round(e.damage * 10) / 10,
        size: e.size,
        color: e.color,
        colorDark: e.colorDark,
        shape: e.def?.shape || 'circle',
        alive: e.alive,
        boss: e.def?.boss || false,
        elite: e.def?.elite || false,
        hitCooldown: Math.round(e.hitCooldown * 10) / 10
      })),
      doorOpen: Dungeon.doorOpen,
      cleared: Dungeon.cleared
    });
  },

  // Called when all players have confirmed reward selection
  _advanceAfterRewards() {
    // Reset tracking
    this._hostRewardConfirmed = false;
    this._clientRewardConfirmed = [false, false, false];
    this._clientRewardPicks = {};
    // Advance to next floor (host calls finishReward)
    if (Game && Game.finishReward) {
      Game.finishReward();
    }
  },

  // Called when the JOINING player picks a reward in reward screen
  sendRewardPick(rewardIdx) {
    if (!this.isHost && this.connected) {
      this.send({ type: 'rewardPick', rewardIdx });
      this._localRewardConfirmed = true;
    }
  },

  // Called when ANY player clicks "Confirm/Done" in reward screen
  sendRewardConfirm() {
    if (this.connected) {
      this.send({ type: 'rewardConfirm' });
    }
  },

  _createRemotePlayer(playerIndex) {
    return {
      x: CONFIG.ROOM_WIDTH / 2,
      y: CONFIG.ROOM_HEIGHT - CONFIG.WALL_THICKNESS - 30,
      hp: CONFIG.PLAYER.BASE_HP,
      maxHp: CONFIG.PLAYER.BASE_HP,
      size: CONFIG.PLAYER.SIZE,
      alive: true,
      facingAngle: 0,
      weaponCount: 1,
      kills: 0,
      level: 1,
      flashTimer: 0,
      invincible: 0,
      playerIndex: playerIndex || (this.remotePlayers.length + 1),
      color: this.PLAYER_COLORS[playerIndex || (this.remotePlayers.length + 1)] || '#6ec6ff',
      weapons: [],
      _remoteBob: Math.random() * Math.PI * 2
    };
  },

  disconnect() {
    for (const conn of this.conns) {
      try { conn.close(); } catch(e) {}
    }
    this.conns = [];
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
      this.peer = null;
    }
    this.connected = false;
    this.roomId = null;
    this.isHost = false;
    this.remotePlayers = [];
    this.remoteReady = [];
  },

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let id = '';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  },

  // Full sync of enemy data — sent when count changes, includes all player states
  sendFullSync() {
    if (!this.isHost || !this.connected) return;
    this.broadcast({
      type: 'fullSync',
      floor: Dungeon.currentFloor,
      enemies: EnemySystem.enemies.map(e => ({
        type: e.type,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: e.hp,
        maxHp: e.maxHp,
        damage: e.damage,
        size: e.size,
        color: e.color,
        colorDark: e.colorDark,
        shape: e.def?.shape || 'circle',
        alive: e.alive,
        boss: e.def?.boss || false,
        elite: e.def?.elite || false,
        hitCooldown: e.hitCooldown || 0
      })),
      doorOpen: Dungeon.doorOpen,
      cleared: Dungeon.cleared,
      allPlayers: this.remotePlayers.map(p => ({
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        facingAngle: p.facingAngle, weapons: p.weapons, kills: p.kills,
        level: p.level, playerIndex: p.playerIndex, color: p.color
      }))
    });
  },

  // Send full sync to a specific client (new join)
  sendFullSyncTo(connIdx) {
    if (!this.isHost || connIdx < 0 || connIdx >= this.conns.length) return;
    this.sendTo(connIdx, {
      type: 'fullSync',
      floor: Dungeon.currentFloor,
      enemies: EnemySystem.enemies.map(e => ({
        type: e.type,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: e.hp,
        maxHp: e.maxHp,
        damage: e.damage,
        size: e.size,
        color: e.color,
        colorDark: e.colorDark,
        shape: e.def?.shape || 'circle',
        alive: e.alive,
        boss: e.def?.boss || false,
        elite: e.def?.elite || false,
        hitCooldown: e.hitCooldown || 0
      })),
      doorOpen: Dungeon.doorOpen,
      cleared: Dungeon.cleared,
      allPlayers: this.remotePlayers.map(p => ({
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        facingAngle: p.facingAngle, weapons: p.weapons, kills: p.kills,
        level: p.level, playerIndex: p.playerIndex, color: p.color
      }))
    });
  },

  // Check if ANY connected player is near the door
  isPlayerAtDoor(doorPos) {
    // Check local player
    if (Game.player && Game.player.alive) {
      const dist = Utils.vecDist(Game.player, doorPos);
      if (dist < 40) return true;
    }
    // Check all remote players
    for (const rp of this.remotePlayers) {
      if (rp && rp.alive) {
        const dist = Utils.vecDist(rp, doorPos);
        if (dist < 40) return true;
      }
    }
    return false;
  },

  // Render ALL remote players
  renderRemote(ctx, camera) {
    for (const rp of this.remotePlayers) {
      if (!rp || !rp.alive) continue;
      this._renderOneRemote(ctx, camera, rp);
    }
  },

  // Render a single remote player
  _renderOneRemote(ctx, camera, rp) {
    const zoom = camera.zoom || 1;
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
    const sx = (rp.x - camera.x) * zoom + w / 2;
    const sy = (rp.y - camera.y) * zoom + h / 2;
    const s = rp.size * zoom;

    rp._remoteBob += 0.05;
    const bob = Math.sin(rp._remoteBob) * 2 * zoom;

    // Shadow
    ctx.fillStyle = `rgba(0,0,0,${CONFIG.VISUAL.SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.7, s * 0.8, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (rp.flashTimer > 0) ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 30) * 0.5;

    // Body — use the player's assigned color
    const bodyColor = rp.color || '#6ec6ff';
    const borderColor = this._darkenColor(bodyColor, 0.7);
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy + bob, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    const eyeSize = s * 0.2;
    const eyeOff = s * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx - eyeOff, sy + bob - eyeSize, eyeSize, 0, Math.PI * 2);
    ctx.arc(sx + eyeOff, sy + bob - eyeSize, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(sx - eyeOff, sy + bob - eyeSize, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.arc(sx + eyeOff, sy + bob - eyeSize, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // Weapons
    if (rp.weapons && rp.weapons.length > 0) {
      const baseAngle = rp.facingAngle || 0;
      for (let i = 0; i < rp.weapons.length; i++) {
        const w = rp.weapons[i];
        let weaponAngle;
        if (rp.weapons.length === 1) {
          weaponAngle = baseAngle;
        } else {
          const spread = Math.PI + (i - 1) * (Math.PI * 0.6 / (rp.weapons.length - 1)) - Math.PI * 0.3;
          weaponAngle = baseAngle + spread;
        }
        const wX = sx + Math.cos(weaponAngle) * (s + (6 + (i > 0 ? 3 : 0)) * zoom);
        const wY = sy + bob + Math.sin(weaponAngle) * (s + (6 + (i > 0 ? 3 : 0)) * zoom);

        ctx.save();
        ctx.translate(wX, wY);
        ctx.rotate(weaponAngle + Math.PI / 2);
        Player._drawWeaponShape(ctx, { def: w.def || CONFIG.WEAPON_DEFS[w.defKey] || CONFIG.WEAPON_DEFS.knife, tier: w.tier || 0 }, {});
        ctx.restore();
      }
    }

    // Name tag with player color
    const playerLabel = `P${(rp.playerIndex || 1) + 1}`;
    ctx.fillStyle = bodyColor;
    ctx.font = `bold ${11 * zoom}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🤝 ' + playerLabel, sx, sy - s - (rp.weapons && rp.weapons.length > 0 ? 18 : 12) * zoom);

    // HP bar
    const barW = s * 2, barH = 3 * zoom;
    const barX = sx - barW / 2, barY = sy - s - 6 * zoom;
    const hpPct = rp.hp / rp.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = hpPct > 0.5 ? '#44dd66' : hpPct > 0.25 ? '#ddaa00' : '#ff4466';
    ctx.fillRect(barX, barY, barW * hpPct, barH);
  },

  // Utility: darken a hex color by a factor
  _darkenColor(hex, factor) {
    if (!hex || hex[0] !== '#') return hex;
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
    return `rgb(${r},${g},${b})`;
  },

  // Are ALL remote players dead?
  areAllRemotePlayersDead() {
    if (this.remotePlayers.length === 0) return false;
    return this.remotePlayers.every(rp => !rp.alive);
  },

  // Get the count of alive remote players
  aliveRemotePlayerCount() {
    return this.remotePlayers.filter(rp => rp.alive).length;
  }
};