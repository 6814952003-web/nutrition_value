const mongoose = require("mongoose");
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });
const { connectDB } = require("../src/config/db");
const Catalog = require("../src/models/catalog.model");
const Site = require("../src/models/site.model");
const { CATALOG_ID, loadSeed } = require("../src/config/catalog");
const { importCatalogSeed } = require("../src/services/catalog-import");

const run = async () => {
  const argumentsSet = new Set(process.argv.slice(2));
  if ([...argumentsSet].some(argument => !["--apply", "--replace", "--clear-legacy-meals"].includes(argument))) throw new Error("Usage: node scripts/import-catalog.js [--apply] [--replace] [--clear-legacy-meals]");
  const seed = loadSeed();
  if (!await connectDB()) throw new Error("Database unavailable.");
  const stored = await Catalog.findById(CATALOG_ID).lean();
  const expectedRevision = stored?.revision || 0;
  const site = argumentsSet.has("--clear-legacy-meals") ? await Site.findById("public-site").lean() : null;
  if (site && (!site.config || typeof site.config !== "object" || Array.isArray(site.config)
    || (site.config.meals !== undefined && !Array.isArray(site.config.meals)))) throw new Error("Legacy site meals are invalid; preserve and review the site document before clearing.");
  const legacyMealCount = Array.isArray(site?.config?.meals) ? site.config.meals.length : 0;
  if (!argumentsSet.has("--apply")) {
    console.log(JSON.stringify({
      dryRun: true, revision: expectedRevision, storedIngredients: stored?.tables?.ingredients?.length || 0,
      storedRecipes: stored?.tables?.recipes?.length || 0, seedIngredients: seed.ingredients.length,
      listedIngredients: 100, additionalIngredients: seed.ingredients.length - 100, seedRecipes: seed.recipes.length,
      replace: argumentsSet.has("--replace"), legacySiteRevision: site?.revision || 0, legacyMealCount,
      clearLegacyMeals: argumentsSet.has("--clear-legacy-meals"),
    }));
    return;
  }
  if (argumentsSet.has("--clear-legacy-meals") && legacyMealCount > 0 && (!Number.isSafeInteger(site.revision) || site.revision < 1)) {
    throw new Error("Legacy site revision is invalid; preserve and review the site document before clearing.");
  }
  const result = await importCatalogSeed({ expectedRevision, seed, replace: argumentsSet.has("--replace") });
  if (argumentsSet.has("--clear-legacy-meals") && legacyMealCount > 0) {
    const cleared = await Site.findOneAndUpdate(
      { _id: "public-site", revision: site.revision },
      { $set: { "config.meals": [] }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!cleared) throw new Error("Site settings changed during catalog import. Re-run the dry run before clearing legacy meals.");
  }
  console.log(JSON.stringify({ ...result, legacyMealsCleared: legacyMealCount }));
};

run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
