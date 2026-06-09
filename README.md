# Aether

A fast, modern, **Chromium-based desktop web browser** built with Electron. Aether
embeds Chromium + V8 (the same engine family as Google Chrome), wrapped in a
hand-built, Chrome-style chrome (tab strip, omnibox, menus) with a polished
light/dark UI.

![status](https://img.shields.io/badge/status-alpha-blue)

## Features

**Tabs & navigation**
- Multiple tabs as live `<webview>`s, drag-to-reorder, middle-click close, overflow scroll
- Per-tab favicon, title, loading spinner, audio state
- Back / forward / reload ↔ stop / home, with disabled states
- Frameless window with a custom Chrome-style titlebar + window controls (minimize / maximize / close)
- Page load progress bar, hover status bubble

**Omnibox**
- Smart URL-vs-search detection (schemes, `localhost`, IPs, domains, `browser://`, `about:` rewrite)
- Suggestions dropdown blending open tabs, bookmarks, history (frecency-ranked), and search
- Security indicator (secure / not secure / internal / file)
- Configurable search engine (Google / Bing / DuckDuckGo / custom `%s` template)

**Data & pages** (`browser://` internal pages)
- `browser://newtab` — search box + most-visited tiles + custom shortcuts
- `browser://history` — day-grouped, searchable, bulk-delete, clear browsing data
- `browser://bookmarks` — folder tree, search, add/edit/delete, bookmarks bar
- `browser://downloads` — live progress, pause/resume/cancel, open / show in folder
- `browser://settings` — search engine, startup, home, appearance/theme, downloads, privacy, about

**More**
- Bookmarks (star + bookmarks bar), full history, download manager
- Find-in-page, zoom (per-origin, persisted), print + Save-as-PDF
- Themes: System / Light / Dark
- Session restore (continue where you left off / specific pages)
- Multi-window + **Incognito** windows (non-persistent, no history/session writes)
- Custom themed context menus (page, link, image, selection, editable, tab strip)
- Fullscreen (F11) and HTML fullscreen
- Extensive keyboard shortcuts

## Getting started

```bash
npm install      # downloads Electron + Chromium
npm start        # launch the browser
```

Other scripts:

```bash
npm run dev      # launch with --dev
npm run smoke    # headless boot/render self-check (CI)
```

> Requires Node 18+ (developed on Node 22). First `npm install` downloads
> Electron's prebuilt Chromium binaries (~100 MB).

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New tab / window / incognito | `Ctrl+T` / `Ctrl+N` / `Ctrl+Shift+N` |
| Close tab / reopen closed | `Ctrl+W` / `Ctrl+Shift+T` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Jump to tab 1–8 / last tab | `Ctrl+1`–`8` / `Ctrl+9` |
| Focus address bar | `Ctrl+L` (also `Alt+D`, `F6`) |
| Back / forward | `Alt+←` / `Alt+→` |
| Reload / hard reload | `Ctrl+R` (`F5`) / `Ctrl+Shift+R` |
| Find in page | `Ctrl+F` |
| Zoom in / out / reset | `Ctrl++` / `Ctrl+-` / `Ctrl+0` |
| History / Downloads | `Ctrl+H` / `Ctrl+J` |
| Bookmark this tab / manager | `Ctrl+D` / `Ctrl+Shift+O` |
| Toggle bookmarks bar | `Ctrl+Shift+B` |
| Print | `Ctrl+P` |
| Toggle full screen | `F11` |
| DevTools | `Ctrl+Shift+I` (`F12`) |

## Architecture

```
src/
  main/                  Electron main process (CommonJS)
    main.js              entry, lifecycle, single-instance lock, smoke test
    windows.js           frameless window manager + cross-window broadcast
    ipc.js               the single place all ipcMain handlers are registered
    protocol.js          privileged browser:// scheme + file handler
    security.js          web-contents hardening, guest webPreferences, permissions
    downloads.js         download lifecycle (will-download), pause/resume/cancel
    stores.js            typed bookmarks/history/downloads/settings/session stores
    store.js             generic atomic JSON store (temp+rename, debounced)
    navigation.js        pure URL/search normalization
    appMenu.js           native accelerator menu -> menu:command events
  preload.js             contextBridge -> window.browserAPI (chrome renderer)
  webview-preload.js     guest preload; privileged API only on browser:// pages
  renderer/              the browser chrome (single classic script)
    index.html  renderer.js  styles/{tokens,chrome}.css
  internal/              browser:// pages
    shared/{internal.css,internal-api.js}
    newtab/ history/ bookmarks/ downloads/ settings/ error/
```

**Security model**
- `contextIsolation: true`, `nodeIntegration: false` everywhere.
- The privileged `window.browserAPI` is exposed to a guest **only** when the page
  is served from the `browser://` scheme — external sites never receive it.
- Guest `<webview>` `webPreferences` are forced in `will-attach-webview` (page
  attributes can't weaken them).
- `window.open` / `target=_blank` is denied as a native popup and routed to a tab.
- Per-session permission policy; incognito denies sensitive permissions and never
  persists history/session/download records.

## Known limitations

- No extension (CRX) support, sync, or profiles.
- Permission requests are auto-granted in normal windows (no per-site prompt UI yet).
- Tabs stay in memory (no tab discarding) — heavy at very high tab counts.

## License

MIT
