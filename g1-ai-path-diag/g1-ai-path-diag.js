/*
 * Read-only Shadowrocket diagnostic for one.google.com.
 * Records only whether the path is exactly /ai or /ai/, that fixed path class,
 * and local hit counts. Query, fragment, headers, cookies, body, account, token,
 * and product values are never stored or logged. No network calls.
 * Every path ends in $done({}), so the response is never modified.
 * This build has no plan, price, or purchase behavior.
 * Not tested on iPhone, Gemini, or live Shadowrocket.
 */
"use strict";

(function () {
  var VERSION = "g1-ai-path-diag-0.1.0";
  var DIAG_STORE_KEY = "g1.diag.aiPath.v1";
  var MAX_COUNT = 1000000;

  function safeDone() {
    if (typeof $done === "function") {
      $done({});
    }
  }

  function safeLog(msg) {
    if (typeof console === "object" && console && typeof console.log === "function") {
      console.log("[g1-diag] " + msg);
    }
  }

  function parseHttpsUrl(raw) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return null;
    var cut = raw.length;
    var q = raw.indexOf("?");
    var h = raw.indexOf("#");
    if (q !== -1 && q < cut) cut = q;
    if (h !== -1 && h < cut) cut = h;
    var head = raw.slice(0, cut);
    var m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)$/.exec(head);
    if (!m) return null;
    var scheme = m[1].toLowerCase();
    var authority = m[2];
    if (!authority || authority.indexOf("@") !== -1) return null;
    var host = authority.toLowerCase();
    var port = "";
    var colonIdx = authority.lastIndexOf(":");
    if (colonIdx !== -1) {
      host = authority.slice(0, colonIdx).toLowerCase();
      port = authority.slice(colonIdx + 1);
      if (!/^\d{1,5}$/.test(port)) return null;
    }
    var pathname = m[3] || "/";
    if (pathname.charAt(0) !== "/") pathname = "/" + pathname;
    return {
      scheme: scheme,
      host: host,
      port: port,
      pathname: pathname
    };
  }

  function isOneGoogleUrl(parsed) {
    if (!parsed) return false;
    if (parsed.scheme !== "https") return false;
    if (parsed.host !== "one.google.com") return false;
    if (parsed.port !== "" && parsed.port !== "443") return false;
    return true;
  }

  function fixedPathClass(pathname) {
    if (pathname === "/ai") return "/ai";
    if (pathname === "/ai/") return "/ai/";
    return "";
  }

  function emptyRecord() {
    return {
      schemaVersion: 1,
      version: VERSION,
      hit: false,
      route: "",
      countAi: 0,
      countAiSlash: 0
    };
  }

  function boundedCount(n) {
    if (typeof n !== "number" || n !== n || n < 0 || n > MAX_COUNT || Math.floor(n) !== n) return 0;
    return n;
  }

  function loadRecord() {
    try {
      if (typeof $persistentStore === "undefined" ||
          !$persistentStore ||
          typeof $persistentStore.read !== "function") {
        return emptyRecord();
      }
      var raw = $persistentStore.read(DIAG_STORE_KEY);
      if (typeof raw !== "string" || !raw) return emptyRecord();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyRecord();
      var route = parsed.route === "/ai" || parsed.route === "/ai/" ? parsed.route : "";
      return {
        schemaVersion: 1,
        version: VERSION,
        hit: parsed.hit === true && route !== "",
        route: route,
        countAi: boundedCount(parsed.countAi),
        countAiSlash: boundedCount(parsed.countAiSlash)
      };
    } catch (_) {
      return emptyRecord();
    }
  }

  function saveRecord(record) {
    try {
      if (typeof $persistentStore !== "undefined" &&
          $persistentStore &&
          typeof $persistentStore.write === "function") {
        var payload = {
          schemaVersion: 1,
          version: VERSION,
          updatedAt: new Date().toISOString(),
          hit: true,
          route: record.route,
          countAi: record.countAi,
          countAiSlash: record.countAiSlash
        };
        $persistentStore.write(JSON.stringify(payload), DIAG_STORE_KEY);
      }
    } catch (_) {
      // Storage errors must not change the response.
    }
  }

  try {
    var rawUrl = typeof $request === "object" && $request ? $request.url : "";
    var parsed = parseHttpsUrl(typeof rawUrl === "string" ? rawUrl : "");
    if (!isOneGoogleUrl(parsed)) {
      safeDone();
      return;
    }
    var route = fixedPathClass(parsed.pathname);
    if (!route) {
      safeDone();
      return;
    }

    var record = loadRecord();
    record.hit = true;
    record.route = route;
    if (route === "/ai" && record.countAi < MAX_COUNT) record.countAi += 1;
    if (route === "/ai/" && record.countAiSlash < MAX_COUNT) record.countAiSlash += 1;
    saveRecord(record);

    safeLog(
      "v=" + VERSION +
      " hit=yes" +
      " route=" + route +
      " countAi=" + record.countAi +
      " countAiSlash=" + record.countAiSlash
    );
    safeDone();
  } catch (_) {
    safeDone();
  }
})();
