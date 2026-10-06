const mongoose = require("mongoose");
const { CATALOG_ID, validTables } = require("../config/catalog");

// A single versioned snapshot prevents edits from leaving dangling ingredient
// references, and makes seed imports an atomic compare-and-swap operation.
const catalogSchema = new mongoose.Schema({
  _id: { type: String, default: CATALOG_ID },
  tables: { type: mongoose.Schema.Types.Mixed, required: true, validate: { validator: validTables, message: "Invalid nutrition catalog tables." } },
  revision: { type: Number, required: true, min: 1 },
}, { timestamps: true });

module.exports = mongoose.model("Catalog", catalogSchema);
