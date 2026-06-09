// ============================================================
// DUNGEON.JS — Floor generation, room layout, door system
// ============================================================
const Dungeon = {
  currentFloor: 0,
  room: null,
  doorOpen: false,
  doorPos: null,
  floorTimer: 0,
  cleared: false,

  startFloor(floorNum, player) {
    this.currentFloor = floorNum;
    this.cleared = false;
    this.doorOpen = false;
    this.floorTimer = CONFIG.TOWER.FLOOR_TIME_LIMIT || 0;

    const theme = this.getTheme(floorNum);
    const isBoss = floorNum % CONFIG.TOWER.BOSS_EVERY === 0;

    // Generate room with varied size and shape
    this.room = this.generateRoom(floorNum, theme, isBoss);

    // Update CONFIG room size for this floor
    CONFIG.ROOM_WIDTH = this.room.pixelWidth;
    CONFIG.ROOM_HEIGHT = this.room.pixelHeight;

    // Place player at room entrance (bottom center of playable area)
    player.x = CONFIG.ROOM_WIDTH / 2;
    player.y = CONFIG.ROOM_HEIGHT - CONFIG.WALL_THICKNESS - player.size - 10;

    // Place door at top center
    this.doorPos = {
      x: CONFIG.ROOM_WIDTH / 2,
      y: CONFIG.WALL_THICKNESS
    };

    // Spawn enemies on floor tiles only
    this.spawnEnemies(floorNum, theme, isBoss);

    return this.room;
  },

  getTheme(floorNum) {
    for (const t of CONFIG.THEMES) {
      if (floorNum >= t.floorMin && floorNum <= t.floorMax) return t;
    }
    return CONFIG.THEMES[CONFIG.THEMES.length - 1];
  },

  generateRoom(floorNum, theme, isBoss) {
    const ts = CONFIG.TILE_SIZE;

    // Room size grows with floor
    const scale = isBoss ? 1.4 : Math.min(CONFIG.MIN_ROOM_SCALE + (floorNum - 1) * 0.08, CONFIG.MAX_ROOM_SCALE);
    const rw = Math.round(CONFIG.ROOM_BASE_WIDTH * scale * (isBoss ? 1.3 : 1));
    const rh = Math.round(CONFIG.ROOM_BASE_HEIGHT * scale * (isBoss ? 1.2 : 1));

    const cols = Math.floor(rw / ts);
    const rows = Math.floor(rh / ts);

    // === New approach: start with all walls, carve out rooms + corridors ===
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        tiles[r][c] = 1; // wall
      }
    }

    // Generate composite room layout: overlapping rectangles + corridors
    const rooms = this._carveRooms(cols, rows, floorNum, isBoss);

    // Carve each room
    for (const room of rooms) {
      for (let r = room.y; r < room.y + room.h && r < rows; r++) {
        for (let c = room.x; c < room.x + room.w && c < cols; c++) {
          tiles[r][c] = 0;
        }
      }
    }

    // Add internal obstacles (only on floor tiles)
    const obstacleCount = Math.min(3 + Math.floor(floorNum / 3), 15);
    for (let i = 0; i < obstacleCount; i++) {
      const c = Utils.randInt(3, cols - 4);
      const r = Utils.randInt(3, rows - 4);
      if (tiles[r][c] === 0) tiles[r][c] = 2;
    }

    // Wall clusters on higher floors
    if (floorNum >= 5) {
      const clusterCount = Math.min(Math.floor(floorNum / 5), 4);
      for (let i = 0; i < clusterCount; i++) {
        const cc = Utils.randInt(4, cols - 5);
        const cr = Utils.randInt(4, rows - 5);
        // Don't place in spawn/door area
        if (Math.abs(cc - Math.floor(cols / 2)) < 3 && (cr > rows - 5 || cr < 4)) continue;
        const shape = Utils.randInt(0, 2);
        if (shape === 0) {
          for (let d = 0; d < 3; d++) { if (cc + d < cols && tiles[cr][cc + d] === 0) tiles[cr][cc + d] = 2; }
        } else if (shape === 1) {
          for (let d = 0; d < 3; d++) { if (cr + d < rows && tiles[cr + d][cc] === 0) tiles[cr + d][cc] = 2; }
        } else {
          if (tiles[cr][cc] === 0) tiles[cr][cc] = 2;
          if (cr + 1 < rows && tiles[cr + 1][cc] === 0) tiles[cr + 1][cc] = 2;
          if (cr + 1 < rows && cc + 1 < cols && tiles[cr + 1][cc + 1] === 0) tiles[cr + 1][cc + 1] = 2;
        }
      }
    }

    // Ensure spawn zone (bottom center) and door zone (top center) are clear
    const spawnCol = Math.floor(cols / 2);
    for (let dc = -3; dc <= 3; dc++) {
      for (let dr = 0; dr < 5; dr++) {
        const sc = spawnCol + dc;
        if (sc >= 0 && sc < cols) {
          if (rows - 2 - dr >= 0) tiles[rows - 2 - dr][sc] = 0; // spawn area
          if (1 + dr < rows) tiles[1 + dr][sc] = 0; // door area
        }
      }
    }

    // Carve a path from spawn to door to guarantee connectivity
    this._carvePath(tiles, cols, rows, spawnCol, rows - 4, spawnCol, 3, 3);

    // Door opening in top wall
    const doorLeft = Math.floor(cols / 2) - 1;
    const doorRight = Math.floor(cols / 2) + 1;
    for (let dc = doorLeft; dc <= doorRight; dc++) {
      if (dc >= 0 && dc < cols) tiles[0][dc] = 0;
    }

    return {
      tiles, cols, rows, theme, isBoss,
      tileWidth: ts,
      wallColor: theme.wallColor,
      floorColor: theme.floorColor,
      pixelWidth: cols * ts,
      pixelHeight: rows * ts
    };
  },

  // Generate room layout: 1 big main area + side rooms, mostly floor
  _carveRooms(cols, rows, floorNum, isBoss) {
    const rooms = [];
    const m = 2; // margin

    if (isBoss) {
      rooms.push({ x: m, y: m, w: cols - m * 2, h: rows - m * 2 });
      return rooms;
    }

    // Start with a big main area that fills most of the grid (75-90%)
    const mainW = Math.floor(cols * (0.65 + Math.random() * 0.25));
    const mainH = Math.floor(rows * (0.55 + Math.random() * 0.3));
    const mainX = Math.floor((cols - mainW) / 2);
    const mainY = Math.floor((rows - mainH) / 2);
    rooms.push({ x: mainX, y: mainY, w: mainW, h: mainH });

    // Add 1-3 side rooms that extend beyond the main area
    const sideRooms = Math.min(1 + Math.floor(floorNum / 4), 3);
    for (let i = 0; i < sideRooms; i++) {
      const side = i % 3; // top, left, right
      let roomW, roomH, roomX, roomY;

      if (side === 0) {
        // Extension at top (toward door area)
        roomW = Math.floor(cols * (0.3 + Math.random() * 0.25));
        roomH = Math.floor(rows * (0.15 + Math.random() * 0.1));
        roomX = Math.max(m, Math.floor((cols - roomW) / 2 + (Math.random() - 0.5) * cols * 0.2));
        roomY = Math.max(m, Math.floor(rows * 0.05 + Math.random() * rows * 0.1));
      } else if (side === 1) {
        // Extension on left
        roomW = Math.floor(cols * (0.15 + Math.random() * 0.15));
        roomH = Math.floor(rows * (0.25 + Math.random() * 0.15));
        roomX = Math.max(m, Math.floor(mainX * 0.5));
        roomY = Math.max(m, Math.floor(mainY + Math.random() * mainH * 0.3));
      } else {
        // Extension on right
        roomW = Math.floor(cols * (0.15 + Math.random() * 0.15));
        roomH = Math.floor(rows * (0.25 + Math.random() * 0.15));
        roomX = Math.min(cols - m - roomW, Math.floor(mainX + mainW + (cols - mainX - mainW) * 0.3));
        roomY = Math.max(m, Math.floor(mainY + Math.random() * mainH * 0.3));
      }

      roomW = Math.max(roomW, 6);
      roomH = Math.max(roomH, 5);
      roomX = Math.max(m, Math.min(cols - m - roomW, roomX));
      roomY = Math.max(m, Math.min(rows - m - roomH, roomY));
      rooms.push({ x: roomX, y: roomY, w: roomW, h: roomH });

      // Wide corridor connecting side room to main
      const prev = rooms[0]; // always connect to main
      const ax = Math.floor(roomX + roomW / 2);
      const ay = Math.floor(roomY + roomH / 2);
      const bx = Math.floor(prev.x + prev.w / 2);
      const by = Math.floor(prev.y + prev.h / 2);
      const cw = 4;
      // Horizontal
      const hMinX = Math.min(ax, bx);
      const hMaxX = Math.max(ax, bx);
      rooms.push({ x: hMinX - cw/2, y: Math.min(ay, by) - cw/2, w: Math.max(hMaxX - hMinX + cw, cw), h: cw });
      // Vertical
      const vMinY = Math.min(ay, by);
      const vMaxY = Math.max(ay, by);
      rooms.push({ x: Math.min(ax, bx) - cw/2, y: vMinY - cw/2, w: cw, h: Math.max(vMaxY - vMinY + cw, cw) });
    }

    // Always carve a wide corridor from spawn to door
    rooms.push({
      x: Math.floor(cols / 2) - 3,
      y: m + 1,
      w: 7,
      h: rows - m * 2
    });

    return rooms;
  },

  // Carve a wide path between two points
  _carvePath(tiles, cols, rows, fromCol, fromRow, toCol, toRow, width) {
    const w = width || 3;
    let c = fromCol, r = fromRow;
    // Horizontal
    while (c !== toCol) {
      for (let dr = -Math.floor(w / 2); dr <= Math.floor(w / 2); dr++) {
        const rr = r + dr;
        if (rr >= 0 && rr < rows && c >= 0 && c < cols) tiles[rr][c] = 0;
      }
      c += (toCol > fromCol) ? 1 : -1;
    }
    // Vertical
    while (r !== toRow) {
      for (let dc = -Math.floor(w / 2); dc <= Math.floor(w / 2); dc++) {
        const cc = c + dc;
        if (cc >= 0 && cc < cols && r >= 0 && r < rows) tiles[r][cc] = 0;
      }
      r += (toRow > fromRow) ? 1 : -1;
    }
  },

  spawnEnemies(floorNum, theme, isBoss) {
    EnemySystem.clear();

    if (isBoss) {
      const bossKey = this.getBossForTheme(theme);
      const bossPos = this.getRandomFloorPos();
      EnemySystem.spawn(bossKey, bossPos.x, bossPos.y, floorNum);
      const minionCount = Math.floor(floorNum / 10);
      for (let i = 0; i < minionCount; i++) {
        const type = Utils.randChoice(theme.enemies.filter(e => !CONFIG.ENEMY_DEFS[e].boss));
        if (type) {
          const pos = this.getRandomFloorPos();
          EnemySystem.spawn(type, pos.x, pos.y, floorNum);
        }
      }
    } else {
      const count = CONFIG.TOWER.ENEMIES_BASE + (floorNum - 1) * CONFIG.TOWER.ENEMIES_PER_FLOOR;
      const available = theme.enemies.filter(e => CONFIG.ENEMY_DEFS[e].minFloor <= floorNum);
      for (let i = 0; i < count; i++) {
        const type = available.length > 0 ? Utils.randChoice(available) : 'skeleton';
        const pos = this.getRandomFloorPos();
        EnemySystem.spawn(type, pos.x, pos.y, floorNum);
      }
    }
  },

  getBossForTheme(theme) {
    const floorNum = this.currentFloor;
    if (floorNum >= 40) return 'boss_end';
    if (floorNum >= 30) return 'boss_nether';
    if (floorNum >= 20) return 'boss_cave';
    return 'boss_stone';
  },

  // Only spawn enemies on floor tiles (not walls!)
  getRandomFloorPos() {
    if (this.room && this.room.tiles) {
      const ts = this.room.tileWidth;
      const floorTiles = [];

      // Collect all floor tiles (exclude spawn zone and door zone)
      for (let r = 0; r < this.room.rows; r++) {
        for (let c = 0; c < this.room.cols; c++) {
          if (this.room.tiles[r][c] === 0) {
            // Skip spawn zone (bottom center)
            if (r > this.room.rows - 5 && Math.abs(c - Math.floor(this.room.cols / 2)) < 4) continue;
            // Skip door zone (top center)
            if (r < 4 && Math.abs(c - Math.floor(this.room.cols / 2)) < 4) continue;
            floorTiles.push({ r, c });
          }
        }
      }

      if (floorTiles.length > 0) {
        const tile = Utils.randChoice(floorTiles);
        return {
          x: tile.c * ts + ts / 2 + Utils.rand(-ts / 4, ts / 4),
          y: tile.r * ts + ts / 2 + Utils.rand(-ts / 4, ts / 4)
        };
      }
    }

    // Fallback (shouldn't happen)
    const wt = CONFIG.WALL_THICKNESS;
    const rw = CONFIG.ROOM_WIDTH;
    const rh = CONFIG.ROOM_HEIGHT;
    return { x: Utils.rand(wt + 40, rw - wt - 40), y: Utils.rand(wt + 40, rh / 2) };
  },

  update(dt, player) {
    if (this.floorTimer > 0) {
      this.floorTimer -= dt;
      if (this.floorTimer <= 0) this.floorTimer = 0;
    }

    if (!this.cleared && EnemySystem.enemies.length === 0) {
      this.cleared = true;
      this.doorOpen = true;
      ParticleSystem.levelUpBurst(this.doorPos.x, this.doorPos.y);
      FloatingText.add(this.doorPos.x, this.doorPos.y - 20, '🚪 FREI!', '#ffdd44', 22, 1.5);
    }

    if (this.doorOpen && this.doorPos) {
      const localDist = Utils.vecDist(player, this.doorPos);
      if (localDist < 55) return 'floor_complete';
      if (Multiplayer.remotePlayers.some(rp => rp.remotePlayer && rp.remotePlayer.alive)) {
        const closestRemote = Multiplayer.remotePlayers
          .filter(rp => rp.remotePlayer && rp.remotePlayer.alive)
          .reduce((best, rp) => {
            const d = Utils.vecDist(rp.remotePlayer, this.doorPos);
            return (!best || d < best.d) ? { d, rp } : best;
          }, null);
        const remoteDist = closestRemote ? closestRemote.d : Infinity;
        if (remoteDist < 55) return 'floor_complete';
      }
    }

    this.constrainToRoom(player);
    return null;
  },

  constrainToRoom(entity, debug) {
    const wt = CONFIG.WALL_THICKNESS;
    const rw = this.room?.pixelWidth || CONFIG.ROOM_WIDTH;
    const rh = this.room?.pixelHeight || CONFIG.ROOM_HEIGHT;
    const s = entity.size;

    // Check obstacle/wall collisions via tile map
    if (this.room) {
      const tiles = this.room.tiles;
      const ts = this.room.tileWidth;
      const col = Math.floor(entity.x / ts);
      const row = Math.floor(entity.y / ts);
      let pushed = false;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= this.room.rows || c < 0 || c >= this.room.cols) continue;
          const tileVal = tiles[r]?.[c];
          if (tileVal !== 1 && tileVal !== 2) continue;

          const tileX = c * ts;
          const tileY = r * ts;

          const closestX = Utils.clamp(entity.x, tileX, tileX + ts);
          const closestY = Utils.clamp(entity.y, tileY, tileY + ts);
          const dx = entity.x - closestX;
          const dy = entity.y - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < s && dist > 0.001) {
            const push = (s - dist) / dist;
            entity.x += dx * push;
            entity.y += dy * push;
            pushed = true;
          }
        }
      }
      if (debug && pushed) console.log('[DBG] pushed entity from tile', col, row);
    }

    // Room boundary
    const doorLeft = rw / 2 - CONFIG.DOOR_WIDTH / 2;
    const doorRight = rw / 2 + CONFIG.DOOR_WIDTH / 2;

    // Left/Right/Bottom walls always solid
    entity.x = Utils.clamp(entity.x, wt + s, rw - wt - s);
    entity.y = Utils.clamp(entity.y, wt + s, rh - wt - s);

    // Top wall: only block if not at door
    if (entity.y - s < wt) {
      if (!this.doorOpen || entity.x < doorLeft || entity.x > doorRight) {
        entity.y = wt + s;
      }
    }
  },

  constrainEnemy(enemy) {
    this.constrainToRoom(enemy);
  },

  getTimeLeft() {
    if (this.floorTimer <= 0) return '∞';
    return Math.ceil(this.floorTimer);
  },

  // ── Enhanced Rendering State ──
  _tileCache: null,
  _tileCacheKey: null,
  _torchPositions: null,

  render(ctx, camera) {
    if (!this.room) return;
    const zoom = camera.zoom || 1;
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
    const tiles = this.room.tiles;
    const ts = this.room.tileWidth;
    const theme = this.room.theme;

    // ── 1) Render Tiles with procedural textures (cached) ──
    const cacheKey = `${this.room.cols}x${this.room.rows}_${ts}_${theme.floorColor}_${theme.wallColor}_f${this.currentFloor}`;
    if (this._tileCacheKey !== cacheKey) {
      this._tileCache = this._renderTileTexture(tiles, theme, ts);
      this._tileCacheKey = cacheKey;
      this._torchPositions = this._generateTorchPositions(tiles, ts);
    }

    const sx = (0 - camera.x) * zoom + w / 2;
    const sy = (0 - camera.y) * zoom + h / 2;
    const totalW = this.room.cols * ts * zoom;
    const totalH = this.room.rows * ts * zoom;

    ctx.drawImage(this._tileCache, sx, sy, totalW, totalH);

    // ── 2) Ambient Occlusion (wall shadows on floor) ──
    this._renderAO(ctx, camera, tiles, ts, zoom);

    // ── 3) Torch glow + flames ──
    this._renderTorches(ctx, camera, zoom);

    // ── 4) Atmospheric vignette ──
    this._renderVignette(ctx);

    // ── 5) Door ──
    if (this.doorPos) this._renderDoor(ctx, camera, zoom);
  },

  _renderTileTexture(tiles, theme, ts) {
    const canvas = document.createElement('canvas');
    const cols = this.room.cols, rows = this.room.rows;
    canvas.width = cols * ts; canvas.height = rows * ts;
    const c = canvas.getContext('2d');
    let rng = cols * 31 + rows * 17;
    function rand() { rng = (rng * 1664525 + 1013904223) & 0xFFFFFFFF; return (rng >>> 0) / 4294967296; }

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * ts, y = r * ts;
        const tile = tiles[r][col];
        const v = rand() * 0.06 - 0.03;

        if (tile === 0) {
          // ── FLOOR: biome-specific flooring ──
          this._drawFloorTile(c, x, y, ts, theme, v, rand);
          // Decorative elements on floor
          this._drawFloorDecor(c, x, y, ts, theme, rand);
        } else if (tile === 1) {
          // ── WALL: biome-specific wall ──
          this._drawWallTile(c, x, y, ts, theme, v, rand);
          // Wall decorations
          this._drawWallDecor(c, x, y, ts, theme, rand);
        } else if (tile === 2) {
          // ── OBSTACLE: boulder with gradient + cracks ──
          c.fillStyle = this._adjustColor(theme.wallColor, v);
          c.fillRect(x, y, ts, ts);
          const cx = x + ts / 2, cy = y + ts / 2, rad = ts * 0.38;
          c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath();
          c.ellipse(cx, cy + rad * 0.3, rad * 1.1, rad * 0.5, 0, 0, Math.PI * 2); c.fill();
          const gr = c.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 0, cx, cy, rad);
          gr.addColorStop(0, this._adjustColor(theme.wallColor, 0.08));
          gr.addColorStop(0.7, this._adjustColor(theme.wallColor, -0.02));
          gr.addColorStop(1, this._adjustColor(theme.wallColor, -0.08));
          c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
          for (let k = 0; k < 2; k++) {
            c.beginPath(); c.moveTo(cx + rand() * rad * 0.5 - rad * 0.25, cy + rand() * rad * 0.5 - rad * 0.25);
            c.lineTo(cx + rand() * rad - rad * 0.5, cy + rand() * rad - rad * 0.5); c.stroke();
          }
          c.fillStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.arc(cx - rad * 0.2, cy - rad * 0.2, rad * 0.3, 0, Math.PI * 2); c.fill();
        }
      }
    }
    return canvas;
  },

  _drawFloorTile(c, x, y, ts, theme, v, rand) {
    const ft = theme.floorType || 'stone_tile';
    // Base fill
    c.fillStyle = this._adjustColor(theme.floorColor, v);
    c.fillRect(x, y, ts, ts);

    if (ft === 'stone_tile') {
      c.strokeStyle = 'rgba(0,0,0,0.1)'; c.lineWidth = 1;
      // Grid
      c.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      // Subtle tile lines
      c.beginPath(); c.moveTo(x + ts * 0.33, y); c.lineTo(x + ts * 0.33, y + ts); c.stroke();
      c.beginPath(); c.moveTo(x + ts * 0.66, y); c.lineTo(x + ts * 0.66, y + ts); c.stroke();
      c.beginPath(); c.moveTo(x, y + ts * 0.33); c.lineTo(x + ts, y + ts * 0.33); c.stroke();
      c.beginPath(); c.moveTo(x, y + ts * 0.66); c.lineTo(x + ts, y + ts * 0.66); c.stroke();
      // Cracks
      if (rand() < 0.4) {
        c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
        const cx2 = x + rand() * ts, cy2 = y + rand() * ts;
        c.beginPath(); c.moveTo(cx2, cy2); c.lineTo(cx2 + (rand()-0.5)*ts*0.4, cy2 + (rand()-0.5)*ts*0.4); c.stroke();
      }
    } else if (ft === 'stone_slab') {
      // Uneven slabs
      const slabH = ts * 0.45;
      c.fillStyle = this._adjustColor(theme.floorColor, v + 0.03);
      c.fillRect(x + 1, y + 1, ts - 2, slabH);
      c.fillStyle = this._adjustColor(theme.floorColor, v - 0.03);
      c.fillRect(x + 1, y + slabH, ts - 2, ts - slabH - 1);
      c.strokeStyle = 'rgba(0,0,0,0.1)'; c.lineWidth = 1;
      c.strokeRect(x + 1, y + slabH - 0.5, ts - 2, 2);
    } else if (ft === 'earth') {
      // Earthy ground with small stones
      c.fillStyle = this._adjustColor(theme.floorColor, v);
      c.fillRect(x, y, ts, ts);
      // Small pebbles
      if (rand() < 0.6) {
        c.fillStyle = this._adjustColor(theme.wallColor, v * 0.5);
        const px = x + rand() * (ts - 4), py = y + rand() * (ts - 4);
        c.beginPath(); c.arc(px + 2, py + 2, 1.5 + rand() * 2, 0, Math.PI * 2); c.fill();
      }
      // Grass tuft
      if (rand() < 0.08) {
        c.strokeStyle = 'rgba(60,140,50,0.25)'; c.lineWidth = 1.5;
        const gx = x + 3 + rand() * (ts - 6);
        for (let gi = 0; gi < 3; gi++) {
          c.beginPath(); c.moveTo(gx + gi * 2, y + ts - 2); c.lineTo(gx + gi * 2 + (rand()-0.5)*3, y + ts - 6 - rand()*4); c.stroke();
        }
      }
    } else if (ft === 'netherrack') {
      // Rough, fiery ground
      c.fillStyle = this._adjustColor(theme.floorColor, v);
      c.fillRect(x, y, ts, ts);
      // Rough texture
      for (let i = 0; i < 5; i++) {
        c.fillStyle = this._adjustColor(theme.wallColor, v + (rand() - 0.5) * 0.1);
        c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, 2 + rand() * 3, 0, Math.PI * 2); c.fill();
      }
      // Small glow cracks
      if (rand() < 0.15) {
        c.fillStyle = 'rgba(255,100,30,0.4)'; c.strokeStyle = 'rgba(255,60,20,0.5)'; c.lineWidth = 1;
        const lx = x + rand() * (ts - 4), ly = y + rand() * (ts - 4);
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + (rand()-0.5)*6, ly + (rand()-0.5)*6); c.stroke();
        c.beginPath(); c.arc(lx, ly, 2, 0, Math.PI * 2); c.fill();
      }
    } else if (ft === 'endstone') {
      // Endstone tiles with subtle cracks
      c.fillStyle = this._adjustColor(theme.floorColor, v);
      c.fillRect(x, y, ts, ts);
      c.strokeStyle = 'rgba(0,0,0,0.07)'; c.lineWidth = 1;
      // Uneven tiles
      const tw = ts * 0.5, th = ts * 0.5;
      c.strokeRect(x + 1, y + 1, tw, th); c.strokeRect(x + tw - 1, y + 1, ts - tw, th);
      c.strokeRect(x + 1, y + th - 1, tw, th); c.strokeRect(x + tw - 1, y + th - 1, ts - tw, ts - th);
      // Glow dots
      if (rand() < 0.12) {
        c.fillStyle = 'rgba(160,120, 255, 0.35)';
        c.beginPath(); c.arc(x + 3 + rand() * (ts - 6), y + 3 + rand() * (ts - 6), 1.5, 0, Math.PI * 2); c.fill();
      }
    }

    // Generic floor edge shadow
    c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 1;
    if (rand() < 0.2) {
      c.fillStyle = 'rgba(0,0,0,0.05)';
      const s2 = Math.floor(rand() * 4);
      if (s2 === 0) c.fillRect(x, y, ts, 2);
      else if (s2 === 1) c.fillRect(x, y + ts - 2, ts, 2);
      else if (s2 === 2) c.fillRect(x, y, 2, ts);
      else c.fillRect(x + ts - 2, y, 2, ts);
    }
  },

  _drawFloorDecor(c, x, y, ts, theme, rand) {
    if (!theme.decor) return;
    const d = theme.decor;

    // Pillars (large floor decorations)
    if (d.pillars && rand() < d.pillars) {
      const px = x + ts * 0.3, py = y + ts * 0.2, pw = ts * 0.4, ph = ts * 0.6;
      c.fillStyle = this._adjustColor(theme.wallColor, 0.05);
      c.fillRect(px, py, pw, ph);
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      // Base
      c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(px - 2, py + ph - 2, pw + 4, 4);
      // Top
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(px - 1, py - 1, pw + 2, 3);
    }

    // Chains (hanging from ceiling shadows on floor)
    if (d.chains && rand() < d.chains) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      const lw = 3;
      for (let ci = 0; ci < 3; ci++) {
        const lx = x + 4 + ci * 5;
        c.beginPath(); c.arc(lx, y + 4 + ci * 3, 2, 0, Math.PI * 2); c.fill();
      }
    }

    // Crystals (cave/end crystals)
    if (d.crystals && rand() < d.crystals) {
      const cx3 = x + ts * 0.5, cy3 = y + ts * 0.6;
      c.fillStyle = 'rgba(120,220,255,0.45)';
      c.beginPath(); c.moveTo(cx3, cy3 - ts * 0.25);
      c.lineTo(cx3 + ts * 0.12, cy3 + ts * 0.1);
      c.lineTo(cx3 - ts * 0.08, cy3 + ts * 0.15);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(180,255,255,0.3)';
      c.beginPath(); c.moveTo(cx3 - 2, cy3 - ts * 0.2);
      c.lineTo(cx3 + 3, cy3 + ts * 0.05);
      c.lineTo(cx3 - 4, cy3 + ts * 0.12);
      c.closePath(); c.fill();
    }

    // Lava (nether only)
    if (d.lava && rand() < d.lava) {
      c.fillStyle = 'rgba(255,60,10,0.5)';
      c.beginPath(); c.ellipse(x + ts * 0.5, y + ts * 0.45, ts * 0.35, ts * 0.15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,180,40,0.6)'; c.beginPath();
      c.ellipse(x + ts * 0.5 - 2, y + ts * 0.42, ts * 0.2, ts * 0.08, 0, 0, Math.PI * 2); c.fill();
    }

    // Moss (green patches)
    if (d.moss && rand() < d.moss) {
      c.fillStyle = 'rgba(40,100,40,0.15)';
      c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, rand() * ts * 0.4 + 4, 0, Math.PI * 2); c.fill();
    }

    // Bones (scatter)
    if (d.bones && rand() < d.bones) {
      c.strokeStyle = 'rgba(200,190,160,0.3)'; c.lineWidth = 1.5;
      const bx2 = x + 2 + rand() * (ts - 4), by2 = y + 2 + rand() * (ts - 4);
      c.beginPath(); c.moveTo(bx2, by2); c.lineTo(bx2 + 4 + rand() * 3, by2 + (rand()-0.5)*2); c.stroke();
      // Joint
      c.fillStyle = 'rgba(200,190,160,0.25)'; c.beginPath(); c.arc(bx2, by2, 1.5, 0, Math.PI * 2); c.fill();
    }

    // Skulls (nether)
    if (d.skulls && rand() < d.skulls) {
      const sx = x + ts * 0.5, sy = y + ts * 0.45;
      c.fillStyle = 'rgba(200,200,160,0.35)';
      c.beginPath(); c.arc(sx, sy, ts * 0.12, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.arc(sx - 1, sy - 1, 1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(sx + 1, sy - 1, 1, 0, Math.PI * 2); c.fill();
    }

    // Runes (glowing symbols)
    if (d.runes && rand() < d.runes) {
      c.fillStyle = 'rgba(160,120,255,0.35)';
      const rx2 = x + 3 + rand() * (ts - 6), ry2 = y + 3 + rand() * (ts - 6);
      c.font = '8px Outfit'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String.fromCharCode(0x16A0 + Math.floor(rand() * 30)), rx2, ry2);
    }

    // Glow (ambient glow patches)
    if (d.glow && rand() < d.glow) {
      const gx2 = x + rand() * ts, gy2 = y + rand() * ts;
      c.beginPath(); c.arc(gx2, gy2, 4 + rand() * 4, 0, Math.PI * 2);
      c.fillStyle = 'rgba(180,160,255,0.12)'; c.fill();
    }

    // Banners (fortress only)
    if (d.banners && rand() < d.banners) {
      const bx3 = x + ts * 0.5, by3 = y + 1;
      c.fillStyle = 'rgba(180,60,30,0.3)';
      c.fillRect(bx3 - 3, by3, 6, ts * 0.4);
      c.fillStyle = 'rgba(200,200,160,0.2)';
      c.fillRect(bx3 - 1, by3 - 2, 2, 3);
    }

    // Veins (cave ore veins)
    if (d.veins && rand() < d.veins) {
      c.strokeStyle = 'rgba(200,180,140,0.2)'; c.lineWidth = 1.5;
      const vx = x + rand() * ts, vy = y + rand() * ts;
      c.beginPath(); c.moveTo(vx, vy);
      c.lineTo(vx + (rand()-0.5)*ts*0.5, vy + (rand()-0.5)*ts*0.5); c.stroke();
    }

    // Spikes
    if (d.spikes && rand() < d.spikes) {
      const sx2 = x + ts * 0.5, sy2 = y + ts * 0.8;
      c.fillStyle = 'rgba(160,160,170,0.3)';
      c.beginPath(); c.moveTo(sx2, sy2); c.lineTo(sx2 - 3, sy2 - ts * 0.3); c.lineTo(sx2 + 3, sy2 - ts * 0.35); c.closePath(); c.fill();
    }

    // Stalactites / mushrooms
    if (d.stalactites && rand() < d.stalactites) {
      c.fillStyle = 'rgba(140,140,140,0.25)';
      const stx = x + rand() * ts, sty = y;
      c.beginPath(); c.moveTo(stx, sty); c.lineTo(stx - 2, sty + 5); c.lineTo(stx + 3, sty + 4); c.closePath(); c.fill();
    }
    if (d.mushrooms && rand() < d.mushrooms) {
      c.fillStyle = 'rgba(180,60,60,0.35)';
      const mx = x + rand() * ts, my = y + ts - 2;
      c.beginPath(); c.arc(mx, my - 3, 3, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(120,80,50,0.3)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(mx, my - 3); c.lineTo(mx, my); c.stroke();
    }

    // Metal grating (fortress)
    if (d.metal_grating && rand() < d.metal_grating) {
      c.fillStyle = 'rgba(60,60,60,0.25)';
      for (let gi = 0; gi < 3; gi++) {
        c.fillRect(x + gi * (ts/3), y, 1, ts);
        c.fillRect(x, y + gi * (ts/3), ts, 1);
      }
    }

    // Flames
    if (d.flames && rand() < d.flames) {
      c.fillStyle = 'rgba(255,80,20,0.4)';
      const fx2 = x + ts * 0.5, fy2 = y + ts * 0.5;
      c.beginPath(); c.moveTo(fx2, fy2 + 3); c.lineTo(fx2 - 2, fy2 - 4); c.lineTo(fx2 + 2, fy2 - 2); c.closePath(); c.fill();
    }

    // Void tendrils (end)
    if (d.void_tendrils && rand() < d.void_tendrils) {
      c.strokeStyle = 'rgba(100,60,200,0.15)'; c.lineWidth = 1.5;
      const tx2 = x + ts * 0.5, ty2 = y + ts * 0.5;
      c.beginPath(); c.moveTo(tx2, ty2);
      c.quadraticCurveTo(tx2 + (rand()-0.5)*ts, ty2 + (rand()-0.5)*ts, tx2 + (rand()-0.5)*ts*0.7, ty2 + (rand()-0.5)*ts*0.7); c.stroke();
    }

    // Particles (end floating)
    if (d.particles && rand() < d.particles) {
      c.fillStyle = 'rgba(180,160,255,0.2)';
      c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, 1 + rand(), 0, Math.PI * 2); c.fill();
    }
  },

  _drawWallTile(c, x, y, ts, theme, v, rand) {
    const wt = theme.wallType || 'stone_brick';
    // Base wall fill
    c.fillStyle = this._adjustColor(theme.wallColor, v);
    c.fillRect(x, y, ts, ts);

    if (wt === 'stone_brick') {
      this._drawBrickPattern(c, x, y, ts, theme, v, rand, 4, 2);
    } else if (wt === 'rough_stone') {
      // Uneven rough stone blocks
      c.fillStyle = this._adjustColor(theme.wallColor, v + (rand() - 0.5) * 0.06);
      c.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      // Cracks and rough patches
      c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const crx = x + rand() * ts, cry = y + rand() * ts;
        c.beginPath(); c.moveTo(crx, cry); c.lineTo(crx + (rand()-0.5)*6, cry + (rand()-0.5)*6); c.stroke();
      }
      // Moss patches on walls
      if (rand() < 0.1) {
        c.fillStyle = 'rgba(40,100,40,0.12)';
        c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, rand() * ts * 0.3 + 3, 0, Math.PI * 2); c.fill();
      }
    } else if (wt === 'fortress_brick') {
      this._drawBrickPattern(c, x, y, ts, theme, v, rand, 3, 2.5);
      // Metal reinforcements
      if (rand() < 0.25) {
        c.fillStyle = 'rgba(80,70,60,0.25)';
        c.fillRect(x, y + ts * 0.4, ts, ts * 0.2);
      }
      // Rust spots
      if (rand() < 0.15) {
        c.fillStyle = 'rgba(160,80,30,0.15)';
        c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, 3 + rand() * 2, 0, Math.PI * 2); c.fill();
      }
    } else if (wt === 'obsidian') {
      // Smooth dark obsidian with subtle facets
      c.fillStyle = this._adjustColor(theme.wallColor, v);
      c.fillRect(x, y, ts, ts);
      // Facet lines
      c.strokeStyle = 'rgba(255,255,255,0.03)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + ts, y + ts); c.stroke();
      c.beginPath(); c.moveTo(x + ts, y); c.lineTo(x, y + ts); c.stroke();
      // Tiny lava glow dots
      if (rand() < 0.08) {
        c.fillStyle = 'rgba(255,60,20,0.4)';
        c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, 1.5, 0, Math.PI * 2); c.fill();
      }
    } else if (wt === 'endframe') {
      // Obsidian frame with endstone center
      c.fillStyle = this._adjustColor(theme.wallColor, v);
      c.fillRect(x, y, ts, ts);
      // Center block
      const pad = ts * 0.12;
      c.fillStyle = this._adjustColor(theme.floorColor, v + 0.05);
      c.fillRect(x + pad, y + pad, ts - pad * 2, ts - pad * 2);
      c.strokeStyle = 'rgba(180,160,255,0.15)'; c.lineWidth = 1;
      c.strokeRect(x + pad + 0.5, y + pad + 0.5, ts - pad * 2 - 1, ts - pad * 2 - 1);
      // Glowing rune lines
      if (rand() < 0.3) {
        c.strokeStyle = 'rgba(160,120,255,0.2)'; c.lineWidth = 1;
        const cx = x + ts * 0.5, cy = y + ts * 0.5;
        c.beginPath(); c.moveTo(cx - 3, cy); c.lineTo(cx + 3, cy); c.stroke();
        c.beginPath(); c.moveTo(cx, cy - 3); c.lineTo(cx, cy + 3); c.stroke();
      }
    }

    // Generic wall depth
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, y, ts, 2);
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x, y, ts, ts * 0.12);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x, y + ts * 0.88, ts, ts * 0.12);
  },

  _drawBrickPattern(c, x, y, ts, theme, v, rand, rows, cols) {
    const bH = ts / rows, bW = ts / cols;
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
    for (let br = 0; br < rows; br++) {
      const off = br % 2 === 0 ? 0 : bW / 2;
      for (let bc = -1; bc < Math.ceil(cols) + 1; bc++) {
        const bx = x + bc * bW + off, by2 = y + br * bH;
        c.strokeRect(bx + 0.5, by2 + 0.5, bW - 1, bH - 1);
        c.fillStyle = this._adjustColor(theme.wallColor, rand() * 0.04 - 0.02);
        c.fillRect(bx + 1, by2 + 1, bW - 2, bH - 2);
      }
    }
  },

  _drawWallDecor(c, x, y, ts, theme, rand) {
    if (!theme.decor) return;
    const d = theme.decor;

    // Pillars (wall-mounted half-pillars)
    if (d.pillars && rand() < d.pillars * 0.6) {
      c.fillStyle = this._adjustColor(theme.wallColor, 0.03);
      c.fillRect(x + ts * 0.75, y + 2, ts * 0.2, ts - 4);
      c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 1;
      c.strokeRect(x + ts * 0.75 + 0.5, y + 2.5, ts * 0.2 - 1, ts - 5);
    }

    // Chains hanging from wall
    if (d.chains && rand() < d.chains * 0.5) {
      c.fillStyle = 'rgba(100,100,100,0.2)';
      const cw = 2;
      for (let ci = 0; ci < 4; ci++) {
        const ly = y + 3 + ci * (ts / 5);
        c.fillRect(x + ts * 0.3, ly, cw, ts / 5 - 1);
      }
    }

    // Crystals on walls
    if (d.crystals && rand() < d.crystals * 0.4) {
      const crx = x + ts * 0.8, cry = y + ts * 0.5;
      c.fillStyle = 'rgba(140,220,255,0.4)';
      c.beginPath(); c.moveTo(crx, cry); c.lineTo(crx + 5, cry - 4); c.lineTo(crx + 3, cry + 3); c.closePath(); c.fill();
    }

    // Skulls mounted on wall
    if (d.skulls && rand() < d.skulls * 0.5) {
      const skx = x + ts * 0.5, sky = y + ts * 0.35;
      c.fillStyle = 'rgba(200,200,170,0.35)';
      c.beginPath(); c.arc(skx, sky, ts * 0.12, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath(); c.arc(skx - 1, sky - 1, 1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(skx + 1, sky - 1, 1, 0, Math.PI * 2); c.fill();
    }

    // Banners (hanging from wall top)
    if (d.banners && rand() < d.banners * 0.8) {
      c.fillStyle = 'rgba(180,60,30,0.35)';
      c.fillRect(x + ts * 0.3, y + 2, ts * 0.4, ts * 0.5);
      c.fillStyle = 'rgba(200,200,160,0.25)';
      c.fillRect(x + ts * 0.3, y, ts * 0.4, 3);
    }
  },

  _generateTorchPositions(tiles, ts) {
    const torches = [], cols = this.room.cols, rows = this.room.rows;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (tiles[r][c] !== 0) continue;
        const adj = (tiles[r-1]?.[c] >= 1) || (tiles[r+1]?.[c] >= 1) || (tiles[r]?.[c-1] >= 1) || (tiles[r]?.[c+1] >= 1);
        if (adj && Math.random() < 0.05) {
          const tx = c * ts + ts / 2, ty = r * ts + ts / 2;
          if (!torches.some(t => Math.abs(t.x - tx) < ts * 5 && Math.abs(t.y - ty) < ts * 5)) {
            torches.push({ x: tx, y: ty, phase: Math.random() * Math.PI * 2 });
          }
        }
      }
    }
    if (torches.length < 2) {
      torches.push({ x: cols * ts * 0.25, y: rows * ts * 0.3, phase: 0 });
      torches.push({ x: cols * ts * 0.75, y: rows * ts * 0.3, phase: 1.5 });
    }
    return torches;
  },

  _renderTorches(ctx, camera, zoom) {
    if (!this._torchPositions) return;
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height), now = Date.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const torch of this._torchPositions) {
      const sx = (torch.x - camera.x) * zoom + w / 2;
      const sy = (torch.y - camera.y) * zoom + h / 2;
      if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) continue;
      const fl = 0.85 + Math.sin(now * 6 + torch.phase) * 0.08 + Math.sin(now * 11 + torch.phase * 2) * 0.07;
      const rad = 120 * zoom * fl;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      gr.addColorStop(0, `rgba(255,180,60,${0.12 * fl})`);
      gr.addColorStop(0.3, `rgba(255,140,40,${0.06 * fl})`);
      gr.addColorStop(0.7, `rgba(255,100,20,${0.02 * fl})`);
      gr.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = gr; ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
      // Flame
      const fH = 10 * zoom * fl, fW = 5 * zoom;
      ctx.fillStyle = `rgba(255,200,80,${0.8 * fl})`;
      ctx.beginPath(); ctx.moveTo(sx - fW, sy); ctx.lineTo(sx, sy - fH); ctx.lineTo(sx + fW, sy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,240,180,${0.6 * fl})`;
      ctx.beginPath(); ctx.moveTo(sx - fW * 0.5, sy); ctx.lineTo(sx, sy - fH * 0.6); ctx.lineTo(sx + fW * 0.5, sy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(sx - 3 * zoom, sy, 6 * zoom, 8 * zoom);
    }
    ctx.restore();
  },

  _renderAO(ctx, camera, tiles, ts, zoom) {
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
    const cols2 = this.room.cols, rows2 = this.room.rows, ao = 8 * zoom;
    for (let r = 0; r < rows2; r++) {
      for (let c = 0; c < cols2; c++) {
        if (tiles[r][c] !== 0) continue;
        const sx = (c * ts - camera.x) * zoom + w / 2;
        const sy2 = (r * ts - camera.y) * zoom + h / 2;
        const tS = ts * zoom;
        if (sx + tS < -20 || sx > w + 20 || sy2 + tS < -20 || sy2 > h + 20) continue;
        if (r > 0 && tiles[r-1][c] >= 1) {
          const g = ctx.createLinearGradient(sx, sy2, sx, sy2 + ao * 3);
          g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(sx, sy2, tS, ao * 3);
        }
        if (c > 0 && tiles[r][c-1] >= 1) {
          const g = ctx.createLinearGradient(sx, sy2, sx + ao * 2, sy2);
          g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(sx, sy2, ao * 2, tS);
        }
        if (r > 0 && c > 0 && tiles[r-1][c] >= 1 && tiles[r][c-1] >= 1) {
          const g = ctx.createRadialGradient(sx, sy2, 0, sx, sy2, ao * 3);
          g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(sx - ao, sy2 - ao, ao * 4, ao * 4);
        }
      }
    }
  },

  _renderVignette(ctx) {
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
    const cx = w / 2, cy = h / 2;
    const radius = Math.max(w, h) * 0.6;
    const g = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  },

  _renderDoor(ctx, camera, zoom) {
    const w = (ctx.canvas._cssWidth || ctx.canvas.width), h = (ctx.canvas._cssHeight || ctx.canvas.height);
    const dx = (this.doorPos.x - camera.x) * zoom + w / 2;
    const dy = (this.doorPos.y - camera.y) * zoom + h / 2;
    if (this.doorOpen) {
      const p = 0.6 + Math.sin(Date.now() / 300) * 0.3;
      ctx.save();
      const gR = 80 * zoom * p;
      const gg = ctx.createRadialGradient(dx, dy, 0, dx, dy, gR);
      gg.addColorStop(0, `rgba(255,221,68,${0.2 * p})`); gg.addColorStop(0.5, `rgba(255,180,40,${0.08 * p})`);
      gg.addColorStop(1, 'rgba(255,150,30,0)');
      ctx.fillStyle = gg; ctx.fillRect(dx - gR, dy - gR, gR * 2, gR * 2);
      ctx.shadowColor = '#ffdd44'; ctx.shadowBlur = 15 * zoom;
      ctx.fillStyle = `rgba(255,221,68,${p})`;
      const dW = CONFIG.DOOR_WIDTH * zoom, dH = CONFIG.WALL_THICKNESS * zoom;
      ctx.beginPath();
      ctx.moveTo(dx - dW / 2, dy + dH); ctx.lineTo(dx - dW / 2, dy - dH * 0.5);
      ctx.arcTo(dx - dW / 2, dy - dH, dx, dy - dH, dW * 0.3);
      ctx.arcTo(dx + dW / 2, dy - dH, dx + dW / 2, dy - dH * 0.5, dW * 0.3);
      ctx.lineTo(dx + dW / 2, dy + dH); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(255,221,68,${0.5 + Math.sin(Date.now() / 200) * 0.3})`;
      ctx.font = `${18 * zoom}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⬆️', dx, dy + 28 * zoom);
    } else {
      const dW2 = CONFIG.DOOR_WIDTH * zoom, dH2 = CONFIG.WALL_THICKNESS * zoom;
      ctx.fillStyle = this.room?.theme?.wallColor || '#555';
      ctx.fillRect(dx - dW2 / 2, dy - dH2 / 2, dW2, dH2);
      ctx.fillStyle = '#444'; ctx.fillRect(dx - dW2 / 2, dy - 3 * zoom, dW2, 6 * zoom);
      ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(dx, dy, 6 * zoom, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(dx - 2 * zoom, dy, 4 * zoom, 5 * zoom);
    }
  },

  _adjustColor(hex, amt) {
    if (!hex || hex[0] !== '#') return hex || '#888';
    let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    r = Math.max(0, Math.min(255, r + Math.round(amt * 255)));
    g = Math.max(0, Math.min(255, g + Math.round(amt * 255)));
    b = Math.max(0, Math.min(255, b + Math.round(amt * 255)));
    return `rgb(${r},${g},${b})`;
  },

  clear() {
    this.room = null;
    this.currentFloor = 0;
    this.cleared = false;
    this.doorOpen = false;
    this._tileCache = null;
    this._tileCacheKey = null;
    this._torchPositions = null;
  }
};