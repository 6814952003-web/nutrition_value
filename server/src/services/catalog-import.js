const { isDeepStrictEqual } = require("node:util");
const Catalog = require("../models/catalog.model");
const { CATALOG_ID, revisionValid, validTables, loadSeed } = require("../config/catalog");

class CatalogImportConflict extends Error {
  constructor() { super("Catalog changed. Re-read its revision before importing."); this.name = "CatalogImportConflict"; }
}

// Explicit operator operation only: public reads never write or re-seed Mongo.
// replace=true is appropriate for an approved staged reset; the default only
// inserts absent ids and preserves edits made by an administrator.
const importCatalogSeed = async ({ expectedRevision, seed = loadSeed(), replace = false }, model = Catalog) => {
  if (!revisionValid(expectedRevision) || !validTables(seed)) throw new Error("Invalid catalog import or expected revision.");
  const stored = await model.findById(CATALOG_ID).lean();
  if ((stored?.revision || 0) !== expectedRevision) throw new CatalogImportConflict();
  if (stored && !validTables(stored.tables)) throw new Error("Existing catalog is invalid; preserve and review it before importing.");
  let tables;
  if (replace || !stored) tables = structuredClone(seed);
  else {
    tables = structuredClone(stored.tables);
    for (const kind of ["ingredients", "recipes"]) {
      const ids = new Set(tables[kind].map(item => item.id));
      tables[kind].push(...structuredClone(seed[kind].filter(item => !ids.has(item.id))));
    }
  }
  if (!validTables(tables)) throw new Error("Imported catalog would contain invalid records or dangling ingredient references.");
  if (stored && isDeepStrictEqual(stored.tables, tables)) return { changed: false, revision: stored.revision, ingredientCount: tables.ingredients.length, recipeCount: tables.recipes.length };
  let document;
  if (!stored) {
    try { document = await model.create({ _id: CATALOG_ID, tables, revision: 1 }); }
    catch (error) { if (error.code === 11000) throw new CatalogImportConflict(); throw error; }
  } else {
    document = await model.findOneAndUpdate({ _id: CATALOG_ID, revision: expectedRevision }, { $set: { tables }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!document) throw new CatalogImportConflict();
  }
  return { changed: true, revision: document.revision, ingredientCount: tables.ingredients.length, recipeCount: tables.recipes.length };
};

module.exports = { importCatalogSeed, CatalogImportConflict };
