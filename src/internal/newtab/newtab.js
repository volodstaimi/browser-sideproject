(function () {
  const { api, escapeHtml } = window.AetherInternal;

  const HIDDEN_KEY = 'aether.newtab.hiddenSites';
  const CUSTOM_KEY = 'aether.newtab.customShortcuts';
  const MAX_TILES = 10;

  const contentEl = document.getElementById('content');
  const formEl = document.getElementById('searchForm');
  const inputEl = document.getElementById('searchInput');

  // Dialog elements
  const backdrop = document.getElementById('dialogBackdrop');
  const nameEl = document.getElementById('shortcutName');
  const urlEl = document.getElementById('shortcutUrl');
  const errorEl = document.getElementById('dialogError');
  const cancelBtn = document.getElementById('dialogCancel');
  const saveBtn = document.getElementById('dialogSave');

  let isIncognito = false;
  let unsubHistory = null;

  /* ---------- localStorage helpers ---------- */
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function getHidden() {
    const arr = readJson(HIDDEN_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function addHidden(url) {
    const set = new Set(getHidden());
    set.add(url);
    writeJson(HIDDEN_KEY, Array.from(set));
  }

  function getCustom() {
    const arr = readJson(CUSTOM_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function setCustom(list) { writeJson(CUSTOM_KEY, list); }

  /* ---------- URL utilities ---------- */
  function hostnameOf(url) {
    try {
      const h = new URL(url).hostname;
      return h.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
  function faviconFor(url) {
    try {
      const u = new URL(url);
      return u.origin + '/favicon.ico';
    } catch {
      return '';
    }
  }
  function firstLetter(label) {
    const s = String(label || '').trim();
    return s ? s[0] : '?';
  }
  function normalizeUrl(raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^[a-z]+:/i.test(v)) {
      v = 'https://' + v;
    }
    try {
      const u = new URL(v);
      return u.href;
    } catch {
      return '';
    }
  }

  /* ---------- Search ---------- */
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = inputEl.value.trim();
    if (!value) return;
    try {
      const result = await api.nav.navigate(value);
      if (result && result.url) {
        window.location.href = result.url;
      }
    } catch {
      /* ignore navigation failures */
    }
  });

  /* ---------- Tile rendering ---------- */
  function makeTile(item) {
    const tile = document.createElement('a');
    tile.className = 'nt-tile';
    tile.href = item.url;
    tile.tabIndex = 0;
    tile.title = item.title || item.url;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'nt-tile-icon';

    const faviconUrl = item.favicon || faviconFor(item.url);
    if (faviconUrl) {
      const img = document.createElement('img');
      img.src = faviconUrl;
      img.alt = '';
      img.addEventListener('error', () => {
        iconWrap.innerHTML = '';
        const letter = document.createElement('span');
        letter.className = 'nt-tile-letter';
        letter.textContent = firstLetter(item.title || hostnameOf(item.url));
        iconWrap.appendChild(letter);
      });
      iconWrap.appendChild(img);
    } else {
      const letter = document.createElement('span');
      letter.className = 'nt-tile-letter';
      letter.textContent = firstLetter(item.title || hostnameOf(item.url));
      iconWrap.appendChild(letter);
    }

    const label = document.createElement('div');
    label.className = 'nt-tile-label';
    label.textContent = item.title || hostnameOf(item.url);

    const remove = document.createElement('button');
    remove.className = 'nt-tile-remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove ' + (item.title || hostnameOf(item.url)));
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

    tile.appendChild(iconWrap);
    tile.appendChild(label);
    tile.appendChild(remove);

    tile.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = item.url;
    });

    remove.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeTile(item);
      tile.remove();
    });

    return tile;
  }

  function removeTile(item) {
    if (item.custom) {
      const list = getCustom().filter((c) => c.url !== item.url);
      setCustom(list);
    } else {
      addHidden(item.url);
    }
  }

  function makeAddTile() {
    const tile = document.createElement('button');
    tile.className = 'nt-tile nt-tile-add';
    tile.type = 'button';
    tile.title = 'Add shortcut';
    tile.setAttribute('aria-label', 'Add shortcut');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'nt-tile-icon';
    iconWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5 V19 M5 12 H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    const label = document.createElement('div');
    label.className = 'nt-tile-label';
    label.textContent = 'Add shortcut';

    tile.appendChild(iconWrap);
    tile.appendChild(label);

    tile.addEventListener('click', openDialog);
    return tile;
  }

  async function renderTiles() {
    let topSites = [];
    try {
      const res = await api.history.topSites(MAX_TILES);
      topSites = (res && res.sites) || [];
    } catch {
      topSites = [];
    }

    const hidden = new Set(getHidden());
    const custom = getCustom();
    const seen = new Set();

    const items = [];

    // Custom shortcuts first, so the user's picks are stable.
    for (const c of custom) {
      if (!c || !c.url || seen.has(c.url)) continue;
      seen.add(c.url);
      items.push({ url: c.url, title: c.title || hostnameOf(c.url), favicon: null, custom: true });
    }

    for (const s of topSites) {
      if (!s || !s.url) continue;
      if (hidden.has(s.url) || seen.has(s.url)) continue;
      seen.add(s.url);
      items.push({
        url: s.url,
        title: s.title || hostnameOf(s.url),
        favicon: s.favicon || null,
        custom: false,
      });
    }

    const limited = items.slice(0, MAX_TILES);

    contentEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'nt-tiles';

    limited.forEach((item, i) => {
      const tile = makeTile(item);
      tile.style.animationDelay = (i * 22) + 'ms';
      grid.appendChild(tile);
    });

    // Add-shortcut tile (only when there's room for more shortcuts).
    if (limited.length < MAX_TILES) {
      const addTile = makeAddTile();
      addTile.style.animationDelay = (limited.length * 22) + 'ms';
      grid.appendChild(addTile);
    }

    contentEl.appendChild(grid);
  }

  function renderIncognito() {
    contentEl.innerHTML =
      '<div class="nt-incognito">' +
        '<div class="nt-incognito-glyph">' +
          '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path d="M4 13 L6 7 H18 L20 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M3 13 H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
            '<circle cx="7.5" cy="16" r="2.6" stroke="currentColor" stroke-width="1.8"/>' +
            '<circle cx="16.5" cy="16" r="2.6" stroke="currentColor" stroke-width="1.8"/>' +
            '<path d="M10.1 16 Q12 14.8 13.9 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
          '</svg>' +
        '</div>' +
        '<h2>You’ve gone Incognito</h2>' +
        '<p>Now you can browse privately, and other people who use this device won’t see your activity. ' +
        'Pages you view in this window won’t be saved to your browsing history, and the sites you visit ' +
        'here will be hidden from your most-visited shortcuts.</p>' +
      '</div>';
  }

  /* ---------- Add-shortcut dialog ---------- */
  function openDialog() {
    errorEl.textContent = '';
    nameEl.value = '';
    urlEl.value = '';
    backdrop.classList.add('open');
    setTimeout(() => nameEl.focus(), 0);
  }
  function closeDialog() {
    backdrop.classList.remove('open');
  }

  function saveShortcut() {
    const name = nameEl.value.trim();
    const url = normalizeUrl(urlEl.value);
    if (!url) {
      errorEl.textContent = 'Enter a valid URL.';
      urlEl.focus();
      return;
    }
    const title = name || hostnameOf(url);
    const list = getCustom();
    if (list.some((c) => c.url === url)) {
      errorEl.textContent = 'That shortcut already exists.';
      return;
    }
    list.push({ url, title });
    setCustom(list);
    // If this URL was previously hidden, un-hide it.
    const hidden = getHidden().filter((u) => u !== url);
    writeJson(HIDDEN_KEY, hidden);
    closeDialog();
    renderTiles();
  }

  saveBtn.addEventListener('click', saveShortcut);
  cancelBtn.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog();
  });
  [nameEl, urlEl].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveShortcut();
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) {
      closeDialog();
    }
  });

  /* ---------- Init ---------- */
  async function init() {
    try {
      const info = await api.app.getInfo();
      isIncognito = !!(info && info.isIncognito);
    } catch {
      isIncognito = false;
    }

    if (isIncognito) {
      renderIncognito();
    } else {
      await renderTiles();
      if (api.on) {
        unsubHistory = api.on('history:changed', () => {
          renderTiles();
        });
      }
    }

    inputEl.focus();
  }

  window.addEventListener('beforeunload', () => {
    if (typeof unsubHistory === 'function') {
      try { unsubHistory(); } catch { /* ignore */ }
    }
  });

  init();
}());
