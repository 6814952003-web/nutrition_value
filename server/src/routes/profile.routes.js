const express = require("express");
const { getPublicProfile } = require("../controllers/profile.controller");

const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/:username", getPublicProfile);
module.exports = router;
