const express = require("express");
const {
    getTracks,
    createTrack,
    downloadTrack,
} = require("../controllers/track.controller");

const router = express.Router();

router.get("/", getTracks);
router.post("/", createTrack);
router.post("/:id/download", downloadTrack);

module.exports = router;