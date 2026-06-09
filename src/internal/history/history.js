/* browser://history — full browsing history manager. */
(function () {
  'use strict';

  var AI = window.AetherInternal || {};
  var api = AI.api;
  var escapeHtml = AI.escapeHtml || function (s) { return String(s == null ? '' : s); };

  var PAGE_SIZE = 300;

  // --- DOM refs ---
  var searchWrap = document.getElementById('searchWrap');
  var searchInput = document.getElementById('searchInput');
  var clearSearch = document.getElementById('clearSearch');
  var clearDataBtn = document.getElementById('clearDataBtn');
  var bulkBar = document.getElementById('bulkBar');
  var bulkCount = document.getElementById('bulkCount');
  var bulkCancel = document.getElementById('bulkCancel');
  var bulkDelete = document.getElementById('bulkDelete');
  var listRoot = document.getElementById('listRoot');
  var statusLine = document.getElementById('statusLine');
  var loadMoreWrap = document.getElementById('loadMoreWrap');
  var loadMoreBtn = document.getElementById('loadMoreBtn');

  var modalBackdrop = document.getElementById('modalBackdrop');
  var rangeSelect = document.getElementById('rangeSelect');
  var catHistory = document.getElementById('catHistory');
  var catCookies = document.getElementById('catCookies');
  var catCache = document.getElementById('catCache');
  var catDownloads = document.getElementById('catDownloads');
  var modalCancel = document.getElementById('modalCancel');
  var modalConfirm = document.getElementById('modalConfirm');

  // --- State ---
  var entries = [];          // currently rendered entries (search results or paged list)
  var selected = {};         // id -> true
  var query = '';
  var offset = 0;            // for non-search pagination
  var total = 0;
  var loading = false;
  var entryById = {};        // id -> entry (for navigation/title lookups)

  // --- Helpers ---
  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function dayLabel(ts) {
    var today = startOfDay(Date.now());
    var day = startOfDay(ts);
    var diffDays = Math.round((today - day) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    var d = new Date(ts);
    var opts = { weekday: 'long', month: 'long', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function timeLabel(ts) {
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function faviconHtml(entry) {
    if (entry.favicon) {
      return '<img class="favicon" src="' + escapeHtml(entry.favicon) + '" alt="" data-fallback="1" />';
    }
    return '<span class="favicon-fallback">&#127760;</span>';
  }

  function selectedIds() {
    return Object.keys(selected);
  }

  function updateBulkBar() {
    var ids = selectedIds();
    if (ids.length > 0) {
      bulkBar.classList.add('active');
      bulkCount.textContent = ids.length + (ids.length === 1 ? ' item selected' : ' items selected');
      document.body.classList.add('has-selection');
    } else {
      bulkBar.classList.remove('active');
      document.body.classList.remove('has-selection');
    }
  }

  // --- Rendering ---
  function render() {
    selected = pruneSelection();
    updateBulkBar();

    if (!entries.length) {
      var msg = query
        ? 'No history matches "' + escapeHtml(query) + '".'
        : 'Pages you visit will appear here.';
      var title = query ? 'No results' : 'No browsing history';
      listRoot.innerHTML =
        '<div class="empty-state">' +
        '<div style="font-size:40px;margin-bottom:12px;">&#128340;</div>' +
        '<h2 style="margin:0 0 6px;color:var(--fg-secondary);font-weight:500;">' + title + '</h2>' +
        '<div>' + msg + '</div>' +
        '</div>';
      return;
    }

    // Group by day (entries already newest-first).
    var groups = [];
    var currentDay = null;
    var currentGroup = null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var d = startOfDay(e.lastVisit);
      if (d !== currentDay) {
        currentDay = d;
        currentGroup = { day: d, label: dayLabel(e.lastVisit), items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(e);
    }

    var html = '';
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      html += '<div class="day-group">';
      html += '<div class="day-header">' + escapeHtml(grp.label) + '</div>';
      html += '<div class="hist-list">';
      for (var j = 0; j < grp.items.length; j++) {
        html += rowHtml(grp.items[j]);
      }
      html += '</div></div>';
    }
    listRoot.innerHTML = html;
  }

  function rowHtml(e) {
    var id = String(e.id);
    var isSel = !!selected[id];
    var title = e.title && e.title.trim() ? e.title : e.url;
    var displayUrl = e.url;
    try {
      var u = new URL(e.url);
      displayUrl = u.hostname + (u.pathname === '/' ? '' : u.pathname) + u.search;
    } catch (err) { /* keep raw */ }

    var vc = (e.visitCount && e.visitCount > 1)
      ? '<span class="visit-count" title="Visited ' + e.visitCount + ' times">&times;' + e.visitCount + '</span>'
      : '';

    return '' +
      '<div class="hist-row' + (isSel ? ' selected' : '') + '" data-id="' + escapeHtml(id) + '">' +
        '<input type="checkbox" class="row-check" ' + (isSel ? 'checked' : '') +
          ' aria-label="Select ' + escapeHtml(title) + '" />' +
        '<span class="time">' + escapeHtml(timeLabel(e.lastVisit)) + '</span>' +
        faviconHtml(e) +
        '<div class="meta">' +
          '<a href="#" class="title" data-url="' + escapeHtml(e.url) + '" title="' + escapeHtml(e.url) + '">' +
            escapeHtml(title) + '</a>' +
          '<span class="url">' + escapeHtml(displayUrl) + '</span>' +
          vc +
        '</div>' +
        '<button class="remove-btn" title="Remove from history" aria-label="Remove from history">&times;</button>' +
      '</div>';
  }

  function pruneSelection() {
    var next = {};
    for (var i = 0; i < entries.length; i++) {
      var id = String(entries[i].id);
      if (selected[id]) next[id] = true;
    }
    return next;
  }

  function updateLoadMore() {
    if (!query && offset < total && entries.length > 0) {
      loadMoreWrap.style.display = '';
    } else {
      loadMoreWrap.style.display = 'none';
    }
  }

  function setStatus(text) {
    if (text) {
      statusLine.textContent = text;
      statusLine.style.display = '';
    } else {
      statusLine.style.display = 'none';
    }
  }

  // --- Data loading ---
  function indexEntries() {
    entryById = {};
    for (var i = 0; i < entries.length; i++) {
      entryById[String(entries[i].id)] = entries[i];
    }
  }

  function loadInitial() {
    if (!api) {
      setStatus('History is unavailable.');
      return;
    }
    loading = true;
    setStatus('');
    if (query) {
      api.history.search(query, PAGE_SIZE).then(function (res) {
        entries = (res && res.entries) || [];
        offset = entries.length;
        total = entries.length;
        loading = false;
        indexEntries();
        render();
        updateLoadMore();
      }).catch(function () {
        loading = false;
        setStatus('Could not search history.');
      });
    } else {
      api.history.list({ limit: PAGE_SIZE, offset: 0 }).then(function (res) {
        entries = (res && res.entries) || [];
        total = (res && typeof res.total === 'number') ? res.total : entries.length;
        offset = entries.length;
        loading = false;
        indexEntries();
        render();
        updateLoadMore();
      }).catch(function () {
        loading = false;
        setStatus('Could not load history.');
      });
    }
  }

  function loadMore() {
    if (loading || query || offset >= total) return;
    loading = true;
    loadMoreBtn.textContent = 'Loading…';
    api.history.list({ limit: PAGE_SIZE, offset: offset }).then(function (res) {
      var more = (res && res.entries) || [];
      if (res && typeof res.total === 'number') total = res.total;
      entries = entries.concat(more);
      offset += more.length;
      loading = false;
      loadMoreBtn.textContent = 'Show more';
      indexEntries();
      render();
      updateLoadMore();
    }).catch(function () {
      loading = false;
      loadMoreBtn.textContent = 'Show more';
    });
  }

  // --- Search (debounced) ---
  var searchTimer = null;
  function onSearchInput() {
    var val = searchInput.value;
    if (val && val.trim()) {
      searchWrap.classList.add('has-value');
    } else {
      searchWrap.classList.remove('has-value');
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      query = searchInput.value.trim();
      loadInitial();
    }, 200);
  }

  // --- Selection / row interactions (event delegation) ---
  listRoot.addEventListener('click', function (ev) {
    var target = ev.target;
    var row = target.closest ? target.closest('.hist-row') : null;
    if (!row) return;
    var id = row.getAttribute('data-id');

    // Remove (x) button
    if (target.classList.contains('remove-btn')) {
      ev.preventDefault();
      removeIds([id]);
      return;
    }

    // Checkbox toggle
    if (target.classList.contains('row-check')) {
      if (target.checked) selected[id] = true;
      else delete selected[id];
      row.classList.toggle('selected', !!selected[id]);
      updateBulkBar();
      return;
    }

    // Title link -> navigate current tab
    if (target.classList.contains('title')) {
      ev.preventDefault();
      var url = target.getAttribute('data-url');
      if (url) window.location.href = url;
      return;
    }
  });

  // Open in new tab on middle-click of title
  listRoot.addEventListener('auxclick', function (ev) {
    if (ev.button !== 1) return;
    var target = ev.target;
    if (target.classList && target.classList.contains('title')) {
      ev.preventDefault();
      var url = target.getAttribute('data-url');
      if (url) window.open(url);
    }
  });

  // Favicon fallback to globe glyph on load error
  listRoot.addEventListener('error', function (ev) {
    var img = ev.target;
    if (img && img.classList && img.classList.contains('favicon') && img.getAttribute('data-fallback')) {
      var span = document.createElement('span');
      span.className = 'favicon-fallback';
      span.innerHTML = '&#127760;';
      if (img.parentNode) img.parentNode.replaceChild(span, img);
    }
  }, true);

  function removeIds(ids) {
    if (!ids || !ids.length || !api) return;
    api.history.remove(ids).then(function () {
      var rm = {};
      for (var i = 0; i < ids.length; i++) { rm[String(ids[i])] = true; }
      entries = entries.filter(function (e) { return !rm[String(e.id)]; });
      for (var j = 0; j < ids.length; j++) { delete selected[String(ids[j])]; }
      // adjust pagination counters
      total = Math.max(0, total - ids.length);
      offset = Math.max(0, offset - ids.length);
      indexEntries();
      render();
      updateLoadMore();
    }).catch(function () { /* ignore */ });
  }

  // --- Bulk bar ---
  bulkDelete.addEventListener('click', function () {
    var ids = selectedIds();
    if (ids.length) removeIds(ids);
  });
  bulkCancel.addEventListener('click', function () {
    selected = {};
    updateBulkBar();
    var checks = listRoot.querySelectorAll('.row-check');
    for (var i = 0; i < checks.length; i++) { checks[i].checked = false; }
    var rows = listRoot.querySelectorAll('.hist-row.selected');
    for (var j = 0; j < rows.length; j++) { rows[j].classList.remove('selected'); }
  });

  // --- Search clear button ---
  clearSearch.addEventListener('click', function () {
    searchInput.value = '';
    searchWrap.classList.remove('has-value');
    query = '';
    loadInitial();
    searchInput.focus();
  });
  searchInput.addEventListener('input', onSearchInput);
  searchInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && searchInput.value) {
      ev.preventDefault();
      searchInput.value = '';
      searchWrap.classList.remove('has-value');
      query = '';
      loadInitial();
    }
  });

  // --- Load more ---
  loadMoreBtn.addEventListener('click', loadMore);

  // --- Modal: clear browsing data ---
  function openModal() {
    modalBackdrop.classList.add('open');
    setTimeout(function () { rangeSelect.focus(); }, 0);
    document.addEventListener('keydown', onModalKeydown);
  }
  function closeModal() {
    modalBackdrop.classList.remove('open');
    document.removeEventListener('keydown', onModalKeydown);
  }
  function onModalKeydown(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeModal();
    }
  }

  clearDataBtn.addEventListener('click', openModal);
  modalCancel.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', function (ev) {
    if (ev.target === modalBackdrop) closeModal();
  });

  modalConfirm.addEventListener('click', function () {
    if (!api) { closeModal(); return; }
    var range = rangeSelect.value;
    var categories = {
      history: catHistory.checked,
      cookies: catCookies.checked,
      cache: catCache.checked,
      downloads: catDownloads.checked
    };
    if (!categories.history && !categories.cookies && !categories.cache && !categories.downloads) {
      closeModal();
      return;
    }
    modalConfirm.disabled = true;
    modalConfirm.textContent = 'Clearing…';
    api.history.clear({ range: range, categories: categories }).then(function () {
      modalConfirm.disabled = false;
      modalConfirm.textContent = 'Clear data';
      closeModal();
      selected = {};
      // Re-fetch from scratch
      offset = 0;
      loadInitial();
    }).catch(function () {
      modalConfirm.disabled = false;
      modalConfirm.textContent = 'Clear data';
      closeModal();
    });
  });

  // --- Live refresh ---
  if (api && api.on) {
    api.on('history:changed', function () {
      // Re-fetch current view (search or paged list), keeping selection where possible.
      if (query) {
        loadInitial();
      } else {
        // Refresh from the top up to the current offset window.
        var keep = offset || PAGE_SIZE;
        api.history.list({ limit: keep, offset: 0 }).then(function (res) {
          entries = (res && res.entries) || [];
          total = (res && typeof res.total === 'number') ? res.total : entries.length;
          offset = entries.length;
          indexEntries();
          render();
          updateLoadMore();
        }).catch(function () { /* ignore */ });
      }
    });
  }

  // --- Init ---
  loadInitial();
}());
