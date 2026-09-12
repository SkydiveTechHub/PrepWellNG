/**
 * ScholarsCrib service worker.
 *
 * Two caches, only one versioned:
 *   - SHELL is precached on install and purged when the version changes. It
 *     holds the offline page and the icons, nothing else.
 *   - RUNTIME is unversioned and holds content-hashed build output, images and
 *     public pages, trimmed by entry count. Hashed URLs never collide, so old
 *     entries are harmless — and purging them on every deploy is exactly how an
 *     already-open tab starts throwing ChunkLoadError mid-quiz.
 *
 * There is no skipWaiting() and no clients.claim() here, deliberately: a new
 * worker waits until every tab closes rather than swapping itself in under a
 * student who is mid-exam.
 */
importScripts("/sw-policy.js");

var SHELL_VERSION = "v1";
var SHELL_CACHE = "scholarscrib-shell-" + SHELL_VERSION;
var RUNTIME_CACHE = "scholarscrib-runtime";
var RUNTIME_MAX_ENTRIES = 80;
var OFFLINE_URL = "/offline";

var PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // addAll is all-or-nothing: one 404 aborts the install and leaves the
      // old worker in place. Adding individually means a missing icon costs
      // that icon, not the whole offline fallback.
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" })).catch(function () {
            return undefined;
          });
        }),
      );
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          var isStaleShell =
            key.indexOf("scholarscrib-shell-") === 0 && key !== SHELL_CACHE;
          return isStaleShell ? caches.delete(key) : undefined;
        }),
      );
    }),
  );
});

function trimCache(cacheName, maxEntries) {
  return caches.open(cacheName).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= maxEntries) return undefined;
      return Promise.all(
        keys.slice(0, keys.length - maxEntries).map(function (key) {
          return cache.delete(key);
        }),
      );
    });
  });
}

function putInRuntime(request, response) {
  if (!response || !response.ok || response.type === "opaque") return response;
  var copy = response.clone();
  caches
    .open(RUNTIME_CACHE)
    .then(function (cache) {
      return cache.put(request, copy);
    })
    .then(function () {
      return trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
    })
    .catch(function () {
      // A cache write that fails must never turn into a failed page load.
    });
  return response;
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      return putInRuntime(request, response);
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(function (cached) {
    var network = fetch(request)
      .then(function (response) {
        return putInRuntime(request, response);
      })
      .catch(function () {
        return cached;
      });
    return cached || network;
  });
}

function networkFirst(request) {
  return fetch(request)
    .then(function (response) {
      return putInRuntime(request, response);
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        return cached || caches.match(OFFLINE_URL);
      });
    });
}

function networkOnly(request, isNavigation) {
  if (!isNavigation) return fetch(request);
  return fetch(request).catch(function () {
    return caches.match(OFFLINE_URL).then(function (offline) {
      return (
        offline ||
        new Response("You are offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var isNavigation = request.mode === "navigate";
  var strategy = self.chooseStrategy(request.url, request.method, self.location.origin);

  if (strategy === "network-only") {
    // Non-navigations are left entirely alone: not intercepted, not wrapped.
    if (!isNavigation) return;
    event.respondWith(networkOnly(request, true));
    return;
  }

  if (strategy === "cache-first") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (strategy === "stale-while-revalidate") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
