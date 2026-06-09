'use strict';

/**
 * Native application Menu. On a frameless window the menu bar isn't rendered,
 * but its accelerators still fire while the app is focused — even when a
 * <webview> guest has keyboard focus. Every command is forwarded to the focused
 * chrome window as a `menu:command` event; the renderer does the actual work.
 */

const { Menu, BrowserWindow, app } = require('electron');

function buildAppMenu(windowsMod) {
  const isMac = process.platform === 'darwin';

  const dispatch = (command, args) => (menuItem, browserWindow) => {
    const win = browserWindow || BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed()) win.webContents.send('menu:command', { command, args });
  };

  const tabNumberItems = [];
  for (let i = 1; i <= 8; i += 1) {
    tabNumberItems.push({ label: `Tab ${i}`, accelerator: `CmdOrCtrl+${i}`, visible: false, click: dispatch('goto-tab', { index: i - 1 }) });
  }

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: dispatch('open-settings') },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: dispatch('new-tab') },
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: dispatch('new-window') },
        { label: 'New Incognito Window', accelerator: 'CmdOrCtrl+Shift+N', click: dispatch('new-incognito') },
        { type: 'separator' },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: dispatch('reopen-tab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: dispatch('close-tab') },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: dispatch('print') },
        { label: 'Save as PDF…', click: dispatch('print-pdf') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: dispatch('open-settings') }, { role: 'quit', label: 'Exit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' },
        { role: 'delete' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find in Page…', accelerator: 'CmdOrCtrl+F', click: dispatch('find') },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: dispatch('focus-omnibox') },
        { label: 'Focus Address Bar (Alt+D)', accelerator: 'Alt+D', visible: false, click: dispatch('focus-omnibox') },
        { label: 'Focus Address Bar (F6)', accelerator: 'F6', visible: false, click: dispatch('focus-omnibox') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: dispatch('reload') },
        { label: 'Reload (F5)', accelerator: 'F5', visible: false, click: dispatch('reload') },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: dispatch('reload-hard') },
        { label: 'Stop', accelerator: 'Esc', visible: false, click: dispatch('stop') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: dispatch('zoom-in') },
        { label: 'Zoom In (+)', accelerator: 'CmdOrCtrl+Plus', visible: false, click: dispatch('zoom-in') },
        { label: 'Zoom In (Shift)', accelerator: 'CmdOrCtrl+Shift+=', visible: false, click: dispatch('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: dispatch('zoom-out') },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: dispatch('zoom-reset') },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: dispatch('fullscreen') },
        { label: 'Toggle Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: dispatch('devtools') },
        { label: 'Developer Tools (F12)', accelerator: 'F12', visible: false, click: dispatch('devtools') },
        { type: 'separator' },
        { label: 'Toggle Bookmarks Bar', accelerator: 'CmdOrCtrl+Shift+B', click: dispatch('toggle-bookmarks-bar') },
      ],
    },
    {
      label: 'History',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: dispatch('back') },
        { label: 'Forward', accelerator: 'Alt+Right', click: dispatch('forward') },
        { label: 'Home', accelerator: 'Alt+Home', click: dispatch('home') },
        { type: 'separator' },
        { label: 'Show Full History', accelerator: isMac ? 'CmdOrCtrl+Y' : 'CmdOrCtrl+H', click: dispatch('open-history') },
      ],
    },
    {
      label: 'Bookmarks',
      submenu: [
        { label: 'Bookmark This Tab…', accelerator: 'CmdOrCtrl+D', click: dispatch('bookmark') },
        { label: 'Show All Bookmarks', accelerator: 'CmdOrCtrl+Shift+O', click: dispatch('open-bookmarks') },
      ],
    },
    {
      label: 'Tab',
      submenu: [
        { label: 'Next Tab', accelerator: 'Control+Tab', click: dispatch('next-tab') },
        { label: 'Next Tab (alt)', accelerator: 'CmdOrCtrl+Alt+Right', visible: false, click: dispatch('next-tab') },
        { label: 'Previous Tab', accelerator: 'Control+Shift+Tab', click: dispatch('prev-tab') },
        { label: 'Previous Tab (alt)', accelerator: 'CmdOrCtrl+Alt+Left', visible: false, click: dispatch('prev-tab') },
        { label: 'Last Tab', accelerator: 'CmdOrCtrl+9', click: dispatch('last-tab') },
        ...tabNumberItems,
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: dispatch('open-downloads') },
        { label: 'History', click: dispatch('open-history') },
        { label: 'Bookmark Manager', click: dispatch('open-bookmarks') },
        { label: 'Settings', click: dispatch('open-settings') },
        { type: 'separator' },
        { label: 'New Tab Page', click: dispatch('open-newtab') },
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])],
    },
    {
      role: 'help',
      submenu: [{ label: 'About Aether', click: dispatch('about') }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { buildAppMenu };
