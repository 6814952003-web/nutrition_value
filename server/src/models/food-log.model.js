const mongoose = require("mongoose");
const { NUTRIENTS } = require("../config/catalog");

const nullableNutrients = () => Object.fromEntries(NUTRIENTS.map(key => [key, { type: Number, default: null, min: 0 }]));
const foodLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  itemType: { type: String, required: true, enum: ["recipe", "ingredient"], default: "recipe" },
  menuId: { type: String, required: true, trim: true },
  menuName: { type: String, required: true, trim: true, maxlength: 160 },
  imageUrl: { type: String, required: true, maxlength: 2048 },
  referenceGrams: { type: Number, default: null, min: 0.01, max: 100_000 },
  meal: { type: String, required: true, enum: ["breakfast", "lunch", "dinner", "snack"] },
  servings: { type: Number, required: true, min: 0.1, max: 100 },
  eatenAt: { type: Date, required: true },
  nutrientsPerServing: { type: mongoose.Schema.Types.Mixed, required: true },
  nutrients: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

foodLogSchema.index({ userId: 1, eatenAt: 1 });

module.exports = mongoose.model("FoodLog", foodLogSchema);
