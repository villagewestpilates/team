/* Village West Team app. Stage 2: Home, Bulletins, reading a post. */
(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ/exec';
  var STORE_KEY = 'vwp.k';
  var CACHE_KEY = 'vwp.data';
  var TZ = 'America/New_York';

  var app = document.getElementById('app');
  var tabbar = document.getElementById('tabbar');
  var toastEl = document.getElementById('toast');

  var state = {
    k: '', me: null, settings: { beta: false }, categories: [], posts: [],
    tab: 'home',            // which bottom tab is showing
    view: 'tab',            // 'tab' | 'post' | 'done'
    postId: '',             // open post
    flow: null,             // { total, done, justRead: [ids] } while reading through unread posts
    filter: 'all', search: '',
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
  function isUnread(p) { return p.needsRead && p.forMe && !p.readAt; }
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
  function preview(body) { return String(body).replace(/\s+/g, ' ').trim().slice(0, 220); }
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function safeUrl(u) { return /^(https?:|sms:|tel:|mailto:)/i.test(u) ? u : '#'; }

  /* ---------- Talking to the server ---------- */

  function api(action, data) {
    var body = Object.assign({ action: action, k: state.k }, data || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
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

  function header() {
    var me = state.me;
    return '<header class="hello">' +
      '<div class="avatar" aria-hidden="true">' + esc(me.firstName.charAt(0).toUpperCase()) + '</div>' +
      '<div class="hello-text"><div class="hello-small">' + greeting() + '</div>' +
      '<div class="hello-name">' + esc(me.firstName) + '</div></div>' +
      '<div class="brand"><span class="wordmark">VILLAGE WEST</span>' +
      (state.settings.beta ? '<span class="beta">Beta</span>' : '') + '</div>' +
    '</header>';
  }

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
    var bits = [esc(p.author), fullDate(p.createdAt)];
    return bits.join(' · ');
  }
  function extras(p) {
    var out = '';
    if (p.pinned) out += '<span class="mini">' + icon('pin') + 'Pinned</span>';
    if (p.updated) out += '<span class="mini mini-updated">Updated</span>';
    if (p.eventDate) out += '<span class="mini">' + fullDate(p.eventDate) + '</span>';
    return out ? '<div class="minis">' + out + '</div>' : '';
  }

  /** Big card for a post that still needs to be read. */
  function unreadCard(p) {
    return '<article class="card post-card">' +
      '<div class="card-top">' + catTag(p) + statusPill(p) + '</div>' +
      '<h3 class="card-title">' + esc(p.title) + '</h3>' +
      extras(p) +
      '<p class="preview">' + esc(preview(p.body)) + '</p>' +
      '<div class="meta">' + metaLine(p) + '</div>' +
      '<button class="btn btn-primary" data-open="' + esc(p.id) + '">Open and read' + icon('arrow-right') + '</button>' +
    '</article>';
  }

  /** Compact row for a post that is read, or that does not need marking. */
  function compactRow(p, when) {
    var c = cat(p.categoryId);
    var sub = p.readAt
      ? '<span class="row-read">' + icon('check') + esc(when || 'Read') + '</span> · ' + esc(p.author)
      : esc(p.author) + ' · ' + fullDate(p.createdAt);
    return '<button class="post-row" data-open="' + esc(p.id) + '">' +
      '<span class="dot" style="background:' + esc(c.color) + '"></span>' +
      '<span class="post-row-text"><span class="post-row-title">' + esc(p.title) + '</span>' +
      '<span class="post-row-sub">' + (p.pinned ? '<span class="row-pin">' + icon('pin') + '</span>' : '') + sub + '</span></span>' +
      icon('chevron-right') +
    '</button>';
  }

  /* ---------- Home ---------- */

  function renderHome() {
    var unread = unreadQueue();
    var read = state.posts.filter(function (p) { return p.readAt; }).sort(function (a, b) { return a.readAt < b.readAt ? 1 : -1; });
    var fyi = state.posts.filter(function (p) { return !p.readAt && !isUnread(p); }).sort(pinnedThenNewest);
    var html = '<div class="screen">' + header();

    if (unread.length) {
      var due = unread[0].readBy;
      html += '<section class="todo">' +
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
    return list.map(function (p) { return isUnread(p) ? unreadCard(p) : compactRow(p, p.readAt ? 'Read' : ''); }).join('');
  }

  function chips() {
    var n = unreadQueue().length;
    var all = [['all', 'All'], ['unread', 'Unread' + (n ? ' ' + n : '')]].concat(state.categories.map(function (c) { return [c.id, c.name, c.color]; }));
    return all.map(function (c) {
      var on = state.filter === c[0];
      return '<button class="chip' + (on ? ' on' : '') + '" data-filter="' + esc(c[0]) + '" aria-pressed="' + on + '">' +
        (c[2] ? '<span class="dot" style="background:' + esc(c[2]) + '"></span>' : '') + esc(c[1]) + '</button>';
    }).join('');
  }

  function renderBulletins() {
    return '<div class="screen">' +
      '<h1 class="page-title">Bulletins</h1>' +
      '<label class="search">' + icon('search') +
        '<input id="search" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="Search posts" aria-label="Search posts" value="' + esc(state.search) + '">' +
      '</label>' +
      '<div class="chips" id="chips">' + chips() + '</div>' +
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

    var foot = '';
    if (unread) {
      var more = f && f.done + 1 < f.total;
      foot = '<div class="readbar"><div class="readbar-in">' +
        '<button class="btn btn-primary" id="markread">' + icon('check') + esc(p.buttonText || 'Mark as read') + '</button>' +
        '<p class="readbar-note">Tapping this confirms you\'ve read and understood it.' + (more ? ' Then you\'ll go to the next one.' : '') + '</p>' +
      '</div></div>';
    } else if (p.readAt) {
      foot = '<div class="readbar quiet"><div class="readbar-in"><div class="read-done">' + icon('check') +
        'You read this ' + (dayKey(asDate(p.readAt)) === dayKey(new Date()) ? 'today' : 'on ' + fullDate(p.readAt)) + '</div></div></div>';
    }

    return '<div class="screen post-screen' + (foot ? ' has-bar' : '') + '">' +
      '<div class="post-top"><button class="back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button>' + progress + '<span class="back-spacer"></span></div>' +
      '<div class="card-top">' + catTag(p) + (unread || p.readAt ? statusPill(p) : '') + '</div>' +
      '<h1 class="post-title">' + esc(p.title) + '</h1>' +
      '<div class="meta">' + metaLine(p) + '</div>' + extras(p) +
      '<div class="post-body">' + linkify(p.body) + '</div>' +
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

  /* ---------- Other tabs (later stages) ---------- */

  var TAB_ICONS = { home: 'house', bulletins: 'newspaper', resources: 'layout-grid', contact: 'message-circle', team: 'users' };
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
    } else if (state.view === 'done') {
      html = renderDone();
    } else {
      html = state.tab === 'home' ? renderHome() : state.tab === 'bulletins' ? renderBulletins() : renderSoon();
    }
    app.innerHTML = html;
    var scr = app.querySelector('.screen');
    if (scr && anim) scr.classList.add(anim);
    tabbar.hidden = state.view === 'post';
    if (!tabbar.hidden) renderTabbar();
  }

  function renderTabbar() {
    var tabs = [['home', 'Home'], ['bulletins', 'Bulletins'], ['resources', 'Resources'], ['contact', 'Contact']];
    if (state.me.role === 'admin') tabs.push(['team', 'Team']);
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
    if (opts.replace) replaceRoute('#/post/' + id); else pushRoute('#/post/' + id);
    render(opts.anim || 'slide');
    window.scrollTo(0, 0);
    api('viewPost', { postId: id }).catch(function () {});
  }

  function showDone() {
    state.view = 'done'; state.tab = 'home';
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
      posts: state.posts.map(function (p) { var c = Object.assign({}, p); delete c._pending; return c; }) });
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-open],[data-start],[data-back],[data-home],[data-filter],[data-clear],#markread');
    if (!t) return;
    if (t.id === 'markread') return markRead();
    if (t.hasAttribute('data-tab')) return goTab(t.getAttribute('data-tab'));
    if (t.hasAttribute('data-open')) return openPost(t.getAttribute('data-open'));
    if (t.hasAttribute('data-start')) { var q = unreadQueue(); if (q[0]) openPost(q[0].id); return; }
    if (t.hasAttribute('data-back')) { if (depth() > 0) history.back(); else goTab(state.tab, false); return; }
    if (t.hasAttribute('data-home')) return goTab('home');
    if (t.hasAttribute('data-filter')) { state.filter = t.getAttribute('data-filter'); return refreshBulletins(); }
    if (t.hasAttribute('data-clear')) {
      state.filter = 'all'; state.search = '';
      var s = document.getElementById('search'); if (s) s.value = '';
      return refreshBulletins();
    }
  });

  document.addEventListener('input', function (e) {
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
    } else {
      var tab = (/^#\/(home|bulletins|resources|contact|team)$/.exec(h) || [])[1] || 'home';
      if (tab === 'team' && state.me.role !== 'admin') tab = 'home';
      state.view = 'tab'; state.tab = tab; state.flow = null;
    }
  }
  window.addEventListener('popstate', function () {
    if (!state.me) return;
    routeFromHash();
    render('fade');
  });

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
        '<p>Open your personal link again, or ask Barbara to resend it.</p>' +
        '<a class="btn btn-outline" href="sms:+14432779647" target="_blank" rel="noopener">' + icon('message-circle') + 'Text Barbara</a>' +
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
    var p = new URLSearchParams(location.search).get('p');
    if (p && byId(p) && !location.hash) replaceRoute('#/post/' + p);
    routeFromHash();
    if (!history.state) replaceRoute(location.hash || '#/home');
  }

  var booting = false;
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

  // When someone comes back to the app after a while, quietly check for new posts.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.me && Date.now() - state.loadedAt > 60000 && !marking) {
      state.loadedAt = Date.now();
      api('boot', { quiet: true }).then(function (res) {
        if (!res || !res.ok) return;
        var typing = document.activeElement && document.activeElement.id === 'search';
        applyData(res); saveCache(res);
        if (state.view === 'tab' && !typing) { var y = window.scrollY; render(); window.scrollTo(0, y); }
      }).catch(function () {});
    }
  });

  boot();
})();
