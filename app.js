/* Village West Team app. Stage 2: Home, Bulletins, reading a post. */
(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ/exec';
  var STORE_KEY = 'vwp.k';
  var CACHE_KEY = 'vwp.data';
  var EDIT_KEY = 'vwp.edit';
  var SIZE_KEY = 'vwp.size';
  var SIZES = { standard: 1, large: 1.14, largest: 1.28 };
  /** Makes everything in the app bigger for this phone only. */
  function applySize() {
    var z = SIZES[lsGet(SIZE_KEY)] || 1;
    document.documentElement.style.zoom = z === 1 ? '' : String(z);
  }
  var TZ = 'America/New_York';

  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');
  var toastEl = document.getElementById('toast');
  var veil = document.createElement('div');
  veil.className = 'veil'; veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);

  var state = {
    k: '', me: null, settings: { beta: false }, categories: [], posts: [],
    tab: 'home',            // which bottom tab is showing
    view: 'tab',            // 'tab' | 'post' | 'done'
    postId: '',             // open post
    flow: null,             // { total, done, justRead: [ids] } while reading through unread posts
    canPost: false, people: [], defaultCategory: '', draft: null, photos: {}, readers: null, team: null, personForm: null, catForm: null, resources: [], contacts: [], resSearch: '', resForm: null,
    filter: 'all', search: '', lastSeen: lsGet('vwp.seen'), holdFor: '',
    loadedAt: 0
  };

  /* ---------- Small helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (window.ICONS[name] || '') + '</svg>'; }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function lsGet(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function lsSet(key, v) { try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch (e) {} }

  applySize();
  /** Editing tools (pencils, New post, read counts) only show while Edit mode is on. */
  function editing() { return lsGet(EDIT_KEY) === '1' && !!state.me && (state.canPost || state.me.role === 'admin'); }
  function editChip() {
    if (!state.me || !(state.canPost || state.me.role === 'admin')) return '';
    var on = editing();
    return '<button class="editchip' + (on ? ' on' : '') + '" data-editmode="1" role="switch" aria-checked="' + on + '" aria-label="Edit mode">' + icon('pencil') + '<span>Edit mode</span><span class="switch' + (on ? ' on' : '') + '"><span></span></span></button>';
  }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- Dates (always studio time) ---------- */

  function asDate(v) {
    if (!v) return null;
    // A date-only value is treated as midday so the time zone never shifts the day.
    var d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T17:00:00Z') : new Date(v);
    return isNaN(d) ? null : d;
  }
  function fmt(v, opts) {
    var d = asDate(v);
    if (!d) return '';
    opts.timeZone = TZ;
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  }
  function fullDate(v) { return fmt(v, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayKey(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function daysFromToday(dayStr) {
    var a = new Date(dayKey(new Date()) + 'T00:00:00Z'), b = new Date(dayStr + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }
  /** "Read by Fri" for the coming week, "Read by today", otherwise "Read by Nov 20". */
  function readByText(dayStr) {
    var n = daysFromToday(dayStr);
    if (n === 0) return 'Read by today';
    if (n > 0 && n < 7) return 'Read by ' + fmt(dayStr, { weekday: 'short' });
    return 'Read by ' + fmt(dayStr, { month: 'short', day: 'numeric' });
  }
  function readWhen(iso) {
    if (!iso) return 'Read';
    return dayKey(asDate(iso)) === dayKey(new Date()) ? 'Read today' : 'Read ' + fmt(iso, { month: 'short', day: 'numeric' });
  }

  /* ---------- Post helpers ---------- */

  function cat(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return { id: '', name: 'Announcements', color: '#3F5FC0' };
  }
  function activeCats() { return state.categories.filter(function (c) { return !c.archived; }); }
  function tint(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#EEF1F8';
    var n = parseInt(m[1], 16), mix = function (c) { return Math.round(c + (255 - c) * 0.86); };
    return 'rgb(' + mix(n >> 16) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
  }
  function shade(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#243A7A';
    var n = parseInt(m[1], 16), mix = function (c) { return Math.round(c * 0.55); };
    return 'rgb(' + mix(n >> 16) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
  }
  function byId(id) {
    for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === id) return state.posts[i];
    return null;
  }
  /** Posted since this person last opened the app, and not written by them. */
  function isNew(p) { return !!state.lastSeen && !p.mine && !p.readAt && p.createdAt > state.lastSeen; }
  function isUnread(p) { return p.needsRead && p.forMe && !p.readAt && !p.status; }
  function newestFirst(a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; }
  function pinnedThenNewest(a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || newestFirst(a, b); }
  /** Reading order: earliest read-by date first, then pinned, then oldest so news is read in order. */
  function unreadQueue() {
    return state.posts.filter(isUnread).sort(function (a, b) {
      var da = a.readBy || '9999', db = b.readBy || '9999';
      if (da !== db) return da < db ? -1 : 1;
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || -newestFirst(a, b);
    });
  }
  function preview(body) { return String(body).replace(/\*\*/g, '').replace(/^\s*[-•*]\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 220); }
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function inline(t) { return linkify(t).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>'); }
  /** Plain text with line breaks and links, plus **bold** and lines that start with "- " as bullets. */
  function renderBody(text) {
    var out = '', buf = [], list = [];
    function flushText() { if (buf.join('').trim()) out += '<div class="para">' + inline(buf.join('\n').replace(/^\n+|\n+$/g, '')) + '</div>'; buf = []; }
    function flushList() { if (list.length) out += '<ul>' + list.map(function (l) { return '<li>' + inline(l) + '</li>'; }).join('') + '</ul>'; list = []; }
    String(text).split('\n').forEach(function (l) {
      var m = /^\s*[-•*]\s+(.*)$/.exec(l);
      if (m) { flushText(); list.push(m[1]); } else { flushList(); buf.push(l); }
    });
    flushText(); flushList();
    return out;
  }
  function safeUrl(u) { return /^(https?:|sms:|tel:|mailto:)/i.test(u) ? u : '#'; }

  /* ---------- Talking to the server ---------- */

  function api(action, data, wait) {
    var body = Object.assign({ action: action, k: state.k }, data || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, wait || 30000);
    return fetch(API, {
      method: 'POST', credentials: 'omit', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  function applyData(res) {
    state.me = res.me;
    state.settings = res.settings || state.settings;
    state.categories = res.categories || [];
    state.canPost = !!res.canPost;
    state.people = res.people || [];
    state.defaultCategory = res.defaultCategory || '';
    state.resources = res.resources || [];
    state.contacts = res.contacts || [];
    // Keep any read we marked locally that the server has not echoed back yet.
    var pending = {};
    state.posts.forEach(function (p) { if (p._pending) pending[p.id] = p.readAt; });
    state.posts = (res.posts || []).map(function (p) {
      if (pending[p.id] && !p.readAt) { p.readAt = pending[p.id]; p._pending = true; }
      return p;
    });
    state.loadedAt = Date.now();
  }
  function saveCache(res) { lsSet(CACHE_KEY, JSON.stringify({ k: state.k, res: res })); }
  function loadCache() {
    try {
      var c = JSON.parse(lsGet(CACHE_KEY) || 'null');
      return c && c.k === state.k ? c.res : null;
    } catch (e) { return null; }
  }

  /* ---------- Shared pieces ---------- */

  /** Morning, afternoon, evening, or night, with a matching icon and color. */
  function timeOfDay() {
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return { word: 'Good morning', icon: 'sunrise', cls: 'tod-morning' };
    if (h >= 12 && h < 17) return { word: 'Good afternoon', icon: 'sun', cls: 'tod-afternoon' };
    if (h >= 17 && h < 21) return { word: 'Good evening', icon: 'sunset', cls: 'tod-evening' };
    return { word: 'Good evening', icon: 'moon', cls: 'tod-night' };
  }
  function stampDay() { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()); }
  function stampTime() { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date()); }
  function header() {
    var me = state.me, t = timeOfDay();
    return '<header class="top">' +
      '<div class="top-brand">' + (state.settings.beta ? '<span class="beta">Beta</span>' : '') +
      '<img class="wordmark-img" src="brand/wordmark.png" alt="Village West" width="156" height="13"></div>' +
      '<div class="hello"><span class="tod ' + t.cls + '" aria-hidden="true">' + icon(t.icon) + '</span>' +
      '<div class="hello-text"><div class="hello-small">' + t.word + '</div>' +
      '<div class="hello-name">' + esc(me.firstName) + '</div></div>' +
      '<div class="stamp"><div class="stamp-day">' + stampDay() + '</div><div class="stamp-time" id="stamp-time">' + stampTime() + '</div></div></div>' +
    '</header>';
  }
  // Keep the clock on Home current without redrawing the screen.
  setInterval(function () {
    var el = document.getElementById('stamp-time');
    if (el) { var now = stampTime(); if (el.textContent !== now) el.textContent = now; }
  }, 15000);

  function catTag(p) {
    var c = cat(p.categoryId);
    return '<span class="tag" style="background:' + tint(c.color) + ';color:' + shade(c.color) + '">' +
      '<span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</span>';
  }
  function statusPill(p) {
    if (isUnread(p)) return '<span class="pill pill-coral">' + (p.readBy ? esc(readByText(p.readBy)) : 'Unread') + '</span>';
    if (p.readAt) return '<span class="pill pill-read">' + icon('check') + 'Read</span>';
    return '';
  }
  function metaLine(p) {
    var bits = ['By ' + esc(p.author), fullDate(p.createdAt)];
    return bits.join(' · ');
  }
  function extras(p) {
    var out = '';
    if (isNew(p)) out += '<span class="mini mini-new">New</span>';
    if (p.pinned) out += '<span class="mini mini-pin">' + icon('pin') + 'Pinned</span>';
    if (p.updated) out += '<span class="mini mini-updated">Updated</span>';
    if (p.eventDate) out += '<span class="mini">' + fullDate(p.eventDate) + '</span>';
    return out ? '<div class="minis">' + out + '</div>' : '';
  }

  /** Big card for a post that still needs to be read. */
  function unreadCard(p) {
    return '<article class="card post-card" data-open="' + esc(p.id) + '" role="button" tabindex="0" onclick="">' +
      '<div class="card-top">' + catTag(p) + statusPill(p) + '</div>' +
      '<div class="card-main"><div class="card-main-text"><h3 class="card-title">' + esc(p.title) + '</h3>' +
      extras(p) +
      '<p class="preview">' + esc(preview(p.body)) + '</p></div>' +
      (p.thumb ? '<img class="thumb" src="' + esc(p.thumb) + '" alt="">' : '') + '</div>' +
      '<div class="meta">' + metaLine(p) + '</div>' +
      '<button class="btn btn-primary" data-open="' + esc(p.id) + '">Open and read' + icon('arrow-right') + '</button>' +
    '</article>';
  }

  /** Compact row for a post that is read, or that does not need marking. */
  function compactRow(p, when) {
    var c = cat(p.categoryId);
    var sub = 'By ' + esc(p.author) + '<span class="sep">·</span>' + fullDate(p.createdAt);
    var status = p.readAt ? '<span class="row-read">' + icon('check') + 'Read</span>' : '';
    return '<button class="post-row" data-open="' + esc(p.id) + '">' +
      '<span class="dot" style="background:' + esc(c.color) + '"></span>' +
      '<span class="post-row-text"><span class="post-row-title">' + esc(p.title) + '</span>' +
      '<span class="post-row-sub">' + (p.pinned ? '<span class="mini mini-pin">' + icon('pin') + 'Pinned</span>' : '') + sub + '</span></span>' +
      status + icon('chevron-right') +
    '</button>';
  }

  function textSizeControl() {
    var cur = SIZES[lsGet(SIZE_KEY)] ? lsGet(SIZE_KEY) : 'standard';
    return '<div class="textsize"><div class="seg-group">' +
      [['standard', 'Standard', 15], ['large', 'Large', 18], ['largest', 'Largest', 21]].map(function (x) {
        return '<button class="seg-btn' + (cur === x[0] ? ' on' : '') + '" data-size="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '"><b style="font-size:' + x[2] + 'px">A</b>' + x[1] + '</button>';
      }).join('') + '</div></div>';
  }

  /* ---------- Home ---------- */

  function renderHome() {
    var unread = unreadQueue();
    var read = state.posts.filter(function (p) { return p.readAt && !p.status; }).sort(function (a, b) { return a.readAt < b.readAt ? 1 : -1; });
    var fyi = state.posts.filter(function (p) { return !p.readAt && !isUnread(p) && !p.status; }).sort(pinnedThenNewest);
    var html = '<div class="screen">' + header();

    if (unread.length) {
      var due = unread[0].readBy;
      html += '<section class="todo" data-start="1" role="button" tabindex="0" onclick="">' +
        '<div class="todo-text"><div class="todo-count">' + unread.length + (unread.length === 1 ? ' post to read' : ' posts to read') + '</div>' +
        '<div class="todo-sub">' + (due ? 'Earliest due ' + fullDate(due) : 'Takes about a minute each') + '</div></div>' +
        '<button class="btn-start" data-start="1">Start</button>' +
      '</section>';
      html += '<h2 class="section-label">To read</h2>' + unread.map(unreadCard).join('');
    } else if (!state.posts.length) {
      html += '<section class="calm"><div class="bubble sm">' + icon('newspaper') + '</div>' +
        '<div><div class="calm-title">Nothing posted yet</div>' +
        '<div class="calm-sub">New posts from the studio will show up here.</div></div></section>';
    } else {
      html += '<section class="calm"><div class="bubble sm">' + icon('check') + '</div>' +
        '<div><div class="calm-title">You\'re all caught up</div>' +
        '<div class="calm-sub">Nothing new to read right now.</div></div></section>';
    }

    var waiting = pendingPosts().length;
    if (waiting) html += '<button class="link-btn pending-link" data-tab="bulletins">' + icon('pencil') + waiting + (waiting === 1 ? ' draft or scheduled post' : ' drafts and scheduled posts') + icon('chevron-right') + '</button>';
    if (fyi.length) {
      html += '<h2 class="section-label">Good to know</h2><div class="rows-list">' +
        fyi.slice(0, 5).map(function (p) { return compactRow(p); }).join('') + '</div>';
    }
    if (read.length) {
      html += '<h2 class="section-label">Already read</h2><div class="rows-list">' +
        read.slice(0, 5).map(function (p) { return compactRow(p, 'Read'); }).join('') + '</div>';
      if (read.length > 5) html += '<button class="link-btn" data-tab="bulletins">See all bulletins' + icon('chevron-right') + '</button>';
    }
    return html + '</div>';
  }

  /* ---------- Bulletins ---------- */

  function bulletinList() {
    var q = state.search.trim().toLowerCase();
    var list = state.posts.filter(function (p) {
      if (p.status) return false;
      if (state.filter === 'unread' && !isUnread(p)) return false;
      if (state.filter !== 'all' && state.filter !== 'unread' && p.categoryId !== state.filter) return false;
      if (q && (p.title + ' ' + p.body + ' ' + p.author + ' ' + cat(p.categoryId).name).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(pinnedThenNewest);
    if (!list.length) {
      var filtered = q || state.filter !== 'all';
      return '<div class="empty"><div class="bubble sm">' + icon(filtered ? 'search' : 'newspaper') + '</div>' +
        '<div class="calm-title">' + (state.filter === 'unread' && !q ? 'Nothing left to read' : filtered ? 'No posts match' : 'Nothing posted yet') + '</div>' +
        '<div class="calm-sub">' + (filtered ? 'Try a different word or filter.' : 'New posts from the studio will show up here.') + '</div>' +
        (filtered ? '<button class="btn btn-outline sm" data-clear="1">Show all posts</button>' : '') + '</div>';
    }
    var one = function (p) { return isUnread(p) ? unreadCard(p) : compactRow(p, p.readAt ? 'Read' : ''); };
    var pins = list.filter(function (p) { return p.pinned; }), rest = list.filter(function (p) { return !p.pinned; });
    if (!pins.length) return rest.map(one).join('');
    return '<h2 class="section-label pin-label">' + icon('pin') + 'Pinned</h2><div class="pin-group">' + pins.map(one).join('') + '</div>' +
      (rest.length ? '<h2 class="section-label">Latest</h2>' + rest.map(one).join('') : '');
  }

  function chips() {
    var n = unreadQueue().length;
    var all = [['all', 'All'], ['unread', 'Unread' + (n ? ' ' + n : '')]].concat(activeCats().map(function (c) { return [c.id, c.name, c.color]; }));
    return all.map(function (c) {
      var on = state.filter === c[0];
      return '<button class="chip' + (on ? ' on' : '') + '" data-filter="' + esc(c[0]) + '" aria-pressed="' + on + '">' +
        (c[2] ? '<span class="dot" style="background:' + esc(c[2]) + '"></span>' : '') + esc(c[1]) + '</button>';
    }).join('');
  }

  function pendingPosts() {
    return !editing() ? [] : state.posts.filter(function (p) { return p.status && p.canEdit; }).sort(function (a, b) { return (a.savedAt || '') < (b.savedAt || '') ? 1 : -1; });
  }
  function whenFull(iso) { return fullDate(iso) + ' at ' + fmt(iso, { hour: 'numeric', minute: '2-digit' }); }
  function pendingSection() {
    var list = pendingPosts();
    if (!list.length) return '';
    return '<h2 class="section-label" style="margin-top:6px">Drafts and scheduled</h2><div class="rows-list" style="margin-bottom:8px">' + list.map(function (p) {
      var sub = p.status === 'draft' ? 'Draft, saved ' + whenFull(p.savedAt) : 'Goes out ' + whenFull(p.publishAt);
      return '<button class="post-row pending-row" data-edit="' + esc(p.id) + '"><span class="pending-ic">' + icon(p.status === 'draft' ? 'pencil' : 'clock') + '</span>' +
        '<span class="post-row-text"><span class="post-row-title">' + esc(p.title || 'Untitled') + '</span><span class="post-row-sub">' + esc(sub) + '</span></span>' + icon('chevron-right') + '</button>';
    }).join('') + '</div>';
  }

  function renderBulletins() {
    return '<div class="screen">' +
      '<h1 class="page-title">Bulletins</h1>' +
      '<label class="search">' + icon('search') +
        '<input id="search" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Search posts" aria-label="Search posts" value="' + esc(state.search) + '">' +
      '</label>' +
      '<div class="chips" id="chips">' + chips() + '</div>' +
      pendingSection() +
      '<div id="list">' + bulletinList() + '</div>' +
    '</div>';
  }

  /* ---------- Open post ---------- */

  function renderPost(p) {
    var unread = isUnread(p);
    var f = state.flow;
    var progress = '';
    if (f && unread) {
      var segs = '';
      for (var i = 0; i < f.total; i++) segs += '<span class="seg' + (i <= f.done ? ' on' : '') + '"></span>';
      progress = '<div class="progress"><div class="progress-text">' + (f.done + 1) + ' of ' + f.total + ' to read</div>' +
        (f.total > 1 ? '<div class="segs">' + segs + '</div>' : '') + '</div>';
    }
    var links = (p.links || []).map(function (l) {
      return '<a class="link-row" href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener">' +
        icon(/^sms:/i.test(l.url) ? 'message-circle' : 'external-link') + '<span>' + esc(l.label) + '</span>' + icon('chevron-right') + '</a>';
    }).join('');

    var hold = unread && state.holdFor === p.id;
    state.holdFor = '';
    // A Back button sits in the bottom bar, in easy reach of a thumb. The top arrow still works too.
    var backBtn = '<button class="bar-back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button>';
    var foot;
    if (unread) {
      var more = f && f.done + 1 < f.total;
      foot = '<div class="readbar"><div class="readbar-in"><div class="readbar-row">' + backBtn +
        '<button class="btn btn-primary' + (hold ? ' holding' : '') + '" id="markread"' + (hold ? ' disabled data-hold="1"' : '') + '>' + icon('check') + esc(p.buttonText || 'Mark as read') + '</button></div>' +
        '<p class="readbar-note">Tapping this confirms you\'ve read and understood it.' + (more ? ' Then you\'ll go to the next one.' : '') + '</p>' +
      '</div></div>';
    } else {
      foot = '<div class="readbar quiet"><div class="readbar-in"><div class="readbar-row">' + backBtn +
        (p.readAt ? '<div class="read-done">' + icon('check') + 'You read this ' + (dayKey(asDate(p.readAt)) === dayKey(new Date()) ? 'today' : 'on ' + fullDate(p.readAt)) + '</div>'
          : '<button class="back-text" data-back="1">Back</button>') + '</div></div></div>';
    }

    return '<div class="screen post-screen' + (foot ? ' has-bar' : '') + '">' +
      '<div class="post-top"><button class="back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button>' + progress +
        (p.canEdit && editing() ? '<button class="back" data-edit="' + esc(p.id) + '" aria-label="Edit this post">' + icon('pencil') + '</button>' : '<span class="back-spacer"></span>') + '</div>' +
      '<div class="card-top">' + catTag(p) + (unread || p.readAt ? statusPill(p) : '') + '</div>' +
      (p.status ? '<div class="sched-note">' + icon(p.status === 'draft' ? 'pencil' : 'clock') + (p.status === 'draft' ? 'Draft. Only you and admins can see it.' : 'Goes out ' + esc(whenFull(p.publishAt)) + '. Only you and admins can see it until then.') + '</div>' : '') +
      '<h1 class="post-title">' + esc(p.title) + '</h1>' +
      '<div class="meta">' + metaLine(p) + '</div>' + extras(p) +
      (p.stats && p.needsRead && editing() ? '<button class="stats" data-readers="' + esc(p.id) + '">' + icon('users') + p.stats.read + ' of ' + p.stats.total + ' read' + icon('chevron-right') + '</button>' : '') +
      (p.photo ? '<button class="photo" data-photo="' + esc(p.id) + '" aria-label="See the photo full size" style="aspect-ratio:' + p.photo.w + '/' + p.photo.h + '"><span class="sk"></span></button>' : '') +
      '<div class="post-body">' + renderBody(p.body) + '</div>' +
      (links ? '<div class="links">' + links + '</div>' : '') +
    '</div>' + foot;
  }

  /* ---------- All caught up ---------- */

  function renderDone() {
    var ids = (state.flow && state.flow.justRead) || [];
    var n = ids.length;
    var line = n === 1 ? 'That post is marked as read.' : n === 2 ? 'Both posts are marked as read.' : 'All ' + n + ' posts are marked as read.';
    var rows = ids.map(byId).filter(Boolean).map(function (p) { return compactRow(p, 'Read today'); }).join('');
    return '<div class="screen">' + header() +
      '<div class="done"><div class="bubble">' + icon('check') + '</div>' +
      '<h1>You\'re all caught up</h1>' +
      '<p>' + line + ' Thank you, ' + esc(state.me.firstName) + '.</p></div>' +
      (rows ? '<h2 class="section-label">Just read</h2><div class="rows-list">' + rows + '</div>' : '') +
      '<button class="btn btn-outline" data-home="1" style="margin-top:20px">Back to Home</button>' +
    '</div>';
  }

  /* ---------- A little celebration for getting caught up ---------- */

  var PARTY = ['#465A50', '#163D38', '#E58B7C', '#B8892B', '#7B52B9', '#3F5FC0', '#A9C4B6'];
  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var from = app.querySelector('.done .bubble');
    if (!from) return;
    var r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var box = document.createElement('div');
    box.className = 'party'; box.setAttribute('aria-hidden', 'true');
    var html = '';
    for (var i = 0; i < 46; i++) {
      var ang = (Math.PI * 2 * i) / 46 + (Math.random() - 0.5) * 0.5;
      var dist = 90 + Math.random() * 150;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 60;      // a burst that leans upward
      var shape = i % 3;                                                  // dot, strip, or ring
      var size = 6 + Math.random() * 7;
      html += '<i class="bit s' + shape + '" style="left:' + cx + 'px;top:' + cy + 'px;width:' + (shape === 1 ? size * 0.55 : size) + 'px;height:' + (shape === 1 ? size * 1.7 : size) + 'px;' +
        (shape === 2 ? 'border-color:' : 'background:') + PARTY[i % PARTY.length] + ';--dx:' + dx.toFixed(0) + 'px;--dy:' + dy.toFixed(0) + 'px;--fall:' + (120 + Math.random() * 140).toFixed(0) + 'px;--rot:' + (Math.random() * 720 - 360).toFixed(0) + 'deg;animation-delay:' + (Math.random() * 90).toFixed(0) + 'ms;animation-duration:' + (1300 + Math.random() * 700).toFixed(0) + 'ms"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    from.classList.add('pop');
    setTimeout(function () { box.remove(); }, 2400);
  }

  /* ---------- Other tabs (later stages) ---------- */

  var TAB_ICONS = { home: 'house', bulletins: 'newspaper', resources: 'layout-grid', contact: 'message-circle', team: 'settings' };
  function renderSoon() {
    var names = { resources: 'Resources', contact: 'Contact', team: 'Team' };
    return '<div class="center"><div class="bubble">' + icon(TAB_ICONS[state.tab]) + '</div>' +
      '<h1>' + names[state.tab] + '</h1><p>This screen is coming in a later stage.</p></div>';
  }

  /* ---------- Rendering and navigation ---------- */

  function render(anim) {
    var html;
    if (state.view === 'post') {
      var p = byId(state.postId);
      if (!p) { state.view = 'tab'; return render(); }
      html = renderPost(p);
    } else if (state.view === 'compose' && state.draft) {
      html = renderCompose();
    } else if (state.view === 'readers') {
      html = renderReaders();
    } else if (state.view === 'done') {
      html = renderDone();
    } else {
      html = state.tab === 'home' ? renderHome() : state.tab === 'bulletins' ? renderBulletins() : state.tab === 'team' ? renderTeam() : state.tab === 'resources' ? renderResources() : state.tab === 'contact' ? renderContact() : renderSoon();
      if (state.canPost && editing() && (state.tab === 'home' || state.tab === 'bulletins')) {
        html += '<button class="fab" data-compose="new">' + icon('plus') + 'New post</button>';
      }
    }
    app.innerHTML = html;
    // A soft white veil fades away over the new screen. The text itself never animates,
    // so it cannot shift or change size as it settles.
    if (anim) { veil.classList.remove('go'); void veil.offsetWidth; veil.classList.add('go'); }
    var held = document.querySelector('#markread[data-hold]');
    if (held) setTimeout(function () { held.disabled = false; held.classList.remove('holding'); }, 3000);
    tabbar.hidden = state.view === 'post' || state.view === 'compose' || state.view === 'readers';
    if (state.view === 'post') loadPhoto(state.postId);
    if (!tabbar.hidden) renderTabbar();
  }

  function renderTabbar() {
    var tabs = [['home', 'Home'], ['bulletins', 'Bulletins'], ['resources', 'Resources'], ['contact', 'Contact']];
    tabs.push(['team', 'Settings']);
    var n = unreadQueue().length;
    tabbar.innerHTML = '<div class="tabbar-in">' + tabs.map(function (t) {
      var on = state.tab === t[0];
      var badge = t[0] === 'bulletins' && n > 0 ? '<span class="count" aria-label="' + n + ' to read">' + n + '</span>' : '';
      return '<button class="tab' + (on ? ' on' : '') + '" data-tab="' + t[0] + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="ic-wrap">' + icon(TAB_ICONS[t[0]]) + badge + '</span><span>' + t[1] + '</span></button>';
    }).join('') + '</div>';
  }

  /** The address keeps ?k= so a saved shortcut always works. Screens live after the #. */
  function depth() { return (history.state && history.state.d) || 0; }
  function pushRoute(hash) {
    try { history.pushState({ vwp: 1, d: depth() + 1 }, '', location.pathname + location.search + hash); } catch (e) {}
  }
  function replaceRoute(hash) {
    try { history.replaceState({ vwp: 1, d: depth() }, '', location.pathname + location.search + hash); } catch (e) {}
  }

  function goTab(tab, push) {
    state.view = 'tab'; state.tab = tab; state.flow = null;
    if (tab === 'team') state.team = null;
    if (push !== false) pushRoute('#/' + tab); else replaceRoute('#/' + tab);
    render('fade');
    window.scrollTo(0, 0);
  }

  function openPost(id, opts) {
    opts = opts || {};
    var p = byId(id);
    if (!p) { toast('That post is no longer available.'); return; }
    if (isUnread(p) && !opts.keepFlow) {
      state.flow = { total: unreadQueue().length, done: 0, justRead: [] };
    } else if (!isUnread(p)) {
      state.flow = opts.keepFlow ? state.flow : null;
    }
    state.view = 'post'; state.postId = id;
    // Longer posts get a short pause before the button turns on, so it can't be tapped by reflex.
    state.holdFor = isUnread(p) && p.body.length > 280 ? id : '';
    if (opts.replace) replaceRoute('#/post/' + id); else pushRoute('#/post/' + id);
    render(opts.anim || 'slide');
    window.scrollTo(0, 0);
    api('viewPost', { postId: id }).catch(function () {});
    if (!lsGet('vwp.swipetip') && 'ontouchstart' in window) { lsSet('vwp.swipetip', '1'); setTimeout(function () { if (state.view === 'post') toast('Tip: swipe sideways to go back'); }, 900); }
  }

  function showDone() {
    state.view = 'done'; state.tab = 'home';
    toastEl.classList.remove('show'); // this screen already says it
    setTimeout(celebrate, 120);
    replaceRoute('#/home');
    render('fade');
    window.scrollTo(0, 0);
  }

  var marking = false;
  function markRead() {
    var p = byId(state.postId);
    if (!p || marking || !isUnread(p)) return;
    marking = true;
    var btn = document.getElementById('markread');
    if (btn) btn.disabled = true;
    // Show it as read straight away, then save. If saving fails, put it back.
    p.readAt = new Date().toISOString();
    p._pending = true;
    var f = state.flow || (state.flow = { total: 1, done: 0, justRead: [] });
    f.justRead.push(p.id);
    f.done += 1;
    toast('Marked as read');
    var failed = false, advanced = false;
    api('markRead', { postId: p.id }).then(function (res) {
      if (!res || !res.ok) throw new Error('not saved');
      p.readAt = res.readAt || p.readAt;
      p._pending = false;
      saveLocalSnapshot();
    }).catch(function () {
      // Put the post back exactly as it was so nothing looks read that isn't.
      failed = true;
      p.readAt = ''; p._pending = false;
      f.justRead = f.justRead.filter(function (x) { return x !== p.id; });
      f.done = Math.max(0, f.done - 1);
      toast('That didn\'t save. Check your connection and try again.');
      if (!advanced) { marking = false; render(); }
      else if (state.view === 'done') { state.flow = null; openPost(p.id, { replace: true, anim: 'fade' }); }
      else render();
    });
    setTimeout(function () {
      if (failed) return;
      advanced = true;
      marking = false;
      var next = unreadQueue()[0];
      if (next) openPost(next.id, { keepFlow: true, replace: true, anim: 'slide' });
      else showDone();
    }, 380);
  }

  function saveLocalSnapshot() {
    saveCache({ ok: true, me: state.me, settings: state.settings, categories: state.categories,
      canPost: state.canPost, people: state.people, defaultCategory: state.defaultCategory, resources: state.resources, contacts: state.contacts,
      posts: state.posts.map(function (p) { var c = Object.assign({}, p); delete c._pending; return c; }) });
  }


  /* ---------- Photos ---------- */

  function loadPhoto(id) {
    var p = byId(id), box = app.querySelector('.photo[data-photo]');
    if (!p || !p.photo || !box) return;
    function show(src) {
      var now = app.querySelector('.photo[data-photo="' + id + '"]');
      if (now) now.innerHTML = '<img src="' + src + '" alt="Photo for this post">';
    }
    if (state.photos[id]) return show(state.photos[id]);
    api('getPhoto', { postId: id }).then(function (res) {
      if (!res || !res.ok) throw new Error('no photo');
      state.photos[id] = res.data;
      show(res.data);
    }).catch(function () {
      var now = app.querySelector('.photo[data-photo="' + id + '"]');
      if (now) now.innerHTML = '<span class="photo-fail">' + icon('refresh-cw') + 'Photo didn\'t load. Tap to try again.</span>';
    });
  }

  function showPhotoFull(src) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = '<button class="viewer-close" aria-label="Close photo">' + icon('x') + '</button><img src="' + src + '" alt="Photo for this post">';
    v.addEventListener('click', function (e) { if (e.target.tagName !== 'IMG') v.remove(); });
    document.body.appendChild(v);
  }

  /** Shrinks a chosen photo in the browser so posts stay quick to load. */
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var tries = [[1100, 0.7], [960, 0.62], [800, 0.55], [640, 0.5]], out = null;
          for (var i = 0; i < tries.length; i++) {
            var scale = Math.min(1, tries[i][0] / Math.max(img.naturalWidth, img.naturalHeight));
            var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
            out = { data: c.toDataURL('image/jpeg', tries[i][1]), w: w, h: h };
            if (out.data.length < 240000) break;
          }
          var side = Math.min(img.naturalWidth, img.naturalHeight), tc = document.createElement('canvas');
          tc.width = tc.height = 200;
          tc.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 200, 200);
          out.thumb = tc.toDataURL('image/jpeg', 0.55);
          URL.revokeObjectURL(url);
          resolve(out);
        } catch (err) { reject(err); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  /* ---------- Writing and editing a post ---------- */

  var DRAFT_KEY = 'vwp.draft';
  function blankDraft() {
    return { id: '', title: '', body: '', categoryId: state.defaultCategory || (state.categories[0] || {}).id || '',
      pinned: false, needsRead: true, readBy: '', audience: 'everyone', audienceIds: [], buttonText: '',
      links: [{ label: '', url: '' }, { label: '', url: '' }], eventDate: '', skipEmail: false,
      photo: null, hasPhoto: false, removePhoto: false, more: false, dirty: false, authorId: state.me.id, when: 'now', publishLocal: '', wasStatus: '' };
  }
  function saveDraft() {
    var d = state.draft;
    if (!d || d.id) return; // only brand-new posts are kept as a draft
    var copy = Object.assign({}, d); copy.photo = null; // photos are too big to keep here
    lsSet(DRAFT_KEY, JSON.stringify(copy));
  }
  function isPromo(id) { return /promo|event/i.test(id + ' ' + cat(id).name); }

  function openCompose(id) {
    if (!state.canPost) return;
    var d = blankDraft();
    if (id) {
      var p = byId(id);
      if (!p || !p.canEdit) return;
      Object.assign(d, { id: p.id, title: p.title, body: p.body, categoryId: p.categoryId, pinned: p.pinned,
        needsRead: p.needsRead, readBy: p.readBy, audience: p.audience || 'everyone', audienceIds: (p.audienceIds || []).slice(),
        buttonText: p.buttonText, eventDate: p.eventDate, skipEmail: !!p.skipEmail, hasPhoto: !!p.photo, authorId: p.authorId || state.me.id });
      (p.links || []).forEach(function (l, i) { if (i < 2) d.links[i] = { label: l.label, url: l.url }; });
      d.wasStatus = p.status || '';
      if (p.status === 'scheduled') { d.when = 'later'; d.publishLocal = localInput(p.publishAt); }
      d.more = !!(d.buttonText || d.links[0].url || d.pinned || d.skipEmail || d.authorId !== state.me.id);
    } else {
      try { var saved = JSON.parse(lsGet(DRAFT_KEY) || 'null'); if (saved && (saved.title || saved.body)) { d = Object.assign(d, saved); d.restored = true; } } catch (e) {}
    }
    state.draft = d; state.view = 'compose';
    pushRoute('#/compose');
    render('fade');
    window.scrollTo(0, 0);
    if (d.restored) { d.restored = false; toast('We kept your draft from last time'); }
  }

  /** Studio wall-clock time (Eastern) for a date and time box, as YYYY-MM-DDTHH:mm. */
  function studioClock(d) {
    var o = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
    return o.year + '-' + o.month + '-' + o.day + 'T' + (o.hour === '24' ? '00' : o.hour) + ':' + o.minute;
  }
  function clockMs(str) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(str || '');
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
  }
  /** Turns a studio wall-clock time into an exact moment, allowing for daylight saving. */
  function studioToIso(str) {
    var want = clockMs(str);
    if (isNaN(want)) return '';
    var guess = want;
    for (var i = 0; i < 3; i++) guess += want - clockMs(studioClock(new Date(guess)));
    return new Date(guess).toISOString();
  }
  window.__vwpTest = studioToIso;
  function localInput(iso) { return studioClock(iso ? new Date(iso) : new Date(Date.now() + 3600000)); }
  function notOutYet(d) { return !d.id || !!d.wasStatus; }

  function leaveCompose() {
    var d = state.draft;
    if (d && d.id && d.dirty) {
      return sheet('<h2>Leave without saving?</h2><p>Your changes to this post will be lost.</p>' +
        '<button class="btn btn-primary" data-sheet="leave">Leave</button><button class="btn btn-ghost" data-sheet="close">Keep editing</button>');
    }
    closeCompose();
  }
  function closeCompose() {
    var d = state.draft; state.draft = null;
    if (d && d.id && byId(d.id)) { state.view = 'post'; state.postId = d.id; replaceRoute('#/post/' + d.id); render('fade'); }
    else goTab(state.tab === 'bulletins' ? 'bulletins' : 'home', false);
    window.scrollTo(0, 0);
  }

  function toggle(key, on, label, hint) {
    return '<button class="switch-row" role="switch" aria-checked="' + !!on + '" data-toggle="' + key + '">' +
      '<span class="switch-text"><span class="switch-label">' + label + '</span>' + (hint ? '<span class="switch-hint">' + hint + '</span>' : '') + '</span>' +
      '<span class="switch' + (on ? ' on' : '') + '"><span></span></span></button>';
  }
  function audienceCount(d) {
    if (d.audience === 'apprentices') return state.people.filter(function (x) { return x.apprentice; }).length;
    if (d.audience === 'people') return d.audienceIds.length;
    return state.people.length;
  }
  function audienceWords(d) {
    var n = audienceCount(d);
    if (d.audience === 'apprentices') return 'Apprentices (' + n + (n === 1 ? ' person)' : ' people)');
    if (d.audience === 'people') {
      var names = state.people.filter(function (x) { return d.audienceIds.indexOf(x.id) !== -1; }).map(function (x) { return x.firstName; });
      return names.length <= 3 ? names.join(', ') : names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more';
    }
    return 'Everyone (' + n + ' people)';
  }

  function photoField(d) {
    if (d.photo) return '<div class="photo-pick has"><img src="' + d.photo.data + '" alt="Chosen photo"><button class="photo-x" data-rmphoto="1" aria-label="Remove photo">' + icon('x') + '</button></div>';
    if (d.hasPhoto && !d.removePhoto) {
      return '<div class="photo-pick has">' + (state.photos[d.id] ? '<img src="' + state.photos[d.id] + '" alt="Current photo">' : '<div class="photo-note">This post has a photo.</div>') +
        '<button class="photo-x" data-rmphoto="1" aria-label="Remove photo">' + icon('x') + '</button></div>';
    }
    return '<button class="photo-pick" data-addphoto="1">' + icon('plus') + '<span>Add a photo</span><small>Optional. One per post.</small></button>';
  }

  function postAs(d) {
    var who = state.people.filter(function (x) { return x.role === 'admin' || x.role === 'poster'; });
    if (state.me.role !== 'admin' || who.length < 2) return '';
    return '<div class="lbl">Posted by <span class="opt">shows as their post</span></div><div class="chips wrap">' + who.map(function (x) {
      var on = d.authorId === x.id;
      return '<button class="chip' + (on ? ' on' : '') + '" data-author="' + esc(x.id) + '" aria-pressed="' + on + '">' + esc(x.id === state.me.id ? 'Me' : x.firstName) + '</button>';
    }).join('') + '</div>';
  }

  function renderCompose() {
    var d = state.draft, editing = !!d.id;
    var cats = activeCats().map(function (c) {
      var on = d.categoryId === c.id;
      return '<button class="chip' + (on ? ' on' : '') + '" data-cat="' + esc(c.id) + '" aria-pressed="' + on + '"><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</button>';
    }).join('');
    var auds = [['everyone', 'Everyone'], ['apprentices', 'Apprentices'], ['people', 'Selected people']].map(function (a) {
      var on = d.audience === a[0];
      return '<button class="seg-btn' + (on ? ' on' : '') + '" data-aud="' + a[0] + '" aria-pressed="' + on + '">' + a[1] + '</button>';
    }).join('');
    var people = d.audience !== 'people' ? '' : '<div class="people">' + state.people.map(function (x) {
      var on = d.audienceIds.indexOf(x.id) !== -1;
      return '<button class="person' + (on ? ' on' : '') + '" data-person="' + esc(x.id) + '" aria-pressed="' + on + '"><span class="tick">' + (on ? icon('check') : '') + '</span>' + esc(x.name) + '</button>';
    }).join('') + '</div>';
    var today = dayKey(new Date());
    var linkRows = d.links.map(function (l, i) {
      return '<div class="pair"><input class="input" data-f="link' + i + 'label" maxlength="40" placeholder="Button label, like Sign up" value="' + esc(l.label) + '" aria-label="Link ' + (i + 1) + ' label">' +
        '<input class="input" data-f="link' + i + 'url" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="https://" value="' + esc(l.url) + '" aria-label="Link ' + (i + 1) + ' address"></div>';
    }).join('');

    return '<div class="screen compose">' +
      '<div class="post-top"><button class="back" data-back="1" aria-label="Close">' + icon('x') + '</button>' +
      '<div class="compose-head">' + (editing ? 'Edit post' : 'New post') + '</div><span class="back-spacer"></span></div>' +

      '<label class="lbl" for="f-title">Title</label>' +
      '<textarea class="input title-input" id="f-title" data-f="title" rows="1" maxlength="140" placeholder="What is this about?">' + esc(d.title) + '</textarea>' +

      '<div class="lbl-row"><label class="lbl" for="f-body">Post</label><div class="fmt">' +
        '<button data-fmt="bold" aria-label="Bold"><b>B</b> Bold</button><button data-fmt="list" aria-label="Bullet list">' + icon('list') + 'List</button></div></div>' +
      '<textarea class="input body-input" id="f-body" data-f="body" rows="7" placeholder="Write it the way you\'d say it. Links you paste become tappable.">' + esc(d.body) + '</textarea>' +

      '<div class="lbl">Photo</div><div id="photo-field">' + photoField(d) + '</div>' +
      '<input type="file" id="photo-input" accept="image/*" hidden>' +

      '<div class="lbl">Category</div><div class="chips wrap">' + cats + '</div>' +
      (isPromo(d.categoryId) ? '<label class="lbl" for="f-event">Event or end date <span class="opt">optional</span></label><input class="input" type="date" id="f-event" data-f="eventDate" value="' + esc(d.eventDate) + '">' : '') +

      '<div class="lbl">Who sees it</div><div class="seg-group">' + auds + '</div>' + people +

      (notOutYet(d) ? '<div class="lbl">When it goes out</div><div class="seg-group">' +
        '<button class="seg-btn' + (d.when !== 'later' ? ' on' : '') + '" data-when="now">Now</button><button class="seg-btn' + (d.when === 'later' ? ' on' : '') + '" data-when="later">Later</button></div>' +
        (d.when === 'later' ? '<input class="input" type="datetime-local" id="f-when" data-f="publishLocal" min="' + localInput(new Date().toISOString()) + '" value="' + esc(d.publishLocal) + '" aria-label="Date and time to post" style="margin-top:8px"><p class="fine" style="margin-top:6px">Studio time (Eastern).</p>' : '') : '') +
      '<div class="group">' + toggle('needsRead', d.needsRead, 'Needs to be marked read', 'People tap "Mark as read" and you can see who has.') + '</div>' +
      (d.needsRead ? '<label class="lbl" for="f-readby">Read by <span class="opt">optional</span></label><input class="input" type="date" id="f-readby" data-f="readBy" min="' + today + '" value="' + esc(d.readBy) + '">' : '') +

      '<button class="more-btn" data-more="1" aria-expanded="' + !!d.more + '">' + (d.more ? 'Fewer options' : 'More options') + icon(d.more ? 'chevron-left' : 'chevron-right') + '</button>' +
      (d.more ? '<div class="more">' +
        '<div class="group">' + toggle('pinned', d.pinned, 'Pin to the top', 'Stays first in Bulletins until you unpin it.') +
          toggle('skipEmail', d.skipEmail, 'Skip the email for this post', 'People will only see it when they open the app.') + '</div>' +
        (d.needsRead ? '<label class="lbl" for="f-btn">Wording for the Mark as read button <span class="opt">optional</span></label><input class="input" id="f-btn" data-f="buttonText" maxlength="40" placeholder="Mark as read" value="' + esc(d.buttonText) + '">' : '') +
        '<div class="lbl">Link buttons <span class="opt">up to two</span></div>' + linkRows + postAs(d) +
        (editing ? '<button class="danger-link" data-archive="1">Remove this post</button>' : '') +
      '</div>' : '') +
    '</div>' +
    '<div class="readbar"><div class="readbar-in"><div class="readbar-row">' +
      (notOutYet(d) ? '<button class="btn btn-outline draft-btn" data-savedraft="1">Save draft</button>' : '') +
      '<button class="btn btn-primary" data-submit="1">' + (!notOutYet(d) ? 'Save changes' : d.when === 'later' ? 'Review and schedule' : 'Review and post') + '</button></div></div></div>';
  }

  function rerenderCompose() {
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
    grow(document.getElementById('f-title'));
  }
  function grow(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }

  function composeInput(e) {
    var d = state.draft, f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!d || !f) return false;
    var v = e.target.value, m = /^link(\d)(label|url)$/.exec(f);
    if (m) d.links[+m[1]][m[2]] = v; else d[f] = v;
    d.dirty = true;
    if (f === 'title') grow(e.target);
    saveDraft();
    return true;
  }

  document.addEventListener('change', function (e) {
    if (e.target.id !== 'photo-input' || !state.draft) return;
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var field = document.getElementById('photo-field');
    if (field) field.innerHTML = '<div class="photo-pick busy"><span class="sk" style="position:absolute;inset:0;border-radius:18px"></span><span style="position:relative">Getting your photo ready</span></div>';
    shrinkPhoto(file).then(function (out) {
      if (!state.draft) return;
      state.draft.photo = out; state.draft.removePhoto = false; state.draft.dirty = true;
      var fld = document.getElementById('photo-field'); if (fld) fld.innerHTML = photoField(state.draft);
    }).catch(function () {
      var fld = document.getElementById('photo-field'); if (fld && state.draft) fld.innerHTML = photoField(state.draft);
      toast('That file isn\'t a photo we can use. Try another one.');
    });
  });

  function composeClick(e) {
    var ph = e.target.closest('[data-photo]');
    if (ph) {
      var pid = ph.getAttribute('data-photo');
      if (state.photos[pid]) showPhotoFull(state.photos[pid]); else { ph.innerHTML = '<span class="sk"></span>'; loadPhoto(pid); }
      return;
    }
    var sh = e.target.closest('[data-sheet]');
    if (sh) return sheetAction(sh.getAttribute('data-sheet'), sh.getAttribute('data-arg') || '');
    if (e.target.classList && e.target.classList.contains('sheet-wrap')) return closeSheet();
    if (stage4Click(e)) return;
    var t = e.target.closest('[data-when],[data-savedraft],[data-fmt],[data-author],[data-compose],[data-edit],[data-cat],[data-aud],[data-person],[data-toggle],[data-more],[data-addphoto],[data-rmphoto],[data-submit],[data-archive]');
    if (!t) return;
    if (t.hasAttribute('data-compose')) return openCompose('');
    if (t.hasAttribute('data-edit')) return openCompose(t.getAttribute('data-edit'));
    var d = state.draft;
    if (!d) return;
    if (t.hasAttribute('data-addphoto')) return document.getElementById('photo-input').click();
    if (t.hasAttribute('data-fmt')) return formatBody(t.getAttribute('data-fmt'));
    if (t.hasAttribute('data-submit')) return submitPost();
    if (t.hasAttribute('data-savedraft')) return saveDraftToServer();
    if (t.hasAttribute('data-when')) { d.when = t.getAttribute('data-when'); if (d.when === 'later' && !d.publishLocal) d.publishLocal = localInput(''); d.dirty = true; saveDraft(); return rerenderCompose(); }
    if (t.hasAttribute('data-archive')) {
      return sheet('<h2>Remove this post?</h2><p>It disappears from the app for everyone. The record stays in your Sheet.</p>' +
        '<button class="btn btn-danger" data-sheet="archive">Remove post</button><button class="btn btn-ghost" data-sheet="close">Keep it</button>');
    }
    d.dirty = true;
    if (t.hasAttribute('data-rmphoto')) { d.photo = null; if (d.hasPhoto) d.removePhoto = true; document.getElementById('photo-field').innerHTML = photoField(d); return; }
    if (t.hasAttribute('data-cat')) d.categoryId = t.getAttribute('data-cat');
    else if (t.hasAttribute('data-author')) d.authorId = t.getAttribute('data-author');
    else if (t.hasAttribute('data-aud')) d.audience = t.getAttribute('data-aud');
    else if (t.hasAttribute('data-person')) {
      var id = t.getAttribute('data-person'), i = d.audienceIds.indexOf(id);
      if (i === -1) d.audienceIds.push(id); else d.audienceIds.splice(i, 1);
    }
    else if (t.hasAttribute('data-toggle')) { var k = t.getAttribute('data-toggle'); d[k] = !d[k]; }
    else if (t.hasAttribute('data-more')) { d.more = !d.more; d.dirty = d.dirty && true; }
    saveDraft();
    rerenderCompose();
  }

  /* A small sheet that slides up from the bottom for confirmations. */
  function sheet(html) {
    closeSheet();
    toastEl.classList.remove('show');
    var w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(w);
  }
  function closeSheet() { var w = document.querySelector('.sheet-wrap'); if (w) w.remove(); }
  function sheetAction(what, arg) {
    if (what === 'close') return closeSheet();
    if (teamSheetAction(what, arg)) return;
    if (what === 'saveres' || what === 'removeres') return saveResource(what === 'removeres');
    if (what === 'leave') { closeSheet(); return closeCompose(); }
    if (what === 'post') return sendPost('');
    if (what === 'picklater') {
      var dd = state.draft; closeSheet();
      if (!dd) return;
      dd.when = 'later'; if (!dd.publishLocal) dd.publishLocal = localInput('');
      saveDraft(); rerenderCompose();
      var box = document.getElementById('f-when'); if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
      return toast('Pick the date and time, then tap Review and schedule');
    }
    if (what === 'small' || what === 'real') return sendPost(what);
    if (what === 'archive') return archivePost();
  }

  function focusField(id) { var el = document.getElementById(id); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }

  function submitPost() {
    var d = state.draft;
    if (!d.title.trim()) { toast('Add a title'); return focusField('f-title'); }
    if (!d.body.trim()) { toast('Add the post text'); return focusField('f-body'); }
    if (d.audience === 'people' && !d.audienceIds.length) return toast('Pick at least one person');
    for (var i = 0; i < 2; i++) {
      var l = d.links[i];
      if (l.label.trim() && !l.url.trim()) { d.more = true; rerenderCompose(); return toast('Add the link for "' + l.label.trim() + '"'); }
      if (l.url.trim() && !/^(https?:\/\/|sms:|tel:|mailto:)\S+$/i.test(l.url.trim())) { d.more = true; rerenderCompose(); return toast('Links need to start with https://'); }
    }
    var later = notOutYet(d) && d.when === 'later';
    var whenIso = later ? studioToIso(d.publishLocal) : '';
    if (later && (!whenIso || new Date(whenIso).getTime() < Date.now() + 120000)) { toast('Pick a date and time in the future'); return focusField('f-when'); }
    var who = audienceWords(d);
    if (notOutYet(d)) {
      var lines = '<div class="sum"><span>Goes out</span><b>' + (later ? esc(whenFull(whenIso)) : 'Now') + '</b></div>' +
        '<div class="sum"><span>Category</span><b>' + esc(cat(d.categoryId).name) + '</b></div>' +
        '<div class="sum"><span>Goes to</span><b>' + esc(who) + '</b></div>' +
        '<div class="sum"><span>Mark as read</span><b>' + (d.needsRead ? (d.readBy ? 'Yes, by ' + fullDate(d.readBy) : 'Yes') : 'Not needed') + '</b></div>' +
        (d.needsRead ? '<div class="sum"><span>Email</span><b>' + esc(emailLine(d, later)) + '</b></div>' : '');
      return sheet('<h2>' + (later ? 'Ready to schedule?' : 'Ready to post?') + '</h2><p class="sheet-title">' + esc(d.title.trim()) + '</p>' + lines +
        '<button class="btn btn-primary" data-sheet="post">' + (later ? 'Schedule it' : 'Post now') + '</button>' +
        (later ? '' : '<button class="btn btn-outline" data-sheet="picklater">' + icon('clock') + 'Schedule for later</button>') + '<button class="btn btn-ghost" data-sheet="close">Keep editing</button>');
    }
    var p = byId(d.id);
    if (!d.needsRead || !(p && p.needsRead)) return sendPost('small');
    sheet('<h2>Small fix or real change?</h2>' +
      '<button class="choice" data-sheet="small"><b>Small fix</b><span>A typo or a tidy-up. Nobody is asked to read it again.</span></button>' +
      '<button class="choice" data-sheet="real"><b>Real change</b><span>The meaning changed. Everyone reads it again and it gets an Updated tag.</span></button>' +
      '<button class="btn btn-ghost" data-sheet="close">Keep editing</button>');
  }

  function saveDraftToServer() {
    var d = state.draft; if (!d) return;
    if (!d.title.trim()) { toast('Give the draft a title first'); return focusField('f-title'); }
    sendPost('', true);
  }

  function emailLine(d, later) {
    var m = state.settings.emailMode;
    if (d.skipEmail) return 'Skipped for this post';
    if (m === 'live') return later ? 'Sent when it goes out' : 'Yes, to everyone it goes to';
    if (m === 'test') return 'Test only. The team gets nothing.';
    return 'Off for now';
  }
  function emailToast(res, word) {
    var e = res.email;
    if (!e || e.skipped || e.mode === 'off') return word;
    if (e.quota) return word + '. The email didn\'t go out: today\'s limit is used up.';
    if (e.error) return word + '. The email didn\'t send, so nudge people later.';
    if (e.mode === 'test') return e.sent ? word + '. One test email went to the test address only.' : word;
    return e.sent ? word + ' and emailed ' + e.sent + (e.sent === 1 ? ' person' : ' people') : word;
  }

  var sending = false;
  function sendPost(change, asDraft) {
    if (sending) return;
    var d = state.draft; if (!d) return;
    var later = !asDraft && notOutYet(d) && d.when === 'later';
    if (asDraft) sheet('<div class="sheet-busy"></div>');
    sending = true;
    var box = document.querySelector('.sheet');
    if (box) box.innerHTML = '<div class="sheet-busy"><div class="sk" style="width:48px;height:48px;border-radius:50%"></div><p>' + (asDraft ? 'Saving your draft' : later ? 'Scheduling' : d.id && !d.wasStatus ? 'Saving' : 'Posting') + (d.photo ? ' and sending the photo' : '') + '</p></div>';
    api('savePost', {
      change: change || '', removePhoto: !!d.removePhoto, photo: d.photo ? { data: d.photo.data, w: d.photo.w, h: d.photo.h } : null, thumb: d.photo ? d.photo.thumb : '',
      post: { id: d.id, status: asDraft ? 'draft' : '', publishAt: later ? studioToIso(d.publishLocal) : '', authorId: d.authorId, title: d.title, body: d.body, categoryId: d.categoryId, pinned: d.pinned, needsRead: d.needsRead,
        readBy: d.readBy, audience: d.audience, audienceIds: d.audienceIds, buttonText: d.buttonText,
        links: d.links, eventDate: isPromo(d.categoryId) ? d.eventDate : '', skipEmail: d.skipEmail }
    }, 75000).then(function (res) {
      sending = false;
      closeSheet();
      if (!res || !res.ok) { toast((res && res.message) || 'That didn\'t save. Try again.'); return; }
      state.posts = res.posts || state.posts;
      if (d.photo) state.photos[res.postId] = d.photo.data; else if (d.removePhoto) delete state.photos[res.postId];
      if (!d.id) lsSet(DRAFT_KEY, '');
      state.draft = null; state.flow = null;
      saveLocalSnapshot();
      if (res.status) { // a draft or a scheduled post is not out yet, so go to the list where it waits
        goTab('bulletins', false);
        var made = byId(res.postId);
        toast(res.status === 'draft' ? 'Draft saved' : 'Scheduled for ' + (made ? whenFull(made.publishAt) : 'later'));
        return;
      }
      state.view = 'post'; state.postId = res.postId;
      replaceRoute('#/post/' + res.postId);
      render('fade'); window.scrollTo(0, 0);
      toast(res.isNew || d.wasStatus ? emailToast(res, 'Posted') : res.real ? emailToast(res, 'Saved. Everyone is asked to read it again') : 'Saved');
    }).catch(function () {
      sending = false; closeSheet();
      toast('That didn\'t send. Check your connection and try again. Your post is still here.');
    });
  }

  function archivePost() {
    var d = state.draft; if (!d || !d.id || sending) return;
    sending = true;
    api('archivePost', { postId: d.id }).then(function (res) {
      sending = false; closeSheet();
      if (!res || !res.ok) return toast((res && res.message) || 'That didn\'t work. Try again.');
      state.posts = res.posts || state.posts; state.draft = null; saveLocalSnapshot();
      goTab('bulletins', false);
      toast('Post removed');
    }).catch(function () { sending = false; closeSheet(); toast('That didn\'t work. Check your connection and try again.'); });
  }


  /* ---------- Bold and bullet buttons ---------- */

  function formatBody(kind) {
    var ta = document.getElementById('f-body'), d = state.draft;
    if (!ta || !d) return;
    var v = ta.value, a = ta.selectionStart || 0, b = ta.selectionEnd || 0, selA, selB;
    if (kind === 'bold') {
      var inner = v.slice(a, b) || 'bold text';
      v = v.slice(0, a) + '**' + inner + '**' + v.slice(b);
      selA = a + 2; selB = a + 2 + inner.length;
    } else {
      var start = v.lastIndexOf('\n', a - 1) + 1, end = v.indexOf('\n', b); if (end === -1) end = v.length;
      var block = v.slice(start, end).split('\n').map(function (l) { return /^\s*[-•*]\s+/.test(l) ? l : '- ' + l; }).join('\n');
      v = v.slice(0, start) + block + v.slice(end);
      selA = selB = start + block.length;
    }
    ta.value = v; d.body = v; d.dirty = true; saveDraft();
    ta.focus(); try { ta.setSelectionRange(selA, selB); } catch (e) {}
  }

  /* ---------- Who has read ---------- */

  function whenText(iso) {
    if (!iso) return '';
    var d = asDate(iso), time = fmt(iso, { hour: 'numeric', minute: '2-digit' });
    return dayKey(d) === dayKey(new Date()) ? 'today at ' + time : fullDate(iso);
  }

  function loadReaders(id) {
    state.readers = null;
    api('readers', { postId: id }).then(function (res) {
      if (state.postId !== id) return;
      if (res && res.ok) { state.readers = res; var p = byId(id); if (p && p.stats) { p.stats.read = res.groups.read.length; p.stats.total = res.groups.read.length + res.groups.opened.length + res.groups.notOpened.length; } }
      else state.readers = { postId: id, error: (res && res.message) || 'That didn\'t load.' };
      if (state.view === 'readers') render();
    }).catch(function () { state.readers = { postId: id, error: 'Can\'t connect right now.' }; if (state.view === 'readers') render(); });
  }
  function openReaders(id) {
    state.view = 'readers'; state.postId = id;
    pushRoute('#/readers/' + id);
    loadReaders(id);
    render('fade'); window.scrollTo(0, 0);
  }

  function renderReaders() {
    var p = byId(state.postId), r = state.readers;
    var top = '<div class="screen post-screen"><div class="post-top"><button class="back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button>' +
      '<div class="compose-head">Who has read</div><span class="back-spacer"></span></div>' +
      '<p class="readers-title">' + esc(p ? p.title : '') + '</p>';
    if (!r) return top + '<div class="sk" style="height:86px;border-radius:20px;margin-top:16px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:26px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:10px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:10px"></div></div>';
    if (r.error) return top + '<div class="empty"><div class="bubble sm coral">' + icon('wifi-off') + '</div><div class="calm-title">' + esc(r.error) + '</div><button class="btn btn-outline sm" data-readers="' + esc(state.postId) + '" data-reload="1">Try again</button></div></div>';
    var g = r.groups, total = g.read.length + g.opened.length + g.notOpened.length, left = g.opened.length + g.notOpened.length;
    var pct = total ? Math.round(g.read.length / total * 100) : 0;
    function rows(list, kind) {
      return '<div class="rows-list">' + list.map(function (x) {
        var sub = kind === 'read' ? 'Read ' + whenText(x.at)
          : kind === 'opened' ? 'Opened ' + whenText(x.at)
          : (x.lastVisit ? 'Last in the app ' + whenText(x.lastVisit) : 'Hasn\'t opened the app yet');
        if (kind !== 'read' && x.nudgedAt) sub += ' · Nudged ' + whenText(x.nudgedAt);
        return '<div class="person-row"><span class="person-row-text"><span class="person-name">' + esc(x.name) + '</span><span class="person-sub">' + esc(sub) + '</span></span>' +
          (kind === 'read' ? '<span class="row-read">' + icon('check') + '</span>' : '<button class="mini-btn" data-nudge="' + esc(x.id) + '">Nudge</button>') + '</div>';
      }).join('') + '</div>';
    }
    function section(label, list, kind) { return list.length ? '<h2 class="section-label">' + label + ' <span class="n">' + list.length + '</span></h2>' + rows(list, kind) : ''; }
    return top +
      '<div class="tally"><div class="tally-top"><b>' + g.read.length + ' of ' + total + ' read</b><span>' + (left ? left + ' to go' : 'Everyone has read it') + '</span></div>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>' +
      (left ? '<button class="btn btn-outline" data-nudge="all" style="margin-top:14px">' + icon('mail') + 'Nudge all ' + left + '</button>' : '') +
      (total ? '' : '<p class="muted" style="margin-top:16px">Nobody is in this post\'s audience right now.</p>') +
      section('Read', g.read, 'read') + section('Opened but not marked', g.opened, 'opened') + section('Not opened', g.notOpened, 'not') +
      '<p class="fine">The full record is in your Sheet, in the Reads and Views tabs.</p></div>' +
      '<div class="readbar quiet"><div class="readbar-in"><div class="readbar-row"><button class="bar-back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button><button class="back-text" data-back="1">Back to the post</button></div></div></div>';
  }

  function nudge(who) {
    var r = state.readers; if (!r || !r.groups) return;
    var ids = who === 'all' ? r.groups.opened.concat(r.groups.notOpened).map(function (x) { return x.id; }) : [who];
    api('nudge', { postId: state.postId, ids: ids }).then(function (res) {
      if (!res || !res.ok) return toast((res && res.message) || 'That didn\'t send.');
      if (res.mode === 'test') return toast('Test nudge sent to the test address only. The team got nothing.');
      var now = new Date().toISOString(), g = state.readers && state.readers.groups;
      if (g) g.opened.concat(g.notOpened).forEach(function (x) { if ((res.nudged || []).indexOf(x.id) !== -1) x.nudgedAt = now; });
      if (state.view === 'readers') { var y = window.scrollY; render(); window.scrollTo(0, y); }
      toast(res.sent === 1 ? 'Nudge sent' : 'Nudged ' + res.sent + ' people');
    }).catch(function () { toast('That didn\'t send. Check your connection.'); });
  }

  /* ---------- Team screen (admins) ---------- */

  var ROLE_WORDS = { admin: 'Admin', poster: 'Poster', member: 'Team member' };
  var SWATCHES = ['#3F5FC0', '#7B52B9', '#4E8A6B', '#B8892B', '#C9432F', '#2E8C9A', '#C25B8E', '#5A6470'];

  function loadTeam() {
    api('team').then(function (res) {
      if (res && res.ok) applyTeam(res); else state.team = { error: (res && res.message) || 'That didn\'t load.' };
      if (state.view === 'tab' && state.tab === 'team') render();
    }).catch(function () { state.team = { error: 'Can\'t connect right now.' }; if (state.view === 'tab' && state.tab === 'team') render(); });
  }
  function applyTeam(res) {
    state.team = res;
    state.settings = res.settings || state.settings;
    state.categories = res.categories || state.categories;
    if (res.newK) { // my own link changed: switch to it so I stay signed in
      state.k = res.newK; lsSet(STORE_KEY, res.newK);
      try { history.replaceState(history.state, '', location.pathname + '?k=' + res.newK + location.hash); } catch (e) {}
    }
    saveLocalSnapshot();
  }
  function person(id) { return ((state.team && state.team.team) || []).filter(function (x) { return x.id === id; })[0]; }
  function linkFor(x) { return location.origin + location.pathname + '?k=' + x.token; }

  function mySettings() {
    var me = state.me;
    return '<h2 class="section-label"' + (state.canPost || state.me.role === 'admin' ? '' : ' style="margin-top:4px"') + '>Text size on this phone</h2>' + textSizeControl() +
      '<p class="fine" style="margin-top:10px">Makes everything in the app bigger. It only changes this phone.</p>' +
      '<h2 class="section-label">Keep the app handy</h2><div class="card"><p><b>iPhone:</b> open your link in Safari, tap the Share button, then "Add to Home Screen."</p>' +
      '<p style="margin-top:10px"><b>Android:</b> open it in Chrome, tap the three dots, then "Add to Home screen."</p></div>' +
      '<h2 class="section-label">You</h2><div class="card"><div class="rows" style="margin-top:0">' +
        '<div class="row"><span class="muted">Signed in as</span><b>' + esc(me.name) + '</b></div>' +
        '<div class="row"><span class="muted">Role</span><b>' + esc(ROLE_WORDS[me.role] || 'Team member') + (me.apprentice ? ', Apprentice' : '') + '</b></div></div></div>' +
      '<button class="link-btn" data-tab="contact">' + icon('message-circle') + 'Something not working? Text the studio' + icon('chevron-right') + '</button>';
  }

  function renderTeam() {
    var t = state.team;
    var head = '<div class="screen"><h1 class="page-title">Settings</h1>';
    if (state.canPost || state.me.role === 'admin') head += '<h2 class="section-label" style="margin-top:4px">Edit mode</h2><div class="group" style="margin-top:0">' +
      toggle('edit', editing(), 'Show editing tools', 'Turns on New post, pencils, drafts, and read counts. Off shows the app the way the team sees it.').replace('data-toggle="edit"', 'data-editmode="1"') + '</div>';
    head += mySettings();
    if (state.me.role !== 'admin') return head + '</div>';
    head += '<h1 class="page-title sub-title">Team</h1>';
    if (!t) { loadTeam(); return head + '<div class="sk" style="height:56px;border-radius:16px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:26px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:10px"></div><div class="sk" style="height:64px;border-radius:18px;margin-top:10px"></div></div>'; }
    if (t.error) return head + '<div class="empty"><div class="bubble sm coral">' + icon('wifi-off') + '</div><div class="calm-title">' + esc(t.error) + '</div><button class="btn btn-outline sm" data-teamreload="1">Try again</button></div></div>';
    function row(x) {
      var tags = (x.role !== 'member' ? '<span class="badge">' + ROLE_WORDS[x.role] + '</span>' : '') + (x.apprentice ? '<span class="badge soft">Apprentice</span>' : '');
      return '<button class="person-row tap" data-person-open="' + esc(x.id) + '"><span class="person-row-text"><span class="person-name">' + esc(x.name) + tags + '</span>' +
        '<span class="person-sub">' + (x.deactivated ? 'Deactivated. Link is off.' : x.lastVisit ? 'Last in the app ' + esc(whenText(x.lastVisit)) : 'Hasn\'t opened the app yet') + '</span></span>' + icon('chevron-right') + '</button>';
    }
    var on = t.team.filter(function (x) { return !x.deactivated; }), off = t.team.filter(function (x) { return x.deactivated; });
    var cats = t.categories.filter(function (c) { return !c.archived; }).map(function (c) {
      return '<button class="person-row tap" data-cat-open="' + esc(c.id) + '"><span class="dot" style="background:' + esc(c.color) + '"></span><span class="person-row-text"><span class="person-name">' + esc(c.name) + '</span></span>' + icon('pencil') + '</button>';
    }).join('');
    return head +
      '<button class="btn btn-primary" data-person-add="1">' + icon('plus') + 'Add team member</button>' +
      '<h2 class="section-label">On the team <span class="n">' + on.length + '</span></h2><div class="rows-list">' + on.map(row).join('') + '</div>' +
      (off.length ? '<h2 class="section-label">Deactivated <span class="n">' + off.length + '</span></h2><div class="rows-list">' + off.map(row).join('') + '</div>' : '') +
      '<h2 class="section-label">App settings</h2>' +
      '<div class="group" style="margin-top:0">' + toggle('beta', state.settings.beta, 'Show the Beta tag', 'The small tag beside VILLAGE WEST on Home.').replace('data-toggle="beta"', 'data-setting="Beta"') + '</div>' +
      emailControl(t) +
      '<h2 class="section-label">Categories</h2><div class="rows-list">' + cats + '</div>' +
      '<button class="link-btn" data-cat-open="">' + icon('plus') + 'Add a category</button>' +
    '</div>';
  }

  var MODE_HINT = {
    off: 'Nothing is emailed. People see new posts when they open the app.',
    test: 'Every email goes only to the test address, marked as a test. The team gets nothing.',
    live: 'New posts, real changes, and nudges email the team.'
  };
  function emailControl(t) {
    var m = t.emailMode || 'off';
    return '<h2 class="section-label">Email</h2><div class="seg-group">' + [['off', 'Off'], ['test', 'Test'], ['live', 'Live']].map(function (x) {
      return '<button class="seg-btn' + (m === x[0] ? ' on' : '') + '" data-emailmode="' + x[0] + '" aria-pressed="' + (m === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="fine" style="margin-top:10px">' + MODE_HINT[m] + (m === 'test' && t.testEmail ? ' Test address: ' + esc(t.testEmail) + '.' : '') +
      (m !== 'off' && t.emailsLeftToday != null ? ' Google allows ' + t.emailsLeftToday + ' more emails today.' : '') + '</p>';
  }
  function setEmailMode(m) {
    teamCall('saveSetting', { key: 'EmailMode', value: m }, function () {
      toast(m === 'live' ? 'Email is live. New posts will email the team.' : m === 'test' ? 'Email is in test mode' : 'Email is off');
    });
  }

  function personSheet(id, note) {
    var x = person(id); if (!x) return;
    var me = x.id === state.me.id, link = linkFor(x);
    sheet('<h2>' + esc(x.name) + '</h2><p>' + esc(x.email) + '</p>' +
      '<div class="sum"><span>Role</span><b>' + ROLE_WORDS[x.role] + (x.apprentice ? ', Apprentice' : '') + '</b></div>' +
      '<div class="sum"><span>Last in the app</span><b>' + (x.lastVisit ? esc(whenText(x.lastVisit)) : 'Not yet') + '</b></div>' +
      '<div class="sum"><span>Link emailed</span><b>' + (x.linkSentAt ? esc(whenText(x.linkSentAt)) : 'Not yet') + '</b></div>' +
      (x.deactivated
        ? '<p class="note">Deactivated. Their link is off and their read history is kept.</p><button class="btn btn-primary" data-sheet="reactivate" data-arg="' + esc(x.id) + '">Reactivate</button>'
        : (note ? '<p class="note">' + esc(note) + '</p>' : '') +
          '<div class="linkbox">' + esc(link.replace(/^https?:\/\//, '')) + '</div>' +
          '<button class="btn btn-primary" data-sheet="copy" data-arg="' + esc(x.id) + '">' + icon('copy') + 'Copy link</button>' +
          '<button class="btn btn-outline" data-sheet="emaillink" data-arg="' + esc(x.id) + '">' + icon('mail') + 'Email it</button>' +
          '<div class="sheet-links"><button data-sheet="editperson" data-arg="' + esc(x.id) + '">Edit details</button><button data-sheet="asknewlink" data-arg="' + esc(x.id) + '">New link</button>' +
          (me ? '' : '<button class="red" data-sheet="askdeactivate" data-arg="' + esc(x.id) + '">Deactivate</button>') + '</div>') +
      '<button class="btn btn-ghost" data-sheet="close">Done</button>');
  }

  function personForm(id) {
    var x = id ? person(id) : null;
    state.personForm = { id: id || '', role: x ? x.role : 'member', apprentice: x ? x.apprentice : false };
    var f = state.personForm;
    sheet('<h2>' + (x ? 'Edit details' : 'Add team member') + '</h2>' +
      '<label class="lbl" for="pf-name" style="margin-top:6px">Name</label><input class="input" id="pf-name" autocomplete="off" placeholder="First and last name" value="' + esc(x ? x.name : '') + '">' +
      '<label class="lbl" for="pf-email">Email</label><input class="input" id="pf-email" type="email" inputmode="email" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="name@example.com" value="' + esc(x ? x.email : '') + '">' +
      '<div class="lbl">Role</div><div class="seg-group" id="pf-role">' + ['member', 'poster', 'admin'].map(function (r) {
        return '<button class="seg-btn' + (f.role === r ? ' on' : '') + '" data-prole="' + r + '">' + ROLE_WORDS[r] + '</button>'; }).join('') + '</div>' +
      '<p class="fine" id="pf-rolehint" style="margin-top:8px">' + roleHint(f.role) + '</p>' +
      '<div class="group" style="margin-top:14px"><button class="switch-row" role="switch" aria-checked="' + f.apprentice + '" data-papp="1"><span class="switch-text"><span class="switch-label">In the Apprentices group</span></span><span class="switch' + (f.apprentice ? ' on' : '') + '"><span></span></span></button></div>' +
      '<button class="btn btn-primary" data-sheet="saveperson" style="margin-top:14px">' + (x ? 'Save' : 'Add and create their link') + '</button><button class="btn btn-ghost" data-sheet="' + (x ? 'backtoperson' : 'close') + '" data-arg="' + esc(id || '') + '">Cancel</button>');
  }
  function roleHint(r) {
    return r === 'admin' ? 'Admins can do everything, including this Team screen.' : r === 'poster' ? 'Posters can write posts and see who read their own.' : 'Team members read posts and mark them as read.';
  }

  function catForm(id) {
    var c = id ? cat(id) : null;
    state.catForm = { id: id || '', color: c ? c.color : SWATCHES[5] };
    sheet('<h2>' + (c ? 'Edit category' : 'Add a category') + '</h2>' +
      '<label class="lbl" for="cf-name" style="margin-top:6px">Name</label><input class="input" id="cf-name" maxlength="28" autocomplete="off" value="' + esc(c ? c.name : '') + '">' +
      '<div class="lbl">Color</div><div class="swatches" id="cf-colors">' + SWATCHES.concat(c && SWATCHES.indexOf(c.color) === -1 ? [c.color] : []).map(function (col) {
        return '<button class="swatch' + (state.catForm.color === col ? ' on' : '') + '" data-swatch="' + col + '" style="background:' + col + '" aria-label="Color ' + col + '">' + icon('check') + '</button>'; }).join('') + '</div>' +
      '<button class="btn btn-primary" data-sheet="savecat" style="margin-top:14px">Save</button>' +
      (c ? '<div class="sheet-links"><button class="red" data-sheet="retirecat" data-arg="' + esc(id) + '">Retire this category</button></div>' : '') +
      '<button class="btn btn-ghost" data-sheet="close">Cancel</button>');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }

  var teamBusy = false;
  function teamCall(action, data, then) {
    if (teamBusy) return; teamBusy = true;
    api(action, data).then(function (res) {
      teamBusy = false;
      if (!res || !res.ok) return toast((res && res.message) || 'That didn\'t work. Try again.');
      applyTeam(res);
      if (state.view === 'tab' && state.tab === 'team') { var y = window.scrollY; render(); window.scrollTo(0, y); }
      then(res);
      refresh(); // keeps the people list for posting in step
    }).catch(function () { teamBusy = false; toast('That didn\'t work. Check your connection and try again.'); });
  }

  function teamSheetAction(what, arg) {
    var x = arg ? person(arg) : null, first = x ? x.firstName : '';
    if (what === 'copy') { copyText(linkFor(x)).then(function () { toast('Link copied. Paste it into a text or email to ' + first + '.'); }, function () { toast('Couldn\'t copy. Press and hold the link to copy it.'); }); return true; }
    if (what === 'emaillink') {
      api('emailLink', { id: arg }).then(function (res) {
        if (!res || !res.ok) return toast((res && res.message) || 'That didn\'t send.');
        applyTeam(res);
        toast(res.mode === 'test' ? 'Test email sent to the test address only. ' + first + ' got nothing.' : 'Link emailed to ' + first);
        if (res.mode !== 'test') personSheet(arg);
      }).catch(function () { toast('That didn\'t send.'); });
      return true;
    }
    if (what === 'golive') { closeSheet(); setEmailMode('live'); return true; }
    if (what === 'editperson') { personForm(arg); return true; }
    if (what === 'backtoperson') { personSheet(arg); return true; }
    if (what === 'asknewlink') {
      sheet('<h2>Give ' + esc(first) + ' a new link?</h2><p>' + (arg === state.me.id ? 'This is your own link. This phone will switch to the new one right away. Your other devices and your home screen icon will need the new link.' : 'Their current link stops working right away. You\'ll need to send them the new one.') + '</p>' +
        '<button class="btn btn-primary" data-sheet="newlink" data-arg="' + esc(arg) + '">Make a new link</button><button class="btn btn-ghost" data-sheet="backtoperson" data-arg="' + esc(arg) + '">Cancel</button>');
      return true;
    }
    if (what === 'newlink') { teamCall('newLink', { id: arg }, function () { personSheet(arg, 'New link is ready. The old one no longer works.'); }); return true; }
    if (what === 'askdeactivate') {
      sheet('<h2>Deactivate ' + esc(first) + '?</h2><p>Their link stops working and they come off the read counts. Their read history stays, and you can reactivate them later.</p>' +
        '<button class="btn btn-danger" data-sheet="deactivate" data-arg="' + esc(arg) + '">Deactivate</button><button class="btn btn-ghost" data-sheet="backtoperson" data-arg="' + esc(arg) + '">Cancel</button>');
      return true;
    }
    if (what === 'deactivate') { teamCall('setActive', { id: arg, active: false }, function () { closeSheet(); toast(first + ' is deactivated'); }); return true; }
    if (what === 'reactivate') { teamCall('setActive', { id: arg, active: true }, function () { personSheet(arg, 'Reactivated. Their link works again.'); }); return true; }
    if (what === 'saveperson') {
      var f = state.personForm, name = document.getElementById('pf-name').value, email = document.getElementById('pf-email').value;
      if (name.trim().length < 2) { toast('Add their name'); return true; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast('That email doesn\'t look right'); return true; }
      teamCall('savePerson', { person: { id: f.id, name: name, email: email, role: f.role, apprentice: f.apprentice } }, function (res) {
        personSheet(res.personId, res.added ? 'Added. Copy their link and send it to them.' : 'Saved.');
      });
      return true;
    }
    if (what === 'savecat') {
      var cf = state.catForm, cname = document.getElementById('cf-name').value;
      if (!cname.trim()) { toast('Give the category a name'); return true; }
      teamCall('saveCategory', { category: { id: cf.id, name: cname, color: cf.color } }, function () { closeSheet(); toast('Category saved'); });
      return true;
    }
    if (what === 'retirecat') {
      var c = cat(arg);
      teamCall('saveCategory', { category: { id: arg, name: c.name, color: c.color, archived: true } }, function () { closeSheet(); toast('Category retired. Old posts keep it.'); });
      return true;
    }
    return false;
  }

  function stage4Click(e) {
    var t = e.target.closest('[data-editmode],[data-size],[data-emailmode],[data-res-edit],[data-res-add],[data-res-clear],[data-rsec],[data-raud],[data-readers],[data-nudge],[data-person-open],[data-person-add],[data-cat-open],[data-setting],[data-teamreload],[data-prole],[data-papp],[data-swatch]');
    if (!t) return false;
    if (t.hasAttribute('data-editmode')) {
      var turnOn = !editing(); lsSet(EDIT_KEY, turnOn ? '1' : '');
      var yy = window.scrollY; render(); window.scrollTo(0, yy);
      toast(turnOn ? 'Edit mode is on. Editing tools are showing.' : 'Edit mode is off. This is what the team sees.');
      return true;
    }
    if (t.hasAttribute('data-size')) { lsSet(SIZE_KEY, t.getAttribute('data-size')); applySize(); render(); toast('Text size saved for this phone'); return true; }
    if (t.hasAttribute('data-emailmode')) {
      var em = t.getAttribute('data-emailmode');
      if (em === (state.team && state.team.emailMode)) return true;
      if (em === 'live') {
        sheet('<h2>Turn on email to the team?</h2><p>From now on, new posts, real changes, and nudges will email real team members. Nothing already posted gets sent.</p>' +
          '<button class="btn btn-primary" data-sheet="golive">Turn it on</button><button class="btn btn-ghost" data-sheet="close">Not yet</button>');
      } else setEmailMode(em);
      return true;
    }
    if (t.hasAttribute('data-res-edit')) return resForm(t.getAttribute('data-res-edit')), true;
    if (t.hasAttribute('data-res-add')) return resForm(''), true;
    if (t.hasAttribute('data-res-clear')) { state.resSearch = ''; render(); return true; }
    if (t.hasAttribute('data-rsec')) {
      state.resForm.section = t.getAttribute('data-rsec'); document.getElementById('rf-newsec').value = '';
      [].forEach.call(document.querySelectorAll('#rf-secs .chip'), function (b) { b.classList.toggle('on', b === t); });
      return true;
    }
    if (t.hasAttribute('data-raud')) {
      state.resForm.audience = t.getAttribute('data-raud');
      [].forEach.call(document.querySelectorAll('#rf-aud .seg-btn'), function (b) { b.classList.toggle('on', b === t); });
      return true;
    }
    if (t.hasAttribute('data-readers')) { if (t.hasAttribute('data-reload')) { loadReaders(state.postId); render(); } else openReaders(t.getAttribute('data-readers')); }
    else if (t.hasAttribute('data-nudge')) nudge(t.getAttribute('data-nudge'));
    else if (t.hasAttribute('data-person-open')) personSheet(t.getAttribute('data-person-open'));
    else if (t.hasAttribute('data-person-add')) personForm('');
    else if (t.hasAttribute('data-cat-open')) catForm(t.getAttribute('data-cat-open'));
    else if (t.hasAttribute('data-teamreload')) { state.team = null; render(); }
    else if (t.hasAttribute('data-setting')) {
      var val = !state.settings.beta; state.settings.beta = val; render();
      teamCall('saveSetting', { key: 'Beta', value: val }, function () { toast(val ? 'Beta tag is on' : 'Beta tag is off'); });
    }
    else if (t.hasAttribute('data-prole')) {
      state.personForm.role = t.getAttribute('data-prole');
      [].forEach.call(document.querySelectorAll('#pf-role .seg-btn'), function (b) { b.classList.toggle('on', b === t); });
      document.getElementById('pf-rolehint').textContent = roleHint(state.personForm.role);
    }
    else if (t.hasAttribute('data-papp')) {
      state.personForm.apprentice = !state.personForm.apprentice;
      t.setAttribute('aria-checked', state.personForm.apprentice); t.querySelector('.switch').classList.toggle('on', state.personForm.apprentice);
    }
    else if (t.hasAttribute('data-swatch')) {
      state.catForm.color = t.getAttribute('data-swatch');
      [].forEach.call(document.querySelectorAll('#cf-colors .swatch'), function (b) { b.classList.toggle('on', b === t); });
    }
    return true;
  }


  /* ---------- Resources ---------- */

  var AUD_WORDS = { everyone: 'Everyone', apprentices: 'Apprentices', admins: 'Admins' };
  function resIcon(r) {
    var u = r.url, t = (r.title + ' ' + r.section).toLowerCase();
    if (/docs\.google\.com\/forms|forms\.gle/.test(u) || /\b(form|quiz|sign up)\b/.test(t)) return 'clipboard-list';
    if (/\/spreadsheets\//.test(u)) return 'sheet';
    if (/\/folders\//.test(u) || /\bdrive\b/.test(r.title.toLowerCase())) return 'folder';
    if (/video|recording/.test(t)) return 'circle-play';
    if (/docs\.google\.com\/document|drive\.google\.com\/file/.test(u)) return 'file-text';
    return 'external-link';
  }
  function sections() {
    var out = [];
    state.resources.forEach(function (r) { if (out.indexOf(r.section) === -1) out.push(r.section); });
    return out;
  }
  function resourceList() {
    var admin = state.me.role === 'admin' && editing(), q = state.resSearch.trim().toLowerCase();
    var list = state.resources.filter(function (r) { return (admin || r.url) && (!q || (r.title + ' ' + r.section).toLowerCase().indexOf(q) !== -1); });
    if (!list.length) {
      return '<div class="empty"><div class="bubble sm">' + icon(q ? 'search' : 'layout-grid') + '</div><div class="calm-title">' + (q ? 'Nothing matches' : 'No resources yet') + '</div>' +
        '<div class="calm-sub">' + (q ? 'Try a shorter word.' : 'Forms, documents, and links will show up here.') + '</div>' + (q ? '<button class="btn btn-outline sm" data-res-clear="1">Show everything</button>' : '') + '</div>';
    }
    var html = '';
    sections().forEach(function (sec) {
      var rows = list.filter(function (r) { return r.section === sec; });
      if (!rows.length) return;
      html += '<h2 class="section-label">' + esc(sec) + '</h2><div class="rows-list">' + rows.map(function (r) {
        var badge = admin && r.audience !== 'everyone' ? '<span class="badge soft">' + AUD_WORDS[r.audience] + ' only</span>' : '';
        var edit = admin ? '<button class="res-edit" data-res-edit="' + esc(r.id) + '" aria-label="Edit ' + esc(r.title) + '">' + icon('pencil') + '</button>' : '';
        if (!r.url) { // only admins ever receive these
          return '<div class="res-item"><button class="res-row todo-link" data-res-edit="' + esc(r.id) + '">' + icon('link') +
            '<span class="res-text"><span class="res-title">' + esc(r.title) + '</span><span class="res-sub"><span class="pill pill-coral">Needs a link</span>Hidden from the team until it has one</span></span></button></div>';
        }
        return '<div class="res-item"><a class="res-row" href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener">' + icon(resIcon(r)) +
          '<span class="res-text"><span class="res-title">' + esc(r.title) + badge + '</span></span>' + (admin ? '' : icon('chevron-right')) + '</a>' + edit + '</div>';
      }).join('') + '</div>';
    });
    return html;
  }
  function renderResources() {
    return '<div class="screen"><h1 class="page-title">Resources</h1>' +
      '<label class="search">' + icon('search') + '<input id="res-search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search resources" aria-label="Search resources" value="' + esc(state.resSearch) + '"></label>' +
      (state.me.role === 'admin' && editing() ? '<button class="btn btn-outline" data-res-add="1" style="margin-top:14px">' + icon('plus') + 'Add a resource</button>' : '') +
      '<div id="res-list">' + resourceList() + '</div></div>';
  }

  function resForm(id) {
    var r = id ? state.resources.filter(function (x) { return x.id === id; })[0] : null;
    var secs = sections();
    state.resForm = { id: id || '', section: r ? r.section : (secs[0] || ''), audience: r ? r.audience : 'everyone' };
    var f = state.resForm;
    sheet('<h2>' + (r ? 'Edit resource' : 'Add a resource') + '</h2>' +
      '<label class="lbl" for="rf-title" style="margin-top:6px">Name</label><input class="input" id="rf-title" maxlength="80" autocomplete="off" value="' + esc(r ? r.title : '') + '">' +
      '<label class="lbl" for="rf-url">Link <span class="opt">leave empty to add later</span></label><input class="input" id="rf-url" inputmode="url" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="https://" value="' + esc(r ? r.url : '') + '">' +
      '<div class="lbl">Section</div><div class="chips wrap" id="rf-secs">' + secs.map(function (x) { return '<button class="chip' + (f.section === x ? ' on' : '') + '" data-rsec="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<input class="input" id="rf-newsec" maxlength="40" autocomplete="off" placeholder="Or type a new section" style="margin-top:8px">' +
      '<div class="lbl">Who sees it</div><div class="seg-group" id="rf-aud">' + ['everyone', 'apprentices', 'admins'].map(function (a) { return '<button class="seg-btn' + (f.audience === a ? ' on' : '') + '" data-raud="' + a + '">' + AUD_WORDS[a] + '</button>'; }).join('') + '</div>' +
      '<button class="btn btn-primary" data-sheet="saveres" style="margin-top:14px">Save</button>' +
      (r ? '<div class="sheet-links"><button class="red" data-sheet="removeres">Remove this resource</button></div>' : '') +
      '<button class="btn btn-ghost" data-sheet="close">Cancel</button>');
  }
  var resBusy = false;
  function saveResource(remove) {
    var f = state.resForm; if (!f || resBusy) return;
    var title = document.getElementById('rf-title').value.trim(), url = document.getElementById('rf-url').value.trim();
    var section = document.getElementById('rf-newsec').value.trim() || f.section;
    if (!title) return toast('Give it a name');
    if (!section) return toast('Pick a section');
    if (url && !/^https:\/\/\S+$/i.test(url)) return toast('Links need to start with https://');
    resBusy = true;
    api('saveResource', { resource: { id: f.id, title: title, url: url, section: section, audience: f.audience, archived: !!remove } }).then(function (res) {
      resBusy = false;
      if (!res || !res.ok) return toast((res && res.message) || 'That didn\'t save. Try again.');
      state.resources = res.resources; saveLocalSnapshot(); closeSheet();
      if (state.view === 'tab' && state.tab === 'resources') { var y = window.scrollY; render(); window.scrollTo(0, y); }
      toast(remove ? 'Resource removed' : url ? 'Saved' : 'Saved. It stays hidden from the team until it has a link.');
    }).catch(function () { resBusy = false; toast('That didn\'t save. Check your connection and try again.'); });
  }

  /* ---------- Contact ---------- */

  function fmtPhone(p) {
    var d = String(p).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(p);
  }
  function renderContact() {
    var first = state.contacts.filter(function (c) { return c.primary; })[0] || state.contacts[0];
    var rest = state.contacts.filter(function (c) { return c !== first; });
    if (!first) return '<div class="screen"><h1 class="page-title">Contact</h1><div class="empty"><div class="bubble sm">' + icon('message-circle') + '</div><div class="calm-title">No numbers yet</div></div></div>';
    return '<div class="screen"><h1 class="page-title">Contact</h1>' +
      '<section class="contact-main"><div class="bubble sm">' + icon('message-circle') + '</div>' +
        '<div class="contact-main-title">' + esc(first.label || 'Text the studio') + '</div><div class="contact-num">' + esc(fmtPhone(first.phone)) + '</div>' +
        '<p class="contact-note">The fastest way to reach us. Use it for client updates, schedule questions, or anything that looks off.</p>' +
        '<a class="btn btn-primary" href="sms:' + esc(first.phone) + '" target="_blank" rel="noopener">' + icon('message-circle') + esc(first.label || 'Text the studio') + '</a></section>' +
      (rest.length ? '<h2 class="section-label">Or text someone directly</h2><div class="rows-list">' + rest.map(function (c) {
        return '<div class="person-row"><span class="person-row-text"><span class="person-name">' + esc(c.name) + '</span><span class="person-sub">' + esc(fmtPhone(c.phone)) + '</span></span>' +
          '<a class="mini-btn" href="sms:' + esc(c.phone) + '" target="_blank" rel="noopener" aria-label="' + esc(c.label || 'Text ' + c.name) + '">Text</a></div>';
      }).join('') + '</div>' : '') + '</div>';
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-open],[data-start],[data-back],[data-home],[data-filter],[data-clear],#markread');
    if (!t) return composeClick(e);
    if (t.id === 'markread') return markRead();
    if (t.hasAttribute('data-tab')) return goTab(t.getAttribute('data-tab'));
    if (t.hasAttribute('data-open')) return openPost(t.getAttribute('data-open'));
    if (t.hasAttribute('data-start')) { var q = unreadQueue(); if (q[0]) openPost(q[0].id); return; }
    if (t.hasAttribute('data-back')) return goBack();
    if (t.hasAttribute('data-home')) return goTab('home');
    if (t.hasAttribute('data-filter')) { state.filter = t.getAttribute('data-filter'); return refreshBulletins(); }
    if (t.hasAttribute('data-clear')) {
      state.filter = 'all'; state.search = '';
      var s = document.getElementById('search'); if (s) s.value = '';
      return refreshBulletins();
    }
  });

  document.addEventListener('input', function (e) {
    if (composeInput(e)) return;
    if (e.target.id === 'res-search') { state.resSearch = e.target.value; var rl = document.getElementById('res-list'); if (rl) rl.innerHTML = resourceList(); return; }
    if (e.target.id !== 'search') return;
    state.search = e.target.value;
    var list = document.getElementById('list');
    if (list) list.innerHTML = bulletinList();
  });

  function refreshBulletins() {
    var c = document.getElementById('chips'), l = document.getElementById('list');
    if (c) c.innerHTML = chips();
    if (l) l.innerHTML = bulletinList();
  }

  function routeFromHash() {
    var h = location.hash || '';
    var m = /^#\/post\/(.+)$/.exec(h);
    if (m && byId(m[1])) {
      state.view = 'post'; state.postId = m[1];
      if (!isUnread(byId(m[1]))) state.flow = null;
      else if (!state.flow) state.flow = { total: unreadQueue().length, done: 0, justRead: [] };
    } else if (/^#\/readers\/(.+)$/.test(h) && byId(h.slice(10)) && byId(h.slice(10)).canEdit) {
      state.view = 'readers'; state.postId = h.slice(10);
      if (!state.readers || state.readers.postId !== state.postId) loadReaders(state.postId);
    } else if (h === '#/compose' && state.draft && state.canPost) {
      state.view = 'compose';
    } else {
      var tab = (/^#\/(home|bulletins|resources|contact|team)$/.exec(h) || [])[1] || 'home';
      state.view = 'tab'; state.tab = tab; state.flow = null;
    }
  }
  window.addEventListener('popstate', function () {
    if (!state.me) return;
    routeFromHash();
    render('fade');
  });

  /* ---------- Swipe sideways to go back ---------- */

  function goBack() {
    if (state.view === 'compose') return leaveCompose();
    if (depth() > 0) history.back(); else goTab(state.tab, false);
  }
  var sw = { on: false, decided: false, x: 0, y: 0, dx: 0, el: null };
  function canSwipe() { return state.me && (state.view === 'post' || state.view === 'readers') && !document.querySelector('.sheet-wrap,.viewer'); }
  document.addEventListener('touchstart', function (e) {
    sw.on = false; sw.decided = false; sw.dx = 0;
    if (!canSwipe() || e.touches.length !== 1) return;
    var t = e.touches[0];
    // The outer edges are left alone so the phone's own edge gestures keep working without doubling up.
    if (t.clientX < 22 || t.clientX > window.innerWidth - 22) return;
    sw.on = true; sw.x = t.clientX; sw.y = t.clientY; sw.el = app.querySelector('.screen');
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!sw.on) return;
    var t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.decided) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw.on = false; return; }   // scrolling, not swiping
      if (Math.abs(dx) < 14) return;
      sw.decided = true;
    }
    sw.dx = dx;
    if (sw.el) { sw.el.style.transition = 'none'; sw.el.style.transform = 'translateX(' + (dx * 0.5) + 'px)'; sw.el.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 420)); }
  }, { passive: true });
  function endSwipe() {
    if (!sw.on) return;
    sw.on = false;
    var far = sw.decided && Math.abs(sw.dx) > 90;
    if (sw.el) { sw.el.style.transition = 'transform .18s ease, opacity .18s ease'; sw.el.style.transform = ''; sw.el.style.opacity = ''; }
    if (far) goBack();
  }
  document.addEventListener('touchend', endSwipe);
  document.addEventListener('touchcancel', function () { sw.dx = 0; endSwipe(); });

  /* ---------- Loading, errors, start ---------- */

  function showSkeleton() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="screen" aria-busy="true" aria-label="Loading">' +
        '<div class="hello"><div class="sk sk-circle"></div><div class="hello-text">' +
          '<div class="sk" style="width:110px;height:14px;margin-bottom:8px"></div>' +
          '<div class="sk" style="width:150px;height:22px"></div></div></div>' +
        '<div class="sk sk-card" style="height:84px"></div>' +
        '<div class="sk" style="width:90px;height:13px;margin:30px 0 14px"></div>' +
        '<div class="sk sk-card" style="height:230px;margin-top:0"></div><div class="sk sk-card" style="height:230px"></div>' +
      '</div>';
  }

  function showLinkProblem() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="center full">' +
        '<div class="bubble">' + icon('link') + '</div>' +
        '<h1>This link didn\'t work</h1>' +
        '<p>Open your personal link again, or ask Bethany to resend it.</p>' +
        '<a class="btn btn-outline" href="sms:+14437025786" target="_blank" rel="noopener">' + icon('message-circle') + 'Text the studio</a>' +
      '</div>';
  }

  function showOffline() {
    tabbar.hidden = true;
    app.innerHTML =
      '<div class="center full">' +
        '<div class="bubble coral">' + icon('wifi-off') + '</div>' +
        '<h1>Can\'t connect right now</h1>' +
        '<p>Check your signal or Wi-Fi, then try again.</p>' +
        '<button class="btn btn-primary" id="retry">' + icon('refresh-cw') + 'Try again</button>' +
      '</div>';
    document.getElementById('retry').addEventListener('click', boot);
  }

  function firstRoute() {
    // A link from an email can point at one post with &p=POSTID.
    // Opening the app always starts on Home, whatever screen it was on when the icon was saved.
    // The one exception is an email link that points at a post with &p=POSTID.
    var qs = new URLSearchParams(location.search), p = qs.get('p'), start = '#/home';
    var keep = [];
    qs.forEach(function (v, k) { if (k !== 'p') keep.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); });
    if (p && byId(p)) start = '#/post/' + p;
    try { history.replaceState({ vwp: 1, d: 0 }, '', location.pathname + (keep.length ? '?' + keep.join('&') : '') + start); } catch (e) {}
    routeFromHash();
    if (!history.state) replaceRoute(location.hash || '#/home');
  }

  var booting = false, seenSaved = false;
  function boot() {
    if (booting) return;
    var fromLink = new URLSearchParams(location.search).get('k') || '';
    state.k = fromLink || lsGet(STORE_KEY);
    if (!state.k) { showLinkProblem(); return; }

    // Show what we had last time straight away, then quietly update it.
    var cached = loadCache();
    if (cached && !state.me) {
      applyData(cached);
      firstRoute();
      render('fade');
    } else if (!state.me) {
      showSkeleton();
    }

    booting = true;
    api('boot', { quiet: !!state.loadedAt && !cached ? true : false }).then(function (res) {
      booting = false;
      if (res && res.ok) {
        var first = !state.me;
        var wasTyping = document.activeElement && document.activeElement.id === 'search';
        applyData(res);
        saveCache(res);
        lsSet(STORE_KEY, state.k);
        if (!seenSaved) { seenSaved = true; lsSet('vwp.seen', res.serverTime || new Date().toISOString()); }
        if (first) { firstRoute(); render('fade'); }
        else if (state.view === 'tab' && !wasTyping) { var y = window.scrollY; render(); window.scrollTo(0, y); }
        else if (state.view === 'tab') { refreshBulletins(); renderTabbar(); }
      } else if (res && res.code === 'auth') {
        // The link is the source of truth. A bad link never falls back to a saved one.
        lsSet(CACHE_KEY, '');
        if (!fromLink) lsSet(STORE_KEY, '');
        state.me = null;
        showLinkProblem();
      } else if (!state.me) {
        showOffline();
      }
    }).catch(function () {
      booting = false;
      if (!state.me) showOffline();
    });
  }

  function refresh(done) {
    state.loadedAt = Date.now();
    api('boot', { quiet: true }).then(function (res) {
      if (res && res.ok) {
        var typing = document.activeElement && document.activeElement.id === 'search';
        applyData(res); saveCache(res);
        if (state.view === 'tab' && !typing) { var y = window.scrollY; render(); window.scrollTo(0, y); }
      }
      if (done) done(!!(res && res.ok));
    }).catch(function () { if (done) done(false); });
  }

  // When someone comes back to the app after a while, quietly check for new posts.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.me && Date.now() - state.loadedAt > 60000 && !marking) refresh();
  });

  // Pull down on Home or Bulletins to check for new posts.
  var ptr = document.createElement('div');
  ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true');
  ptr.innerHTML = icon('refresh-cw');
  document.body.appendChild(ptr);
  var pull = { y: 0, on: false, d: 0, busy: false };
  function canPull() { return state.me && state.view === 'tab' && (state.tab === 'home' || state.tab === 'bulletins') && window.scrollY <= 0 && !pull.busy; }
  document.addEventListener('touchstart', function (e) {
    pull.on = canPull() && e.touches.length === 1; pull.y = e.touches[0].clientY; pull.d = 0;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!pull.on) return;
    pull.d = e.touches[0].clientY - pull.y;
    if (pull.d <= 0 || window.scrollY > 0) { ptr.style.transform = ''; ptr.style.opacity = 0; return; }
    var t = Math.min(pull.d * 0.45, 64);
    ptr.style.transition = 'none';
    ptr.style.opacity = Math.min(t / 50, 1);
    ptr.style.transform = 'translate(-50%,' + t + 'px) rotate(' + (t * 4) + 'deg)';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (!pull.on) return;
    pull.on = false;
    ptr.style.transition = '';
    if (pull.d * 0.45 >= 56) {
      pull.busy = true;
      ptr.classList.add('spin'); ptr.style.transform = 'translate(-50%,56px)'; ptr.style.opacity = 1;
      refresh(function (ok) {
        pull.busy = false;
        ptr.classList.remove('spin'); ptr.style.transform = ''; ptr.style.opacity = 0;
        if (!ok) toast('Couldn\'t check right now. Try again in a moment.');
      });
    } else { ptr.style.transform = ''; ptr.style.opacity = 0; }
  });

  boot();
})();
