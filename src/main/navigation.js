'use strict';

/**
 * Pure URL / search normalization. No Electron imports so it can be reasoned
 * about (and unit-tested) in isolation. Implements the omnibox URL-vs-search
 * heuristic described in the spec.
 */

const ABOUT_MAP = {
  blank: 'newtab',
  newtab: 'newtab',
  home: 'newtab',
  history: 'history',
  bookmarks: 'bookmarks',
  downloads: 'downloads',
  settings: 'settings',
  preferences: 'settings',
};

/** Does the bare host look like a registrable domain (has a dot + plausible TLD)? */
function looksLikeDomain(host) {
  if (!host || /\s/.test(host)) return false;
  const h = host.replace(/:\d+$/, ''); // strip :port
  if (!h.includes('.')) return false;
  const labels = h.split('.');
  if (labels.some((l) => l.length === 0)) return false; // no empty labels
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/i.test(tld) || /^xn--/i.test(tld);
}

function buildSearchURL(query, template) {
  const tpl = template && template.includes('%s')
    ? template
    : 'https://www.google.com/search?q=%s';
  return tpl.replace('%s', encodeURIComponent(query));
}

/** browser://... normalization (collapse missing slashes, default page). */
function normalizeInternal(input) {
  let rest = input.replace(/^browser:\/*/i, '');
  if (!rest) rest = 'newtab';
  return 'browser://' + rest;
}

/**
 * @param {string} rawInput  what the user typed / pasted
 * @param {string} template  search engine template containing %s
 * @returns {{ url:string, isSearch:boolean }}
 */
function normalizeInput(rawInput, template) {
  const input = String(rawInput == null ? '' : rawInput).trim();
  if (!input) return { url: '', isSearch: false };

  // Internal scheme
  if (/^browser:/i.test(input)) {
    return { url: normalizeInternal(input), isSearch: false };
  }
  // about:* -> browser://*
  if (/^about:/i.test(input)) {
    const page = input.slice('about:'.length).replace(/^\/+/, '').toLowerCase() || 'newtab';
    return { url: 'browser://' + (ABOUT_MAP[page] || 'newtab'), isSearch: false };
  }
  // Explicit scheme with authority (http://, https://, file://, ftp://, ws(s)://, data:)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    return { url: input, isSearch: false };
  }
  if (/^(mailto:|tel:|data:|javascript:)/i.test(input)) {
    return { url: input, isSearch: false };
  }
  // Windows absolute path -> file URL
  if (/^[a-zA-Z]:[\\/]/.test(input)) {
    return { url: 'file:///' + input.replace(/\\/g, '/'), isSearch: false };
  }
  // POSIX absolute path
  if (input.startsWith('/') && !input.startsWith('//')) {
    return { url: 'file://' + input, isSearch: false };
  }

  const hasSpace = /\s/.test(input);
  const firstSlash = input.indexOf('/');
  const hostPart = firstSlash === -1 ? input : input.slice(0, firstSlash);
  const isLocalhost = /^localhost(:\d+)?$/i.test(hostPart);
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(hostPart);

  if (!hasSpace && (isLocalhost || isIPv4 || looksLikeDomain(hostPart))) {
    return { url: 'https://' + input, isSearch: false };
  }

  return { url: buildSearchURL(input, template), isSearch: true };
}

function isInternal(url) {
  return typeof url === 'string' && /^browser:\/\//i.test(url);
}

/** Normalize a URL for dedupe/comparison (drop hash + trailing slash, lowercase host). */
function normalizeForCompare(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.toString();
    // strip a lone trailing slash on the path (but keep "/" for bare host)
    if (u.pathname === '/' && !u.search) s = s.replace(/\/$/, '');
    return s;
  } catch {
    return String(url || '').trim();
  }
}

const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=%s',
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
};

module.exports = {
  normalizeInput,
  buildSearchURL,
  isInternal,
  normalizeForCompare,
  looksLikeDomain,
  SEARCH_ENGINES,
};
