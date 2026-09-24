const express = require("express");
const { registerUser, loginUser, getMe, listUsers, updateUser, updateMyProfile } = require("../controllers/user.controller");
const { listMyActivity, saveSession } = require("../controllers/activity.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", authenticate, getMe);
router.patch("/me/profile", authenticate, updateMyProfile);
router.get("/me/activity", authenticate, listMyActivity);
router.post("/me/activity", authenticate, saveSession);
router.get("/", authenticate, authorize("admin"), listUsers);
router.patch("/:id", authenticate, authorize("admin"), updateUser);
module.exports = router;
