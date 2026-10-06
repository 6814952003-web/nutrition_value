const express = require("express");
const { registerUser, loginUser, getMe, listUsers, updateUser, updateMyProfile } = require("../controllers/user.controller");
const { listMyActivity, saveSession } = require("../controllers/activity.controller");
const { previewMyPublicProfile } = require("../controllers/profile.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", authenticate, getMe);
router.get("/me/public-preview", authenticate, previewMyPublicProfile);
router.patch("/me/profile", authenticate, updateMyProfile);
router.get("/me/activity", authenticate, listMyActivity);
router.post("/me/activity", authenticate, saveSession);
router.get("/", authenticate, authorize("admin"), listUsers);
router.patch("/:id", authenticate, authorize("admin"), updateUser);
module.exports = router;
