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
      // addAll/cache.add are all-or-nothing and can't be inspected before
      // they store, so a URL that currently redirects (e.g. /offline, until
      // Task 3 adds it to the auth allowlist) would get the redirect target
      // — the login page — precached under the original key. Fetching and
      // checking first keeps that out of the shell. Adding individually
      // also means a missing icon costs that icon, not the whole offline
      // fallback.
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return fetch(new Request(url, { cache: "reload" }))
            .then(function (response) {
              if (!response.ok || response.redirected) return undefined;
              return cache.put(url, response);
            })
            .catch(function () {
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
  // A followed redirect stored under the original request's URL would serve
  // the wrong page to whoever asks for that URL next, and a browser refuses
  // to fulfil a navigation from a cached response whose redirect chain isn't
  // "manual" — so redirected responses are left uncached, same as failed or
  // opaque ones.
  if (!response || !response.ok || response.type === "opaque" || response.redirected) {
    return response;
  }
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

// A cache read must never turn into a hard network-error page: if the
// cache itself is corrupt or unavailable, treat it the same as a miss and
// keep going, rather than letting the rejection reach event.respondWith.
function safeMatch(request) {
  return caches.match(request).catch(function () {
    return undefined;
  });
}

// The last resort when both the network and the cache have failed —
// factored out so networkFirst and networkOnly don't each build their own
// copy of the same plain-text fallback.
function offlineResponse() {
  return new Response("You are offline.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function cacheFirst(request) {
  return safeMatch(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      return putInRuntime(request, response);
    });
  });
}

function staleWhileRevalidate(request) {
  return safeMatch(request).then(function (cached) {
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
      // The network already failed, so a broken cache read here has nowhere
      // left to fall through to but the plain offline response.
      return caches
        .match(request)
        .then(function (cached) {
          return cached || caches.match(OFFLINE_URL);
        })
        .catch(function () {
          return offlineResponse();
        });
    });
}

function networkOnly(request, isNavigation) {
  if (!isNavigation) return fetch(request);
  return fetch(request)
    .catch(function () {
      return caches.match(OFFLINE_URL).then(function (offline) {
        return offline || offlineResponse();
      });
    })
    .catch(function () {
      return offlineResponse();
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
