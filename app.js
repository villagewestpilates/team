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
  var veil = document.createElement('div');
  veil.className = 'veil'; veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);

  var state = {
    k: '', me: null, settings: { beta: false }, categories: [], posts: [],
    tab: 'home',            // which bottom tab is showing
    view: 'tab',            // 'tab' | 'post' | 'done'
    postId: '',             // open post
    flow: null,             // { total, done, justRead: [ids] } while reading through unread posts
    canPost: false, people: [], defaultCategory: '', draft: null, photos: {},
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
  /** Posted since this person last opened the app, and not written by them. */
  function isNew(p) { return !!state.lastSeen && !p.mine && !p.readAt && p.createdAt > state.lastSeen; }
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
    var bits = ['By ' + esc(p.author), fullDate(p.createdAt)];
    return bits.join(' · ');
  }
  function extras(p) {
    var out = '';
    if (isNew(p)) out += '<span class="mini mini-new">New</span>';
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
    var sub = 'By ' + esc(p.author) + '<span class="sep">·</span>' + fullDate(p.createdAt);
    var status = p.readAt ? '<span class="row-read">' + icon('check') + 'Read</span>' : '';
    return '<button class="post-row" data-open="' + esc(p.id) + '">' +
      '<span class="dot" style="background:' + esc(c.color) + '"></span>' +
      '<span class="post-row-text"><span class="post-row-title">' + esc(p.title) + '</span>' +
      '<span class="post-row-sub">' + (p.pinned ? '<span class="row-pin">' + icon('pin') + '</span>' : '') + sub + '</span></span>' +
      status + icon('chevron-right') +
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
    var hold = unread && state.holdFor === p.id;
    state.holdFor = '';
    if (unread) {
      var more = f && f.done + 1 < f.total;
      foot = '<div class="readbar"><div class="readbar-in">' +
        '<button class="btn btn-primary' + (hold ? ' holding' : '') + '" id="markread"' + (hold ? ' disabled data-hold="1"' : '') + '>' + icon('check') + esc(p.buttonText || 'Mark as read') + '</button>' +
        '<p class="readbar-note">Tapping this confirms you\'ve read and understood it.' + (more ? ' Then you\'ll go to the next one.' : '') + '</p>' +
      '</div></div>';
    } else if (p.readAt) {
      foot = '<div class="readbar quiet"><div class="readbar-in"><div class="read-done">' + icon('check') +
        'You read this ' + (dayKey(asDate(p.readAt)) === dayKey(new Date()) ? 'today' : 'on ' + fullDate(p.readAt)) + '</div></div></div>';
    }

    return '<div class="screen post-screen' + (foot ? ' has-bar' : '') + '">' +
      '<div class="post-top"><button class="back" data-back="1" aria-label="Back">' + icon('chevron-left') + '</button>' + progress +
        (p.canEdit ? '<button class="back" data-edit="' + esc(p.id) + '" aria-label="Edit this post">' + icon('pencil') + '</button>' : '<span class="back-spacer"></span>') + '</div>' +
      '<div class="card-top">' + catTag(p) + (unread || p.readAt ? statusPill(p) : '') + '</div>' +
      '<h1 class="post-title">' + esc(p.title) + '</h1>' +
      '<div class="meta">' + metaLine(p) + '</div>' + extras(p) +
      (p.stats && p.needsRead ? '<div class="stats">' + icon('users') + p.stats.read + ' of ' + p.stats.total + ' read</div>' : '') +
      (p.photo ? '<button class="photo" data-photo="' + esc(p.id) + '" aria-label="See the photo full size" style="aspect-ratio:' + p.photo.w + '/' + p.photo.h + '"><span class="sk"></span></button>' : '') +
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
    } else if (state.view === 'compose' && state.draft) {
      html = renderCompose();
    } else if (state.view === 'done') {
      html = renderDone();
    } else {
      html = state.tab === 'home' ? renderHome() : state.tab === 'bulletins' ? renderBulletins() : renderSoon();
      if (state.canPost && (state.tab === 'home' || state.tab === 'bulletins')) {
        html += '<button class="fab" data-compose="new">' + icon('plus') + 'New post</button>';
      }
    }
    app.innerHTML = html;
    // A soft white veil fades away over the new screen. The text itself never animates,
    // so it cannot shift or change size as it settles.
    if (anim) { veil.classList.remove('go'); void veil.offsetWidth; veil.classList.add('go'); }
    var held = document.querySelector('#markread[data-hold]');
    if (held) setTimeout(function () { held.disabled = false; held.classList.remove('holding'); }, 3000);
    tabbar.hidden = state.view === 'post' || state.view === 'compose';
    if (state.view === 'post') loadPhoto(state.postId);
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
    // Longer posts get a short pause before the button turns on, so it can't be tapped by reflex.
    state.holdFor = isUnread(p) && p.body.length > 280 ? id : '';
    if (opts.replace) replaceRoute('#/post/' + id); else pushRoute('#/post/' + id);
    render(opts.anim || 'slide');
    window.scrollTo(0, 0);
    api('viewPost', { postId: id }).catch(function () {});
  }

  function showDone() {
    state.view = 'done'; state.tab = 'home';
    toastEl.classList.remove('show'); // this screen already says it
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
      canPost: state.canPost, people: state.people, defaultCategory: state.defaultCategory,
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
      photo: null, hasPhoto: false, removePhoto: false, more: false, dirty: false };
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
        buttonText: p.buttonText, eventDate: p.eventDate, skipEmail: !!p.skipEmail, hasPhoto: !!p.photo });
      (p.links || []).forEach(function (l, i) { if (i < 2) d.links[i] = { label: l.label, url: l.url }; });
      d.more = !!(d.buttonText || d.links[0].url || d.pinned || d.skipEmail);
    } else {
      try { var saved = JSON.parse(lsGet(DRAFT_KEY) || 'null'); if (saved && (saved.title || saved.body)) { d = Object.assign(d, saved); d.restored = true; } } catch (e) {}
    }
    state.draft = d; state.view = 'compose';
    pushRoute('#/compose');
    render('fade');
    window.scrollTo(0, 0);
    if (d.restored) { d.restored = false; toast('We kept your draft from last time'); }
  }

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

  function renderCompose() {
    var d = state.draft, editing = !!d.id;
    var cats = state.categories.map(function (c) {
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

      '<label class="lbl" for="f-body">Post</label>' +
      '<textarea class="input body-input" id="f-body" data-f="body" rows="7" placeholder="Write it the way you\'d say it. Links you paste become tappable.">' + esc(d.body) + '</textarea>' +

      '<div class="lbl">Photo</div><div id="photo-field">' + photoField(d) + '</div>' +
      '<input type="file" id="photo-input" accept="image/*" hidden>' +

      '<div class="lbl">Category</div><div class="chips wrap">' + cats + '</div>' +
      (isPromo(d.categoryId) ? '<label class="lbl" for="f-event">Event or end date <span class="opt">optional</span></label><input class="input" type="date" id="f-event" data-f="eventDate" value="' + esc(d.eventDate) + '">' : '') +

      '<div class="lbl">Who sees it</div><div class="seg-group">' + auds + '</div>' + people +

      '<div class="group">' + toggle('needsRead', d.needsRead, 'Needs to be marked read', 'People tap "Mark as read" and you can see who has.') + '</div>' +
      (d.needsRead ? '<label class="lbl" for="f-readby">Read by <span class="opt">optional</span></label><input class="input" type="date" id="f-readby" data-f="readBy" min="' + today + '" value="' + esc(d.readBy) + '">' : '') +

      '<button class="more-btn" data-more="1" aria-expanded="' + !!d.more + '">' + (d.more ? 'Fewer options' : 'More options') + icon(d.more ? 'chevron-left' : 'chevron-right') + '</button>' +
      (d.more ? '<div class="more">' +
        '<div class="group">' + toggle('pinned', d.pinned, 'Pin to the top', 'Stays first in Bulletins until you unpin it.') +
          toggle('skipEmail', d.skipEmail, 'Skip the email for this post', 'People will only see it when they open the app.') + '</div>' +
        (d.needsRead ? '<label class="lbl" for="f-btn">Wording for the Mark as read button <span class="opt">optional</span></label><input class="input" id="f-btn" data-f="buttonText" maxlength="40" placeholder="Mark as read" value="' + esc(d.buttonText) + '">' : '') +
        '<div class="lbl">Link buttons <span class="opt">up to two</span></div>' + linkRows +
        (editing ? '<button class="danger-link" data-archive="1">Remove this post</button>' : '') +
      '</div>' : '') +
    '</div>' +
    '<div class="readbar"><div class="readbar-in"><button class="btn btn-primary" data-submit="1">' + (editing ? 'Save changes' : 'Review and post') + '</button></div></div>';
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
    if (sh) return sheetAction(sh.getAttribute('data-sheet'));
    if (e.target.classList && e.target.classList.contains('sheet-wrap')) return closeSheet();
    var t = e.target.closest('[data-compose],[data-edit],[data-cat],[data-aud],[data-person],[data-toggle],[data-more],[data-addphoto],[data-rmphoto],[data-submit],[data-archive]');
    if (!t) return;
    if (t.hasAttribute('data-compose')) return openCompose('');
    if (t.hasAttribute('data-edit')) return openCompose(t.getAttribute('data-edit'));
    var d = state.draft;
    if (!d) return;
    if (t.hasAttribute('data-addphoto')) return document.getElementById('photo-input').click();
    if (t.hasAttribute('data-submit')) return submitPost();
    if (t.hasAttribute('data-archive')) {
      return sheet('<h2>Remove this post?</h2><p>It disappears from the app for everyone. The record stays in your Sheet.</p>' +
        '<button class="btn btn-danger" data-sheet="archive">Remove post</button><button class="btn btn-ghost" data-sheet="close">Keep it</button>');
    }
    d.dirty = true;
    if (t.hasAttribute('data-rmphoto')) { d.photo = null; if (d.hasPhoto) d.removePhoto = true; document.getElementById('photo-field').innerHTML = photoField(d); return; }
    if (t.hasAttribute('data-cat')) d.categoryId = t.getAttribute('data-cat');
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
  function sheetAction(what) {
    if (what === 'close') return closeSheet();
    if (what === 'leave') { closeSheet(); return closeCompose(); }
    if (what === 'post') return sendPost('');
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
    var who = audienceWords(d);
    if (!d.id) {
      var lines = '<div class="sum"><span>Goes to</span><b>' + esc(who) + '</b></div>' +
        '<div class="sum"><span>Mark as read</span><b>' + (d.needsRead ? (d.readBy ? 'Yes, by ' + fullDate(d.readBy) : 'Yes') : 'Not needed') + '</b></div>' +
        (d.needsRead ? '<div class="sum"><span>Email</span><b>' + (d.skipEmail ? 'Skipped' : 'Starts once email is switched on') + '</b></div>' : '');
      return sheet('<h2>Ready to post?</h2><p class="sheet-title">' + esc(d.title.trim()) + '</p>' + lines +
        '<button class="btn btn-primary" data-sheet="post">Post now</button><button class="btn btn-ghost" data-sheet="close">Keep editing</button>');
    }
    var p = byId(d.id);
    if (!d.needsRead || !(p && p.needsRead)) return sendPost('small');
    sheet('<h2>Small fix or real change?</h2>' +
      '<button class="choice" data-sheet="small"><b>Small fix</b><span>A typo or a tidy-up. Nobody is asked to read it again.</span></button>' +
      '<button class="choice" data-sheet="real"><b>Real change</b><span>The meaning changed. Everyone reads it again and it gets an Updated tag.</span></button>' +
      '<button class="btn btn-ghost" data-sheet="close">Keep editing</button>');
  }

  var sending = false;
  function sendPost(change) {
    if (sending) return;
    var d = state.draft; if (!d) return;
    sending = true;
    var box = document.querySelector('.sheet');
    if (box) box.innerHTML = '<div class="sheet-busy"><div class="sk" style="width:48px;height:48px;border-radius:50%"></div><p>' + (d.id ? 'Saving' : 'Posting') + (d.photo ? ' and sending the photo' : '') + '</p></div>';
    api('savePost', {
      change: change || '', removePhoto: !!d.removePhoto, photo: d.photo,
      post: { id: d.id, title: d.title, body: d.body, categoryId: d.categoryId, pinned: d.pinned, needsRead: d.needsRead,
        readBy: d.readBy, audience: d.audience, audienceIds: d.audienceIds, buttonText: d.buttonText,
        links: d.links, eventDate: isPromo(d.categoryId) ? d.eventDate : '', skipEmail: d.skipEmail }
    }, 75000).then(function (res) {
      sending = false;
      closeSheet();
      if (!res || !res.ok) { toast((res && res.message) || 'That didn\'t save. Try again.'); return; }
      state.posts = res.posts;
      if (d.photo) state.photos[res.postId] = d.photo.data; else if (d.removePhoto) delete state.photos[res.postId];
      if (!d.id) lsSet(DRAFT_KEY, '');
      state.draft = null; state.flow = null;
      saveLocalSnapshot();
      state.view = 'post'; state.postId = res.postId;
      replaceRoute('#/post/' + res.postId);
      render('fade'); window.scrollTo(0, 0);
      toast(res.isNew ? 'Posted' : res.real ? 'Saved. Everyone will be asked to read it again.' : 'Saved');
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
      state.posts = res.posts; state.draft = null; saveLocalSnapshot();
      goTab('bulletins', false);
      toast('Post removed');
    }).catch(function () { sending = false; closeSheet(); toast('That didn\'t work. Check your connection and try again.'); });
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-open],[data-start],[data-back],[data-home],[data-filter],[data-clear],#markread');
    if (!t) return composeClick(e);
    if (t.id === 'markread') return markRead();
    if (t.hasAttribute('data-tab')) return goTab(t.getAttribute('data-tab'));
    if (t.hasAttribute('data-open')) return openPost(t.getAttribute('data-open'));
    if (t.hasAttribute('data-start')) { var q = unreadQueue(); if (q[0]) openPost(q[0].id); return; }
    if (t.hasAttribute('data-back')) { if (state.view === 'compose') return leaveCompose(); if (depth() > 0) history.back(); else goTab(state.tab, false); return; }
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
    } else if (h === '#/compose' && state.draft && state.canPost) {
      state.view = 'compose';
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
