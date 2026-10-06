const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const blobStorage = require("@vercel/blob");
const Catalog = require("../src/models/catalog.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const { NUTRIENTS, PLACEHOLDER, validIngredient, validRecipe, validTables, calculateRecipe, loadSeed } = require("../src/config/catalog");
const { importCatalogSeed, CatalogImportConflict } = require("../src/services/catalog-import");
const routes = require("../src/routes/catalog.routes");
const { errorHandler } = require("../src/middlewares/error.middleware");

// Synthetic source metadata and values exercise validation/calculation only;
// none of these records are imported into the real catalog or sent to Mongo.
const source = () => ({ provider: "USDA FoodData Central", title: "USDA fixture record", url: "https://fdc.nal.usda.gov/food-details/1/nutrients", foodId: "1", matchedDescription: "Fixture raw food", retrievedAt: "2026-10-06" });
const ingredient = (id = "fixture-food", energy = 200) => ({
  id, nameTh: "วัตถุดิบทดสอบ", nameEn: "Fixture ingredient", category: "Test", state: "raw", referenceBasis: "Edible portion, raw", referenceGrams: 100,
  nutrients: Object.fromEntries(NUTRIENTS.map((key, index) => [key, key === "energyKcal" ? energy : index])), source: source(), image: { ...PLACEHOLDER }, needsImage: true,
});
const recipe = () => ({ id: "fixture-recipe", nameTh: "เมนูทดสอบ", nameEn: "Fixture recipe", category: "Test", servingGrams: 75,
  ingredients: [{ ingredientId: "fixture-food", grams: 50 }, { ingredientId: "second-food", grams: 25 }], image: { ...PLACEHOLDER }, needsImage: true });
const tables = () => ({ ingredients: [ingredient(), ingredient("second-food", 300)], recipes: [recipe()] });

test("ingredient nutrition is nullable, per 100 edible grams, and requires an official source for every supplied value", () => {
  assert.equal(validIngredient(ingredient()), true);
  for (const mutation of [
    item => { item.referenceGrams = 1; }, item => { item.state = "unknown"; }, item => { item.source = null; },
    item => { item.nutrients.proteinG = "10"; }, item => { item.nutrients.sodiumMg = -1; }, item => { item.nutrients.fatG = Infinity; },
    item => { delete item.nutrients.fiberG; }, item => { item.nutrients.email = "private@example.com"; },
    item => { item.source.url = "https://unverified.example/food"; }, item => { item.source.provider = "Blog"; },
    item => { item.source.retrievedAt = "not-a-date"; }, item => { item.email = "private@example.com"; },
  ]) {
    const item = ingredient(); mutation(item); assert.equal(validIngredient(item), false);
  }
  const unmatched = ingredient();
  unmatched.source = null; unmatched.nutrients = Object.fromEntries(NUTRIENTS.map(key => [key, null])); unmatched.dataStatus = "unmatched"; unmatched.notes = "No exact authoritative match found.";
  assert.equal(validIngredient(unmatched), true);
  const partial = ingredient(); partial.nutrients.fiberG = null; partial.dataStatus = "partial";
  assert.equal(validIngredient(partial), true);
});

test("per-nutrient source overrides cannot bypass missing references or carry arbitrary private fields", () => {
  const item = ingredient();
  item.nutrientSources = { proteinG: source() };
  assert.equal(validIngredient(item), true);
  item.nutrientSources.proteinG = null;
  assert.equal(validIngredient(item), false);
  item.nutrients.proteinG = null;
  assert.equal(validIngredient(item), true);
  item.nutrientSources.email = source();
  assert.equal(validIngredient(item), false);
});

test("photographs require local hosting, recognized photo credits and a matching license", () => {
  const item = ingredient();
  item.needsImage = false;
  item.image = { imageUrl: "/images/catalog/pork.jpg", photographer: "Fixture photographer", sourceUrl: "https://unsplash.com/photos/fixture", source: "Unsplash", license: "Unsplash License" };
  assert.equal(validIngredient(item), true);
  for (const mutation of [
    value => { value.image.imageUrl = "https://images.unsplash.com/photo-fixture"; },
    value => { value.image.sourceUrl = "https://google.com/images"; }, value => { value.image.license = "Unknown"; },
    value => { value.image.photographer = ""; }, value => { value.image.imageUrl = "/images/catalog/../private.jpg"; },
    value => { value.needsImage = true; },
  ]) { const candidate = structuredClone(item); mutation(candidate); assert.equal(validIngredient(candidate), false); }
  const reorderedPlaceholder = ingredient();
  reorderedPlaceholder.image = Object.fromEntries(Object.entries(PLACEHOLDER).reverse());
  assert.equal(validIngredient(reorderedPlaceholder), true);
});

test("recipe totals are computed solely from ingredient grams and preserve verified zeroes", () => {
  const input = tables();
  input.ingredients[0].nutrients.fiberG = 0;
  input.ingredients[1].nutrients.fiberG = 0;
  const calculated = calculateRecipe(input.recipes[0], input.ingredients);
  assert.equal(calculated.nutrients.energyKcal, 175);
  assert.equal(calculated.nutrients.proteinG, 0.75);
  assert.equal(calculated.nutrients.fiberG, 0);
  assert.equal(calculated.ingredientWeightGrams, 75);
  assert.deepEqual(calculated.missingData, []);
  assert.equal(input.recipes[0].nutrients, undefined);
});

test("one unknown ingredient nutrient makes that entire recipe nutrient unknown without hiding the known totals", () => {
  const input = tables();
  input.ingredients[1].nutrients.sodiumMg = null;
  const calculated = calculateRecipe(input.recipes[0], input.ingredients);
  assert.equal(calculated.nutrients.energyKcal, 175);
  assert.equal(calculated.nutrients.sodiumMg, null);
  assert.deepEqual(calculated.missingData, [{ nutrient: "sodiumMg", ingredientIds: ["second-food"], ingredientNames: ["วัตถุดิบทดสอบ"] }]);
});

test("recipes reject manually supplied totals, missing ingredients, invalid portions and duplicate references", () => {
  const input = tables();
  assert.equal(validRecipe(recipe(), input.ingredients), true);
  for (const mutation of [
    item => { item.nutrients = { energyKcal: 10 }; }, item => { item.calories = 10; },
    item => { item.ingredients[0].ingredientId = "missing-food"; }, item => { item.ingredients[0].grams = 0; },
    item => { item.ingredients[0].grams = "50"; }, item => { item.ingredients.push(item.ingredients[0]); },
    item => { item.servingGrams = null; }, item => { item.ingredients = []; },
  ]) { const candidate = recipe(); mutation(candidate); assert.equal(validRecipe(candidate, input.ingredients), false); }
  input.ingredients.push(input.ingredients[0]);
  assert.equal(validTables(input), false);
});

const fixtureStorage = (t, initial = { _id: "nutrition-catalog", tables: tables(), revision: 1 }) => {
  let stored = initial ? structuredClone(initial) : null;
  t.mock.method(Catalog, "findById", () => ({ lean: async () => stored ? structuredClone(stored) : null }));
  const create = t.mock.method(Catalog, "create", async value => {
    if (stored) throw Object.assign(new Error("duplicate singleton"), { code: 11000 });
    stored = { ...structuredClone(value), updatedAt: "2026-10-06T10:00:00.000Z" };
    return structuredClone(stored);
  });
  const update = t.mock.method(Catalog, "findOneAndUpdate", async (filter, mutation) => {
    if (!stored || stored.revision !== filter.revision) return null;
    stored = { ...stored, tables: structuredClone(mutation.$set.tables), revision: stored.revision + mutation.$inc.revision };
    return structuredClone(stored);
  });
  return { create, update, value: () => stored };
};
const auth = t => t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, role: id === "admin" ? "admin" : "user" }) }));

test("operator import is atomic and idempotent without overwriting administrator edits", async t => {
  const storage = fixtureStorage(t, null);
  const first = await importCatalogSeed({ expectedRevision: 0, seed: tables() });
  assert.deepEqual(first, { changed: true, revision: 1, ingredientCount: 2, recipeCount: 1 });
  assert.equal((await importCatalogSeed({ expectedRevision: 1, seed: tables() })).changed, false);
  const editedSeed = tables(); editedSeed.ingredients[0].nameTh = "Changed upstream name";
  assert.equal((await importCatalogSeed({ expectedRevision: 1, seed: editedSeed })).changed, false);
  assert.equal(storage.value().tables.ingredients[0].nameTh, "วัตถุดิบทดสอบ");
  assert.equal(storage.create.mock.callCount(), 1); assert.equal(storage.update.mock.callCount(), 0);
});

test("explicit operator reset replaces records, rejects stale revisions, and preserves the snapshot on bad imports", async t => {
  const storage = fixtureStorage(t);
  const seed = { ingredients: [ingredient()], recipes: [] };
  assert.deepEqual(await importCatalogSeed({ expectedRevision: 1, seed, replace: true }), { changed: true, revision: 2, ingredientCount: 1, recipeCount: 0 });
  await assert.rejects(() => importCatalogSeed({ expectedRevision: 1, seed, replace: true }), CatalogImportConflict);
  await assert.rejects(() => importCatalogSeed({ expectedRevision: 2, seed: { ingredients: [], recipes: [recipe()] }, replace: true }), /Invalid catalog import/);
  assert.equal(storage.update.mock.callCount(), 1);
});

process.env.JWT_SECRET = "catalog-route-fixture-secret";
process.env.BLOB_PUBLIC_ORIGIN = "https://catalogtest.public.blob.vercel-storage.com";
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_catalogtest_fixture";
let server;
let endpoint;
const request = (path = "", method = "GET", body, id) => fetch(`${endpoint}${path}`, {
  method, headers: { "Content-Type": "application/json", ...(id ? { Authorization: `Bearer ${signToken({ id, role: "admin" })}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
before(async () => {
  const app = express(); app.use(express.json()); app.use("/api/catalog", routes); app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); endpoint = `http://127.0.0.1:${server.address().port}/api/catalog`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("public catalog and detail APIs return complete nutrition and photo credits without account fields", async t => {
  fixtureStorage(t);
  const response = await request(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.ingredients.length, 2); assert.equal(result.recipes[0].nutrients.energyKcal, 175);
  assert.equal(result.disclaimer, "ค่าโภชนาการเป็นค่าประมาณ"); assert.equal(result.stage.awaitingReview, false);
  assert.equal(JSON.stringify(result).includes("email"), false); assert.equal(JSON.stringify(result).includes("health"), false);
  assert.equal((await (await request("/ingredients/fixture-food")).json()).referenceGrams, 100);
  assert.equal((await (await request("/recipes/fixture-recipe")).json()).nutrients.energyKcal, 175);
  assert.equal((await (await request("/credits")).json()).images.length, 3);
  assert.equal((await request("/ingredients/no-such-food")).status, 404);
  assert.equal((await request("/recipes/no-such-recipe")).status, 404);
});

test("a missing catalog returns the validated catalog seed without silently writing to Mongo", async t => {
  const storage = fixtureStorage(t, null);
  const response = await request(); assert.equal(response.status, 200);
  const result = await response.json(); const seed = loadSeed();
  assert.deepEqual(result.ingredients, seed.ingredients); assert.equal(result.recipes.length, 25); assert.equal(result.revision, 0);
  assert.equal(seed.ingredients.length, 76);
  assert.equal(seed.ingredients.every(item => Number.isFinite(item.nutrients.energyKcal)), true);
  assert.equal(result.recipes.every(item => Number.isFinite(item.nutrients.energyKcal)), true);
  assert.equal(result.recipes[0].servingGrams, seed.recipes[0].servingGrams);
  assert.equal(storage.create.mock.callCount(), 0); assert.equal(storage.update.mock.callCount(), 0);
});

test("catalog mutations require authentication and the user's current database admin role", async t => {
  auth(t); const storage = fixtureStorage(t);
  const body = { revision: 1, ingredient: ingredient("new-food") };
  assert.equal((await request("/ingredients", "POST", body)).status, 401);
  assert.equal((await request("/ingredients", "POST", body, "member")).status, 403);
  assert.equal(storage.create.mock.callCount(), 0); assert.equal(storage.update.mock.callCount(), 0);
});

test("energy pruning is admin-only, validates the preview counts, and atomically preserves only complete-energy records", async t => {
  auth(t);
  const input = tables();
  const unknownEnergy = ingredient("unknown-energy");
  unknownEnergy.nutrients.energyKcal = null;
  unknownEnergy.dataStatus = "partial";
  input.ingredients.push(unknownEnergy);
  input.recipes.push({
    id: "unknown-energy-recipe", nameTh: "เมนูไม่มีพลังงาน", nameEn: "Unknown energy recipe",
    category: "Test", servingGrams: 20, ingredients: [{ ingredientId: unknownEnergy.id, grams: 20 }],
    image: { ...PLACEHOLDER }, needsImage: true,
  });
  const storage = fixtureStorage(t, { _id: "nutrition-catalog", tables: input, revision: 1 });
  const body = { revision: 1, expectedIngredients: 1, expectedRecipes: 1 };
  assert.equal((await request("/prune-without-energy", "POST", body)).status, 401);
  assert.equal((await request("/prune-without-energy", "POST", body, "member")).status, 403);
  assert.equal((await request("/prune-without-energy", "POST", { ...body, expectedIngredients: 0 }, "admin")).status, 409);
  assert.equal(storage.update.mock.callCount(), 0);

  const response = await request("/prune-without-energy", "POST", body, "admin");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual([result.removedIngredients, result.removedRecipes], [1, 1]);
  assert.equal(result.catalog.revision, 2);
  assert.equal(result.catalog.ingredients.length, 2);
  assert.equal(result.catalog.recipes.length, 1);
  assert.equal(result.catalog.recipes[0].nutrients.energyKcal, 175);
  assert.equal(storage.update.mock.callCount(), 1);
  assert.equal((await request("/prune-without-energy", "POST", body, "admin")).status, 409);
});

test("admin ingredient edits automatically recalculate existing recipes and conflict with stale revisions", async t => {
  auth(t); const storage = fixtureStorage(t);
  const replacement = ingredient(); replacement.nutrients.energyKcal = 400;
  const response = await request("/ingredients/fixture-food", "PATCH", { revision: 1, ingredient: replacement }, "admin");
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.revision, 2); assert.equal(result.recipes[0].nutrients.energyKcal, 275);
  assert.equal((await request("/ingredients/fixture-food", "PATCH", { revision: 1, ingredient: replacement }, "admin")).status, 409);
  assert.equal(storage.update.mock.callCount(), 1);
});

test("recipe writes reject manual nutrition, spoofed identities, unknown fields and dangling ingredient references", async t => {
  auth(t); const storage = fixtureStorage(t);
  for (const mutation of [
    value => { value.recipe.nutrients = { energyKcal: 1 }; }, value => { value.recipe.calories = 1; },
    value => { value.recipe.ingredients[0].ingredientId = "missing-food"; }, value => { value.recipe.id = "other-id"; },
    value => { value.email = "private@example.com"; }, value => { value.revision = "1"; },
  ]) {
    const body = { revision: 1, recipe: recipe() }; mutation(body);
    assert.equal((await request("/recipes/fixture-recipe", "PATCH", body, "admin")).status, 400);
  }
  assert.equal(storage.update.mock.callCount(), 0);
});

test("removing an ingredient in use is rejected; removing its recipe allows the later removal", async t => {
  auth(t); fixtureStorage(t);
  assert.equal((await request("/ingredients/fixture-food", "DELETE", { revision: 1 }, "admin")).status, 409);
  assert.equal((await request("/recipes/fixture-recipe", "DELETE", { revision: 1 }, "admin")).status, 200);
  assert.equal((await request("/ingredients/fixture-food", "DELETE", { revision: 2 }, "admin")).status, 200);
  const result = await (await request()).json(); assert.equal(result.revision, 3); assert.equal(result.ingredients.length, 1); assert.deepEqual(result.recipes, []);
});

test("catalog creates reject duplicate ids and create a new ingredient through the validated table", async t => {
  auth(t); fixtureStorage(t);
  assert.equal((await request("/ingredients", "POST", { revision: 1, ingredient: ingredient() }, "admin")).status, 409);
  assert.equal((await request("/ingredients", "POST", { revision: 1, ingredient: ingredient("new-food") }, "admin")).status, 201);
});

test("simultaneous first catalog writes are protected by singleton uniqueness", async t => {
  auth(t); const storage = fixtureStorage(t, null);
  const responses = await Promise.all([
    request("/ingredients", "POST", { revision: 0, ingredient: ingredient("first-new-food") }, "admin"),
    request("/ingredients", "POST", { revision: 0, ingredient: ingredient("second-new-food") }, "admin"),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(storage.value().revision, 1);
  assert.equal(storage.value().tables.ingredients.length, loadSeed().ingredients.length + 1);
});

test("administrator replacement images must be owned site uploads with verified storage metadata and rights", async t => {
  auth(t); const storage = fixtureStorage(t);
  const item = ingredient(); item.needsImage = false;
  const url = "https://catalogtest.public.blob.vercel-storage.com/uploads/admin/site/replacement.png";
  item.image = { imageUrl: url, photographer: "Admin", sourceUrl: "", source: "Admin upload", license: "Owner-provided rights" };
  const head = t.mock.method(blobStorage, "head", async () => ({ url, pathname: "uploads/admin/site/replacement.png", contentType: "image/png", size: 5000 }));
  assert.equal((await request("/ingredients/fixture-food", "PATCH", { revision: 1, ingredient: item }, "admin")).status, 200);
  assert.equal(head.mock.callCount(), 1);
  const other = ingredient("second-food"); other.needsImage = false;
  other.image = { ...item.image, imageUrl: "https://catalogtest.public.blob.vercel-storage.com/uploads/other/site/picture.png" };
  assert.equal((await request("/ingredients/second-food", "PATCH", { revision: 2, ingredient: other }, "admin")).status, 400);
  other.image = { imageUrl: "/images/catalog/unreviewed.jpg", photographer: "Someone", sourceUrl: "https://unsplash.com/photos/example", source: "Unsplash", license: "Unsplash License" };
  assert.equal((await request("/ingredients/second-food", "PATCH", { revision: 2, ingredient: other }, "admin")).status, 400);
  assert.equal(storage.update.mock.callCount(), 1);
});
