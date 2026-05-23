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
      if (Multiplayer.remotePlayer && Multiplayer.remotePlayer.alive) {
        const remoteDist = Utils.vecDist(Multiplayer.remotePlayer, this.doorPos);
        if (remoteDist < 55) return 'floor_complete';
      }
    }

    this.constrainToRoom(player);
    return null;
  },

  constrainToRoom(entity) {
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

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= this.room.rows || c < 0 || c >= this.room.cols) continue;
          if (tiles[r][c] !== 1 && tiles[r][c] !== 2) continue;

          const tileX = c * ts;
          const tileY = r * ts;

          const closestX = Utils.clamp(entity.x, tileX, tileX + ts);
          const closestY = Utils.clamp(entity.y, tileY, tileY + ts);
          const dx = entity.x - closestX;
          const dy = entity.y - closestY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < s && dist > 0) {
            const push = (s - dist) / dist;
            entity.x += dx * push;
            entity.y += dy * push;
          }
        }
      }
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
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const tiles = this.room.tiles;
    const ts = this.room.tileWidth;
    const theme = this.room.theme;

    // ── 1) Render Tiles with procedural textures (cached) ──
    const cacheKey = `${this.room.cols}x${this.room.rows}_${ts}_${theme.floorColor}_${theme.wallColor}`;
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
    canvas.width = cols * ts;
    canvas.height = rows * ts;
    const c = canvas.getContext('2d');
    let rng = cols * 31 + rows * 17;
    function rand() { rng = (rng * 1664525 + 1013904223) & 0xFFFFFFFF; return (rng >>> 0) / 4294967296; }

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * ts, y = r * ts;
        const tile = tiles[r][col];
        const v = rand() * 0.06 - 0.03;

        if (tile === 0) {
          // ── Floor: stone tiles with cracks + moss ──
          c.fillStyle = this._adjustColor(theme.floorColor, v);
          c.fillRect(x, y, ts, ts);
          for (let k = 0, n = Math.floor(rand() * 3); k < n; k++) {
            c.fillStyle = this._adjustColor(theme.floorColor, v - 0.04);
            c.fillRect(x + rand() * ts, y + rand() * ts, rand() * ts * 0.6 + 2, rand() * 2 + 1);
          }
          if (rand() < 0.1) {
            c.fillStyle = 'rgba(60,120,50,0.12)';
            c.beginPath(); c.arc(x + rand() * ts, y + rand() * ts, rand() * ts * 0.4 + 4, 0, Math.PI * 2); c.fill();
          }
          c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 1;
          c.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
          if (rand() < 0.3) {
            c.fillStyle = 'rgba(0,0,0,0.06)';
            const s2 = Math.floor(rand() * 4);
            if (s2 === 0) c.fillRect(x, y, ts, 3);
            else if (s2 === 1) c.fillRect(x, y + ts - 3, ts, 3);
            else if (s2 === 2) c.fillRect(x, y, 3, ts);
            else c.fillRect(x + ts - 3, y, 3, ts);
          }
        } else if (tile === 1) {
          // ── Wall: brick pattern + 3D depth ──
          c.fillStyle = this._adjustColor(theme.wallColor, v);
          c.fillRect(x, y, ts, ts);
          const bH = ts / 4, bW = ts / 2;
          c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
          for (let br = 0; br < 4; br++) {
            const off = br % 2 === 0 ? 0 : bW / 2;
            for (let bc = -1; bc < 3; bc++) {
              const bx = x + bc * bW + off, by2 = y + br * bH;
              c.strokeRect(bx + 0.5, by2 + 0.5, bW - 1, bH - 1);
              c.fillStyle = this._adjustColor(theme.wallColor, rand() * 0.05 - 0.025);
              c.fillRect(bx + 1, by2 + 1, bW - 2, bH - 2);
            }
          }
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, ts, 2);
          c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y, ts, ts * 0.15);
          c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(x, y + ts * 0.85, ts, ts * 0.15);
        } else if (tile === 2) {
          // ── Obstacle: boulder with gradient + cracks ──
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
          c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
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
    const w = ctx.canvas.width, h = ctx.canvas.height, now = Date.now() / 1000;
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
    const w = ctx.canvas.width, h = ctx.canvas.height;
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
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cx = w / 2, cy = h / 2;
    const radius = Math.max(w, h) * 0.6;
    const g = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  },

  _renderDoor(ctx, camera, zoom) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
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