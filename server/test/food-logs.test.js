const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const FoodLog = require("../src/models/food-log.model");
const Catalog = require("../src/models/catalog.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const { loadSeed } = require("../src/config/catalog");
const routes = require("../src/routes/food-log.routes");
const { errorHandler } = require("../src/middlewares/error.middleware");

process.env.JWT_SECRET = "food-log-route-fixture-secret";
const accountA = new mongoose.Types.ObjectId();
const accountB = new mongoose.Types.ObjectId();
const logBId = new mongoose.Types.ObjectId();
const nutrients = { energyKcal: 200, proteinG: 10, carbohydrateG: 20, fatG: 5, saturatedFatG: 1, sugarG: 2, fiberG: 3, sodiumMg: 100, cholesterolMg: 25 };
const logB = {
  _id: logBId, userId: accountB, menuId: "fixture-recipe", menuName: "บัญชีบี", imageUrl: "/images/catalog/placeholder.svg",
  meal: "lunch", servings: 1, eatenAt: new Date("2026-10-07T05:00:00.000Z"),
  nutrientsPerServing: nutrients, nutrients, createdAt: new Date("2026-10-07T05:01:00.000Z"), __v: 0,
};

const authenticateAs = t => t.mock.method(User, "findById", id => ({
  select: async () => ({ _id: id === "account-a" ? accountA : accountB, role: "user" }),
}));
const request = (path, method = "GET", body, account = "account-a") => fetch(`${endpoint}${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${signToken({ id: account })}`,
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

let server;
let endpoint;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/food-logs", routes);
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/food-logs`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("food logs require authentication and reject userId or client-supplied nutrition", async t => {
  authenticateAs(t);
  t.mock.method(FoodLog, "create", async value => value);
  const anonymous = await fetch(`${endpoint}?date=2026-10-07`);
  assert.equal(anonymous.status, 401);
  const spoofed = await request("", "POST", { menuId: "recipe", meal: "lunch", servings: 1, eatenAt: "2026-10-07T05:00:00.000Z", userId: String(accountB) });
  assert.equal(spoofed.status, 400);
  const spoofedNutrition = await request("", "POST", { menuId: "recipe", meal: "lunch", servings: 1, eatenAt: "2026-10-07T05:00:00.000Z", nutrients });
  assert.equal(spoofedNutrition.status, 400);
  assert.equal(FoodLog.create.mock.callCount(), 0);
});

test("account A cannot read, edit, or delete account B's food log", async t => {
  authenticateAs(t);
  const find = t.mock.method(FoodLog, "find", filter => ({
    sort: () => ({ lean: async () => String(filter.userId) === String(accountB) ? [logB] : [] }),
  }));
  const findOne = t.mock.method(FoodLog, "findOne", filter => ({ lean: async () => String(filter.userId) === String(accountB) ? logB : null }));
  const update = t.mock.method(FoodLog, "findOneAndUpdate", async () => null);
  const remove = t.mock.method(FoodLog, "findOneAndDelete", async filter => String(filter.userId) === String(accountB) ? logB : null);

  const list = await request("?date=2026-10-07&timezoneOffsetMinutes=-420");
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.deepEqual(await list.json(), []);
  assert.equal(String(find.mock.calls[0].arguments[0].userId), String(accountA));

  const patch = await request(`/${logBId}`, "PATCH", { servings: 3 });
  assert.equal(patch.status, 404);
  assert.equal(String(findOne.mock.calls[0].arguments[0].userId), String(accountA));
  assert.equal(update.mock.callCount(), 0);

  const deletion = await request(`/${logBId}`, "DELETE");
  assert.equal(deletion.status, 404);
  assert.equal(String(remove.mock.calls[0].arguments[0].userId), String(accountA));
});

test("food log snapshots menu nutrition from the server and scales servings on edits", async t => {
  authenticateAs(t);
  const seed = loadSeed();
  t.mock.method(Catalog, "findById", () => ({ lean: async () => ({ tables: seed, revision: 1 }) }));
  let created;
  t.mock.method(FoodLog, "create", async value => { created = { ...value, _id: new mongoose.Types.ObjectId(), __v: 0 }; return created; });
  const response = await request("", "POST", {
    menuId: seed.recipes[0].id, meal: "dinner", servings: 2,
    eatenAt: "2026-10-07T12:00:00.000Z",
  });
  assert.equal(response.status, 201);
  assert.equal(String(created.userId), String(accountA));
  assert.equal(created.menuName, seed.recipes[0].nameTh);
  assert.equal(created.servings, 2);
  assert.deepEqual(created.nutrients, Object.fromEntries(Object.entries(created.nutrientsPerServing).map(([key, value]) => [
    key, Number.isFinite(value) ? Math.round(value * 2 * 1_000_000) / 1_000_000 : null,
  ])));
  assert.equal(Object.hasOwn(created, "userId"), true);
});

test("food log date and meal validation reject malformed input", async t => {
  authenticateAs(t);
  assert.equal((await request("?date=2026-02-31")).status, 400);
  assert.equal((await request("?date=2026-10-07&timezoneOffsetMinutes=900")).status, 400);
  assert.equal((await request("", "POST", { menuId: "recipe", meal: "midnight", servings: 1, eatenAt: "2026-10-07T05:00:00.000Z" })).status, 400);
});
