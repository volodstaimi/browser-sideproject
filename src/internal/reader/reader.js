(function () {
  const { api, escapeHtml } = window.AetherInternal;
  const id = new URLSearchParams(location.search).get('id');

  function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }

  async function load() {
    if (!id || !api) {
      document.getElementById('rContent').innerHTML = '<p class="muted">No article to display.</p>';
      document.getElementById('rTitle').textContent = 'Reader';
      return;
    }
    const res = await api.reader.get(id);
    const content = res && res.content;
    if (!content || !content.html) {
      document.getElementById('rTitle').textContent = 'Article unavailable';
      document.getElementById('rContent').innerHTML = '<p class="muted">This reading view has expired. Reopen the original page and try Reader mode again.</p>';
      return;
    }
    document.title = (content.title || 'Reader');
    document.getElementById('rTitle').textContent = content.title || '';
    const by = document.getElementById('rByline');
    if (content.byline) by.textContent = content.byline; else by.style.display = 'none';
    document.getElementById('rSource').textContent = hostOf(content.url);
    // content.html is extracted from the page with scripts, styles and on* handlers
    // already stripped; the page CSP also blocks inline script execution.
    document.getElementById('rContent').innerHTML = content.html;

    const open = document.getElementById('rOpen');
    open.addEventListener('click', () => { if (content.url) location.href = content.url; });
  }

  load();
}());
