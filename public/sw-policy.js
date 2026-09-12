/**
 * The service worker's routing decision, kept in its own classic script so it
 * can be loaded by importScripts() in the worker and by node:vm in
 * scripts/test-pwa-policy.mts. Logic buried in a fetch handler can only be
 * exercised in a browser; this can be unit-tested, and it is the rule that
 * decides whether one student's page can be served to another.
 *
 * The list is an ALLOWLIST. Anything that does not match a rule below is
 * network-only and is never written to a cache.
 */
(function (scope) {
  "use strict";

  // Public, world-readable pages. Mirrors PUBLIC_EXACT_PATHS /
  // PUBLIC_PATH_PREFIXES in src/lib/public-routes.ts. The two lists are
  // deliberately separate — one is an auth boundary, this one is a caching
  // boundary — but a divergence between them is a bug.
  var PUBLIC_EXACT = ["/", "/about", "/contact", "/offline"];
  var PUBLIC_PREFIXES = ["/learn", "/past-questions"];

  // Cache-first: content-hashed, or stable for the life of the brand.
  var IMMUTABLE_PREFIXES = ["/_next/static/"];
  var IMMUTABLE_FILES = /^\/(icon[\w-]*\.(?:png|svg)|apple-icon[\w-]*\.png|logo-on-(?:light|dark)\.png|favicon\.ico)$/;

  // Stale-while-revalidate: heavy on metered data, tolerant of staleness.
  var MEDIA_PREFIXES = ["/_next/image", "/questions/", "/resources/"];

  function normalise(pathname) {
    if (pathname.length > 1) return pathname.replace(/\/+$/, "");
    return pathname;
  }

  function underPrefix(path, prefix) {
    // Segment-aware: "/learnable" is not inside "/learn".
    return path === prefix || path.indexOf(prefix + "/") === 0;
  }

  function startsWithAny(path, prefixes) {
    for (var i = 0; i < prefixes.length; i += 1) {
      if (path.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  function chooseStrategy(url, method, origin) {
    if (method !== "GET") return "network-only";

    var parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return "network-only";
    }

    if (parsed.origin !== origin) return "network-only";

    var path = normalise(parsed.pathname);

    // The worker and its policy are served no-store. A worker that caches
    // itself is a worker that can never be replaced.
    if (path === "/sw.js" || path === "/sw-policy.js") return "network-only";

    if (startsWithAny(path, IMMUTABLE_PREFIXES) || IMMUTABLE_FILES.test(path)) {
      return "cache-first";
    }

    if (startsWithAny(path, MEDIA_PREFIXES)) return "stale-while-revalidate";

    if (path.indexOf("/api/") === 0 || path === "/api") return "network-only";
    if (underPrefix(path, "/admin")) return "network-only";

    if (PUBLIC_EXACT.indexOf(path) !== -1) return "network-first";

    for (var i = 0; i < PUBLIC_PREFIXES.length; i += 1) {
      if (underPrefix(path, PUBLIC_PREFIXES[i])) return "network-first";
    }

    // Everything else — /dashboard, /classroom, /practice, /settings, and
    // anything added to the app later — is authenticated until proven
    // otherwise. Failing closed is the point.
    return "network-only";
  }

  scope.chooseStrategy = chooseStrategy;
})(typeof self !== "undefined" ? self : globalThis);
