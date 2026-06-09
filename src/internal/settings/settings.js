(function () {
  const { api, escapeHtml } = window.AetherInternal;

  // Inline gear mask for the title mark.
  document.documentElement.style.setProperty(
    '--gear-mask',
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='black' d='M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94 0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z'/></svg>\")"
  );

  // ---- helpers -------------------------------------------------------------
  let toastTimer = null;
  const toastEl = document.getElementById('toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  let settings = {};
  let applying = false; // guard against re-entrancy when external changes arrive

  async function save(patch) {
    try {
      const res = await api.settings.set(patch);
      if (res && res.settings) settings = res.settings;
    } catch (e) {
      toast('Could not save setting');
    }
  }

  // ---- element refs --------------------------------------------------------
  const el = {
    searchEngine: document.getElementById('searchEngine'),
    customRow: document.getElementById('customRow'),
    searchTemplate: document.getElementById('searchTemplate'),
    templateError: document.getElementById('templateError'),
    searchSuggestions: document.getElementById('searchSuggestions'),

    startupRadios: Array.from(document.querySelectorAll('input[name="startupMode"]')),
    urlsRow: document.getElementById('urlsRow'),
    startupUrls: document.getElementById('startupUrls'),
    newStartupUrl: document.getElementById('newStartupUrl'),
    addStartupUrl: document.getElementById('addStartupUrl'),
    restoreSession: document.getElementById('restoreSession'),

    theme: document.getElementById('theme'),
    showBookmarksBar: document.getElementById('showBookmarksBar'),
    showHomeButton: document.getElementById('showHomeButton'),
    homeUrl: document.getElementById('homeUrl'),

    downloadDir: document.getElementById('downloadDir'),
    changeDir: document.getElementById('changeDir'),
    promptForDownloadLocation: document.getElementById('promptForDownloadLocation'),

    openClear: document.getElementById('openClear'),
    blockPopups: document.getElementById('blockPopups'),
    sendDoNotTrack: document.getElementById('sendDoNotTrack'),

    aboutVersion: document.getElementById('aboutVersion'),
    aboutGrid: document.getElementById('aboutGrid'),
    resetSettings: document.getElementById('resetSettings'),
  };

  // ---- render from settings ------------------------------------------------
  function favFor(url) {
    try { return 'https://www.google.com/s2/favicons?sz=32&domain=' + new URL(url).hostname; }
    catch { return ''; }
  }

  function renderStartupUrls() {
    const urls = Array.isArray(settings.startupUrls) ? settings.startupUrls : [];
    el.startupUrls.innerHTML = '';
    if (!urls.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.fontSize = '13px';
      empty.textContent = 'No pages added yet.';
      el.startupUrls.appendChild(empty);
      return;
    }
    urls.forEach((url, idx) => {
      const row = document.createElement('div');
      row.className = 'url-row';
      const fav = favFor(url);
      row.innerHTML =
        (fav ? '<img class="fav" src="' + escapeHtml(fav) + '" alt="" />' : '<span class="fav">🌐</span>') +
        '<span class="u" title="' + escapeHtml(url) + '">' + escapeHtml(url) + '</span>' +
        '<button class="icon-btn" title="Remove" aria-label="Remove">✕</button>';
      const img = row.querySelector('img.fav');
      if (img) img.addEventListener('error', () => { img.replaceWith(globe()); });
      row.querySelector('.icon-btn').addEventListener('click', () => {
        const next = urls.slice();
        next.splice(idx, 1);
        settings.startupUrls = next;
        save({ startupUrls: next });
        renderStartupUrls();
      });
      el.startupUrls.appendChild(row);
    });
  }

  function globe() {
    const s = document.createElement('span');
    s.className = 'fav';
    s.textContent = '🌐';
    return s;
  }

  function renderAll() {
    applying = true;

    // 1) search
    el.searchEngine.value = settings.searchEngine || 'google';
    el.customRow.classList.toggle('hidden', el.searchEngine.value !== 'custom');
    el.searchTemplate.value = settings.searchEngineTemplate || '';
    el.searchSuggestions.checked = !!settings.searchSuggestions;

    // 2) startup
    const mode = settings.startupMode || 'newtab';
    el.startupRadios.forEach((r) => { r.checked = r.value === mode; });
    el.urlsRow.classList.toggle('hidden', mode !== 'urls');
    el.restoreSession.checked = !!settings.restoreSession;
    renderStartupUrls();

    // 3) appearance
    el.theme.value = settings.theme || 'system';
    el.showBookmarksBar.checked = !!settings.showBookmarksBar;
    el.showHomeButton.checked = !!settings.showHomeButton;
    el.homeUrl.classList.toggle('hidden', !settings.showHomeButton);
    el.homeUrl.value = settings.homeUrl || '';

    // 4) downloads
    el.downloadDir.textContent = settings.downloadDir || 'Default download folder';
    el.promptForDownloadLocation.checked = !!settings.promptForDownloadLocation;

    // 5) privacy
    el.blockPopups.checked = !!settings.blockPopups;
    el.sendDoNotTrack.checked = !!settings.sendDoNotTrack;

    applying = false;
  }

  // ---- wiring: search ------------------------------------------------------
  el.searchEngine.addEventListener('change', () => {
    const v = el.searchEngine.value;
    el.customRow.classList.toggle('hidden', v !== 'custom');
    settings.searchEngine = v;
    save({ searchEngine: v });
  });

  function validateTemplate() {
    const v = el.searchTemplate.value.trim();
    if (v && !v.includes('%s')) {
      el.templateError.textContent = 'Must contain %s where the query goes.';
      return false;
    }
    el.templateError.textContent = '';
    return true;
  }
  function commitTemplate() {
    const v = el.searchTemplate.value.trim();
    if (!validateTemplate() || !v) return;
    settings.searchEngineTemplate = v;
    save({ searchEngineTemplate: v });
  }
  el.searchTemplate.addEventListener('input', validateTemplate);
  el.searchTemplate.addEventListener('change', commitTemplate);
  el.searchTemplate.addEventListener('blur', commitTemplate);
  el.searchTemplate.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitTemplate(); el.searchTemplate.blur(); } });

  el.searchSuggestions.addEventListener('change', () => {
    if (applying) return;
    settings.searchSuggestions = el.searchSuggestions.checked;
    save({ searchSuggestions: el.searchSuggestions.checked });
  });

  // ---- wiring: startup -----------------------------------------------------
  el.startupRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (applying || !r.checked) return;
      el.urlsRow.classList.toggle('hidden', r.value !== 'urls');
      settings.startupMode = r.value;
      save({ startupMode: r.value });
    });
  });

  function addStartupUrl() {
    const raw = el.newStartupUrl.value.trim();
    if (!raw) return;
    let url = raw;
    if (!/^[a-z]+:\/\//i.test(url) && !/^browser:\/\//i.test(url)) url = 'https://' + url;
    const next = (Array.isArray(settings.startupUrls) ? settings.startupUrls : []).slice();
    next.push(url);
    settings.startupUrls = next;
    save({ startupUrls: next });
    el.newStartupUrl.value = '';
    renderStartupUrls();
  }
  el.addStartupUrl.addEventListener('click', addStartupUrl);
  el.newStartupUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addStartupUrl(); });

  el.restoreSession.addEventListener('change', () => {
    if (applying) return;
    settings.restoreSession = el.restoreSession.checked;
    save({ restoreSession: el.restoreSession.checked });
  });

  // ---- wiring: appearance --------------------------------------------------
  el.theme.addEventListener('change', () => {
    settings.theme = el.theme.value;
    save({ theme: el.theme.value });
  });
  el.showBookmarksBar.addEventListener('change', () => {
    if (applying) return;
    settings.showBookmarksBar = el.showBookmarksBar.checked;
    save({ showBookmarksBar: el.showBookmarksBar.checked });
  });
  el.showHomeButton.addEventListener('change', () => {
    if (applying) return;
    const on = el.showHomeButton.checked;
    el.homeUrl.classList.toggle('hidden', !on);
    settings.showHomeButton = on;
    save({ showHomeButton: on });
  });
  function commitHomeUrl() {
    const v = el.homeUrl.value.trim();
    settings.homeUrl = v;
    save({ homeUrl: v });
  }
  el.homeUrl.addEventListener('change', commitHomeUrl);
  el.homeUrl.addEventListener('blur', commitHomeUrl);
  el.homeUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitHomeUrl(); el.homeUrl.blur(); } });

  // ---- wiring: downloads ---------------------------------------------------
  el.changeDir.addEventListener('click', async () => {
    try {
      const res = await api.settings.chooseDownloadDir();
      if (res && !res.cancelled && res.dir) {
        settings.downloadDir = res.dir;
        el.downloadDir.textContent = res.dir;
        toast('Download location updated');
      }
    } catch {
      toast('Could not change location');
    }
  });
  el.promptForDownloadLocation.addEventListener('change', () => {
    if (applying) return;
    settings.promptForDownloadLocation = el.promptForDownloadLocation.checked;
    save({ promptForDownloadLocation: el.promptForDownloadLocation.checked });
  });

  // ---- wiring: privacy toggles ---------------------------------------------
  el.blockPopups.addEventListener('change', () => {
    if (applying) return;
    settings.blockPopups = el.blockPopups.checked;
    save({ blockPopups: el.blockPopups.checked });
  });
  el.sendDoNotTrack.addEventListener('change', () => {
    if (applying) return;
    settings.sendDoNotTrack = el.sendDoNotTrack.checked;
    save({ sendDoNotTrack: el.sendDoNotTrack.checked });
  });

  // ---- clear browsing data modal -------------------------------------------
  const scrim = document.getElementById('clearScrim');
  const clearRange = document.getElementById('clearRange');
  const catHistory = document.getElementById('catHistory');
  const catCookies = document.getElementById('catCookies');
  const catCache = document.getElementById('catCache');
  const catDownloads = document.getElementById('catDownloads');
  const clearConfirm = document.getElementById('clearConfirm');

  function openModal() { scrim.classList.add('open'); clearRange.focus(); }
  function closeModal() { scrim.classList.remove('open'); }

  el.openClear.addEventListener('click', openModal);
  document.getElementById('clearCancel').addEventListener('click', closeModal);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && scrim.classList.contains('open')) closeModal(); });

  clearConfirm.addEventListener('click', async () => {
    const categories = {
      history: catHistory.checked,
      cookies: catCookies.checked,
      cache: catCache.checked,
      downloads: catDownloads.checked,
    };
    if (!categories.history && !categories.cookies && !categories.cache && !categories.downloads) {
      toast('Select at least one item to clear');
      return;
    }
    clearConfirm.disabled = true;
    try {
      const res = await api.history.clear({ range: clearRange.value, categories });
      closeModal();
      const n = res && typeof res.removed === 'number' ? res.removed : null;
      toast(n != null ? ('Cleared ' + n + ' item' + (n === 1 ? '' : 's')) : 'Browsing data cleared');
    } catch {
      toast('Could not clear browsing data');
    } finally {
      clearConfirm.disabled = false;
    }
  });

  // ---- about ---------------------------------------------------------------
  async function loadAbout() {
    try {
      const info = await api.app.getInfo();
      el.aboutVersion.textContent = 'Version ' + (info.version || '—') + (info.isIncognito ? ' · Incognito' : '');
      const rows = [
        ['Version', info.version],
        ['Electron', info.electron],
        ['Chromium', info.chrome],
        ['Node.js', info.node],
        ['V8', info.v8],
        ['Platform', info.platform],
      ];
      el.aboutGrid.innerHTML = rows.map(([k, v]) =>
        '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(v || '—') + '</dd>'
      ).join('');
    } catch {
      el.aboutGrid.innerHTML = '<dt>Info</dt><dd>Unavailable</dd>';
    }
  }

  el.resetSettings.addEventListener('click', async () => {
    if (!window.confirm('Reset all settings to their defaults? This cannot be undone.')) return;
    try {
      const res = await api.settings.reset();
      if (res && res.settings) settings = res.settings;
      renderAll();
      toast('Settings reset to default');
    } catch {
      toast('Could not reset settings');
    }
  });

  // ---- left nav scrollspy --------------------------------------------------
  const navLinks = Array.from(document.querySelectorAll('#nav a'));
  const sections = navLinks
    .map((a) => document.getElementById(a.dataset.target))
    .filter(Boolean);

  navLinks.forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const sec = document.getElementById(a.dataset.target);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function setActive(id) {
    navLinks.forEach((a) => a.classList.toggle('active', a.dataset.target === id));
  }
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((en) => en.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.25, 0.5, 1] });
    sections.forEach((s) => io.observe(s));
  }
  if (sections.length) setActive(sections[0].id);

  // ---- bootstrap -----------------------------------------------------------
  async function init() {
    try {
      const res = await api.settings.getAll();
      settings = (res && res.settings) || {};
    } catch {
      settings = {};
    }
    renderAll();
    loadAbout();
  }

  // Stay in sync with external changes (e.g. theme toggled elsewhere).
  if (api && api.on) {
    api.on('settings:changed', async () => {
      try {
        const res = await api.settings.getAll();
        if (res && res.settings) {
          settings = res.settings;
          // Don't clobber a field the user is actively editing.
          const active = document.activeElement;
          if (active === el.searchTemplate || active === el.homeUrl || active === el.newStartupUrl) {
            return;
          }
          renderAll();
        }
      } catch { /* ignore */ }
    });
  }

  init();
}());
