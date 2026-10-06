const router = require("express").Router();
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const controller = require("../controllers/catalog.controller");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/", controller.getCatalog);
router.get("/credits", controller.getCredits);
router.get("/ingredients/:id", controller.getIngredient);
router.get("/recipes/:id", controller.getRecipe);
router.post("/ingredients", authenticate, authorize("admin"), controller.createIngredient);
router.patch("/ingredients/:id", authenticate, authorize("admin"), controller.updateIngredient);
router.delete("/ingredients/:id", authenticate, authorize("admin"), controller.deleteIngredient);
router.post("/recipes", authenticate, authorize("admin"), controller.createRecipe);
router.patch("/recipes/:id", authenticate, authorize("admin"), controller.updateRecipe);
router.delete("/recipes/:id", authenticate, authorize("admin"), controller.deleteRecipe);

module.exports = router;
