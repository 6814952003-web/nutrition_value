const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const esbuild = require("esbuild");

const sourceRoot = path.resolve(__dirname, "../src");
// Transform the actual modules without asking esbuild to discover configuration
// in parent directories; this also runs inside the Windows workspace sandbox.
function loadSource(name, dependencies = {}) {
  const filename = path.join(sourceRoot, `${name}.js`);
  const compiled = esbuild.transformSync(fs.readFileSync(filename, "utf8"), {
    sourcefile: filename,
    loader: "js",
    format: "cjs",
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(sourceRoot);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => Object.hasOwn(dependencies, specifier) ? dependencies[specifier] : originalRequire(specifier);
  loaded._compile(compiled.code, filename);
  return loaded.exports;
}
const session = loadSource("session");
const { api, request } = loadSource("api", { "./session": session });
const { readAccessToken, saveAccessToken, clearAccessToken, SESSION_EXPIRED_EVENT } = session;
const tokenKey = "nouri-token";

function fixture(t, token = "current-token") {
  const original = Object.fromEntries(["localStorage", "window", "fetch", "CustomEvent"].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const values = new Map(token ? [[tokenKey, token]] : []);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
  const events = [];
  const requests = [];
  const target = new EventTarget();
  target.addEventListener(SESSION_EXPIRED_EVENT, event => events.push(event));
  global.localStorage = storage;
  global.window = target;
  if (typeof global.CustomEvent !== "function") {
    global.CustomEvent = class CustomEvent extends Event {
      constructor(type, options) { super(type, options); this.detail = options?.detail; }
    };
  }
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return response(200, {});
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
  });
  return { storage, events, requests };
}

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

test("session helpers persist tokens and refuse to clear a replacement session", t => {
  fixture(t, null);
  assert.equal(readAccessToken(), null);
  saveAccessToken("old-token");
  assert.equal(readAccessToken(), "old-token");
  saveAccessToken("replacement-token");
  clearAccessToken("old-token");
  assert.equal(readAccessToken(), "replacement-token");
  clearAccessToken("replacement-token");
  assert.equal(readAccessToken(), null);
});

test("concurrent authenticated 401 responses expire the current session once", async t => {
  const { events } = fixture(t);
  const first = deferred();
  const second = deferred();
  let calls = 0;
  global.fetch = () => (++calls === 1 ? first.promise : second.promise);
  const pending = [api.me(), api.users()];
  const settled = Promise.allSettled(pending);
  first.resolve(response(401, { message: "Session expired" }));
  second.resolve(response(401, { message: "Session expired" }));
  const results = await settled;
  assert.ok(results.every(result => result.status === "rejected" && result.reason.status === 401));
  assert.equal(readAccessToken(), null);
  assert.equal(events.length, 1);
});

test("an old request's 401 cannot clear a token obtained by a newer login", async t => {
  const { events } = fixture(t, "old-token");
  const outstanding = deferred();
  global.fetch = () => outstanding.promise;
  const pending = api.me();
  saveAccessToken("replacement-token");
  outstanding.resolve(response(401, { message: "Old session expired" }));
  await assert.rejects(pending, error => error.status === 401);
  assert.equal(readAccessToken(), "replacement-token");
  assert.equal(events.length, 0);
});

test("failed public and credential requests leave an existing session untouched", async t => {
  const { events } = fixture(t);
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return response(401, { message: "Invalid credentials" });
  };
  for (const call of [
    () => api.login({ email: "person@example.com", password: "incorrect" }),
    () => api.register({ name: "Person", email: "person@example.com", password: "secret123" }),
    () => api.site(),
    () => api.health(),
  ]) {
    await assert.rejects(call(), error => error.status === 401);
    assert.equal(readAccessToken(), "current-token");
  }
  assert.equal(events.length, 0);
  for (const { options } of requests) assert.equal(new Headers(options.headers).get("Authorization"), null);
});

test("permission, service, and network failures preserve the current session", async t => {
  const { events } = fixture(t);
  for (const status of [403, 503]) {
    global.fetch = async () => response(status, { message: `Failure ${status}` });
    await assert.rejects(api.me(), error => error.status === status);
    assert.equal(readAccessToken(), "current-token");
  }
  const disconnected = new TypeError("Failed to fetch");
  global.fetch = async () => { throw disconnected; };
  await assert.rejects(api.me(), error => error === disconnected);
  assert.equal(readAccessToken(), "current-token");
  assert.equal(events.length, 0);
});

test("protected requests merge custom headers with the captured bearer token", async t => {
  const { requests } = fixture(t);
  const result = await request("/users/me", {
    method: "PATCH",
    headers: { "X-Request-Id": "custom-request" },
    body: JSON.stringify({ name: "Edited name" }),
  });
  assert.deepEqual(result, {});
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  const headers = new Headers(options.headers);
  assert.equal(url, "/api/users/me");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Authorization"), "Bearer current-token");
  assert.equal(headers.get("X-Request-Id"), "custom-request");
  assert.equal(options.method, "PATCH");
  assert.equal(options.body, '{"name":"Edited name"}');
  assert.equal(options.cache, "no-store");
});

test("an unauthenticated 401 does not emit a session-expired event", async t => {
  const { events } = fixture(t, null);
  global.fetch = async () => response(401, { message: "Authentication required" });
  await assert.rejects(api.me(), error => error.status === 401);
  assert.equal(readAccessToken(), null);
  assert.equal(events.length, 0);
});
