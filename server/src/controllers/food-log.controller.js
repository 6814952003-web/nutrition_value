const mongoose = require("mongoose");
const FoodLog = require("../models/food-log.model");
const Catalog = require("../models/catalog.model");
const { CATALOG_ID, NUTRIENTS, catalogResponse, identifier } = require("../config/catalog");

const meals = new Set(["breakfast", "lunch", "dinner", "snack"]);
const exactKeys = (value, allowed) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));
const validServings = value => typeof value === "number" && Number.isFinite(value) && value >= 0.1 && value <= 100;
const validDate = value => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const scaleNutrients = (nutrients, servings) => Object.fromEntries(NUTRIENTS.map(key => [
  key,
  Number.isFinite(nutrients?.[key]) ? Math.round(nutrients[key] * servings * 1_000_000) / 1_000_000 : null,
]));
const ownerFilter = (req, id) => ({ _id: id, userId: req.user._id });
const badRequest = res => res.status(400).json({ message: "ข้อมูลบันทึกการกินไม่ถูกต้อง" });

const getFoodLogs = async (req, res, next) => {
  try {
    const { date, timezoneOffsetMinutes = "0" } = req.query;
    const utcDate = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : null;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(utcDate?.getTime()) || utcDate.toISOString().slice(0, 10) !== date
      || !/^-?\d{1,3}$/.test(String(timezoneOffsetMinutes))) return badRequest(res);
    const offset = Number(timezoneOffsetMinutes);
    if (!Number.isInteger(offset) || offset < -840 || offset > 840) return badRequest(res);
    const [year, month, day] = date.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) + offset * 60_000);
    const end = new Date(start.getTime() + 86_400_000);
    const logs = await FoodLog.find({ userId: req.user._id, eatenAt: { $gte: start, $lt: end } }).sort({ eatenAt: 1, createdAt: 1 }).lean();
    res.set("Cache-Control", "no-store").json(logs);
  } catch (error) { next(error); }
};

const createFoodLog = async (req, res, next) => {
  try {
    if (!exactKeys(req.body, ["menuId", "meal", "servings", "eatenAt", "itemType"])
      || !identifier(req.body.menuId) || !meals.has(req.body.meal)
      || (req.body.itemType !== undefined && !["recipe", "ingredient"].includes(req.body.itemType))
      || !validServings(req.body.servings) || !validDate(req.body.eatenAt)) return badRequest(res);
    const catalog = catalogResponse(await Catalog.findById(CATALOG_ID).lean());
    const itemType = req.body.itemType || "recipe";
    const item = itemType === "recipe"
      ? catalog.recipes.find(recipe => recipe.id === req.body.menuId)
      : catalog.ingredients.find(ingredient => ingredient.id === req.body.menuId);
    if (!item) return res.status(404).json({ message: itemType === "recipe" ? "ไม่พบเมนูนี้ในคลังอาหาร" : "ไม่พบวัตถุดิบนี้ในคลังอาหาร" });
    const referenceGrams = itemType === "ingredient" ? item.referenceGrams : null;
    const nutrientsPerServing = itemType === "ingredient"
      ? scaleNutrients(item.nutrients, referenceGrams / 100)
      : item.nutrients;
    const log = await FoodLog.create({
      userId: req.user._id,
      itemType,
      menuId: item.id,
      menuName: item.nameTh,
      imageUrl: item.image?.imageUrl || "/images/catalog/placeholder.svg",
      referenceGrams,
      meal: req.body.meal,
      servings: req.body.servings,
      eatenAt: new Date(req.body.eatenAt),
      nutrientsPerServing,
      nutrients: scaleNutrients(nutrientsPerServing, req.body.servings),
    });
    res.status(201).json(log);
  } catch (error) { next(error); }
};

const updateFoodLog = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "ไม่พบบันทึกการกินนี้" });
    if (!exactKeys(req.body, ["servings", "meal", "eatenAt"]) || !Object.keys(req.body).length
      || (Object.hasOwn(req.body, "servings") && !validServings(req.body.servings))
      || (Object.hasOwn(req.body, "meal") && !meals.has(req.body.meal))
      || (Object.hasOwn(req.body, "eatenAt") && !validDate(req.body.eatenAt))) return badRequest(res);
    const existing = await FoodLog.findOne(ownerFilter(req, req.params.id)).lean();
    if (!existing) return res.status(404).json({ message: "ไม่พบบันทึกการกินนี้" });
    const nextServings = req.body.servings ?? existing.servings;
    const update = { $set: {
      servings: nextServings,
      nutrients: scaleNutrients(existing.nutrientsPerServing, nextServings),
      ...(req.body.meal ? { meal: req.body.meal } : {}),
      ...(req.body.eatenAt ? { eatenAt: new Date(req.body.eatenAt) } : {}),
    }, $inc: { __v: 1 } };
    const saved = await FoodLog.findOneAndUpdate(
      { ...ownerFilter(req, req.params.id), __v: existing.__v || 0 },
      update,
      { new: true, runValidators: true },
    );
    if (!saved) return res.status(409).json({ message: "บันทึกนี้เปลี่ยนไปแล้ว กรุณาโหลดใหม่" });
    res.json(saved);
  } catch (error) { next(error); }
};

const deleteFoodLog = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "ไม่พบบันทึกการกินนี้" });
    const deleted = await FoodLog.findOneAndDelete(ownerFilter(req, req.params.id));
    if (!deleted) return res.status(404).json({ message: "ไม่พบบันทึกการกินนี้" });
    res.status(204).end();
  } catch (error) { next(error); }
};

module.exports = { getFoodLogs, createFoodLog, updateFoodLog, deleteFoodLog, scaleNutrients };
