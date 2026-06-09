// ============================================================
// MULTIPLAYER.JS — Peer-to-Peer co-op via WebRTC (PeerJS)
// Up to 4 players (1 host + 3 clients).
// No backend server needed — PeerJS handles signaling.
// ============================================================

const PLAYER_COLORS = [
  '#e8b84b',  // Host  — gold
  '#6ec6ff',  // P2    — blue
  '#ff9944',  // P3    — orange
  '#b388ff'  // P4    — purple
];

const PLAYER_NAMES = [
  'Spieler 1', // host (local, not rendered by multiplayer)
  'Spieler 2',
  'Spieler 3',
  'Spieler 4'
];

const Multiplayer = {
  peer: null,
  conns: [],          // Array of DataConnection objects
  isHost: false,
  roomId: null,
  remotePlayers: [],  // Array of remote player state objects { playerIndex, color, conn, remotePlayer, ready }
  onConnect: null,
  onDisconnect: null,
  onRemoteUpdate: null,
  onRemoteSelectReward: null,

  get connected() {
    return this.conns.length > 0;
  },

  init() {
    this.peer = null;
    this.conns = [];
    this.isHost = false;
    this.roomId = null;
    this.remotePlayers = [];
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

          // Track if resolved/rejected to avoid double calls
          let settled = false;

          conn.on('open', () => {
            clearTimeout(timeout);
            console.log('[MP] Connected to host!');
            // Client: we are player index assigned by host (will be set via 'assignPlayer' message)
            // Create a placeholder remote player entry — host will assign our index
            const clientEntry = {
              playerIndex: -1, // will be assigned by host
              color: '#6ec6ff', // placeholder
              conn: conn,
              remotePlayer: this._createRemotePlayer(),
              ready: false
            };
            this.conns.push(conn);
            this.remotePlayers.push(clientEntry);
            if (this.onConnect) this.onConnect();
            this.send({ type: 'hello' });
            if (!settled) { settled = true; resolve(); }
          });

          conn.on('error', (err) => {
            clearTimeout(timeout);
            console.error('[MP] Connection error:', err);
            if (!settled) { settled = true; reject(new Error('Verbindung fehlgeschlagen — Raum nicht gefunden')); }
          });

          conn.on('close', () => {
            console.log('[MP] Connection closed');
            this._removeConnection(conn);
            if (this.onDisconnect) this.onDisconnect();
          });

          conn.on('data', (data) => {
            this._handleMessage(data, conn);
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

  // Host sets up an incoming connection
  _setupConnection(conn) {
    // Max 3 clients
    if (this.conns.length >= 3) {
      console.log('[MP] Rejecting connection — room full');
      try { conn.close(); } catch(e) {}
      return;
    }

    const playerIndex = this.conns.length; // 0-based: first client = 0 (Spieler 2)
    const color = PLAYER_COLORS[playerIndex + 1]; // +1 because index 0 is host color

    const entry = {
      playerIndex: playerIndex,
      color: color,
      conn: conn,
      remotePlayer: this._createRemotePlayer(),
      ready: false
    };

    this.conns.push(conn);
    this.remotePlayers.push(entry);

    conn.on('open', () => {
      console.log('[MP] Client connected — assigning playerIndex', playerIndex);
      // Tell the client their player index
      conn.send({ type: 'assignPlayer', playerIndex: playerIndex, color: color });
      if (this.onConnect) this.onConnect();
      // If host and game is running, send full enemy sync immediately
      if (this.isHost && Game.state === 'PLAYING') {
        setTimeout(() => this.sendFullSync(), 300);
      }
    });

    // If connection is already open (PeerJS sometimes fires 'open' before we attach the listener)
    if (conn.open) {
      console.log('[MP] Connection already open — assigning playerIndex', playerIndex);
      conn.send({ type: 'assignPlayer', playerIndex: playerIndex, color: color });
      if (this.onConnect) this.onConnect();
      if (this.isHost && Game.state === 'PLAYING') {
        setTimeout(() => this.sendFullSync(), 300);
      }
    }

    conn.on('data', (data) => {
      this._handleMessage(data, conn);
    });

    conn.on('close', () => {
      console.log('[MP] Client disconnected — playerIndex', playerIndex);
      this._removeConnection(conn);
      // Show toast if in game
      if (Game.state === 'PLAYING' || Game.state === 'REWARD') {
        UI.showToast('⚠️ ' + PLAYER_NAMES[playerIndex + 1] + ' hat die Verbindung getrennt', 'error');
      }
      if (this.onDisconnect) this.onDisconnect();
    });

    conn.on('error', (err) => {
      console.error('[MP] Connection error:', err);
    });
  },

  // Remove a connection and its remote player entry
  _removeConnection(conn) {
    const peerId = conn.peer;
    this.conns = this.conns.filter(c => c !== conn);
    this.remotePlayers = this.remotePlayers.filter(rp => rp.conn !== conn);
    try { conn.close(); } catch(e) {}
  },

  // Find the remote player entry for a given connection
  _findRemotePlayer(conn) {
    return this.remotePlayers.find(rp => rp.conn === conn);
  },

  _handleMessage(data, conn) {
    if (!data || !data.type) return;

    switch(data.type) {
      case 'assignPlayer': {
        // Client receives player assignment from host
        if (!this.isHost) {
          const entry = this._findRemotePlayer(conn);
          if (entry) {
            entry.playerIndex = data.playerIndex;
            entry.color = data.color;
          }
        }
        break;
      }

      case 'hello': {
        const entry = this._findRemotePlayer(conn);
        if (entry) {
          entry.ready = true;
        }
        break;
      }

      case 'startGame':
        // Host told client to start — includes room data
        if (!this.isHost) {
          if (this.onStartGame) this.onStartGame(data.roomData);
        }
        break;

      case 'playerUpdate': {
        const entry = this._findRemotePlayer(conn);
        if (entry && entry.remotePlayer) {
          Object.assign(entry.remotePlayer, data.state);
        }
        if (this.onRemoteUpdate) this.onRemoteUpdate(data.state, entry);
        // Host relays client positions to all OTHER clients
        if (this.isHost) {
          this.conns.forEach(c => {
            if (c !== conn && c.open) {
              c.send({ ...data, playerIndex: entry ? entry.playerIndex : 0 });
            }
          });
        }
        // Client: if relayed update with playerIndex, find the right remote player
        if (!this.isHost && data.playerIndex !== undefined) {
          const relayEntry = this.remotePlayers.find(rp => rp.playerIndex === data.playerIndex);
          if (relayEntry && relayEntry.remotePlayer) {
            Object.assign(relayEntry.remotePlayer, data.state);
          }
        }
        break;
      }

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
          // Relay pick to all other clients so they can show what others picked
          this.conns.forEach(c => {
            if (c !== conn && c.open) {
              c.send({ type: 'remoteRewardPick', rewardIdx: data.rewardIdx, playerIndex: this._findRemotePlayer(conn)?.playerIndex });
            }
          });
        }
        break;

      case 'rewardConfirm':
        // Client confirmed reward selection
        if (this.isHost) {
          // Track which client confirmed
          this._confirmedPlayers.add(conn);
          // Broadcast progress to all clients
          const confirmedCount = this._confirmedPlayers.size;
          const totalClients = this.conns.length;
          this.conns.forEach(c => {
            if (c.open) {
              c.send({ type: 'rewardProgress', confirmed: confirmedCount, total: totalClients + 1 });
            }
          });
          // Check if ALL connected clients confirmed + host confirmed
          const allConfirmed = this._hostRewardConfirmed &&
            this.conns.every(c => this._confirmedPlayers.has(c));
          if (allConfirmed) {
            // Tell all clients to advance
            this.conns.forEach(c => {
              if (c.open) c.send({ type: 'rewardConfirm' });
            });
            this._advanceAfterRewards();
          }
        } else {
          // Client received host's confirm — everyone ready, advance
          if (this.onRewardConfirm) this.onRewardConfirm();
        }
        break;

      case 'rewardProgress':
        // Host tells clients how many players confirmed rewards
        if (!this.isHost) {
          const btn = document.getElementById('btn-confirm-rewards');
          if (btn) {
            const waiting = data.total - data.confirmed;
            btn.textContent = waiting > 0 ? `⏳ Warte auf ${waiting} Spieler...` : '⏳ Alle bereit!';
          }
        }
        break;

      case 'clientDead':
        // Client tells host they died
        if (this.isHost) {
          const entry = this._findRemotePlayer(conn);
          if (entry && entry.remotePlayer) {
            entry.remotePlayer.alive = false;
            entry.remotePlayer.hp = 0;
          }
          // Check if all players are dead now
          const allRemoteDead = this.remotePlayers.every(rp => !rp.remotePlayer || !rp.remotePlayer.alive);
          if (!Game.player.alive && allRemoteDead) {
            // All dead — game over
            setTimeout(() => Game.gameOver(), 500);
          }
        }
        break;

      case 'hostDead':
        // Host died — client becomes the active player
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
        break;
    }
  },

  // Send data — broadcast to all connections, or send to a specific one
  send(data, specificConn) {
    if (specificConn) {
      // Send to specific connection only
      try {
        specificConn.send(data);
      } catch(e) {
        console.error('[MP] Send error (specific):', e);
      }
      return;
    }
    // Broadcast to all connections
    for (const conn of this.conns) {
      try {
        conn.send(data);
      } catch(e) {
        console.error('[MP] Send error (broadcast):', e);
      }
    }
  },

  // Broadcast player state (called every frame)
  syncPlayer(player) {
    if (!this.connected) return;
    this.send({
      type: 'playerUpdate',
      state: {
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
      }
    });
  },

  // Host syncs game state — full enemy data every sync
  syncGameState() {
    if (!this.isHost || !this.connected) return;
    this.send({
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

  // Called when both players have confirmed reward selection
  _advanceAfterRewards() {
    // Reset tracking
    this._hostRewardConfirmed = false;
    this._confirmedPlayers = new Set(); // track which connections confirmed
    // Advance to next floor (host calls finishReward)
    if (Game && Game.finishReward) {
      Game.finishReward();
    }
  },

  // Called when the JOINING player picks a reward in reward screen
  sendRewardPick(rewardIdx) {
    if (!this.isHost && this.connected) {
      this.send({ type: 'rewardPick', rewardIdx });
      // Mark local player as confirmed
      this._localRewardConfirmed = true;
      // If host already confirmed, we can advance
      // Otherwise wait for host's rewardConfirm
    }
  },

  // Called when ANY player clicks "Confirm/Done" in reward screen
  sendRewardConfirm() {
    if (this.connected) {
      this.send({ type: 'rewardConfirm' });
    }
  },

  _createRemotePlayer() {
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
      _remoteBob: Math.random() * Math.PI * 2
    };
  },

  disconnect() {
    // Close all connections
    for (const conn of this.conns) {
      try { conn.close(); } catch(e) {}
    }
    this.conns = [];
    this.remotePlayers = [];
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
      this.peer = null;
    }
    this.roomId = null;
    this.isHost = false;
  },

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let id = '';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  },

  // Full sync of enemy data — sent when count changes
  sendFullSync() {
    if (!this.isHost || !this.connected) return;
    this.send({
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
      cleared: Dungeon.cleared
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
    for (const entry of this.remotePlayers) {
      if (entry.remotePlayer && entry.remotePlayer.alive) {
        const dist = Utils.vecDist(entry.remotePlayer, doorPos);
        if (dist < 40) return true;
      }
    }
    return false;
  },

  // Render ALL remote players (with interpolation)
  renderRemote(ctx, camera) {
    for (const entry of this.remotePlayers) {
      const rp = entry.remotePlayer;
      if (!rp || !rp.alive) continue;

      // Interpolate position towards target
      if (rp._renderX === undefined) { rp._renderX = rp.x; rp._renderY = rp.y; }
      rp._renderX += (rp.x - rp._renderX) * 0.3;
      rp._renderY += (rp.y - rp._renderY) * 0.3;

      const color = entry.color || '#6ec6ff';
      const name = PLAYER_NAMES[entry.playerIndex + 1] || 'Co-Op';

      const zoom = camera.zoom || 1;
      const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
      const sx = (rp._renderX - camera.x) * zoom + w / 2;
      const sy = (rp._renderY - camera.y) * zoom + h / 2;
      const s = rp.size * zoom;

      rp._remoteBob += 0.05;
      const bob = Math.sin(rp._remoteBob) * 2 * zoom;

      // Shadow
      ctx.fillStyle = `rgba(0,0,0,${CONFIG.VISUAL.SHADOW_ALPHA})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.7, s * 0.8, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      if (rp.flashTimer > 0) ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 30) * 0.5;

      // Body — use assigned color
      ctx.fillStyle = color;
      ctx.strokeStyle = this._darkenColor(color, 0.7);
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
          const rw = rp.weapons[i];
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
          Player._drawWeaponShape(ctx, { def: rw.def || CONFIG.WEAPON_DEFS[rw.defKey] || CONFIG.WEAPON_DEFS.knife, tier: rw.tier || 0 }, {});
          ctx.restore();
        }
      }

      // Name tag
      ctx.fillStyle = color;
      ctx.font = `bold ${11 * zoom}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🤝 ' + name, sx, sy - s - (rp.weapons && rp.weapons.length > 0 ? 18 : 12) * zoom);

      // HP bar
      const barW = s * 2, barH = 3 * zoom;
      const barX = sx - barW / 2, barY = sy - s - 6 * zoom;
      const hpPct = rp.hp / rp.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = hpPct > 0.5 ? '#44dd66' : hpPct > 0.25 ? '#ddaa00' : '#ff4466';
      ctx.fillRect(barX, barY, barW * hpPct, barH);
    }
  },

  // Utility: darken a hex color by a factor (0-1)
  _darkenColor(hex, factor) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.floor(((num >> 16) & 0xFF) * factor);
    const g = Math.floor(((num >> 8) & 0xFF) * factor);
    const b = Math.floor((num & 0xFF) * factor);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
};