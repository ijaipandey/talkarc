/* PenMuse migration v3, M3: Supabase client and auth adapter.
   Load order on every page: supabase-js UMD, then this file, then app.js.
   Replaces Netlify Identity. Exposes:
     window.PENMUSE_FN   - Edge Function base URLs for direct fetches
     window.penmuseAuth  - small auth surface app.js and chatbot.js use */
/* Early-submit guard (CSP blocks inline handlers, so it lives here). The forms are
   visible before app.js binds its handlers; a native submit in that gap reloads the
   page and wipes the typed text. app.js handlers all call preventDefault anyway. */
if (typeof document !== "undefined") document.addEventListener("submit", function (ev) {
  var id = ev.target && ev.target.id;
  if (id === "add-post" || id === "studio-form" || id === "page-form") ev.preventDefault();
}, true);

(function () {
  var SUPABASE_URL = "https://YOUR_SUPABASE_PROJECT.supabase.co";
  var SUPABASE_ANON_KEY = "REPLACE_WITH_PUBLIC_SUPABASE_KEY";
  var FN_BASE = SUPABASE_URL + "/functions/v1";
  /* A deliberately device-only preview is available on localhost when this
     sanitized bundle has no backend configured. It never activates on a hosted site. */
  var LOCAL_MODE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
    (SUPABASE_URL.indexOf("YOUR_SUPABASE_PROJECT") !== -1 || SUPABASE_ANON_KEY.indexOf("REPLACE_WITH_") === 0);
  var LOCAL_ID_KEY = "penmuse.local.id";
  var LOCAL_PAGE_KEY = "penmuse.local.page.";
  var LOCAL_PROFILE_KEY = "penmuse.local.profile";
  var LOCAL_POSTS_KEY = "penmuse.local.posts";
  var LOCAL_CHAT_KEY = "penmuse.local.chat";
  function localId() {
    var id = localStorage.getItem(LOCAL_ID_KEY);
    if (!id) { id = "device-" + Math.random().toString(36).slice(2, 12); localStorage.setItem(LOCAL_ID_KEY, id); }
    return id;
  }
  function localUser() { return { id: localId(), email: "", user_metadata: { full_name: "Local creator" }, jwt: function () { return Promise.resolve("local-preview"); } }; }
  function localResponse(data, status) { return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json" } }); }
  function localFetch(url, options) {
    options = options || {};
    var parsed = new URL(url, location.href), path = parsed.pathname, method = (options.method || "GET").toUpperCase();
    var data = {};
    try { data = options.body ? JSON.parse(options.body) : {}; } catch { return Promise.resolve(localResponse({ error: "Invalid JSON" }, 400)); }
    try {
      if (/\/(planner|postsv2)$/.test(path)) {
        if (method === "GET") return Promise.resolve(localResponse(JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || "[]")));
        if (method === "PUT") {
          if (!Array.isArray(data) || data.length > 500) return Promise.resolve(localResponse({ error: "Plan must contain at most 500 posts." }, 400));
          localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(data)); return Promise.resolve(localResponse({ ok: true }));
        }
      }
      if (/\/(pages|pagev2)$/.test(path)) {
        if (method === "GET") {
          var handle = (parsed.searchParams.get("u") || "").toLowerCase(), page = handle ? localStorage.getItem(LOCAL_PAGE_KEY + handle) : localStorage.getItem(LOCAL_PROFILE_KEY);
          return Promise.resolve(page ? localResponse({ page: JSON.parse(page) }) : localResponse({ error: "Page not found" }, 404));
        }
        if (method === "PUT") {
          var handle = String(data.handle || "").toLowerCase();
          if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(handle)) return Promise.resolve(localResponse({ error: "Choose a 2–30 character handle using letters, numbers, _ or -." }, 400));
          var existing = localStorage.getItem(LOCAL_PAGE_KEY + handle);
          if (existing && JSON.parse(existing)._owner !== localId()) return Promise.resolve(localResponse({ error: "Handle already in use" }, 409));
          data._owner = localId(); localStorage.setItem(LOCAL_PAGE_KEY + handle, JSON.stringify(data)); localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(data));
          return Promise.resolve(localResponse({ ok: true, handle: handle }));
        }
      }
      if (/\/chatdata$/.test(path)) {
        if (method === "GET") return Promise.resolve(localResponse(JSON.parse(localStorage.getItem(LOCAL_CHAT_KEY) || '{"history":[],"prefs":{}}')));
        if (method === "PUT") {
          var chat = JSON.parse(localStorage.getItem(LOCAL_CHAT_KEY) || '{"history":[],"prefs":{}}');
          Object.assign(chat, data); localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(chat)); return Promise.resolve(localResponse({ ok: true }));
        }
        if (method === "DELETE") { localStorage.setItem(LOCAL_CHAT_KEY, '{"history":[],"prefs":{}}'); return Promise.resolve(localResponse({ ok: true })); }
      }
      if (/\/generate$/.test(path)) return Promise.resolve(localResponse({ enabled: false, local: true }));
      if (/\/chat$/.test(path)) {
        var messages = Array.isArray(data.messages) ? data.messages : [], last = messages.filter(function (m) { return m.role === "user"; }).pop(), topic = String(last && last.text || "your idea").replace(/[<>]/g, "").slice(0, 120);
        return Promise.resolve(localResponse({ reply: "Local writing helper (not AI): try this angle — “What I learned about " + topic + " and what I would do differently next time.” Add one specific example, one useful takeaway, and a question for your readers." }));
      }
      return Promise.resolve(localResponse({ error: "Local preview route not found" }, 404));
    } catch (err) { return Promise.resolve(localResponse({ error: err && err.name === "QuotaExceededError" ? "This browser is out of local storage space." : "Local save failed. Check browser storage settings." }, 507)); }
  }
  function exportLocalData() {
    var profile = JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY) || "null");
    if (profile) delete profile._owner;
    return { version: 1, exportedAt: new Date().toISOString(), profile: profile, posts: JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || "[]"), chat: JSON.parse(localStorage.getItem(LOCAL_CHAT_KEY) || '{"history":[],"prefs":{}}') };
  }
  function importLocalData(bundle) {
    if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.posts) || bundle.posts.length > 500 || (bundle.profile && typeof bundle.profile !== "object") || (bundle.chat && typeof bundle.chat !== "object")) throw new Error("Choose a valid PenMuse local backup file.");
    if (bundle.posts.some(function (p) { return !p || typeof p.title !== "string" || p.title.length > 200 || (p.notes || "").length > 1000; })) throw new Error("The backup has an invalid post; nothing was imported.");
    if (bundle.profile && !/^[a-z0-9][a-z0-9_-]{1,29}$/.test(String(bundle.profile.handle || "").toLowerCase())) throw new Error("The backup has an invalid creator handle; nothing was imported.");
    var previous = JSON.parse(localStorage.getItem(LOCAL_PROFILE_KEY) || "null");
    if (previous && previous.handle && (!bundle.profile || previous.handle !== bundle.profile.handle)) localStorage.removeItem(LOCAL_PAGE_KEY + previous.handle);
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(bundle.posts));
    localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(bundle.chat || { history: [], prefs: {} }));
    if (bundle.profile) {
      bundle.profile._owner = localId();
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(bundle.profile));
      localStorage.setItem(LOCAL_PAGE_KEY + bundle.profile.handle, JSON.stringify(bundle.profile));
    } else localStorage.removeItem(LOCAL_PROFILE_KEY);
  }

  /* Anonymous calls still need a gateway Authorization header; the
     publishable anon key is the browser-safe credential for that. */
  window.PENMUSE_ANON = SUPABASE_ANON_KEY;

  window.PENMUSE_FN = {
    planner: FN_BASE + "/planner",
    pages: FN_BASE + "/pages",
    chatdata: FN_BASE + "/chatdata",
    chat: FN_BASE + "/chat",
    generate: FN_BASE + "/generate"
  };

  var FN_MAP = {
    "/.netlify/functions/postsv2": window.PENMUSE_FN.planner,
    "/.netlify/functions/pagev2": window.PENMUSE_FN.pages,
    "/.netlify/functions/chatdatav2": window.PENMUSE_FN.chatdata,
    "/.netlify/functions/chatv2": window.PENMUSE_FN.chat,
    "/.netlify/functions/generatev2": window.PENMUSE_FN.generate
  };

  var sb = null;
  if (!LOCAL_MODE && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  var cachedSession = null;
  var listeners = [];

  /* Same shape app.js expects from a Netlify Identity user:
     id, email, user_metadata.full_name, jwt() -> Promise<token>. */
  function asUser(session) {
    if (!session || !session.user) return null;
    var u = session.user;
    return {
      id: u.id,
      email: u.email || "",
      user_metadata: u.user_metadata || {},
      jwt: function () {
        if (!sb) return Promise.resolve(null);
        return sb.auth.getSession().then(function (r) {
          var s = r && r.data && r.data.session;
          return s ? s.access_token : null;
        });
      }
    };
  }

  var ready;
  if (sb) {
    ready = sb.auth.getSession().then(function (r) {
      cachedSession = (r && r.data && r.data.session) || null;
      return asUser(cachedSession);
    });
    sb.auth.onAuthStateChange(function (event, session) {
      cachedSession = session || null;
      var u = asUser(cachedSession);
      listeners.forEach(function (cb) {
        try { cb(event, u); } catch {}
      });
    });
  } else {
    ready = Promise.resolve(LOCAL_MODE ? localUser() : null);
  }

  window.penmuseAuth = {
    available: LOCAL_MODE || !!sb,
    localMode: LOCAL_MODE,
    localFetch: localFetch,
    exportLocalData: exportLocalData,
    importLocalData: importLocalData,
    ready: ready,
    /* Synchronous read of the cached session. Callers that need certainty
       await penmuseAuth.ready first (initAuth does). */
    currentUser: function () { return LOCAL_MODE ? localUser() : asUser(cachedSession); },
    onChange: function (cb) { listeners.push(cb); },
    signIn: function (email, password) {
      if (LOCAL_MODE) return Promise.reject(new Error("Local preview does not use accounts. Your work stays in this browser."));
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw r.error;
        cachedSession = r.data.session;
        return asUser(cachedSession);
      });
    },
    signUp: function (email, password, fullName) {
      if (LOCAL_MODE) return Promise.reject(new Error("Local preview does not create accounts. Your work stays in this browser."));
      return sb.auth.signUp({
        email: email,
        password: password,
        options: { data: fullName ? { full_name: fullName } : {} }
      }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data && r.data.session) cachedSession = r.data.session;
        return r.data;
      });
    },
    signOut: function () {
      if (LOCAL_MODE) return Promise.resolve({ remoteRevoked: false });
      // Logout is local to this browser. Never leave an expired/revoked token
      // behind merely because the server rejects the revocation request.
      return sb.auth.signOut({ scope: "local" }).then(function (result) {
        if (sb.auth.stopAutoRefresh) sb.auth.stopAutoRefresh();
        localStorage.removeItem("sb-YOUR_SUPABASE_PROJECT-auth-token");
        localStorage.removeItem("sb-YOUR_SUPABASE_PROJECT-auth-token-code-verifier");
        cachedSession = null;
        listeners.forEach(function (cb) { try { cb("SIGNED_OUT", null); } catch {} });
        return { remoteRevoked: !result.error };
      });
    },
    /* Translate a legacy Netlify function path (query string included)
       to its Supabase Edge Function URL. Unknown paths pass through. */
    apiPath: function (path) {
      for (var k in FN_MAP) {
        if (path === k) return FN_MAP[k];
        if (path.indexOf(k + "?") === 0) return FN_MAP[k] + path.slice(k.length);
      }
      return path;
    }
  };
})();


/* ---------- keyboard navigation helpers (MB-04 / QA-09) ----------
   Injected on every page: a "Skip to content" link and a tagged main
   landmark so keyboard users can bypass the nav. */
(function () {
  if (typeof document === 'undefined') return;
  var skipTarget = 'main';
  function tagMain() {
    if (document.getElementById('main')) return;
    var cand = document.querySelector('main') ||
      document.querySelector('nav + section') ||
      document.querySelector('.section') ||
      document.querySelector('main, [role="main"]');
    if (!cand) {
      var navs = document.querySelectorAll('nav');
      if (navs.length) cand = navs[navs.length - 1].nextElementSibling;
    }
    if (cand) {
      // Renderer IDs are functional hooks, never rename them for a skip link.
      if (cand.id) skipTarget = cand.id;
      else cand.id = 'main';
      cand.setAttribute('tabindex', '-1');
      if (cand.tagName !== 'MAIN') cand.setAttribute('role', 'main');
    }
  }
  function addSkipLink() {
    if (!document.body || document.querySelector('.skip-link')) return;
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + skipTarget;
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }
  function init() { tagMain(); addSkipLink(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
