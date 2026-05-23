// ============================================================
// MULTIPLAYER.JS — Peer-to-Peer co-op via WebRTC (PeerJS)
// One player hosts (creates room), other joins with code.
// No backend server needed — PeerJS handles signaling.
// ============================================================
const Multiplayer = {
  peer: null,
  conn: null,         // DataConnection to other player
  isHost: false,
  roomId: null,
  connected: false,
  remotePlayer: null,  // { x, y, hp, maxHp, size, skin, weapons, alive, facingAngle }
  remoteReady: false,
  onConnect: null,
  onDisconnect: null,
  onRemoteUpdate: null,
  onRemoteSelectReward: null,

  init() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomId = null;
    this.connected = false;
    this.remotePlayer = null;
    this.remoteReady = false;
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
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('[MP] Room created:', id);
          resolve(this.roomId);
        });

        this.peer.on('connection', (conn) => {
          console.log('[MP] Player joining...');
          this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
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
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          console.log('[MP] Connecting to room pd-' + this.roomId);
          const conn = this.peer.connect('pd-' + this.roomId, { reliable: true });
          this._setupConnection(conn);
          conn.on('open', () => {
            console.log('[MP] Connected to host!');
            resolve();
          });
        });

        this.peer.on('error', (err) => {
          console.error('[MP] Peer error:', err);
          reject(err);
        });

      } catch(e) {
        reject(e);
      }
    });
  },

  _setupConnection(conn) {
    this.conn = conn;

    conn.on('open', () => {
      this.connected = true;
      this.remotePlayer = this._createRemotePlayer();
      if (this.onConnect) this.onConnect();
      // Send initial hello
      this.send({ type: 'hello' });
      // If host and game is running, send full enemy sync immediately
      if (this.isHost && Game.state === 'PLAYING') {
        setTimeout(() => this.sendFullSync(), 300);
      }
    });

    conn.on('data', (data) => {
      this._handleMessage(data);
    });

    conn.on('close', () => {
      console.log('[MP] Connection closed');
      this.connected = false;
      this.remotePlayer = null;
      this.remoteReady = false;
      if (this.onDisconnect) this.onDisconnect();
    });

    conn.on('error', (err) => {
      console.error('[MP] Connection error:', err);
    });
  },

  _handleMessage(data) {
    if (!data || !data.type) return;

    switch(data.type) {
      case 'hello':
        this.remoteReady = true;
        break;

      case 'startGame':
        // Host told client to start — includes room data
        if (!this.isHost) {
          if (this.onStartGame) this.onStartGame(data.roomData);
        }
        break;

      case 'playerUpdate':
        if (this.remotePlayer) {
          Object.assign(this.remotePlayer, data.state);
        }
        if (this.onRemoteUpdate) this.onRemoteUpdate(data.state);
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
          // Client receives new room data for next floor
          if (this.onNextFloor) this.onNextFloor(data.roomData);
        }
        break;

      case 'showReward':
        // Host entered reward screen
        if (!this.isHost) {
          if (this.onShowReward) this.onShowReward(data.choices);
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

  // Send data to the other player
  send(data) {
    if (this.conn && this.connected) {
      try {
        this.conn.send(data);
      } catch(e) {
        console.error('[MP] Send error:', e);
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
    if (this.conn) {
      try { this.conn.close(); } catch(e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
      this.peer = null;
    }
    this.connected = false;
    this.roomId = null;
    this.isHost = false;
    this.remotePlayer = null;
    this.remoteReady = false;
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
    // Check remote player
    if (this.remotePlayer && this.remotePlayer.alive) {
      const dist = Utils.vecDist(this.remotePlayer, doorPos);
      if (dist < 40) return true;
    }
    return false;
  },

  // Render the remote player
  renderRemote(ctx, camera) {
    const rp = this.remotePlayer;
    if (!rp || !rp.alive) return;

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

    // Body — different color to distinguish
    ctx.fillStyle = '#6ec6ff';
    ctx.strokeStyle = '#4a9fd4';
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

    // Name tag
    ctx.fillStyle = '#6ec6ff';
    ctx.font = `bold ${11 * zoom}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🤝 Co-Op', sx, sy - s - (rp.weapons && rp.weapons.length > 0 ? 18 : 12) * zoom);

    // HP bar
    const barW = s * 2, barH = 3 * zoom;
    const barX = sx - barW / 2, barY = sy - s - 6 * zoom;
    const hpPct = rp.hp / rp.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = hpPct > 0.5 ? '#44dd66' : hpPct > 0.25 ? '#ddaa00' : '#ff4466';
    ctx.fillRect(barX, barY, barW * hpPct, barH);
  }
};