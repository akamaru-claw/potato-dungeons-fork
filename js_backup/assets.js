// ============================================================
// ASSETS.JS — Image loader & cache
// ============================================================
const Assets = {
  _cache: {},
  _queue: [],
  _loaded: 0,
  _total: 0,

  add(key, src) {
    this._queue.push({ key, src });
    this._total++;
  },

  loadAll(callback) {
    if (this._queue.length === 0) { callback && callback(); return; }
    for (const item of this._queue) {
      const img = new Image();
      img.onload = () => { this._loaded++; this._cache[item.key] = img; if (this._loaded >= this._total) callback && callback(); };
      img.onerror = () => { this._loaded++; if (this._loaded >= this._total) callback && callback(); };
      img.src = item.src;
    }
  },

  get(key) { return this._cache[key] || null; },
  isLoaded() { return this._loaded >= this._total; },
  getProgress() { return this._total > 0 ? this._loaded / this._total : 1; }
};

// Pre-register assets
Assets.add('potato_default', 'assets/img/potato_default.png');