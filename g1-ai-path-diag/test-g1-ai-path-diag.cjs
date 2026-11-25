"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCRIPT_PATH = path.join(__dirname, "g1-ai-path-diag.js");
const MODULE_PATH = path.join(__dirname, "g1-ai-path-diag.sgmodule");
const CODE = fs.readFileSync(SCRIPT_PATH, "utf8");
const STORE_KEY = "g1.diag.aiPath.v1";
const ALLOWED_KEYS = ["schemaVersion", "version", "updatedAt", "hit", "route", "countAi", "countAiSlash"];

function runSequence(steps) {
  const store = Object.create(null);
  const logs = [];
  let doneCalled = 0;
  let donePayload;
  let readThrows = false;
  let writeThrows = false;

  function execute(step) {
    doneCalled = 0;
    donePayload = undefined;
    readThrows = step.throwOnRead === true;
    writeThrows = step.throwOnWrite === true;
    const sandbox = {
      $request: step.url === undefined ? undefined : {
        url: step.url,
        headers: step.headers || { Cookie: "SECRET_COOKIE=abc", Authorization: "Bearer SECRET_TOKEN" }
      },
      $response: {
        body: step.body === undefined ? "{\"secretBody\":\"SECRET_BODY\",\"product\":\"g1.ios.2tb.monthly\"}" : step.body,
        headers: { "set-cookie": "SECRET_SET_COOKIE=xyz" }
      },
      $argument: step.arg === undefined ? "rewrite=1&target2tb=g1.2tb.ai.12months_ip_90p" : step.arg,
      $persistentStore: {
        write(val, key) {
          if (writeThrows) throw new Error("simulated store write failure");
          store[key] = val;
          return true;
        },
        read(key) {
          if (readThrows) throw new Error("simulated store read failure");
          return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        }
      },
      $done(payload) {
        doneCalled += 1;
        donePayload = payload && typeof payload === "object" ? JSON.parse(JSON.stringify(payload)) : payload;
      },
      console: {
        log(msg) {
          logs.push(String(msg));
        }
      },
      URL: undefined,
      Date,
      Object,
      Array,
      String,
      Number,
      JSON,
      RegExp,
      Math
    };
    vm.runInNewContext(CODE, sandbox, { filename: "g1-ai-path-diag.js" });
    return { doneCalled, donePayload };
  }

  const runs = steps.map(execute);
  return { runs, store, logs };
}

function runScript(step) {
  const out = runSequence([step]);
  return {
    doneCalled: out.runs[0].doneCalled,
    donePayload: out.runs[0].donePayload,
    store: out.store,
    logs: out.logs
  };
}

function assertUntouched(result, label) {
  assert.equal(result.doneCalled, 1, label);
  assert.deepEqual(result.donePayload, {}, label);
  assert.equal(Object.keys(result.store).length, 0, label);
  assert.equal(result.logs.length, 0, label);
}

function assertNoSecrets(text, label) {
  const banned = [
    "SECRET_COOKIE",
    "SECRET_TOKEN",
    "SECRET_SET_COOKIE",
    "SECRET_BODY",
    "SHOULD_NOT_LOG",
    "Bearer",
    "g1.ios",
    "g1.2tb",
    "ip_90p",
    "rewrite=",
    "target2tb"
  ];
  for (const item of banned) {
    assert.equal(text.includes(item), false, label + " leaked " + item);
  }
}

const results = [];
function test(name, fn) {
  fn();
  results.push({ name, pass: true });
}

test("static: diagnostic source has no network, capture, or plan-change code", () => {
  const codeNoComments = CODE
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const banned = [
    /\$httpClient|\bfetch\s*\(|XMLHttpRequest|WebSocket/i,
    /\beval\s*\(|new\s+Function\b/,
    /\$response|\$argument|\.headers\b|cookie|authorization|\.body\b/i,
    /rewrite|sku|fallback|target2tb|g1\.ios|g1\.2tb|g1\.20tb|ip_90p|\.eft\b|\.acq\b/i
  ];
  for (const re of banned) {
    assert.equal(re.test(codeNoComments), false, String(re));
  }
});

test("scope: ignores other hosts, schemes, userinfo, ports, and non-entry paths", () => {
  for (const badUrl of [
    "https://gemini.google.com/ai",
    "https://one.google.com.evil.example/ai",
    "http://one.google.com/ai",
    "https://user@one.google.com/ai",
    "https://one.google.com:8443/ai",
    "https://one.google.com/ai2?x=1",
    "https://one.google.com/ai/extra",
    "https://one.google.com/plans?x=1",
    "https://one.google.com/g1-sku-report",
    "https://one.google.com/AI",
    "https://one.google.com/",
    ""
  ]) {
    assertUntouched(runScript({ url: badUrl }), badUrl);
  }
});

test("entry: /ai and /ai/ record only fixed class and counts, and always pass through", () => {
  for (const url of [
    "https://one.google.com/ai",
    "https://one.google.com/ai/",
    "https://one.google.com/ai?hl=en&authuser=0&secret=SHOULD_NOT_LOG",
    "https://one.google.com/ai/?hl=zh-CN#plans",
    "https://one.google.com:443/ai/",
    "https://One.Google.com/ai?token=SHOULD_NOT_LOG"
  ]) {
    const r = runScript({ url });
    assert.equal(r.doneCalled, 1, url);
    assert.deepEqual(r.donePayload, {}, url);
    const diag = JSON.parse(r.store[STORE_KEY]);
    assert.deepEqual(Object.keys(diag).sort(), ALLOWED_KEYS.slice().sort(), url);
    assert.equal(diag.hit, true, url);
    assert.equal(diag.version, "g1-ai-path-diag-0.1.0", url);
    const expectSlash = url.indexOf("/ai/") !== -1;
    assert.equal(diag.route, expectSlash ? "/ai/" : "/ai", url);
    assert.equal(diag.countAi, expectSlash ? 0 : 1, url);
    assert.equal(diag.countAiSlash, expectSlash ? 1 : 0, url);
    assertNoSecrets(r.logs.join("\n") + r.store[STORE_KEY], url);
    assert.match(r.logs[0], /^\[g1-diag\] v=g1-ai-path-diag-0\.1\.0 hit=yes route=\/ai\/? countAi=\d+ countAiSlash=\d+$/);
  }
});

test("counts: repeated hits stay on the two fixed classes", () => {
  const seq = runSequence([
    { url: "https://one.google.com/ai?secret=SHOULD_NOT_LOG" },
    { url: "https://one.google.com/ai/" },
    { url: "https://one.google.com/ai#frag" },
    { url: "https://one.google.com/plans?secret=SHOULD_NOT_LOG" }
  ]);
  assert.deepEqual(seq.runs.map((r) => r.donePayload), [{}, {}, {}, {}]);
  const diag = JSON.parse(seq.store[STORE_KEY]);
  assert.equal(diag.route, "/ai");
  assert.equal(diag.countAi, 2);
  assert.equal(diag.countAiSlash, 1);
  assert.equal(diag.hit, true);
  assertNoSecrets(seq.logs.join("\n") + seq.store[STORE_KEY], "sequence");
});

test("passthrough: supplied argument and response body never change the result", () => {
  const r = runScript({
    url: "https://one.google.com/ai",
    body: "PLEASE_REWRITE g1.ios.20tb.m.v2 g1.ai.ultra.1month_eft.acq",
    arg: "rewrite=1"
  });
  assert.deepEqual(r.donePayload, {});
  assert.equal(JSON.parse(r.store[STORE_KEY]).countAi, 1);
  assertNoSecrets(r.logs.join("\n") + r.store[STORE_KEY] + JSON.stringify(r.donePayload), "passthrough");
  assert.equal((r.logs.join("\n") + r.store[STORE_KEY]).includes("PLEASE_REWRITE"), false);
});

test("resilience: store read or write failures still pass the response through", () => {
  for (const step of [
    { url: "https://one.google.com/ai", throwOnRead: true },
    { url: "https://one.google.com/ai/", throwOnWrite: true },
    { url: undefined }
  ]) {
    const r = runScript(step);
    assert.equal(r.doneCalled, 1);
    assert.deepEqual(r.donePayload, {});
  }
});

test("module: only added when it points at a pinned remote script", () => {
  if (!fs.existsSync(MODULE_PATH)) return;
  const text = fs.readFileSync(MODULE_PATH, "utf8");
  assert.equal(/apple\.com|itunes|buy\.itunes|mzstatic|REJECT|UDP|\bAND\b/i.test(text), false);
  assert.equal(/argument\s*=/i.test(text), false);
  assert.equal(/requires-body\s*=\s*1/i.test(text), false);
  assert.match(text, /hostname = %APPEND% one\.google\.com\s*$/m);
  const found = text.match(/script-path=(https:\/\/\S+)/);
  assert.ok(found, "absolute script-path");
  assert.match(found[1], /^https:\/\/.+\/g1-ai-path-diag\.js$/);
  assert.match(found[1], /[0-9a-f]{40}/);
  assert.equal(found[1].includes("@main/") || found[1].includes("/main/"), false);
});

console.log("PASS " + results.length + "/" + results.length + " tests");
for (const item of results) {
  console.log(" - OK:", item.name);
}
