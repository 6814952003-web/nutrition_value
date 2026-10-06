const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Site = require("../src/models/site.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const { defaults, validateSiteConfig, mergeSiteConfig } = require("../src/config/site");
const routes = require("../src/routes/site.routes");
const { errorHandler } = require("../src/middlewares/error.middleware");

process.env.JWT_SECRET = "site-route-fixture-secret";
let server;
let endpoint;
const headers = id => ({ Authorization: `Bearer ${signToken({ id, role: "admin" })}` });
const request = (method = "GET", body, id) => fetch(endpoint, {
  method, headers: { "Content-Type": "application/json", ...(id ? headers(id) : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const authenticateFixtures = t => t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, role: id === "admin" ? "admin" : "user" }) }));
const fixtureStorage = t => {
  let stored;
  t.mock.method(Site, "findById", () => ({ lean: async () => stored ? structuredClone(stored) : null }));
  const create = t.mock.method(Site, "create", async document => {
    if (stored) throw Object.assign(new Error("duplicate singleton"), { code: 11000 });
    stored = { ...structuredClone(document), updatedAt: "2026-10-06T08:00:00.000Z" };
    return structuredClone(stored);
  });
  const update = t.mock.method(Site, "findOneAndUpdate", async (filter, updates) => {
    if (!stored || stored._id !== filter._id || stored.revision !== filter.revision) return null;
    stored = { ...stored, config: structuredClone(updates.$set.config), revision: stored.revision + updates.$inc.revision };
    return structuredClone(stored);
  });
  return { create, update };
};

before(async () => {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use("/api/site", routes);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/site`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("public site reads return shipped defaults and disable caching", async t => {
  fixtureStorage(t);
  assert.equal(validateSiteConfig(defaults), true);
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ...defaults, revision: 0, updatedAt: null });
});

test("site writes require authentication and the current user's admin role", async t => {
  authenticateFixtures(t);
  const storage = fixtureStorage(t);
  const body = { ...defaults, revision: 0 };
  assert.equal((await request("PUT", body)).status, 401);
  // The token claims admin, but a member's current database role is authoritative.
  assert.equal((await request("PUT", body, "member")).status, 403);
  assert.equal(storage.create.mock.callCount(), 0);
  assert.equal(storage.update.mock.callCount(), 0);
});

test("an existing admin token loses write access immediately after role revocation", async t => {
  let currentRole = "admin";
  t.mock.method(User, "findById", () => ({ select: async () => ({ _id: "admin", role: currentRole }) }));
  const storage = fixtureStorage(t);
  const authHeaders = headers("admin");
  const put = revision => fetch(endpoint, {
    method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ ...defaults, revision }),
  });
  assert.equal((await put(0)).status, 200);
  currentRole = "user";
  assert.equal((await put(1)).status, 403);
  assert.equal(storage.create.mock.callCount(), 1);
  assert.equal(storage.update.mock.callCount(), 0);
  assert.equal((await (await request()).json()).revision, 1);
});

test("production without a signing secret reports a service error before any database mutation", async t => {
  t.mock.method(console, "error", () => {});
  const previousEnv = Object.fromEntries(["JWT_SECRET", "jwt_secret", "NODE_ENV"].map(key => [key, process.env[key]]));
  const tokenHeaders = headers("admin");
  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  delete process.env.JWT_SECRET;
  delete process.env.jwt_secret;
  process.env.NODE_ENV = "production";
  t.mock.method(User, "findById", () => assert.fail("unverifiable tokens cannot load a user"));
  const storage = fixtureStorage(t);
  const response = await fetch(endpoint, {
    method: "PUT", headers: { "Content-Type": "application/json", ...tokenHeaders }, body: JSON.stringify({ ...defaults, revision: 0 }),
  });
  assert.equal(response.status, 500);
  assert.match((await response.json()).message, /JWT_SECRET is required/);
  assert.equal(storage.create.mock.callCount(), 0);
  assert.equal(storage.update.mock.callCount(), 0);
});

test("admin settings are persisted and returned without legacy site meal data", async t => {
  authenticateFixtures(t);
  const storage = fixtureStorage(t);
  const config = structuredClone(defaults);
  config.brand.name = "ชื่อเว็บไซต์ใหม่";
  config.copy.dashboard.heroTitle = "อาหารสำหรับทุกวัน";
  config.icons.user = "🧑‍🍳";
  config.icons.spark = "https://images.example.com/spark.png";
  const firstResponse = await request("PUT", { ...config, revision: 0 }, "admin");
  assert.equal(firstResponse.status, 200);
  const saved = await firstResponse.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.meals, []);
  assert.equal(saved.updatedAt, "2026-10-06T08:00:00.000Z");
  assert.equal(storage.create.mock.calls[0].arguments[0]._id, "public-site");
  assert.deepEqual(await (await request()).json(), saved);
  saved.goals.protein = 100;
  const secondResponse = await request("PUT", saved, "admin");
  assert.equal(secondResponse.status, 200);
  assert.equal((await secondResponse.json()).revision, 2);
  assert.deepEqual(storage.update.mock.calls[0].arguments[0], { _id: "public-site", revision: 1 });
  assert.equal((await (await request()).json()).goals.protein, 100);
});

test("stale edits and simultaneous initial saves return a conflict", async t => {
  authenticateFixtures(t);
  fixtureStorage(t);
  const body = { ...defaults, revision: 0 };
  const firstSaves = await Promise.all([request("PUT", body, "admin"), request("PUT", body, "admin")]);
  assert.deepEqual(firstSaves.map(response => response.status).sort(), [200, 409]);
  assert.equal((await request("PUT", { ...defaults, revision: 1 }, "admin")).status, 200);
  assert.equal((await request("PUT", { ...defaults, revision: 1 }, "admin")).status, 409);
  assert.equal((await (await request()).json()).revision, 2);
});

test("site validation rejects unsafe URLs, CSS, unknown keys, oversized values and invalid nutrients", async t => {
  authenticateFixtures(t);
  const storage = fixtureStorage(t);
  const mutations = [
    config => { config.brand.logoUrl = "javascript:alert(1)"; },
    config => { config.brand.faviconUrl = "data:image/svg+xml,<svg>"; },
    config => { config.meals = [{ id: "legacy-meal", name: "Old menu" }]; },
    config => { config.theme.primary = "red; background:url(javascript:alert(1))"; },
    config => { config.theme.accent = "#GG00FF"; },
    config => { config.icons.user = "<script>alert(1)</script>"; },
    config => { config.icons.hero = "x".repeat(10000); },
    config => { config.goals.protein = 0; },
    config => { config.goals.calories = "2000"; },
    config => { config.copy.auth.loginTitle = "x".repeat(3001); },
    config => { config.copy.auth.unknownLabel = "unknown"; },
    config => { config.extra = "unknown"; },
    config => { config.guides = Array.from({ length: 41 }, (_, id) => ({ id: `guide-${id}`, title: "Title", text: "Text" })); },
  ];
  for (const mutate of mutations) {
    const config = structuredClone(defaults);
    mutate(config);
    assert.equal((await request("PUT", { ...config, revision: 0 }, "admin")).status, 400);
  }
  for (const revision of [-1, 1.5, "0", Number.MAX_SAFE_INTEGER]) {
    assert.equal((await request("PUT", { ...defaults, revision }, "admin")).status, 400);
  }
  assert.equal(storage.create.mock.callCount(), 0);
});

test("older documents safely merge newly shipped defaults and discard invalid fields", async t => {
  const oldConfig = { brand: { name: "Existing brand", logoUrl: "javascript:bad" }, copy: { auth: { loginTitle: "Existing title" } }, theme: { primary: "red" }, meals: [{ id: "legacy-meal", name: "Old menu" }], unknown: "removed" };
  t.mock.method(Site, "findById", () => ({ lean: async () => ({ config: oldConfig, revision: 3, updatedAt: "2026-10-06T08:00:00.000Z" }) }));
  const site = await (await request()).json();
  assert.equal(site.brand.name, "Existing brand");
  assert.equal(site.brand.logoUrl, defaults.brand.logoUrl);
  assert.equal(site.copy.auth.loginTitle, "Existing title");
  assert.equal(site.copy.auth.registerTitle, defaults.copy.auth.registerTitle);
  assert.equal(site.theme.primary, defaults.theme.primary);
  assert.deepEqual(site.meals, []);
  assert.equal(site.unknown, undefined);
  const { revision, updatedAt, ...config } = site;
  assert.equal(validateSiteConfig(config), true);
  assert.deepEqual(mergeSiteConfig(null), defaults);
});
