const mongoose = require("mongoose");

// One fixed document id gives create/save requests an atomic uniqueness guard.
const siteSchema = new mongoose.Schema({
  _id: { type: String, default: "public-site" },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  revision: { type: Number, required: true, min: 1 },
}, { timestamps: true });

module.exports = mongoose.model("Site", siteSchema);
