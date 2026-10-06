const router = require("express").Router();
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const { getSite, updateSite } = require("../controllers/site.controller");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/", getSite);
router.put("/", authenticate, authorize("admin"), updateSite);

module.exports = router;
