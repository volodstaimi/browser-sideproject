'use strict';

/**
 * Lightweight network ad/tracker blocker. Cancels requests to known ad/tracking
 * domains via session.webRequest.onBeforeRequest, honoring a per-site allowlist
 * and a global on/off switch (both from settings). Keeps a running blocked count
 * that is broadcast (throttled) to renderers for the toolbar shield badge.
 */

const { webContents } = require('electron');
const stores = require('./stores');

// Curated list of common ad / tracking / analytics domains. Matched by domain
// suffix (label-aware), so subdomains are covered too.
const BLOCK = new Set([
  'doubleclick.net', '2mdn.net', 'googlesyndication.com', 'googleadservices.com',
  'googletagservices.com', 'googletagmanager.com', 'google-analytics.com',
  'adservice.google.com', 'pagead2.googlesyndication.com', 'stats.g.doubleclick.net',
  'analytics.google.com', 'adsystem.google.com', 'amazon-adsystem.com',
  'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'moatads.com',
  'adsafeprotected.com', 'doubleverify.com', 'serving-sys.com', 'adform.net',
  'smartadserver.com', 'contextweb.com', 'advertising.com', 'yieldmo.com',
  'sharethrough.com', 'teads.tv', 'indexww.com', '33across.com', 'bidswitch.net',
  'gumgum.com', 'media.net', 'zedo.com', 'revcontent.com', 'mgid.com',
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'chartbeat.com',
  'chartbeat.net', 'parsely.com', 'crazyegg.com', 'hotjar.com', 'hotjar.io',
  'mouseflow.com', 'fullstory.com', 'mixpanel.com', 'segment.io', 'segment.com',
  'optimizely.com', 'vwo.com', 'clarity.ms', 'mc.yandex.ru', 'bat.bing.com',
  'ads-twitter.com', 'analytics.twitter.com', 'connect.facebook.net',
  'onesignal.com', 'branch.io', 'appsflyer.com', 'adjust.com', 'kochava.com',
  'bluekai.com', 'krxd.net', 'demdex.net', 'everesttech.net', 'rlcdn.com',
  'agkn.com', 'adsrvr.org', 'turn.com', 'mathtag.com', 'tapad.com',
  'crwdcntrl.net', 'exelator.com', 'addthis.com', 'sharethis.com',
  'newrelic.com', 'nr-data.net', 'app.link', 'amplitude.com', 'heap.io',
  'fwmrm.net', 'adcolony.com', 'applovin.com', 'unityads.unity3d.com',
  'inmobi.com', 'mopub.com', 'smaato.net', 'vungle.com',
]);

let cfg = { enabled: true, allow: new Set() };
let total = 0;
let broadcast = () => {};
let pending = null;

function refresh() {
  try {
    const s = stores.settings.getAll();
    cfg = {
      enabled: s.adblockEnabled !== false,
      allow: new Set((s.adblockAllowlist || []).map((o) => String(o).toLowerCase())),
    };
  } catch { /* not ready */ }
}

function init({ broadcast: b } = {}) {
  broadcast = b || (() => {});
  refresh();
  try { stores.bus.on('settings', refresh); } catch { /* ignore */ }
}

function hostBlocked(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  if (BLOCK.has(h)) return true;
  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    if (BLOCK.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function pageOrigin(wcId) {
  try {
    const wc = webContents.fromId(wcId);
    if (wc) return new URL(wc.getURL()).origin;
  } catch { /* ignore */ }
  return null;
}

function attachToSession(ses) {
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!cfg.enabled) return callback({});
    let host;
    try { host = new URL(details.url).hostname; } catch { return callback({}); }
    if (!hostBlocked(host)) return callback({});
    const origin = pageOrigin(details.webContentsId);
    if (origin && cfg.allow.has(origin)) return callback({});
    total += 1;
    scheduleBroadcast();
    return callback({ cancel: true });
  });
}

function scheduleBroadcast() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; broadcast('adblock:changed', { total }); }, 800);
}

function stats() { return { total, enabled: cfg.enabled }; }

module.exports = { init, attachToSession, stats, hostBlocked };
