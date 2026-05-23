// ============================================================
// REWARDS.JS — Reward selection after each floor
// ============================================================
const Rewards = {
  currentChoices: [],
  pickedCount: 0,
  maxPicks: 2,
  rerollsLeft: 1,
  floorNum: 0,

  generate(floorNum, flawless) {
    this.floorNum = floorNum;
    this.pickedCount = 0;
    this.maxPicks = flawless ? 3 : 2;
    this.rerollsLeft = 1;
    this.currentChoices = this._generatePool(floorNum);
    return this.currentChoices;
  },

  _generatePool(floorNum) {
    const choices = [];
    const isShop = floorNum > 1 && floorNum % 5 === 0;

    if (isShop) {
      return this._generateShopPool(floorNum);
    }

    // Slot 1: ALWAYS a weapon
    choices.push(this.createReward('weapon', floorNum));

    // Slots 2-6: weapons + stats + relics
    const pool = [
      { type: 'weapon', weight: 25 },
      { type: 'stat', weight: 55 },
      { type: 'relic', weight: 20 }
    ];

    const totalSlots = this.maxPicks >= 3 ? 8 : 6; // more choices on flawless
    for (let i = 1; i < totalSlots; i++) {
      const pick = Utils.weightedRandom(pool, p => p.weight);
      const reward = this.createReward(pick.type, floorNum);
      // Avoid duplicate weapons in same pool
      if (reward.type === 'weapon' && choices.some(c => c.type === 'weapon' && c.weaponKey === reward.weaponKey)) {
        choices.push(this.createReward('stat', floorNum));
      } else {
        choices.push(reward);
      }
    }

    return choices;
  },

  _generateShopPool(floorNum) {
    const choices = [];
    const totalSlots = this.maxPicks >= 3 ? 6 : 4; // more choices on flawless shop
    const pool = [
      { type: 'weapon', weight: 30 },
      { type: 'stat', weight: 45 },
      { type: 'relic', weight: 25 }
    ];
    for (let i = 0; i < totalSlots; i++) {
      const pick = Utils.weightedRandom(pool, p => p.weight);
      const reward = this.createReward(pick.type, floorNum);
      if (reward.type === 'weapon' && choices.some(c => c.type === 'weapon' && c.weaponKey === reward.weaponKey)) {
        choices.push(this.createReward('stat', floorNum));
      } else {
        choices.push(reward);
      }
    }
    return choices;
  },

  reroll() {
    if (this.rerollsLeft <= 0) return false;
    this.rerollsLeft--;
    this.currentChoices = this._generatePool(this.floorNum);
    return true;
  },

  createReward(type, floorNum) {
    if (type === 'weapon') {
      // Filter by tier availability — higher tiers unlock on later floors
      const maxTier = Math.floor(floorNum / 8) + 1; // tier 0 from start, tier 1@8, tier 2@16, tier 3@24
      const availableWeapons = Object.entries(CONFIG.WEAPON_DEFS)
        .filter(([_, def]) => def.tier <= maxTier);

      const choices = availableWeapons.length > 0 ? availableWeapons : Object.entries(CONFIG.WEAPON_DEFS);
      const [key, def] = Utils.randChoice(choices);

      // Determine the tier of the offered weapon
      // If player already has this weapon, show what level it would become
      const existingWeapon = Game.player?.weapons?.find(w => w.defKey === key);
      const offerTier = existingWeapon ? existingWeapon.tier + 1 : 0;

      return {
        type: 'weapon',
        name: existingWeapon ? `${def.name} Lv.${offerTier + 1}` : def.name,
        icon: def.icon,
        weaponKey: key,
        isUpgrade: !!existingWeapon,
        offerTier,
      };
    } else if (type === 'relic') {
      const relicKeys = Object.keys(CONFIG.RELIC_DEFS || {});
      if (relicKeys.length === 0) return this.createReward('stat', floorNum);
      // Don't offer relics the player already has
      const owned = new Set((Game.player?.relics || []).map(r => r.key));
      const available = relicKeys.filter(k => !owned.has(k));
      if (available.length === 0) return this.createReward('stat', floorNum);
      const key = Utils.randChoice(available);
      const def = CONFIG.RELIC_DEFS[key];
      return {
        type: 'relic',
        name: def.name,
        icon: def.icon,
        relicKey: key,
        desc: def.desc,
      };
    } else {
      const stat = Utils.randChoice(CONFIG.STAT_UPGRADES);
      const scaleFactor = 1 + Math.floor(floorNum / 15) * 0.1;
      return {
        type: 'stat',
        name: stat.name,
        icon: stat.icon,
        stat: stat.stat,
        value: Math.round(stat.value * scaleFactor),
        percent: stat.percent || false,
      };
    }
  },

  apply(reward, player, mode) {
    if (reward.type === 'weapon') {
      if (mode === 'new' || !mode) {
        const weapon = WeaponSystem.create(reward.weaponKey);
        const result = WeaponSystem.addWeapon(player, weapon);
        if (result === 'needs_replace') {
          // Slots full — show replacement dialog
          UI.showWeaponReplaceDialog(weapon);
          return 'needs_replace';
        }
        FloatingText.add(player.x, player.y - 30, `🎯 ${weapon.def.name}!`, '#44dd66', 18, 1.5);
      } else if (mode === 'upgrade') {
        // Level up existing weapon
        const existingIdx = player.weapons.findIndex(w => w.defKey === reward.weaponKey);
        if (existingIdx >= 0) {
          const w = player.weapons[existingIdx];
          w.tier = (w.tier || 0) + 1;
          w.def.baseDamage = CONFIG.WEAPON_DEFS[reward.weaponKey].baseDamage * (1 + w.tier * 0.5);
          w.def.attackSpeed = CONFIG.WEAPON_DEFS[reward.weaponKey].attackSpeed * (1 + w.tier * 0.08);
          w.def.range = CONFIG.WEAPON_DEFS[reward.weaponKey].range * (1 + w.tier * 0.1);
          FloatingText.add(player.x, player.y - 30, `⬆️ ${w.def.name} Lv.${w.tier + 1}!`, '#ffdd44', 18, 1.5);
          player.buildTimeline.push({
            floor: Dungeon.currentFloor,
            type: 'upgrade',
            name: w.def.name,
            icon: w.def.icon,
            tier: w.tier
          });
        } else {
          // Fallback: no existing weapon, just add new
          const w = WeaponSystem.create(reward.weaponKey);
          const added = WeaponSystem.addWeapon(player, w);
          if (added === 'needs_replace') {
            UI.showWeaponReplaceDialog(w);
            return 'needs_replace';
          }
        }
      }
    } else if (reward.type === 'relic') {
      Game.player.addRelic(reward.relicKey);
      FloatingText.add(player.x, player.y - 30, `✨ ${reward.name}!`, '#bb55ee', 18, 1.5);
    } else if (reward.type === 'stat') {
      if (reward.stat === 'maxHp') {
        player.maxHpBonus = (player.maxHpBonus || 0) + reward.value;
        player.hp = player.getMaxHp();
        ParticleSystem.heal(player.x, player.y);
      } else {
        player.stats[reward.stat] = (player.stats[reward.stat] || 0) + reward.value;
      }
    }
  }
};