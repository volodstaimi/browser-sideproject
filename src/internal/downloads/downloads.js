(function () {
  const { api, escapeHtml, fmtBytes, timeAgo } = window.AetherInternal;

  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const searchEl = document.getElementById('search');
  const clearAllBtn = document.getElementById('clearAll');

  // id -> { data, el }
  const rows = new Map();
  let filter = '';

  // ---- helpers ---------------------------------------------------------

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url || ''; }
  }

  function iconFor(item) {
    const name = (item.filename || '').toLowerCase();
    const mime = (item.mime || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(ext)) return '🖼️';
    if (mime.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(ext)) return '🎬';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext)) return '🎵';
    if (mime === 'application/pdf' || ext === 'pdf') return '📕';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return '📦';
    if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'].includes(ext)) return '⚙️';
    if (['doc', 'docx', 'txt', 'rtf', 'odt', 'md'].includes(ext)) return '📄';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📊';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
    if (['js', 'ts', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'sh', 'rb', 'go', 'rs'].includes(ext)) return '💻';
    return '📁';
  }

  function isProgressing(item) {
    return item.state === 'progressing';
  }
  function isFailed(item) {
    return item.state === 'cancelled' || item.state === 'interrupted';
  }

  function matchesFilter(item) {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (item.filename || '').toLowerCase().includes(f) ||
           (item.url || '').toLowerCase().includes(f);
  }

  // ---- row rendering ---------------------------------------------------

  function buildRow(item) {
    const el = document.createElement('div');
    el.className = 'dl-item';
    el.dataset.id = item.id;
    fillRow(el, item);
    return el;
  }

  function fillRow(el, item) {
    const host = hostOf(item.url);
    const progressing = isProgressing(item);
    const failed = isFailed(item);

    let metaHtml = '';
    let progressHtml = '';

    if (progressing) {
      const total = item.totalBytes || 0;
      const received = item.receivedBytes || 0;
      const pct = total > 0 ? Math.min(100, (received / total) * 100) : 0;
      const speed = item.speedBytesPerSec ? fmtBytes(item.speedBytesPerSec) + '/s' : '';
      const sizeText = total > 0
        ? fmtBytes(received) + ' of ' + fmtBytes(total)
        : fmtBytes(received);

      const indet = total > 0 ? '' : ' indeterminate';
      const pausedCls = item.paused ? ' paused' : '';
      progressHtml =
        '<div class="dl-progress-wrap">' +
          '<div class="dl-bar' + indet + pausedCls + '"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '</div>';

      const parts = [];
      if (item.paused) {
        parts.push('<span class="dl-status-failed">Paused</span>');
      } else if (speed) {
        parts.push('<span class="dl-speed">' + escapeHtml(speed) + '</span>');
      }
      parts.push('<span class="dl-size">' + escapeHtml(sizeText) + '</span>');
      metaHtml = parts.join('<span class="dot">&middot;</span>');
    } else if (failed) {
      const label = item.state === 'cancelled' ? 'Cancelled' : 'Failed';
      metaHtml = '<span class="dl-status-failed">' + label + '</span>';
      if (item.receivedBytes) {
        metaHtml += '<span class="dot">&middot;</span><span>' + escapeHtml(fmtBytes(item.receivedBytes)) + '</span>';
      }
    } else {
      // completed
      const size = item.totalBytes || item.receivedBytes || 0;
      const when = item.endTime || item.startTime;
      metaHtml = '<span class="dl-status-done">Done</span>';
      if (size) metaHtml += '<span class="dot">&middot;</span><span>' + escapeHtml(fmtBytes(size)) + '</span>';
      if (when) metaHtml += '<span class="dot">&middot;</span><span>' + escapeHtml(timeAgo(when)) + '</span>';
    }

    const nameCls = progressing ? 'dl-name disabled' : 'dl-name';
    const nameTag = progressing
      ? '<span class="' + nameCls + '" title="' + escapeHtml(item.filename) + '">' + escapeHtml(item.filename) + '</span>'
      : '<span class="' + nameCls + '" data-act="open" role="link" tabindex="0" title="' + escapeHtml(item.filename) + '">' + escapeHtml(item.filename) + '</span>';

    let actionsHtml = '';
    if (progressing) {
      const pr = item.paused
        ? '<button class="dl-act" data-act="resume">Resume</button>'
        : '<button class="dl-act" data-act="pause">Pause</button>';
      actionsHtml =
        pr +
        '<button class="dl-act secondary" data-act="cancel">Cancel</button>';
    } else if (failed) {
      actionsHtml =
        '<button class="dl-act" data-act="retry">Retry</button>' +
        '<button class="dl-iconbtn" data-act="remove" title="Remove from list" aria-label="Remove from list">&times;</button>';
    } else {
      actionsHtml =
        '<button class="dl-act" data-act="open">Open</button>' +
        '<button class="dl-act secondary" data-act="show">Show in folder</button>' +
        '<button class="dl-iconbtn" data-act="remove" title="Remove from list" aria-label="Remove from list">&times;</button>';
    }

    el.innerHTML =
      '<div class="dl-icon" aria-hidden="true">' + iconFor(item) + '</div>' +
      '<div class="dl-body">' +
        '<div>' + nameTag + '</div>' +
        '<div class="dl-host" data-act="source" title="' + escapeHtml(item.url || '') + '">' + escapeHtml(host) + '</div>' +
        progressHtml +
        '<div class="dl-meta">' + metaHtml + '</div>' +
      '</div>' +
      '<div class="dl-actions">' + actionsHtml + '</div>';
  }

  // Lightweight in-place progress update (no innerHTML rebuild).
  function updateProgress(rec) {
    const item = rec.data;
    if (!isProgressing(item)) { fillRow(rec.el, item); return; }
    const el = rec.el;
    const total = item.totalBytes || 0;
    const received = item.receivedBytes || 0;
    const bar = el.querySelector('.dl-bar');
    const fill = el.querySelector('.dl-bar .fill');
    const meta = el.querySelector('.dl-meta');

    if (bar && fill) {
      if (total > 0) {
        bar.classList.remove('indeterminate');
        fill.style.width = Math.min(100, (received / total) * 100).toFixed(1) + '%';
      } else {
        bar.classList.add('indeterminate');
      }
      bar.classList.toggle('paused', !!item.paused);
    }

    if (meta) {
      const sizeText = total > 0 ? fmtBytes(received) + ' of ' + fmtBytes(total) : fmtBytes(received);
      const speed = item.speedBytesPerSec ? fmtBytes(item.speedBytesPerSec) + '/s' : '';
      const parts = [];
      if (item.paused) parts.push('<span class="dl-status-failed">Paused</span>');
      else if (speed) parts.push('<span class="dl-speed">' + escapeHtml(speed) + '</span>');
      parts.push('<span class="dl-size">' + escapeHtml(sizeText) + '</span>');
      meta.innerHTML = parts.join('<span class="dot">&middot;</span>');
    }

    // Pause/Resume label may need to flip if paused state changed.
    const pauseBtn = el.querySelector('[data-act="pause"]');
    const resumeBtn = el.querySelector('[data-act="resume"]');
    if (item.paused && pauseBtn) { pauseBtn.dataset.act = 'resume'; pauseBtn.textContent = 'Resume'; }
    else if (!item.paused && resumeBtn) { resumeBtn.dataset.act = 'pause'; resumeBtn.textContent = 'Pause'; }
  }

  // ---- list orchestration ---------------------------------------------

  function applyVisibility() {
    let visible = 0;
    rows.forEach((rec) => {
      const show = matchesFilter(rec.data);
      rec.el.hidden = !show;
      if (show) visible += 1;
    });
    emptyEl.hidden = visible > 0;
  }

  function render(downloads) {
    rows.clear();
    listEl.textContent = '';
    // Newest-first.
    const sorted = downloads.slice().sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    const frag = document.createDocumentFragment();
    sorted.forEach((item) => {
      const el = buildRow(item);
      rows.set(item.id, { data: item, el });
      frag.appendChild(el);
    });
    listEl.appendChild(frag);
    applyVisibility();
  }

  function upsertPrepend(item) {
    const existing = rows.get(item.id);
    if (existing) {
      existing.data = item;
      fillRow(existing.el, item);
      existing.el.hidden = !matchesFilter(item);
    } else {
      const el = buildRow(item);
      rows.set(item.id, { data: item, el });
      listEl.insertBefore(el, listEl.firstChild);
      el.hidden = !matchesFilter(item);
    }
    emptyEl.hidden = true;
  }

  function finalizeRow(item) {
    const rec = rows.get(item.id);
    if (rec) {
      rec.data = item;
      fillRow(rec.el, item);
      rec.el.hidden = !matchesFilter(item);
    } else {
      upsertPrepend(item);
    }
  }

  function removeRow(id, deleteFile) {
    const rec = rows.get(id);
    if (!rec) return;
    rec.el.classList.add('removing');
    rows.delete(id);
    api.downloads.remove(id, !!deleteFile);
    setTimeout(() => {
      if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      applyVisibility();
    }, 180);
  }

  async function load() {
    try {
      const { downloads } = await api.downloads.list();
      render(downloads || []);
    } catch {
      render([]);
    }
  }

  // ---- event wiring ----------------------------------------------------

  function rowIdFromEvent(target) {
    const item = target.closest('.dl-item');
    return item ? item.dataset.id : null;
  }

  function handleAct(act, id) {
    const rec = rows.get(id);
    if (!rec && act !== 'remove') return;
    const item = rec ? rec.data : null;
    switch (act) {
      case 'open':
        api.downloads.openFile(id);
        break;
      case 'show':
        api.downloads.showInFolder(id);
        break;
      case 'source':
        if (item && item.url) api.shellOpenExternal(item.url);
        break;
      case 'pause':
        api.downloads.pause(id);
        if (item) { item.paused = true; updateProgress(rec); }
        break;
      case 'resume':
        api.downloads.resume(id);
        if (item) { item.paused = false; updateProgress(rec); }
        break;
      case 'cancel':
        api.downloads.cancel(id);
        break;
      case 'retry':
        if (item && item.url) window.open(item.url);
        break;
      case 'remove':
        removeRow(id, false);
        break;
      default:
        break;
    }
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = rowIdFromEvent(btn);
    if (!id) return;
    handleAct(act, id);
  });

  // Keyboard activation for the clickable filename "link".
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('[data-act="open"][role="link"]');
    if (!target) return;
    e.preventDefault();
    const id = rowIdFromEvent(target);
    if (id) handleAct('open', id);
  });

  clearAllBtn.addEventListener('click', () => {
    api.downloads.clear();
    rows.clear();
    listEl.textContent = '';
    emptyEl.hidden = false;
  });

  let searchTimer = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filter = searchEl.value.trim();
      applyVisibility();
    }, 120);
  });

  // ---- live updates ----------------------------------------------------

  if (api && api.on) {
    api.on('downloads:started', (item) => {
      if (item && item.id) upsertPrepend(item);
    });

    api.on('downloads:progress', (item) => {
      if (!item || !item.id) return;
      const rec = rows.get(item.id);
      if (rec) {
        rec.data = Object.assign(rec.data, item);
        updateProgress(rec);
      } else {
        upsertPrepend(item);
      }
    });

    api.on('downloads:done', (item) => {
      if (item && item.id) finalizeRow(item);
    });

    api.on('downloads:changed', () => {
      load();
    });
  }

  // ---- init ------------------------------------------------------------
  load();
}());
