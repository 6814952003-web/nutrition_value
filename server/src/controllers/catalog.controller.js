const Catalog = require("../models/catalog.model");
const { isDeepStrictEqual } = require("node:util");
const { validateBlob } = require("../config/blob");
const { CATALOG_ID, exactKeys, identifier, revisionValid, validIngredient, validRecipe, validTables, loadSeed, catalogResponse, imageCredits } = require("../config/catalog");

const read = () => Catalog.findById(CATALOG_ID).lean();
const conflict = res => res.status(409).json({ message: "Catalog changed. Reload the latest catalog before saving." });
const bad = res => res.status(400).json({ message: "Invalid catalog data. Nutrition values need official references; recipe nutrition is calculated automatically." });
const getCatalog = async (req, res, next) => {
  try { res.json(catalogResponse(await read())); } catch (error) { next(error); }
};
const getIngredient = async (req, res, next) => {
  try {
    const catalog = catalogResponse(await read());
    const ingredient = catalog.ingredients.find(item => item.id === req.params.id);
    if (!ingredient) return res.status(404).json({ message: "Ingredient not found." });
    res.json({ ...ingredient, revision: catalog.revision, disclaimer: catalog.disclaimer });
  } catch (error) { next(error); }
};
const getRecipe = async (req, res, next) => {
  try {
    const catalog = catalogResponse(await read());
    const recipe = catalog.recipes.find(item => item.id === req.params.id);
    if (!recipe) return res.status(404).json({ message: "Recipe not found." });
    res.json({ ...recipe, revision: catalog.revision });
  } catch (error) { next(error); }
};
const getCredits = async (req, res, next) => {
  try {
    const catalog = catalogResponse(await read());
    res.json({ images: imageCredits(catalog), revision: catalog.revision, disclaimer: catalog.disclaimer });
  } catch (error) { next(error); }
};
const save = async (tables, revision, res) => {
  let document;
  if (revision === 0) {
    try { document = await Catalog.create({ _id: CATALOG_ID, tables, revision: 1 }); }
    catch (error) { if (error.code === 11000) { conflict(res); return null; } throw error; }
  } else {
    document = await Catalog.findOneAndUpdate({ _id: CATALOG_ID, revision }, { $set: { tables }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!document) { conflict(res); return null; }
  }
  return document;
};
const validateChangedImage = async (item, previous, user) => {
  if (item.needsImage || isDeepStrictEqual(item.image, previous?.image)) return true;
  // Public-path photographs are curated by the seed importer. Browser edits
  // may only replace them with a verified image uploaded by this administrator.
  const sourceAllowed = ["Unsplash", "Pexels", "Pixabay", "Admin upload"].includes(item.image.source);
  return sourceAllowed && await validateBlob(item.image.imageUrl, user._id, "site", "image");
};
const edit = (kind, action) => async (req, res, next) => {
  try {
    const property = kind === "ingredients" ? "ingredient" : "recipe";
    const keys = action === "delete" ? ["revision"] : ["revision", property];
    if (!exactKeys(req.body, keys) || !revisionValid(req.body.revision)) return bad(res);
    const document = await read();
    if ((document?.revision || 0) !== req.body.revision) return conflict(res);
    const tables = structuredClone(document?.tables || loadSeed());
    if (!validTables(tables)) throw new Error("The existing nutrition catalog could not be validated.");
    const id = action === "create" ? req.body[property]?.id : req.params.id;
    if (!identifier(id)) return bad(res);
    const index = tables[kind].findIndex(item => item.id === id);
    if (action === "create" && index >= 0) return res.status(409).json({ message: "Catalog id already exists." });
    if (action !== "create" && index < 0) return res.status(404).json({ message: "Catalog item not found." });
    if (action === "delete") {
      if (kind === "ingredients" && tables.recipes.some(recipe => recipe.ingredients.some(item => item.ingredientId === id))) {
        return res.status(409).json({ message: "Ingredient is used by a recipe. Update those recipes before removing it." });
      }
      tables[kind].splice(index, 1);
    } else {
      const item = req.body[property];
      if (item?.id !== id || !(kind === "ingredients" ? validIngredient(item) : validRecipe(item, tables.ingredients))) return bad(res);
      if (!await validateChangedImage(item, index < 0 ? null : tables[kind][index], req.user)) return res.status(400).json({ message: "Upload a replacement image through the administrator image uploader and confirm its rights." });
      if (action === "create") tables[kind].push(item); else tables[kind][index] = item;
    }
    if (!validTables(tables)) return bad(res);
    const saved = await save(tables, req.body.revision, res);
    if (saved) res.status(action === "create" ? 201 : 200).json(catalogResponse(saved));
  } catch (error) { next(error); }
};

module.exports = { getCatalog, getIngredient, getRecipe, getCredits,
  createIngredient: edit("ingredients", "create"), updateIngredient: edit("ingredients", "update"), deleteIngredient: edit("ingredients", "delete"),
  createRecipe: edit("recipes", "create"), updateRecipe: edit("recipes", "update"), deleteRecipe: edit("recipes", "delete") };
