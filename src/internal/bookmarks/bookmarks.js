/* browser://bookmarks — two-pane bookmark manager for Aether. */
(function () {
  'use strict';

  var AI = window.AetherInternal || {};
  var api = AI.api || window.browserAPI;
  var esc = AI.escapeHtml || function (s) { return String(s == null ? '' : s); };

  // ---- DOM refs ----
  var folderTreeEl = document.getElementById('folderTree');
  var bmListEl = document.getElementById('bmList');
  var folderTitleEl = document.getElementById('folderTitle');
  var folderCountEl = document.getElementById('folderCount');
  var searchEl = document.getElementById('search');
  var addBookmarkBtn = document.getElementById('addBookmarkBtn');
  var addFolderBtn = document.getElementById('addFolderBtn');
  var showBarToggle = document.getElementById('showBarToggle');
  var editorHost = document.getElementById('editorHost');
  var toastEl = document.getElementById('toast');

  // ---- State ----
  var currentFolderId = 'bar';
  var folders = [];      // [{id,name,parentId,order}]
  var bookmarks = [];    // bookmarks of currentFolderId
  var filterText = '';
  var toastTimer = null;

  var GLOBE = '🌐'; // 🌐

  if (!api) {
    bmListEl.innerHTML = '<div class="empty-state">Bookmarks are unavailable.</div>';
    return;
  }

  // ---- Helpers ----
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function normalizeUrl(raw) {
    var v = String(raw || '').trim();
    if (!v) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) && !/^(mailto:|browser:|about:)/.test(v)) {
      // bare host / path -> assume https
      v = 'https://' + v;
    }
    return v;
  }

  function prettyUrl(u) {
    try {
      var p = new URL(u);
      var s = p.hostname + (p.pathname === '/' ? '' : p.pathname) + p.search;
      return s || u;
    } catch (e) {
      return u;
    }
  }

  function folderName(id) {
    if (id === 'bar') return 'Bookmarks bar';
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === id) return folders[i].name;
    }
    return 'Folder';
  }

  function sortFolders(list) {
    // 'bar' always first, then by order, then by name.
    return list.slice().sort(function (a, b) {
      if (a.id === 'bar') return -1;
      if (b.id === 'bar') return 1;
      var ao = a.order == null ? 0 : a.order;
      var bo = b.order == null ? 0 : b.order;
      if (ao !== bo) return ao - bo;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  // ---- Rendering: sidebar ----
  function renderFolders() {
    var ordered = sortFolders(folders);
    // Guarantee a 'bar' entry exists even if API omitted it.
    var hasBar = ordered.some(function (f) { return f.id === 'bar'; });
    if (!hasBar) ordered.unshift({ id: 'bar', name: 'Bookmarks bar', parentId: null, order: -1 });

    folderTreeEl.innerHTML = '';
    ordered.forEach(function (f) {
      var li = document.createElement('li');
      li.className = 'folder-item' + (f.id === currentFolderId ? ' active' : '');
      li.setAttribute('role', 'treeitem');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-selected', f.id === currentFolderId ? 'true' : 'false');
      li.dataset.id = f.id;

      var ico = document.createElement('span');
      ico.className = 'fico';
      ico.textContent = f.id === 'bar' ? '⭐' : '📁'; // ⭐ / 📁
      li.appendChild(ico);

      var name = document.createElement('span');
      name.className = 'fname';
      name.textContent = f.id === 'bar' ? 'Bookmarks bar' : (f.name || 'Folder');
      li.appendChild(name);

      if (f.id !== 'bar') {
        var del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.title = 'Delete folder';
        del.setAttribute('aria-label', 'Delete folder ' + (f.name || ''));
        del.textContent = '🗑'; // 🗑
        del.dataset.del = f.id;
        li.appendChild(del);
      }

      folderTreeEl.appendChild(li);
    });
  }

  // ---- Rendering: main pane ----
  function visibleBookmarks() {
    if (!filterText) return bookmarks;
    var q = filterText.toLowerCase();
    return bookmarks.filter(function (b) {
      return (String(b.title || '').toLowerCase().indexOf(q) !== -1) ||
        (String(b.url || '').toLowerCase().indexOf(q) !== -1);
    });
  }

  function renderBookmarks() {
    folderTitleEl.textContent = folderName(currentFolderId);
    var list = visibleBookmarks();

    folderCountEl.textContent = list.length
      ? (list.length + (list.length === 1 ? ' bookmark' : ' bookmarks'))
      : '';

    bmListEl.innerHTML = '';

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      if (filterText) {
        empty.innerHTML = 'No bookmarks match “' + esc(filterText) + '”.';
      } else {
        empty.innerHTML = 'No bookmarks in this folder yet.<br>Use “Add bookmark” to save a page.';
      }
      bmListEl.appendChild(empty);
      return;
    }

    list.forEach(function (b) {
      bmListEl.appendChild(buildRow(b));
    });
  }

  function buildRow(b) {
    var row = document.createElement('div');
    row.className = 'bm-row';
    row.dataset.id = b.id;

    // favicon
    var favWrap = document.createElement('div');
    favWrap.className = 'fav-wrap';
    if (b.favicon) {
      var img = document.createElement('img');
      img.src = b.favicon;
      img.alt = '';
      img.addEventListener('error', function () {
        favWrap.innerHTML = '<span class="glob">' + GLOBE + '</span>';
      });
      favWrap.appendChild(img);
    } else {
      favWrap.innerHTML = '<span class="glob">' + GLOBE + '</span>';
    }
    row.appendChild(favWrap);

    // text
    var textWrap = document.createElement('div');
    textWrap.className = 'bm-text';

    var titleEl = document.createElement('span');
    titleEl.className = 'bm-title';
    titleEl.textContent = b.title || prettyUrl(b.url) || b.url || '(untitled)';
    titleEl.title = (b.title || '') + (b.url ? ('\n' + b.url) : '');
    titleEl.setAttribute('role', 'link');
    titleEl.setAttribute('tabindex', '0');
    titleEl.dataset.openCurrent = b.url || '';
    textWrap.appendChild(titleEl);

    var urlEl = document.createElement('span');
    urlEl.className = 'bm-url';
    urlEl.textContent = prettyUrl(b.url || '');
    textWrap.appendChild(urlEl);

    row.appendChild(textWrap);

    var spacer = document.createElement('div');
    spacer.className = 'spacer';
    row.appendChild(spacer);

    // actions
    var actions = document.createElement('div');
    actions.className = 'bm-actions';

    actions.appendChild(makeIconBtn('↗', 'Open in new tab', function () { // ↗
      if (b.url) window.open(b.url);
    }));
    actions.appendChild(makeIconBtn('✎', 'Edit', function () { // ✎
      openEditor('edit', b);
    }));
    var delBtn = makeIconBtn('🗑', 'Delete', function () { // 🗑
      removeBookmark(b);
    });
    actions.appendChild(delBtn);

    row.appendChild(actions);
    return row;
  }

  function makeIconBtn(glyph, label, onClick) {
    var btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // ---- Editor (add / edit bookmark inline dialog) ----
  function closeEditor() {
    editorHost.innerHTML = '';
  }

  function openEditor(mode, bookmark) {
    closeEditor();

    var box = document.createElement('div');
    box.className = 'editor';

    var heading = mode === 'edit' ? 'Edit bookmark' : 'Add bookmark';
    box.innerHTML =
      '<h3>' + heading + '</h3>' +
      '<div class="field">' +
        '<label for="bmName">Name</label>' +
        '<input type="text" id="bmName" placeholder="Bookmark name" autocomplete="off" />' +
      '</div>' +
      '<div class="field">' +
        '<label for="bmUrl">URL</label>' +
        '<input type="text" id="bmUrl" placeholder="https://example.com" autocomplete="off" />' +
      '</div>' +
      '<div class="err-msg" id="bmErr"></div>' +
      '<div class="editor-actions">' +
        '<button class="btn" id="bmCancel" type="button">Cancel</button>' +
        '<button class="btn btn-primary" id="bmSave" type="button">' + (mode === 'edit' ? 'Save' : 'Add') + '</button>' +
      '</div>';

    editorHost.appendChild(box);

    var nameInput = box.querySelector('#bmName');
    var urlInput = box.querySelector('#bmUrl');
    var errEl = box.querySelector('#bmErr');
    var saveBtn = box.querySelector('#bmSave');
    var cancelBtn = box.querySelector('#bmCancel');

    if (mode === 'edit' && bookmark) {
      nameInput.value = bookmark.title || '';
      urlInput.value = bookmark.url || '';
    }

    function setErr(m) { errEl.textContent = m || ''; }

    function submit() {
      var title = nameInput.value.trim();
      var url = normalizeUrl(urlInput.value);
      if (!url) { setErr('Please enter a URL.'); urlInput.focus(); return; }
      try {
        // basic validity check
        // eslint-disable-next-line no-new
        new URL(url);
      } catch (e) {
        setErr('That doesn’t look like a valid URL.');
        urlInput.focus();
        return;
      }
      if (!title) title = prettyUrl(url);

      saveBtn.disabled = true;
      var p;
      if (mode === 'edit' && bookmark) {
        p = api.bookmarks.update(bookmark.id, { title: title, url: url })
          .then(function () { showToast('Bookmark updated'); });
      } else {
        p = api.bookmarks.add({ url: url, title: title, folderId: currentFolderId })
          .then(function () { showToast('Bookmark added'); });
      }
      p.then(function () {
        closeEditor();
        // Live refresh event will reload; reload defensively in case it doesn't fire.
        reload();
      }).catch(function (err) {
        saveBtn.disabled = false;
        setErr((err && err.message) ? err.message : 'Could not save bookmark.');
      });
    }

    saveBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', closeEditor);

    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
    }
    nameInput.addEventListener('keydown', onKey);
    urlInput.addEventListener('keydown', onKey);

    nameInput.focus();
    nameInput.select();
  }

  function removeBookmark(b) {
    var label = b.title || prettyUrl(b.url) || 'this bookmark';
    if (!window.confirm('Delete “' + label + '”?')) return;
    api.bookmarks.remove(b.id).then(function () {
      showToast('Bookmark deleted');
      reload();
    }).catch(function () {
      showToast('Could not delete bookmark');
    });
  }

  // ---- Folder operations ----
  function addFolder() {
    var name = window.prompt('New folder name:', '');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    api.bookmarks.folderAdd(name).then(function (res) {
      showToast('Folder created');
      if (res && res.folder && res.folder.id) currentFolderId = res.folder.id;
      reload();
    }).catch(function () {
      showToast('Could not create folder');
    });
  }

  function removeFolder(id) {
    if (id === 'bar') return;
    if (!window.confirm('Delete this folder and its bookmarks?')) return;
    api.bookmarks.folderRemove(id).then(function () {
      showToast('Folder deleted');
      if (currentFolderId === id) currentFolderId = 'bar';
      reload();
    }).catch(function () {
      showToast('Could not delete folder');
    });
  }

  function selectFolder(id) {
    if (id === currentFolderId) return;
    currentFolderId = id;
    closeEditor();
    renderFolders();
    loadBookmarks();
  }

  // ---- Data loading ----
  function loadFolders() {
    return api.bookmarks.list().then(function (res) {
      folders = (res && res.folders) ? res.folders : [];
      // If current folder no longer exists, fall back to 'bar'.
      var exists = currentFolderId === 'bar' || folders.some(function (f) { return f.id === currentFolderId; });
      if (!exists) currentFolderId = 'bar';
      renderFolders();
    });
  }

  function loadBookmarks() {
    return api.bookmarks.list(currentFolderId).then(function (res) {
      bookmarks = (res && res.bookmarks) ? res.bookmarks.slice() : [];
      bookmarks.sort(function (a, b) {
        var ao = a.order == null ? 0 : a.order;
        var bo = b.order == null ? 0 : b.order;
        if (ao !== bo) return ao - bo;
        return 0;
      });
      renderBookmarks();
    }).catch(function () {
      bookmarks = [];
      renderBookmarks();
    });
  }

  function reload() {
    return loadFolders().then(loadBookmarks);
  }

  function loadSettings() {
    return api.settings.getAll().then(function (res) {
      var s = (res && res.settings) || {};
      showBarToggle.checked = !!s.showBookmarksBar;
    }).catch(function () { /* ignore */ });
  }

  // ---- Event wiring ----
  addBookmarkBtn.addEventListener('click', function () { openEditor('add'); });
  addFolderBtn.addEventListener('click', addFolder);

  searchEl.addEventListener('input', function () {
    filterText = searchEl.value.trim();
    renderBookmarks();
  });
  searchEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      searchEl.value = '';
      filterText = '';
      renderBookmarks();
    }
  });

  // Folder tree (delegated)
  folderTreeEl.addEventListener('click', function (e) {
    var delEl = e.target.closest('[data-del]');
    if (delEl) {
      e.stopPropagation();
      removeFolder(delEl.dataset.del);
      return;
    }
    var item = e.target.closest('.folder-item');
    if (item && item.dataset.id) selectFolder(item.dataset.id);
  });
  folderTreeEl.addEventListener('keydown', function (e) {
    var item = e.target.closest('.folder-item');
    if (!item) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (item.dataset.id) selectFolder(item.dataset.id);
    } else if (e.key === 'Delete' && item.dataset.id !== 'bar') {
      e.preventDefault();
      removeFolder(item.dataset.id);
    }
  });

  // Bookmark list (delegated for title click / keyboard)
  bmListEl.addEventListener('click', function (e) {
    var titleEl = e.target.closest('.bm-title');
    if (titleEl && titleEl.dataset.openCurrent) {
      window.location.href = titleEl.dataset.openCurrent;
    }
  });
  bmListEl.addEventListener('keydown', function (e) {
    var titleEl = e.target.closest('.bm-title');
    if (titleEl && (e.key === 'Enter' || e.key === ' ') && titleEl.dataset.openCurrent) {
      e.preventDefault();
      window.location.href = titleEl.dataset.openCurrent;
    }
  });

  // Show bookmarks bar toggle
  showBarToggle.addEventListener('change', function () {
    var val = showBarToggle.checked;
    api.settings.set({ showBookmarksBar: val }).then(function () {
      showToast(val ? 'Bookmarks bar shown' : 'Bookmarks bar hidden');
    }).catch(function () {
      // revert on failure
      showBarToggle.checked = !val;
      showToast('Could not update setting');
    });
  });

  // ---- Live refresh subscriptions ----
  if (api.on) {
    api.on('bookmarks:changed', function () { reload(); });
    api.on('settings:changed', function () { loadSettings(); });
  }

  // ---- Boot ----
  loadSettings();
  reload();
}());
