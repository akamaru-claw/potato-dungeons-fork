// ============================================================
// ACCOUNT.JS — Account, Login & Shop for Potato Dungeons
// ============================================================
const Account = {
  username: null,
  gold: 0,
  skin: 'potato_default',
  unlockedSkins: ['potato_default'],
  unlockedTrails: [],
  trail: '',
  totalKills: 0,
  bestFloor: 0,
  loggedIn: false,

  // Cosmetic skins (pure visual, any character can wear them)
  SKINS: {
    skin_default:  { name: 'Kartoffel-Classic', icon: '🥔', effect: 'none' },
    skin_golden:   { name: 'Gold-Glanz',       icon: '✨', effect: 'glow',   glowColor: '#ffd700', price: 50 },
    skin_fire:     { name: 'Feuer-Aura',       icon: '🔥', effect: 'aura',  auraColor: '#ff4400', price: 100 },
    skin_ice:      { name: 'Eis-Kristall',      icon: '❄️', effect: 'aura',  auraColor: '#44ccff', price: 100 },
    skin_shadow:   { name: 'Schatten-Schleier',  icon: '🖤', effect: 'ghost', price: 150 },
    skin_rainbow:  { name: 'Regenbogen-Zyklus',  icon: '🌈', effect: 'rainbow', price: 200 },
    skin_neon:     { name: 'Neon-Rand',         icon: '💚', effect: 'outline', outlineColor: '#00ff88', price: 250 },
    skin_crystal:  { name: 'Kristall-Funken',    icon: '💎', effect: 'sparkle', price: 300 },
    skin_diamond:  { name: 'Diamant-Rahmen',     icon: '💠', effect: 'diamond', price: 400 },
    skin_ghost:    { name: 'Geister-Kartoffel',  icon: '👻', effect: 'ghost_transparent', price: 500 },
  },

  TRAILS: {
    trail_fire: { name: 'Feuerspur', icon: '🔥', color: '#ff4400' },
    trail_ice: { name: 'Eisspur', icon: '❄️', color: '#44ccff' },
    trail_rainbow: { name: 'Regenbogenspur', icon: '🌈', color: 'rainbow' },
    trail_particles: { name: 'Sternenstaub', icon: '⭐', color: '#ffdd44' },
  },

  selectedCharacter: 'potato_default',

  init() {
    // Try to restore session from localStorage
    const saved = localStorage.getItem('pd_account');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.username = data.username;
        this.gold = data.gold || 0;
        this.skin = data.skin || 'potato_default';
        this.unlockedSkins = data.unlockedSkins || ['potato_default'];
        this.unlockedTrails = data.unlockedTrails || [];
        this.trail = data.trail || '';
        this.totalKills = data.totalKills || 0;
        this.bestFloor = data.bestFloor || 0;
        this.loggedIn = true;
        this.selectedCharacter = data.selectedCharacter || data.skin || 'potato_default';
        // Sync with server in background
        this._syncFromServer();
      } catch(e) {
        localStorage.removeItem('pd_account');
      }
    }
  },

  _save() {
    localStorage.setItem('pd_account', JSON.stringify({
      username: this.username,
      gold: this.gold,
      skin: this.skin,
      unlockedSkins: this.unlockedSkins,
      unlockedTrails: this.unlockedTrails,
      trail: this.trail,
      totalKills: this.totalKills,
      bestFloor: this.bestFloor,
      selectedCharacter: this.selectedCharacter,
    }));
  },

  async _syncFromServer() {
    if (!this.username) return;
    try {
      const res = await fetch('auth_api.php?action=load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username })
      });
      const data = await res.json();
      if (data.ok) {
        this.gold = Math.max(this.gold, data.gold); // Keep local if higher
        this.bestFloor = Math.max(this.bestFloor, data.best_floor);
        this.totalKills = Math.max(this.totalKills, data.total_kills);
        this.skin = data.skin || this.skin;
        this.trail = data.trail ?? this.trail ?? '';
        this.selectedCharacter = data.selected_character || data.selectedCharacter || this.selectedCharacter || 'potato_default';
        this.unlockedSkins = data.unlocked_skins ? data.unlocked_skins.split(',').map(s => s.trim()) : ['potato_default'];
        this.unlockedTrails = data.unlocked_trails ? data.unlocked_trails.split(',').map(s => s.trim()).filter(s => s) : [];
        this._save();
      }
    } catch(e) { console.warn('Sync failed:', e); }
  },

  async register(username, password) {
    try {
      const res = await fetch('auth_api.php?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.ok) {
        this.username = username;
        this.gold = 0;
        this.skin = 'potato_default';
        this.unlockedSkins = ['potato_default'];
        this.unlockedTrails = [];
        this.totalKills = 0;
        this.bestFloor = 0;
        this.loggedIn = true;
        this._save();
        return { ok: true };
      }
      return data;
    } catch(e) {
      return { ok: false, error: 'Netzwerkfehler' };
    }
  },

  async login(username, password) {
    try {
      const res = await fetch('auth_api.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.ok) {
        this.username = username;
        this.gold = data.gold || 0;
        this.skin = data.skin || 'potato_default';
        this.trail = data.trail || '';
        this.selectedCharacter = data.selectedCharacter || data.selected_character || 'potato_default';
        this.unlockedSkins = data.unlocked_skins ? data.unlocked_skins.split(',').map(s => s.trim()) : ['potato_default'];
        this.unlockedTrails = data.unlocked_trails ? data.unlocked_trails.split(',').map(s => s.trim()).filter(s => s) : [];
        this.totalKills = data.total_kills || 0;
        this.bestFloor = data.best_floor || 0;
        this.loggedIn = true;
        this._save();
        return { ok: true };
      }
      return data;
    } catch(e) {
      return { ok: false, error: 'Netzwerkfehler' };
    }
  },

  logout() {
    this.username = null;
    this.gold = 0;
    this.skin = 'potato_default';
    this.unlockedSkins = ['potato_default'];
    this.unlockedTrails = [];
    this.trail = '';
    this.loggedIn = false;
    this.totalKills = 0;
    this.bestFloor = 0;
    localStorage.removeItem('pd_account');
  },

  // Called after game over — update gold and stats
  async saveProgress(player, floorReached) {
    if (!this.loggedIn) return;
    this.gold += (player.gold || 0);
    this.totalKills += (player.kills || 0);
    this.bestFloor = Math.max(this.bestFloor, floorReached);
    this._save();
    try {
      await fetch('auth_api.php?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          gold: this.gold,
          skin: this.skin,
          total_kills: this.totalKills,
          best_floor: this.bestFloor
        })
      });
    } catch(e) { console.warn('Save failed:', e); }
  },

  // Get current skin colors for rendering
  getSkinColors() {
    const def = this.SKINS[this.skin] || this.SKINS.potato_default;
    return def.colors;
  },

  // Check if skin is owned
  ownsSkin(key) {
    return this.unlockedSkins.includes(key);
  },

  ownsTrail(key) {
    return this.unlockedTrails.includes(key);
  },

  async buyItem(itemKey) {
    if (!this.loggedIn) return { ok: false, error: 'Nicht eingeloggt' };
    try {
      const res = await fetch('auth_api.php?action=buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, item: itemKey })
      });
      const data = await res.json();
      if (data.ok) {
        this.gold = data.gold;
        if (data.unlocked) {
          const newItems = data.unlocked.split(',').map(s => s.trim());
          // Figure out if it's a skin or trail
          if (this.SKINS[itemKey]) {
            this.unlockedSkins = newItems;
          } else {
            this.unlockedTrails = newItems.filter(s => s);
          }
        }
        this._save();
        return data;
      }
      return data;
    } catch(e) {
      return { ok: false, error: 'Netzwerkfehler' };
    }
  },

  async equipItem(itemKey, type) {
    if (!this.loggedIn) return { ok: false, error: 'Nicht eingeloggt' };
    // Let the server handle the ownership check
    try {
      const res = await fetch('auth_api.php?action=equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, item: itemKey, type })
      });
      const data = await res.json();
      if (data.ok) {
        // Update local state
        if (type === 'trail') this.trail = itemKey;
        else this.skin = itemKey;
        this._save();
      }
      return data;
    } catch(e) {
      return { ok: false, error: 'Netzwerkfehler' };
    }
  }
};