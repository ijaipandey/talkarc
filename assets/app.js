/* PenMuse shared scripts: auth, API with local fallback, planner, studio, page editor, public page. */

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function copyText(text, btn) {
  function finish(ok) {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = ok ? "Copied" : "Copy failed - select and copy manually";
    setTimeout(function () { btn.textContent = old; }, 2200);
  }
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy") === true; } catch {}
    document.body.removeChild(ta); finish(ok);
    return ok;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function () { finish(true); return true; }, fallback);
  }
  return Promise.resolve(fallback());
}

/* Accessible confirmation without a blocking browser-native dialog. */
function confirmAction(message) {
  return new Promise(function (resolve) {
    var previous = document.activeElement;
    var dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-label", "Confirm action");
    var text = document.createElement("p"); text.textContent = message;
    var actions = document.createElement("div"); actions.className = "confirm-actions";
    var cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "btn ghost"; cancel.textContent = "Cancel";
    var accept = document.createElement("button"); accept.type = "button"; accept.className = "btn"; accept.textContent = "Continue";
    actions.appendChild(cancel); actions.appendChild(accept);
    dialog.appendChild(text); dialog.appendChild(actions); document.body.appendChild(dialog);
    var finished = false;
    function finish(ok) {
      if (finished) return; finished = true;
      dialog.close(); dialog.remove();
      if (previous && previous.isConnected) previous.focus();
      resolve(ok);
    }
    cancel.addEventListener("click", function () { finish(false); });
    accept.addEventListener("click", function () { finish(true); });
    dialog.addEventListener("cancel", function (ev) { ev.preventDefault(); finish(false); });
    dialog.showModal(); cancel.focus();
  });
}

function studioPlannerNotes(result, platform, tone) {
  var notes = ["Platform: " + platform, "Tone: " + tone, "Caption:", result.caption || "", "Hashtags:", result.hashtags || "", "Hooks:",
    (result.hooks || []).map(function (h, i) { return (i + 1) + ". " + h; }).join("\n")].filter(Boolean).join("\n");
  var marker = "\n[Shortened; full draft stays in Studio]";
  return notes.length > 1000 ? notes.slice(0, 1000 - marker.length) + marker : notes;
}

/* ---------- auth (Supabase adapter) ---------- */
var authModalUsed = false;

function currentUser() {
  return window.penmuseAuth ? penmuseAuth.currentUser() : null;
}

function apiFetch(path, options) {
  options = options || {};
  if (window.penmuseAuth && penmuseAuth.localMode) return penmuseAuth.localFetch(path, options);
  if (window.penmuseAuth) path = penmuseAuth.apiPath(path);
  var user = currentUser();
  var headers = options.headers || {};
  if (user) {
    return user.jwt().then(function (token) {
      headers["Authorization"] = "Bearer " + (token || window.PENMUSE_ANON);
      headers["Content-Type"] = "application/json";
      return fetch(path, Object.assign({}, options, { headers: headers }));
    });
  }
  headers["Authorization"] = "Bearer " + window.PENMUSE_ANON;
  headers["Content-Type"] = "application/json";
  return Promise.resolve(fetch(path, Object.assign({}, options, { headers: headers })));
}

function authUnavailable() {
  var gated = document.body.hasAttribute("data-requires-auth");
  if (gated) {
    /* Do not initialise account tools or read local caches without auth. */
    document.body.textContent = "";
    var main = document.createElement("main");
    main.className = "section wrap";
    main.innerHTML = '<h1>Sign-in is unavailable</h1><p>We could not load sign-in. Your workspace has not been opened. Check your connection or privacy settings, then reload.</p><p><a class="btn" href="index.html">Back to PenMuse</a></p>';
    document.body.appendChild(main);
    document.body.setAttribute("data-auth-state", "error");
  } else {
    var notice = document.getElementById("auth-unavailable");
    if (!notice) {
      notice = document.createElement("p");
      notice.id = "auth-unavailable";
      notice.className = "notice wrap";
      notice.setAttribute("role", "alert");
      notice.textContent = "Sign-in could not load. Check your connection or privacy settings, then reload to log in.";
      document.body.insertBefore(notice, document.body.firstChild);
    }
  }
  return !gated;
}

function initAuth() {
  var gated = document.body.hasAttribute("data-requires-auth");
  if (window.penmuseAuth && penmuseAuth.localMode) {
    var localNotice = document.getElementById("local-preview-notice");
    if (!localNotice) {
      localNotice = document.createElement("div");
      localNotice.id = "local-preview-notice";
      localNotice.className = "local-preview-notice";
      localNotice.setAttribute("role", "status");
      localNotice.innerHTML = "<strong>Local preview</strong> — your pages, drafts, and chat are saved only in this browser. No account, cloud sync, or real AI is connected. Avoid entering sensitive information.";
      document.body.insertBefore(localNotice, document.body.firstChild);
    }
    updateNav(currentUser());
    document.body.setAttribute("data-auth-state", "local-preview");
    return Promise.resolve(true);
  }
  if (!window.penmuseAuth || !penmuseAuth.available) {
    return Promise.resolve(authUnavailable());
  }
  var ready = penmuseAuth.ready.then(function (user) {
    guardAccountSwitch(user);
    updateNav(user);
    if (gated && !user) {
      window.location.href = "index.html";
      return false;
    }
    document.body.setAttribute("data-auth-state", "ready");
    if (user) onSignedIn(user);
    return true;
  }).catch(function () { return authUnavailable(); });
  penmuseAuth.onChange(function (event, user) {
    if (event === "SIGNED_IN") {
      guardAccountSwitch(user);
      updateNav(user);
      /* Reload or redirect only for a sign-in that happened through this
         page's auth modal. A restored session or a token refresh emits
         SIGNED_IN too, and reloading then wipes in-progress work (an open
         chat, a half-filled form) or can loop. */
      if (authModalUsed) {
        if (gated) location.reload();
        else window.location.href = "dashboard.html";
      }
    }
    if (event === "SIGNED_OUT") {
      guardAccountSwitch(null);
      updateNav(null);
      if (gated || authModalUsed) window.location.href = "index.html";
    }
  });

  $all("[data-login]").forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); openAuthModal("login"); });
  });
  $all("[data-signup]").forEach(function (el) {
    el.addEventListener("click", function (ev) { ev.preventDefault(); openAuthModal("signup"); });
  });
  $all("[data-logout]").forEach(function (el) {
    el.addEventListener("click", function (ev) {
      ev.preventDefault();
      penmuseAuth.signOut().then(function () {
        guardAccountSwitch(null); window.location.href = "index.html";
      }).catch(function () {
        var notice = document.getElementById("logout-error");
        if (!notice) { notice = document.createElement("p"); notice.id = "logout-error"; notice.className = "notice wrap"; notice.setAttribute("role", "alert"); document.body.insertBefore(notice, document.body.firstChild); }
        notice.textContent = "Could not finish logging out. Keep this browser private and try again.";
      });
    });
  });
  $all("[data-soon]").forEach(function (el) {
    el.addEventListener("click", function (ev) {
      ev.preventDefault();
      var n = $(".notice");
      if (n) n.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  return ready;
}

function updateNav(user) {
  $all("[data-login]").forEach(function (el) { el.style.display = user ? "none" : ""; });
  $all("[data-signup]").forEach(function (el) { el.style.display = user ? "none" : ""; });
  $all("[data-logout]").forEach(function (el) { el.style.display = user && !(window.penmuseAuth && penmuseAuth.localMode) ? "" : "none"; });
}

function onSignedIn(user) {
  var nameEl = $("#user-name");
  if (nameEl) {
    var meta = user.user_metadata || {};
    nameEl.textContent = meta.full_name || (user.email || "creator").split("@")[0];
  }
  var emailEl = $("#user-email");
  if (emailEl) emailEl.textContent = user.email || "";
}

/* ---------- posts: server with local fallback ---------- */
var POSTS_CACHE = "penmuse.posts.v2";
var PAGE_CACHE = "penmuse.page.v2";
var CACHE_PREFIX = "penmuse.";
var STUDIO_DRAFT_CACHE = "penmuse.studio.draft";
var LAST_USER_KEY = "penmuse.lastUser";
var LEGACY_CACHE_PREFIX = "launchpad.";

/* One-time namespace migration launchpad.* -> penmuse.*: copy each legacy
   key to its penmuse.* counterpart (never overwriting newer data), then
   remove the legacy key. Idempotent and runs on every load until no legacy
   keys remain. The legacy v1 keys are never copied; guardAccountSwitch
   purges them (GH-19 retires that purge after the grace period). */
function migrateNamespace() {
  try {
    if (typeof localStorage.key !== "function") return;
    var moves = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(LEGACY_CACHE_PREFIX) === 0 &&
          k !== LEGACY_CACHE_PREFIX + "posts.v1" && k !== LEGACY_CACHE_PREFIX + "page.v1") {
        moves.push(k);
      }
    }
    moves.forEach(function (oldKey) {
      try {
        var newKey = CACHE_PREFIX + oldKey.slice(LEGACY_CACHE_PREFIX.length);
        if (localStorage.getItem(newKey) === null) {
          var v = localStorage.getItem(oldKey);
          if (v !== null) localStorage.setItem(newKey, v);
        }
        localStorage.removeItem(oldKey);
      } catch {}
    });
  } catch {}
}
migrateNamespace();

/* Account-scoped local caches: no cross-account fallback, fail closed when identity unresolved */
function currentUserId() {
  var u = currentUser();
  return u && u.id ? String(u.id) : null;
}

function scopedKey(base) {
  var uid = currentUserId();
  return uid ? base + "." + uid : null;
}

function cacheGet(base) {
  var k = scopedKey(base);
  if (!k) return null;
  try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
}

function cacheSet(base, value) {
  var k = scopedKey(base);
  if (!k) return false;
  try { localStorage.setItem(k, JSON.stringify(value)); return true; } catch { return false; }
}

function clearAppCaches() {
  try {
    var del = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(CACHE_PREFIX) === 0 && k !== LAST_USER_KEY) del.push(k);
    }
    del.forEach(function (k) { localStorage.removeItem(k); });
  } catch {}
}

function guardAccountSwitch(user) {
  if (window.penmuseAuth && penmuseAuth.localMode) return;
  var uid = user && user.id ? String(user.id) : null;
  var last = null;
  try { last = localStorage.getItem(LAST_USER_KEY); } catch {}
  if (last !== uid) clearAppCaches(); /* logout or account switch: drop any prior account state */
  /* legacy shared keys are never read; remove them whenever we touch auth state */
  try { localStorage.removeItem("launchpad.posts.v1"); localStorage.removeItem("launchpad.page.v1"); } catch {}
  if (uid) { try { localStorage.setItem(LAST_USER_KEY, uid); } catch {} }
  else { try { localStorage.removeItem(LAST_USER_KEY); } catch {} }
}

function loadPosts(requireFresh) {
  return apiFetch("/.netlify/functions/postsv2").then(function (r) {
    if (!r.ok) throw new Error("api");
    return r.json();
  }).then(function (posts) {
    if (!Array.isArray(posts)) throw new Error("invalid-posts");
    cacheSet(POSTS_CACHE, posts);
    return posts;
  }).catch(function () {
    showPlannerStatus(window.penmuseAuth && penmuseAuth.localMode ? "Could not read this browser’s saved plan." : "Account sync is unavailable. Showing the last saved copy from this browser; new changes need a connection.", true);
    if (requireFresh) throw new Error("read-failed");
    return cacheGet(POSTS_CACHE) || [];
  });
}

function showPlannerStatus(message, isError) {
  var list = $("#post-list");
  if (!list) return;
  var status = $("#planner-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "planner-status";
    status.className = "notice";
    list.parentNode.insertBefore(status, list);
  }
  status.setAttribute("role", isError ? "alert" : "status");
  status.textContent = message;
}

var PLANNER_STATUS_ENUM = ["Draft", "Scheduled", "Published"];
/* Client-side mirror of the SEC-Q11 caps (500 posts, title 200, notes 1000,
   status enum, YYYY-MM-DD date). The v3 staging function currently enforces
   only the 500-post cap (11 Nov black-box findings), so the client refuses
   oversize or malformed posts instead of letting them be stored silently. */
function validatePlannerPosts(posts) {
  if (!Array.isArray(posts)) return "Plan data is not a list.";
  if (posts.length > 500) return "Your plan has " + posts.length + " posts; the limit is 500. Remove some before saving.";
  for (var i = 0; i < posts.length; i++) {
    var p = posts[i] || {};
    if ((p.title || "").length > 200) return "Post " + (i + 1) + " title is over 200 characters.";
    if ((p.notes || "").length > 1000) return "Post " + (i + 1) + " notes are over 1000 characters.";
    if (p.status && PLANNER_STATUS_ENUM.indexOf(p.status) === -1) return "Post " + (i + 1) + " has an unknown status.";
    if (p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return "Post " + (i + 1) + " date must be YYYY-MM-DD.";
  }
  return null;
}

/* Local calendar date as YYYY-MM-DD. toISOString() is UTC and lands on the
   wrong day for users east of UTC during their early morning (CC-02). */
function localISODate(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function savePosts(posts) {
  var invalidPosts = validatePlannerPosts(posts);
  if (invalidPosts) return Promise.reject(new Error("invalid-posts: " + invalidPosts));
  return apiFetch("/.netlify/functions/postsv2", { method: "PUT", body: JSON.stringify(posts) })
    .then(function (r) {
      if (!r.ok) throw new Error("sync-failed");
      /* Never label rejected/offline writes as saved, or overwrite the last good cache. */
      cacheSet(POSTS_CACHE, posts);
      return r;
    });
}

var plannerPosts = [];
var plannerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
var editingPostId = null;
function visiblePlannerPosts(posts) {
  var query = (($('#planner-search') && $('#planner-search').value) || '').trim().toLowerCase();
  var status = ($('#planner-status-filter') && $('#planner-status-filter').value) || 'all';
  var platform = ($('#planner-platform-filter') && $('#planner-platform-filter').value) || 'all';
  return posts.filter(function (p) {
    return (status === 'all' || p.status === status) && (platform === 'all' || p.platform === platform) &&
      (!query || (String(p.title || '') + ' ' + String(p.notes || '') + ' ' + String(p.platform || '')).toLowerCase().includes(query));
  }).sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
}
function renderCalendar(posts) {
  var grid = $('#calendar-grid');
  if (!grid) return;
  var year = plannerMonth.getFullYear(), month = plannerMonth.getMonth();
  $('#calendar-month').textContent = plannerMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  var first = new Date(year, month, 1), startOffset = (first.getDay() + 6) % 7, start = new Date(year, month, 1 - startOffset);
  var headings = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  grid.innerHTML = headings.map(function (day) { return '<div class="calendar-weekday">' + day + '</div>'; }).join('');
  for (var i = 0; i < 42; i++) {
    var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), iso = localISODate(day);
    var events = posts.filter(function (p) { return p.date === iso; });
    grid.insertAdjacentHTML('beforeend', '<div class="calendar-day' + (day.getMonth() !== month ? ' outside' : '') + (iso === localISODate() ? ' today' : '') + '"><span class="calendar-date">' + day.getDate() + '</span>' + events.map(function (p) { return '<button type="button" class="calendar-event" data-edit-id="' + esc(p.id) + '" data-status="' + esc(p.status) + '" title="Edit ' + esc(p.title) + '">' + esc(p.title) + '<small>' + esc(p.platform) + ' · ' + esc(p.status) + '</small></button>'; }).join('') + '</div>');
  }
  grid.querySelectorAll('[data-edit-id]').forEach(function (button) { button.onclick = function () { editPlannerPost(button.dataset.editId); }; });
}
function renderPosts(posts) {
  var list = $('#post-list');
  if (!list) return;
  plannerPosts = posts.slice();
  $('#stat-total').textContent = posts.length;
  $('#stat-scheduled').textContent = posts.filter(function (p) { return p.status === 'Scheduled'; }).length;
  $('#stat-published').textContent = posts.filter(function (p) { return p.status === 'Published'; }).length;
  var dashCount = $('#dash-post-count'); if (dashCount) dashCount.textContent = posts.length;
  var visible = visiblePlannerPosts(posts);
  list.innerHTML = !visible.length ? '<div class="empty-state">' + (posts.length ? 'No posts match these filters.' : 'No posts yet. Add your first post above.') + '</div>' : visible.map(function (p) {
    return '<div class="post-item" data-status="' + esc(p.status) + '"><div class="dot"></div><div class="body"><h4>' + esc(p.title) + '</h4><div class="meta">' + esc(p.platform) + ' · ' + esc(p.date) + ' · ' + esc(p.status) + (p.notes ? '<br>' + esc(p.notes) : '') + '</div></div><div class="actions"><button class="mini-btn" data-act="edit" data-id="' + esc(p.id) + '">Edit</button><button class="mini-btn" data-act="copy" data-id="' + esc(p.id) + '">Duplicate</button><button class="mini-btn" data-act="cycle" data-id="' + esc(p.id) + '">Next status</button><button class="mini-btn" data-act="del" data-id="' + esc(p.id) + '">Delete</button></div></div>';
  }).join('');
  renderCalendar(visible);
}
function editPlannerPost(id) {
  var post = plannerPosts.find(function (p) { return String(p.id) === String(id); });
  if (!post) return;
  editingPostId = post.id;
  $('#f-title').value = post.title || '';
  $('#f-platform').value = post.platform || 'LinkedIn';
  $('#f-date').value = post.date || '';
  $('#f-status').value = post.status || 'Draft';
  $('#f-notes').value = post.notes || '';
  $('#save-post').textContent = 'Save changes';
  $('#cancel-edit').hidden = false;
  $('#add-post').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#f-title').focus({ preventScroll: true });
}
function cancelPlannerEdit() {
  editingPostId = null;
  var form = $('#add-post');
  if (form) form.reset();
  if ($('#save-post')) $('#save-post').textContent = 'Add to plan';
  if ($('#cancel-edit')) $('#cancel-edit').hidden = true;
}

function initPlanner() {
  if (!$("#post-list")) return;
  var saving = false;
  function persist(posts, onSaved) {
    if (saving) return Promise.resolve(false);
    saving = true;
    $all("#add-post button, #post-list button, #clear-posts").forEach(function (btn) { btn.disabled = true; });
    showPlannerStatus(window.penmuseAuth && penmuseAuth.localMode ? "Saving in this browser..." : "Saving to your account...", false);
    return savePosts(posts).then(function () {
      renderPosts(posts);
      if (onSaved) onSaved();
      showPlannerStatus(window.penmuseAuth && penmuseAuth.localMode ? "Saved in this browser." : "Saved to your account.", false);
      return true;
    }).catch(function (err) {
      var invalid = err && err.message && err.message.indexOf("invalid-posts: ") === 0;
      showPlannerStatus(invalid ? "Not saved: " + err.message.slice(15) : window.penmuseAuth && penmuseAuth.localMode ? "Could not save in this browser. Your change was not saved; keep this page open and try again." : "Could not save to your account. Your change was not saved. Your draft is still here; reconnect and try again.", true);
      return false;
    }).then(function (saved) {
      saving = false;
      $all("#add-post button, #post-list button, #clear-posts").forEach(function (btn) { btn.disabled = false; });
      return saved;
    });
  }
  loadPosts().then(renderPosts);

  $('#planner-search').addEventListener('input', function () { renderPosts(plannerPosts); });
  $('#planner-status-filter').addEventListener('change', function () { renderPosts(plannerPosts); });
  $('#planner-platform-filter').addEventListener('change', function () { renderPosts(plannerPosts); });
  $('#planner-list-view').addEventListener('click', function () {
    $('#post-list').hidden = false; $('#planner-calendar').hidden = true;
    $('#planner-list-view').setAttribute('aria-pressed', 'true'); $('#planner-calendar-view').setAttribute('aria-pressed', 'false');
  });
  $('#planner-calendar-view').addEventListener('click', function () {
    $('#post-list').hidden = true; $('#planner-calendar').hidden = false;
    $('#planner-list-view').setAttribute('aria-pressed', 'false'); $('#planner-calendar-view').setAttribute('aria-pressed', 'true');
  });
  $('#calendar-prev').addEventListener('click', function () { plannerMonth = new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() - 1, 1); renderCalendar(visiblePlannerPosts(plannerPosts)); });
  $('#calendar-next').addEventListener('click', function () { plannerMonth = new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() + 1, 1); renderCalendar(visiblePlannerPosts(plannerPosts)); });
  $('#calendar-today').addEventListener('click', function () { plannerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(visiblePlannerPosts(plannerPosts)); });
  $('#cancel-edit').addEventListener('click', cancelPlannerEdit);

  $("#add-post").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (saving) return;
    var post = {
      id: editingPostId || "p" + Date.now(),
      title: $("#f-title").value.trim(),
      platform: $("#f-platform").value,
      date: $("#f-date").value || localISODate(),
      status: $("#f-status").value,
      notes: $("#f-notes").value.trim()
    };
    if (!post.title) return;
    loadPosts(true).then(function (posts) {
      if (editingPostId) {
        var found = posts.find(function (item) { return String(item.id) === String(editingPostId); });
        if (!found) throw new Error('The post could not be found. Reload the planner and try again.');
        Object.assign(found, post);
      } else posts.push(post);
      return persist(posts, cancelPlannerEdit);
    }).catch(function () {
      showPlannerStatus("Could not load the latest plan, so nothing was changed. Your draft is still here; reconnect and try again.", true);
    });
  });

  $("#post-list").addEventListener("click", function (ev) {
    var btn = ev.target.closest("button[data-act]");
    if (!btn || saving) return;
    if (btn.dataset.act === 'edit') { editPlannerPost(btn.dataset.id); return; }
    loadPosts(true).then(function (posts) {
      var p = posts.find(function (x) { return x.id === btn.dataset.id; });
      if (!p) return;
      if (btn.dataset.act === "del") { posts = posts.filter(function (x) { return x.id !== p.id; }); if (String(editingPostId) === String(p.id)) cancelPlannerEdit(); }
      else if (btn.dataset.act === 'copy') {
        var duplicate = Object.assign({}, p, { id: 'p' + Date.now(), title: (String(p.title || 'Untitled post') + ' (copy)').slice(0, 200), status: 'Draft' });
        posts.push(duplicate);
      } else {
        var order = ["Draft", "Scheduled", "Published"];
        p.status = order[(order.indexOf(p.status) + 1) % order.length];
      }
      return persist(posts);
    }).catch(function () {
      showPlannerStatus("Could not load the latest plan, so nothing was changed. Reconnect and try again.", true);
    });
  });

  $("#export-posts").addEventListener("click", function () {
    var btn = this;
    loadPosts().then(function (posts) { copyText(JSON.stringify(posts, null, 2), btn); });
  });

  $("#clear-posts").addEventListener("click", async function () {
    if (saving || !await confirmAction("Remove every planned post?")) return;
    cancelPlannerEdit();
    persist([]);
  });
}

/* ---------- post studio ---------- */
var HOOKS = {
  LinkedIn: [
    "Nobody talks about this part of {topic}.",
    "I spent {time} learning {topic} the hard way. Here is the short version.",
    "{topic}: what I believed vs. what is actually true.",
    "Unpopular opinion: {topic} is simpler than people make it.",
    "If I had to start {topic} again from zero, this is exactly what I would do."
  ],
  Instagram: [
    "POV: you finally understand {topic}.",
    "3 things about {topic} I wish someone told me earlier.",
    "Save this before you start with {topic}.",
    "The {topic} mistake almost everyone makes.",
    "Day one of sharing everything I learn about {topic}."
  ],
  "X (Twitter)": [
    "{topic} in one sentence:",
    "Most advice about {topic} is noise. The signal:",
    "I studied {topic} so you do not have to. Findings:",
    "Hot take: {topic} rewards consistency more than talent.",
    "A thread on {topic} from someone still in the arena:"
  ],
  YouTube: [
    "I tried {topic} so you do not have to",
    "{topic} explained in under 5 minutes",
    "The truth about {topic} nobody shows you",
    "Beginner to confident: my {topic} roadmap",
    "What {topic} actually looks like behind the scenes"
  ]
};

var CAPTIONS = {
  professional: "Working on {topic} has taught me more than any textbook. The biggest lesson: start before you feel ready, and let consistency do the compounding. I share what I learn as I go - follow along if you are building too.",
  casual: "Been deep into {topic} lately and honestly it changes how you see everything else. Still learning, still building. More coming soon.",
  bold: "Most people will scroll past {topic}. A few will act on it. Those few win. I am documenting the whole journey - no filter, no fluff."
};

var HASHTAGS = {
  LinkedIn: "#entrepreneurship #startuplife #learning #discipline #buildinpublic",
  Instagram: "#creatorjourney #startupindia #discipline #growthmindset #learninpublic",
  "X (Twitter)": "#buildinpublic #startups #learning",
  YouTube: "#startup #entrepreneur #learning #india"
};

function fill(str, topic, time) {
  return str.split("{topic}").join(topic).split("{time}").join(time);
}

function templateGenerate(platform, topic, tone, time) {
  var hooks = HOOKS[platform] || HOOKS.LinkedIn;
  var caption = CAPTIONS[tone] || CAPTIONS.casual;
  var tags = HASHTAGS[platform] || HASHTAGS.LinkedIn;
  return {
    hooks: hooks.map(function (h) { return fill(h, topic, time); }),
    caption: fill(caption, topic, time),
    hashtags: fill(tags, topic, time),
    engine: "template"
  };
}

/* A usable Studio result needs at least one real hook, a caption or
   hashtags. The gated function can answer 200 with an error body such as
   {"error":"ai-not-configured"}; treat those as no-AI and fall back. */
function isValidStudioResult(res) {
  if (!res || typeof res !== "object") return false;
  if (Array.isArray(res.hooks) && res.hooks.some(function (h) { return typeof h === "string" && h.trim(); })) return true;
  if (typeof res.caption === "string" && res.caption.trim()) return true;
  if (typeof res.hashtags === "string" && res.hashtags.trim()) return true;
  return false;
}

function renderStudioResult(res) {
  $("#out-hooks").textContent = (res.hooks || []).map(function (h, i) { return (i + 1) + ". " + h; }).join("\n");
  $("#out-caption").textContent = res.caption || "";
  $("#out-tags").textContent = res.hashtags || "";
  var countEl = $("#caption-count");
  if (countEl && $("#s-platform")) {
    var count = studioCaptionCount($("#s-platform").value, res.caption, res.hashtags);
    countEl.textContent = count.used + " / " + count.limit + " characters";
    countEl.classList.toggle("over", count.used > count.limit);
    countEl.setAttribute("aria-label", count.used > count.limit
      ? "Caption and hashtags are " + (count.used - count.limit) + " characters over the " + ($("#s-platform").value) + " guide"
      : "Caption and hashtags use " + count.used + " of " + count.limit + " characters for " + $("#s-platform").value);
  }
  var badge = $("#engine-badge");
  if (badge) badge.textContent = res.engine === "ai" ? "AI engine" : "Template engine";
  var note = $("#out-engine-note");
  if (note) note.textContent = (res.engine === "ai" ? "Generated by the AI engine." : "Generated by the built-in template engine.") + " Edit before posting - your voice is the point.";
  $("#studio-out").style.display = "block";
  $("#studio-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

var STUDIO_LIMITS = {
  LinkedIn: 3000,
  Instagram: 2200,
  "X (Twitter)": 280,
  YouTube: 5000
};

function studioCaptionCount(platform, caption, hashtags) {
  var limit = STUDIO_LIMITS[platform] || STUDIO_LIMITS.LinkedIn;
  var text = String(caption || "");
  if (platform !== "YouTube") text += (text ? "\n\n" : "") + String(hashtags || "");
  return { used: text.length, limit: limit };
}

function showStudioStatus(message, isError) {
  var status = $("#studio-status");
  if (!status) return;
  status.textContent = message;
  status.setAttribute("role", isError ? "alert" : "status");
  status.hidden = false;
}

function collectStudioDraft() {
  return {
    platform: $("#s-platform") ? $("#s-platform").value : "LinkedIn",
    topic: $("#s-topic") ? $("#s-topic").value : "",
    time: $("#s-time") ? $("#s-time").value : "",
    tone: $("#s-tone") ? $("#s-tone").value : "professional",
    result: null
  };
}

function fillStudioDraft(draft) {
  if (!draft) return false;
  if (draft.result) lastStudioResult = draft.result;
  if ($("#s-platform") && draft.platform) $("#s-platform").value = draft.platform;
  if ($("#s-topic")) $("#s-topic").value = draft.topic || "";
  if ($("#s-time")) $("#s-time").value = draft.time || "";
  if ($("#s-tone") && draft.tone) $("#s-tone").value = draft.tone;
  if (draft.result && isValidStudioResult(draft.result)) {
    renderStudioResult(draft.result);
  } else {
    draft.result = null;
    lastStudioResult = null;
  }
  return true;
}

function studioDraftKey() {
  var k = scopedKey(STUDIO_DRAFT_CACHE);
  /* The scoped cache key exists only for signed-in users, so anonymous
     drafts deliberately use the unscoped key. */
  return k || STUDIO_DRAFT_CACHE;
}

var lastStudioResult = null;
function saveStudioDraft(result) {
  if (result) lastStudioResult = result;
  var draft = collectStudioDraft();
  if (result) draft.result = result;
  else if (lastStudioResult) draft.result = lastStudioResult;
  var badge = $("#studio-draft-status");
  try {
    localStorage.setItem(studioDraftKey(), JSON.stringify(draft));
    if (badge) {
      badge.hidden = false;
      badge.textContent = "Draft kept in this browser";
    }
    return true;
  } catch {
    if (badge) {
      badge.hidden = false;
      badge.textContent = "Browser draft unavailable";
    }
    return false;
  }
}

function loadStudioDraft() {
  try {
    var raw = localStorage.getItem(studioDraftKey());
    if (!raw) return false;
    var draft = JSON.parse(raw);
    var restored = fillStudioDraft(draft);
    if (restored) {
      var badge = $("#studio-draft-status");
      if (badge) {
        badge.hidden = false;
        badge.textContent = "Draft restored from this browser";
      }
    }
    return restored;
  } catch {
    return false;
  }
}

function initStudio() {
  var form = $("#studio-form");
  if (!form) return;
  loadStudioDraft();
  function latestResult() { return lastStudioResult; }
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var platform = $("#s-platform").value;
    var topic = $("#s-topic").value.trim() || "building a startup";
    var tone = $("#s-tone").value;
    var time = $("#s-time").value.trim() || "6 months";
    var generateButton = form.querySelector('button[type="submit"]');
    if (generateButton) generateButton.disabled = true;
    showStudioStatus("Generating template draft...", false);

    /* Try the gated server AI function first; a rejection/offline response
       uses the local template engine and is labelled as such. */
    apiFetch("/.netlify/functions/generatev2", {
      method: "POST",
      body: JSON.stringify({ platform: platform, topic: topic, tone: tone, time: time })
    }).then(function (r) {
      if (!r.ok) throw new Error("no-ai");
      return r.json();
    }).then(function (res) {
      if (!isValidStudioResult(res)) throw new Error("invalid-ai-response");
      res.engine = "ai";
      renderStudioResult(res);
      saveStudioDraft(res);
      showStudioStatus("Draft generated.", false);
    }).catch(function () {
      var result = templateGenerate(platform, topic, tone, time);
      renderStudioResult(result);
      saveStudioDraft(result);
      showStudioStatus("Draft generated with the built-in template engine. AI stays off until billing is approved.", false);
    }).then(function () {
      if (generateButton) generateButton.disabled = false;
    });
  });
  $all("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyText($(btn.dataset.copy).textContent, btn);
    });
  });
  var clearDraft = $("#studio-clear-draft");
  if (clearDraft) clearDraft.addEventListener("click", async function () {
    if (!await confirmAction("Discard this Studio draft? It will be removed from this browser.")) return;
    lastStudioResult = null;
    try { localStorage.removeItem(studioDraftKey()); } catch {}
    form.reset();
    $("#studio-out").style.display = "none";
    var badge = $("#studio-draft-status");
    if (badge) badge.hidden = true;
    showStudioStatus("Draft discarded from this browser.", false);
  });
  var savePlanner = $("#studio-save-planner");
  if (savePlanner) savePlanner.addEventListener("click", async function () {
    if (!latestResult()) {
      showStudioStatus("Generate a draft before saving it to your planner.", true);
      return;
    }
    if (!currentUser()) {
      showStudioStatus("Log in before saving to your planner. The generated draft stays in this browser.", true);
      return;
    }
    if (!await confirmAction("Save this Studio result as a new draft post in your Content Planner?")) return;
    savePlanner.disabled = true;
    showStudioStatus("Saving draft to your planner...", false);
    loadPosts(true).then(function (posts) {
      var current = latestResult();
      var text = current.caption || (current.hooks && current.hooks[0]) || "Studio draft";
      var notes = studioPlannerNotes(current, $("#s-platform").value, $("#s-tone").value);
      posts.push({
        id: "p" + Date.now(),
        title: text.split("\n")[0].slice(0, 90) || "Studio draft",
        platform: $("#s-platform").value,
        date: localISODate(),
        status: "Draft",
        notes: notes
      });
      return savePosts(posts);
    }).then(function () {
      showStudioStatus("Saved to your Content Planner as a draft. Notes may be shortened to fit the planner; the full draft stays in Studio.", false);
    }).catch(function () {
      showStudioStatus("Could not save to your Content Planner. The Studio draft is still in this browser; reconnect and try again.", true);
    }).then(function () {
      savePlanner.disabled = false;
    });
  });
}

/* ---------- page editor ---------- */
function collectPage() {
  var links = {};
  ["github", "linkedin", "instagram", "x", "youtube", "website"].forEach(function (k) {
    var v = $("#l-" + k).value.trim();
    if (v) links[k] = v;
  });
  var projects = [];
  for (var i = 1; i <= 3; i++) {
    var t = $("#p" + i + "-title").value.trim();
    if (t) projects.push({ tag: $("#p" + i + "-tag").value.trim(), title: t, desc: $("#p" + i + "-desc").value.trim() });
  }
  var experience = [];
  for (var j = 1; j <= 4; j++) {
    var xt = $("#x" + j + "-title").value.trim();
    if (xt) experience.push({ title: xt, when: $("#x" + j + "-when").value.trim() });
  }
  return {
    name: $("#e-name").value.trim(),
    handle: $("#e-handle").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
    role: $("#e-role").value.trim(),
    location: $("#e-loc").value.trim(),
    bio: $("#e-bio").value.trim(),
    links: links,
    projects: projects,
    experience: experience
  };
}

function fillPageForm(pg) {
  if (!pg) return;
  $("#e-name").value = pg.name || "";
  $("#e-handle").value = pg.handle || "";
  $("#e-role").value = pg.role || "";
  $("#e-loc").value = pg.location || "";
  $("#e-bio").value = pg.bio || "";
  var links = pg.links || {};
  ["github", "linkedin", "instagram", "x", "youtube", "website"].forEach(function (k) {
    if (links[k]) $("#l-" + k).value = links[k];
  });
  (pg.projects || []).forEach(function (p, i) {
    var n = i + 1;
    $("#p" + n + "-tag").value = p.tag || "";
    $("#p" + n + "-title").value = p.title || "";
    $("#p" + n + "-desc").value = p.desc || "";
  });
  (pg.experience || []).forEach(function (x, i) {
    var n = i + 1;
    $("#x" + n + "-title").value = x.title || "";
    $("#x" + n + "-when").value = x.when || "";
  });
}

/* Client-side mirror of the SEC-Q12 rules: https-only links, sensible field
   caps. The v3 staging function drops javascript: links but still stores
   http:// links and fields of any length (11 Nov black-box findings). */
function validatePageInput(pg) {
  if (!pg.handle || pg.handle.length < 3 || pg.handle.length > 30) return "Handle must be 3-30 lowercase letters, numbers or dashes.";
  if ((pg.name || "").length > 100) return "Name is over 100 characters.";
  if ((pg.role || "").length > 100) return "Role is over 100 characters.";
  if ((pg.location || "").length > 100) return "Location is over 100 characters.";
  if ((pg.bio || "").length > 2000) return "Bio is over 2000 characters.";
  var keys = Object.keys(pg.links || {});
  for (var i = 0; i < keys.length; i++) {
    var v = pg.links[keys[i]];
    if (v && !/^https:\/\//i.test(v)) return "Links must start with https:// - fix the " + (keys[i] === "x" ? "X (Twitter)" : keys[i]) + " link.";
    if (v && v.length > 200) return "The " + keys[i] + " link is too long.";
  }
  return null;
}

function initPageEditor() {
  var form = $("#page-form");
  if (!form) return;

  apiFetch("/.netlify/functions/pagev2").then(function (r) {
    if (!r.ok) throw new Error("api");
    return r.json();
  }).then(function (pg) {
    if (pg && pg.page) fillPageForm(pg.page);
  }).catch(function () {
    var cachedPage = cacheGet(PAGE_CACHE); if (cachedPage) fillPageForm(cachedPage);
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var pg = collectPage();
    var status = $("#save-status");
    var invalidPage = validatePageInput(pg);
    if (invalidPage) {
      status.style.display = "";
      status.className = "notice";
      status.setAttribute("role", "alert");
      status.textContent = "Not published: " + invalidPage;
      return;
    }
    var cached = cacheSet(PAGE_CACHE, pg);
    var saveButton = form.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;
    status.style.display = "block";
    status.className = "notice";
    status.setAttribute("role", "status");
    status.textContent = window.penmuseAuth && penmuseAuth.localMode ? "Saving this page in your browser..." : "Saving your page to your account...";
    apiFetch("/.netlify/functions/pagev2", { method: "PUT", body: JSON.stringify(pg) })
      .then(function (r) {
        if (r.status === 409) throw new Error("handle-taken");
        if (!r.ok) throw new Error("api");
        return r.json();
      }).then(function (res) {
        status.style.display = "";
        status.className = "notice";
        status.textContent = "Saved - live at p.html?u=" + (res.handle || pg.handle);
      }).catch(function (err) {
        status.style.display = "";
        status.className = "notice";
        status.setAttribute("role", "alert");
        status.textContent = err.message === "handle-taken"
          ? "Not published: that handle is taken. Pick another."
          : cached
            ? window.penmuseAuth && penmuseAuth.localMode ? "Could not save in this browser. Your unsaved edits are still on this screen; try again." : "Not published. Your draft is saved only in this browser; account sync is unavailable. Reconnect and try again."
            : "Not saved. Browser storage and account sync are unavailable. Keep this page open and copy your draft before leaving.";
      }).then(function () { if (saveButton) saveButton.disabled = false; });
  });
}

/* ---------- dashboard ---------- */
function loadPostsWithRetry(retries) {
  return apiFetch("/.netlify/functions/postsv2").then(function (r) {
    if (!r.ok) throw new Error("api");
    return r.json();
  }).catch(function () {
    if (retries > 0) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(loadPostsWithRetry(retries - 1)); }, 1200);
      });
    }
    return cacheGet(POSTS_CACHE) || [];
  });
}
function initDashboard() {
  if (!$("#dash-post-count")) return;
  var copyPublicButton = $("#copy-public-url");
  if (copyPublicButton) copyPublicButton.disabled = true;
  var gsEl = $("#getting-started");
  var gsState = { posts: 0, handle: null, copied: !!cacheGet("gs.copied") };
  function gsRender() {
    if (!gsEl) return;
    var donePage = !!gsState.handle, donePost = gsState.posts > 0, doneShare = donePage && gsState.copied;
    if (cacheGet("gs.dismissed") || (donePage && donePost && doneShare)) { gsEl.hidden = true; return; }
    gsEl.hidden = false;
    gsEl.querySelector('[data-step="page"]').classList.toggle("done", donePage);
    gsEl.querySelector('[data-step="post"]').classList.toggle("done", donePost);
    gsEl.querySelector('[data-step="share"]').classList.toggle("done", doneShare);
  }
  var dismissBtn = $("#dismiss-checklist");
  if (dismissBtn) dismissBtn.addEventListener("click", function () { cacheSet("gs.dismissed", true); if (gsEl) gsEl.hidden = true; });
  loadPostsWithRetry(2).then(function (posts) {
    $("#dash-post-count").textContent = posts.length;
    gsState.posts = posts.length; gsRender();
  });
  apiFetch("/.netlify/functions/pagev2").then(function (r) { return r.ok ? r.json() : null; })
    .then(function (res) {
      var el = $("#public-url");
      if (!el) return;
      var handle = res && res.page && res.page.handle;
      if (handle) {
        var url = location.origin + "/p.html?u=" + handle;
        el.textContent = url;
        if (copyPublicButton) copyPublicButton.disabled = false;
        gsState.handle = handle;
        $("#copy-public-url").addEventListener("click", function () { copyText(url, this).then(function (ok) { if (ok) { cacheSet("gs.copied", true); gsState.copied = true; gsRender(); } }); });
      } else {
        el.textContent = "Save your page in the editor to get your link";
      }
      gsRender();
    }).catch(function () {
      var el = $("#public-url");
      if (el) el.textContent = "Save your page in the editor to get your link";
      gsRender();
    });
  if (penmuseAuth && penmuseAuth.localMode) {
    var backup = $("#local-backup"), exportButton = $("#export-local-backup"), importInput = $("#import-local-backup"), backupStatus = $("#backup-status");
    if (backup) backup.hidden = false;
    if (exportButton) exportButton.addEventListener("click", function () {
      try {
        var blob = new Blob([JSON.stringify(penmuseAuth.exportLocalData(), null, 2)], { type: "application/json" });
        var link = document.createElement("a"), url = URL.createObjectURL(blob);
        link.href = url; link.download = "penmuse-local-backup.json"; link.click(); URL.revokeObjectURL(url);
        backupStatus.textContent = "Backup downloaded to your device.";
      } catch { backupStatus.textContent = "Could not create a backup. Check browser storage settings."; }
    });
    if (importInput) importInput.addEventListener("change", async function () {
      var file = importInput.files && importInput.files[0]; if (!file) return;
      if (!await confirmAction("Import this backup and replace the current local profile, plan, and chat?")) { importInput.value = ""; return; }
      try { penmuseAuth.importLocalData(JSON.parse(await file.text())); backupStatus.textContent = "Backup imported. Refreshing your workspace…"; location.reload(); }
      catch (err) { backupStatus.textContent = err.message || "Could not import that backup."; }
      importInput.value = "";
    });
  }
}

/* ---------- public creator page ---------- */
function renderPublicPage(pg, handle) {
  var root = $("#page-root");
  var linksHtml = "";
  var linkLabels = { github: "GitHub", linkedin: "LinkedIn", instagram: "Instagram", x: "X (Twitter)", youtube: "YouTube", website: "Website" };
  Object.keys(pg.links || {}).forEach(function (k) {
    if (!/^https?:\/\//i.test(pg.links[k])) return; /* only http(s) URLs render as links */
    var handleTxt = pg.links[k].replace(/^https?:\/\//, "").replace(/\/$/, "");
    linksHtml += '<a class="link-pill" href="' + esc(pg.links[k]) + '" target="_blank" rel="noopener">' +
      "<span>" + esc(linkLabels[k] || k) + '</span><span class="handle">' + esc(handleTxt) + "</span></a>";
  });
  var projectsHtml = (pg.projects || []).map(function (p) {
    return '<div class="card project-card">' +
      (p.tag ? '<span class="tag">' + esc(p.tag) + "</span>" : "") +
      "<h3>" + esc(p.title) + "</h3><p>" + esc(p.desc || "") + "</p></div>";
  }).join("");
  var expHtml = (pg.experience || []).map(function (x) {
    return '<div class="timeline-item"><h3>' + esc(x.title) + '</h3><div class="when">' + esc(x.when || "") + "</div></div>";
  }).join("");
  var initials = (pg.name || handle || "?").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();

  document.title = (pg.name || handle) + " | PenMuse";
  root.innerHTML =
    '<header class="profile-head wrap">' +
    '<div class="avatar">' + esc(initials) + "</div>" +
    "<h1>" + esc(pg.name || handle) + "</h1>" +
    (pg.role ? '<div class="role">' + esc(pg.role) + "</div>" : "") +
    (pg.location ? '<div class="loc">' + esc(pg.location) + "</div>" : "") +
    (pg.bio ? '<p class="bio">' + esc(pg.bio) + "</p>" : "") +
    (linksHtml ? '<div class="link-list">' + linksHtml + "</div>" : "") +
    "</header>" +
    (projectsHtml ? '<section class="section wrap"><h2 class="section-title">Currently building</h2><div class="grid grid-3">' + projectsHtml + "</div></section>" : "") +
    (expHtml ? '<section class="section wrap"><h2 class="section-title">Experience</h2><div class="timeline">' + expHtml + "</div></section>" : "");
}

function initPublicPage() {
  var root = $("#page-root");
  if (!root) return;
  var params = new URLSearchParams(location.search);
  var handle = (params.get("u") || "").toLowerCase();
  if (!handle) {
    root.innerHTML = '<div class="empty-state wrap" style="margin-top:60px;">This page needs a creator handle, e.g. p.html?u=yourname</div>';
    return;
  }
  (window.penmuseAuth && penmuseAuth.localMode
    ? penmuseAuth.localFetch(window.PENMUSE_FN.pages + "?u=" + encodeURIComponent(handle))
    : fetch(window.PENMUSE_FN.pages + "?u=" + encodeURIComponent(handle), { headers: { Authorization: "Bearer " + window.PENMUSE_ANON } }))
    .then(function (r) {
      if (r.status === 404) { var e = new Error("not-found"); e.kind = "not-found"; throw e; }
      if (!r.ok) { var e2 = new Error("load-failed"); e2.kind = "load-failed"; throw e2; }
      return r.json();
    })
    .then(function (res) { renderPublicPage(res.page, handle); })
    .catch(function (err) {
      if (err && err.kind === "not-found") {
        root.innerHTML = '<div class="empty-state wrap" style="margin-top:60px;">No creator page found for "' + esc(handle) + '" yet. <a href="index.html" style="color:var(--accent)">Claim it</a>.</div>';
      } else {
        root.innerHTML = '<div class="empty-state wrap" style="margin-top:60px;">Could not load this page right now - check your connection and try again.</div>';
      }
    });
}

document.addEventListener("DOMContentLoaded", function () {
  initAuth().then(function (canOpen) {
    if (!canOpen) return;
    initPlanner();
    initStudio();
    initPageEditor();
    initDashboard();
    initPublicPage();
  });
});

/* Scroll reveal */
(function () {
  if (!("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".card, .section-title, .section-sub, .bento-card").forEach(function (el) {
      el.classList.add("reveal"); io.observe(el);
    });
  });
})();

/* Mobile nav toggle */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".nav-toggle");
    var links = document.querySelector(".nav-links");
    if (btn && links) {
      btn.addEventListener("click", function () {
        var open = links.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (window.penmuseAuth) {
      penmuseAuth.ready.then(function (user) {
        $all("[data-dashboard-cta]").forEach(function (el) { el.style.display = user ? "" : "none"; });
      });
      penmuseAuth.onChange(function (event, _user) {
        if (event === "SIGNED_IN") $all("[data-dashboard-cta]").forEach(function (el) { el.style.display = ""; });
        if (event === "SIGNED_OUT") $all("[data-dashboard-cta]").forEach(function (el) { el.style.display = "none"; });
      });
    }
  });
})();

/* Studio: truthful AI status pill */
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var host = document.getElementById("ai-status-host");
    if (!host) return;
    apiFetch("/.netlify/functions/generatev2").then(function (r) { return r.json(); }).then(function (j) {
      var on = j && j.enabled === true;
      host.innerHTML = '<span class="ai-status ' + (on ? "on" : "off") + '"><span class="dot"></span>' +
        (on ? "AI drafting: on" : "AI drafting: off - template engine active") + "</span>";
    }).catch(function () {
      host.innerHTML = '<span class="ai-status off"><span class="dot"></span>AI drafting: off - template engine active</span>';
    });
  });
})();

/* ---------- premium auth modal (custom UI on the same Netlify Identity backend) ---------- */
var authModal = null;
var authReturnFocus = null;
var authInertSiblings = [];
var authBodyOverflow = "";
var authMode = "login";
var authBusy = false;

function buildAuthModal() {
  if (authModal) return authModal;
  var d = document.createElement("div");
  d.className = "auth-backdrop";
  d.id = "authBackdrop";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-labelledby", "authTitle");
  d.innerHTML =
    '<div class="auth-card">' +
    '<button type="button" class="auth-close" id="authClose" aria-label="Close">&times;</button>' +
    '<div class="auth-brand"><img class="auth-mark" src="assets/penmuse-mark.svg" alt=""><span>PenMuse</span></div>' +
    '<h3 id="authTitle"></h3>' +
    '<p class="auth-sub" id="authSub"></p>' +
    '<div class="auth-error" id="authError" role="alert" hidden></div>' +
    '<div class="auth-note" id="authNote" hidden></div>' +
    '<form id="authForm" novalidate>' +
    '<label class="auth-field" id="authNameWrap" hidden><span>Name</span><input id="authName" type="text" autocomplete="name" maxlength="80"></label>' +
    '<label class="auth-field"><span>Email</span><input id="authEmail" type="email" autocomplete="email" required></label>' +
    '<label class="auth-field" id="authPassWrap"><span>Password</span><input id="authPass" type="password" autocomplete="current-password" required minlength="6"></label>' +
    '<button class="auth-submit" type="submit" id="authSubmit"><span id="authSubmitLabel"></span><span class="auth-spinner" id="authSpinner" hidden></span></button>' +
    '</form>' +
    '<div class="auth-links"><a href="#" id="authSwitch"></a><a href="#" id="authForgot">Forgot password?</a></div>' +
    '<p class="auth-legal">Your public page is visible to everyone. Your planner and chats stay private to your account.</p>' +
    '</div>';
  document.body.appendChild(d);
  authModal = d;

  $("#authClose").addEventListener("click", closeAuthModal);
  d.addEventListener("click", function (ev) { if (ev.target === d) closeAuthModal(); });
  document.addEventListener("keydown", function (ev) {
    if (!authModal || !authModal.classList.contains("open")) return;
    if (ev.key === "Escape") { ev.preventDefault(); closeAuthModal(); }
    if (ev.key === "Tab") {
      var items = Array.from(authModal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(function (el) {
        return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
      });
      var first = items[0], last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || !authModal.contains(document.activeElement))) {
        ev.preventDefault(); if (last) last.focus();
      } else if (!ev.shiftKey && (document.activeElement === last || !authModal.contains(document.activeElement))) {
        ev.preventDefault(); if (first) first.focus();
      }
    }
  });
  $("#authSwitch").addEventListener("click", function (ev) {
    ev.preventDefault();
    setAuthMode(authMode === "login" ? "signup" : "login");
  });
  $("#authForgot").addEventListener("click", function (ev) { ev.preventDefault(); authForgotPassword(); });
  $("#authForm").addEventListener("submit", function (ev) { ev.preventDefault(); submitAuthForm(); });
  return d;
}

function setAuthMode(mode) {
  authMode = mode;
  var login = mode === "login";
  $("#authTitle").textContent = login ? "Welcome back" : "Create your account";
  $("#authSub").textContent = login
    ? "Log in to your creator workspace."
    : "Set up your workspace - pages, planner and chat in one place.";
  $("#authSubmitLabel").textContent = login ? "Log in" : "Create account";
  $("#authNameWrap").hidden = login;
  $("#authPass").setAttribute("autocomplete", login ? "current-password" : "new-password");
  $("#authPass").setAttribute("minlength", login ? "6" : "10");
  $("#authSwitch").textContent = login ? "New here? Create an account" : "Already have an account? Log in";
  hideAuthMsgs();
}

function openAuthModal(mode) {
  authModalUsed = true;
  buildAuthModal();
  if (!authModal.classList.contains("open")) {
    authReturnFocus = document.activeElement;
    authBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    authInertSiblings = Array.from(document.body.children).filter(function (el) { return el !== authModal; }).map(function (el) {
      var old = el.inert;
      el.inert = true;
      return { el: el, inert: old };
    });
  }
  setAuthMode(mode || "login");
  authBusy = false;
  $("#authForm").hidden = false;
  $("#authSubmit").disabled = false;
  $("#authSpinner").hidden = true;
  $("#authPass").value = "";
  authModal.classList.add("open");
  setTimeout(function () { if (authModal.classList.contains("open")) $("#authEmail").focus(); }, 60);
}

function closeAuthModal() {
  if (!authModal || !authModal.classList.contains("open")) return;
  authModal.classList.remove("open");
  authInertSiblings.forEach(function (item) { item.el.inert = item.inert; });
  authInertSiblings = [];
  document.body.style.overflow = authBodyOverflow;
  hideAuthMsgs();
  if (authReturnFocus && authReturnFocus.isConnected) authReturnFocus.focus();
  authReturnFocus = null;
}

function hideAuthMsgs() {
  var e = $("#authError"), n = $("#authNote");
  if (e) { e.hidden = true; e.textContent = ""; }
  if (n) { n.hidden = true; n.textContent = ""; }
}

function authShowError(msg) {
  var e = $("#authError");
  e.textContent = msg;
  e.hidden = false;
}

function authShowNote(msg) {
  var n = $("#authNote");
  n.textContent = msg;
  n.hidden = false;
}

function authErrorMessage(err, fallback) {
  var raw = "";
  if (err) {
    if (err.json && (err.json.error_description || err.json.error || err.json.msg)) {
      raw = err.json.error_description || err.json.error || err.json.msg;
    } else if (err.message) {
      raw = err.message;
    }
  }
  raw = String(raw || "");
  if (/invalid (login|grant|credentials)|email or password|no user found/i.test(raw)) return "Incorrect email or password.";
  if (/not confirmed|confirm/i.test(raw)) return "Please confirm your email first - the confirmation link is in your inbox.";
  if (/rate limit|too many|429/i.test(raw)) return "Too many attempts - wait a minute and try again.";
  if (/already registered|already exists|taken/i.test(raw)) return "That email already has an account - try logging in instead.";
  return fallback || "Something went wrong - please try again.";
}

function setAuthBusy(busy) {
  authBusy = busy;
  $("#authSubmit").disabled = busy;
  $("#authSpinner").hidden = !busy;
}

function submitAuthForm() {
  if (authBusy) return;
  var email = $("#authEmail").value.trim();
  var pass = $("#authPass").value;
  var name = $("#authName").value.trim();
  hideAuthMsgs();
  if (!email || email.indexOf("@") < 1) { authShowError("Enter a valid email address."); return; }
  if (authMode === "signup") {
    var weak = ["123456", "12345678", "123456789", "1234567890", "password", "password1", "qwerty123", "11111111", "iloveyou", "abc12345", "password123", "qwerty12345", "letmein1234", "welcome123", "iloveyou123", "abc1234567"];
    if (!pass || pass.length < 10) { authShowError("Choose a stronger password: at least 10 characters."); return; }
    if (!/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass)) { authShowError("Choose a stronger password: mix letters and numbers."); return; }
    if (weak.indexOf(pass.toLowerCase()) !== -1) { authShowError("That password is too common - pick something harder to guess."); return; }
  } else if (!pass || pass.length < 6) { authShowError("Password must be at least 6 characters."); return; }
  setAuthBusy(true);
  if (authMode === "login") {
    penmuseAuth.signIn(email, pass)
      .then(function () { window.location.reload(); })
      .catch(function (err) {
        setAuthBusy(false);
        authShowError(authErrorMessage(err, "Could not log you in - please try again."));
      });
  } else {
    penmuseAuth.signUp(email, pass, name)
      .then(function (data) {
        if (data && data.session) { window.location.reload(); return; }
        setAuthBusy(false);
        setAuthMode("login");
        $("#authForm").hidden = true;
        authShowNote("Account created. Check your email for the confirmation link, then log in.");
      })
      .catch(function (err) {
        setAuthBusy(false);
        authShowError(authErrorMessage(err, "Could not create the account - please try again."));
      });
  }
}

function authForgotPassword() {
  // Recovery callbacks and a password-update screen have not been configured.
  // Do not throw, send a misleading reset, or imply an email was sent.
  hideAuthMsgs();
  authShowNote("Password reset is not available in this preview yet. No reset email was sent. Use your existing login, or contact the site owner if you cannot sign in.");
  }
