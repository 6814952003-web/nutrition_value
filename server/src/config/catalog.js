const fs = require("node:fs");
const path = require("node:path");
const { blobPublicOrigin } = require("./blob");

const NUTRIENTS = Object.freeze(["energyKcal", "proteinG", "carbohydrateG", "fatG", "saturatedFatG", "sugarG", "fiberG", "sodiumMg", "cholesterolMg"]);
const DISCLAIMER = "ค่าโภชนาการเป็นค่าประมาณ";
const CATALOG_ID = "nutrition-catalog";
const PLACEHOLDER = Object.freeze({ imageUrl: "/images/catalog/placeholder.svg", photographer: "", sourceUrl: "", source: "Placeholder", license: "Original placeholder" });
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => object(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value, max = 200, required = true) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const identifier = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
const revisionValid = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const https = value => {
  if (!text(value, 2048)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && url.href === value ? url : null;
  } catch { return null; }
};
const validSource = source => {
  if (!exactKeys(source, ["provider", "title", "url", "foodId", "matchedDescription", "retrievedAt"])) return false;
  if (!["USDA FoodData Central", "INMUCAL"].includes(source.provider)
    || !text(source.title, 500) || !text(source.foodId, 120) || !text(source.matchedDescription, 1000)
    || !text(source.retrievedAt, 40) || !Number.isFinite(Date.parse(source.retrievedAt))) return false;
  const url = https(source.url);
  if (!url) return false;
  const hosts = source.provider === "USDA FoodData Central" ? ["fdc.nal.usda.gov"]
    : ["inmu.mahidol.ac.th", "inmu2.mahidol.ac.th", "thaifcd.anamai.moph.go.th", "nutrition2.anamai.moph.go.th", "nutrition.anamai.moph.go.th"];
  return hosts.includes(url.hostname);
};
const validNutrients = value => exactKeys(value, NUTRIENTS)
  && NUTRIENTS.every(key => value[key] === null || (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0));
const validImage = (image, needsImage) => {
  if (!exactKeys(image, ["imageUrl", "photographer", "sourceUrl", "source", "license"]) || typeof needsImage !== "boolean") return false;
  if (!text(image.imageUrl, 2048) || !text(image.photographer, 200, false) || !text(image.sourceUrl, 2048, false) || !text(image.license, 300)) return false;
  if (needsImage) return Object.keys(PLACEHOLDER).every(key => image[key] === PLACEHOLDER[key]);
  const local = /^\/images\/catalog\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(image.imageUrl);
  const remote = https(image.imageUrl);
  const origin = blobPublicOrigin();
  const ownedBlob = remote && origin && remote.origin === origin && /^\/uploads\/[a-zA-Z0-9_-]+\/site\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(remote.pathname) && !remote.search;
  if (!local && !ownedBlob) return false;
  const hosts = { Unsplash: ["unsplash.com", "www.unsplash.com"], Pexels: ["pexels.com", "www.pexels.com"], Pixabay: ["pixabay.com", "www.pixabay.com"] };
  const sourceUrl = https(image.sourceUrl);
  const licenses = { Unsplash: "Unsplash License", Pexels: "Pexels License", Pixabay: "Pixabay Content License" };
  if (image.source === "Admin upload") return image.sourceUrl === "" && text(image.photographer, 200) && image.license === "Owner-provided rights";
  return !!sourceUrl && !!hosts[image.source]?.includes(sourceUrl.hostname) && text(image.photographer, 200) && image.license === licenses[image.source];
};
const validIngredient = ingredient => {
  const fields = ["id", "nameTh", "nameEn", "category", "state", "referenceBasis", "referenceGrams", "nutrients", "source", "image", "needsImage"];
  if (!exactKeys(ingredient, fields, ["nutrientSources", "dataStatus", "notes"]) || !identifier(ingredient.id)
    || !text(ingredient.nameTh, 160) || !text(ingredient.nameEn, 160) || !text(ingredient.category, 120)
    || !["raw", "cooked", "processed"].includes(ingredient.state) || !text(ingredient.referenceBasis, 500)
    || ingredient.referenceGrams !== 100 || !validNutrients(ingredient.nutrients) || !validImage(ingredient.image, ingredient.needsImage)
    || (ingredient.source !== null && !validSource(ingredient.source))) return false;
  if (Object.hasOwn(ingredient, "dataStatus") && !["verified", "partial", "unmatched"].includes(ingredient.dataStatus)) return false;
  if (Object.hasOwn(ingredient, "notes") && !text(ingredient.notes, 2000, false)) return false;
  if (Object.hasOwn(ingredient, "nutrientSources") && (!object(ingredient.nutrientSources)
    || Object.keys(ingredient.nutrientSources).some(key => !NUTRIENTS.includes(key))
    || Object.values(ingredient.nutrientSources).some(source => source !== null && !validSource(source)))) return false;
  return NUTRIENTS.every(key => ingredient.nutrients[key] === null
    || validSource(Object.hasOwn(ingredient.nutrientSources || {}, key) ? ingredient.nutrientSources[key] : ingredient.source));
};
const validRecipe = (recipe, ingredients) => {
  const fields = ["id", "nameTh", "nameEn", "category", "servingGrams", "ingredients", "image", "needsImage"];
  if (!exactKeys(recipe, fields) || !identifier(recipe.id) || !text(recipe.nameTh, 160) || !text(recipe.nameEn, 160)
    || !text(recipe.category, 120) || typeof recipe.servingGrams !== "number" || !Number.isFinite(recipe.servingGrams)
    || recipe.servingGrams <= 0 || recipe.servingGrams > 100_000 || !validImage(recipe.image, recipe.needsImage)
    || !Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1 || recipe.ingredients.length > 100
    || new Set(recipe.ingredients.map(item => item?.ingredientId)).size !== recipe.ingredients.length) return false;
  const ids = new Set(ingredients.map(item => item.id));
  return recipe.ingredients.every(item => exactKeys(item, ["ingredientId", "grams"]) && ids.has(item.ingredientId)
    && typeof item.grams === "number" && Number.isFinite(item.grams) && item.grams > 0 && item.grams <= 100_000);
};
const validTables = tables => exactKeys(tables, ["ingredients", "recipes"])
  && Array.isArray(tables.ingredients) && tables.ingredients.length <= 1000 && tables.ingredients.every(validIngredient)
  && new Set(tables.ingredients.map(item => item.id)).size === tables.ingredients.length
  && Array.isArray(tables.recipes) && tables.recipes.length <= 1000 && tables.recipes.every(recipe => validRecipe(recipe, tables.ingredients))
  && new Set(tables.recipes.map(item => item.id)).size === tables.recipes.length;

const calculateRecipe = (recipe, ingredients) => {
  const lookup = new Map(ingredients.map(item => [item.id, item]));
  const missingData = [];
  const nutrients = Object.fromEntries(NUTRIENTS.map(nutrient => {
    const missing = recipe.ingredients.filter(item => {
      const ingredient = lookup.get(item.ingredientId);
      return !ingredient || typeof ingredient.nutrients?.[nutrient] !== "number" || !Number.isFinite(ingredient.nutrients[nutrient]);
    });
    if (missing.length) {
      missingData.push({ nutrient, ingredientIds: missing.map(item => item.ingredientId), ingredientNames: missing.map(item => lookup.get(item.ingredientId)?.nameTh || item.ingredientId) });
      return [nutrient, null];
    }
    const total = recipe.ingredients.reduce((sum, item) => sum + lookup.get(item.ingredientId).nutrients[nutrient] * item.grams / 100, 0);
    return [nutrient, Math.round(total * 1_000_000) / 1_000_000];
  }));
  return { ...structuredClone(recipe), nutrients, missingData, ingredientWeightGrams: recipe.ingredients.reduce((sum, item) => sum + item.grams, 0), calculation: "sum(ingredient nutrient per 100 g × ingredient grams / 100)", disclaimer: DISCLAIMER };
};
const loadSeed = () => {
  const filename = path.resolve(__dirname, "../../../shared/catalog-ingredients.json");
  const extraFilename = path.resolve(__dirname, "../../../shared/catalog-extra-ingredients.json");
  const recipesFilename = path.resolve(__dirname, "../../../shared/catalog-recipes.json");
  const ingredients = JSON.parse(fs.readFileSync(filename, "utf8"));
  const extras = JSON.parse(fs.readFileSync(extraFilename, "utf8"));
  const definitions = JSON.parse(fs.readFileSync(recipesFilename, "utf8"));
  const recipes = definitions.map(([id, nameTh, nameEn, category, parts]) => ({
    id, nameTh, nameEn, category,
    servingGrams: parts.reduce((sum, [, grams]) => sum + grams, 0),
    ingredients: parts.map(([ingredientId, grams]) => ({ ingredientId, grams })),
    image: structuredClone(PLACEHOLDER), needsImage: true,
  }));
  const tables = { ingredients: [...ingredients, ...extras], recipes };
  if (!validTables(tables)) throw new Error("Catalog seed is invalid. Nutrients must have verified references, and images must be locally hosted with credits.");
  return tables;
};
const catalogResponse = document => {
  const tables = document?.tables || loadSeed();
  if (!validTables(tables)) throw new Error("The nutrition catalog could not be validated.");
  return {
    ingredients: structuredClone(tables.ingredients), recipes: tables.recipes.map(recipe => calculateRecipe(recipe, tables.ingredients)),
    revision: document?.revision || 0, updatedAt: document?.updatedAt || null,
    stage: { name: "catalog-seed-ready", ingredientBatch: Math.min(100, tables.ingredients.length), ingredientsTarget: tables.ingredients.length, extraIngredients: Math.max(0, tables.ingredients.length - 100), recipeBatch: Math.min(25, tables.recipes.length), recipesTarget: tables.recipes.length, awaitingReview: false }, disclaimer: DISCLAIMER,
  };
};
const imageCredits = catalog => [...catalog.ingredients.map(item => ({ kind: "ingredient", id: item.id, nameTh: item.nameTh, ...item.image, needsImage: item.needsImage })),
  ...catalog.recipes.map(item => ({ kind: "recipe", id: item.id, nameTh: item.nameTh, ...item.image, needsImage: item.needsImage }))];

module.exports = { NUTRIENTS, DISCLAIMER, CATALOG_ID, PLACEHOLDER, exactKeys, identifier, revisionValid, validSource, validImage, validIngredient, validRecipe, validTables, calculateRecipe, loadSeed, catalogResponse, imageCredits };
