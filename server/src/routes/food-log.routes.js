const router = require("express").Router();
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/food-log.controller");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.use(authenticate);
router.get("/", controller.getFoodLogs);
router.post("/", controller.createFoodLog);
router.patch("/:id", controller.updateFoodLog);
router.delete("/:id", controller.deleteFoodLog);

module.exports = router;
