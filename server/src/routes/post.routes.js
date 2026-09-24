const express = require("express");
const { getPosts, createPost, likePost, commentPost } = require("../controllers/post.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const router = express.Router();
router.route("/").get(authenticate, getPosts).post(authenticate, createPost);
router.post("/:id/like", authenticate, likePost);
router.post("/:id/comments", authenticate, commentPost);
module.exports = router;
