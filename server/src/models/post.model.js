const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, required: true, trim: true, maxlength: 80 },
  content: { type: String, required: true, trim: true, maxlength: 500 },
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  authorName: { type: String, required: true, trim: true, maxlength: 80 },
  authorEmail: { type: String, required: true, trim: true, lowercase: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  authorAvatar: { type: String, default: "" },
  category: { type: String, enum: ["food", "workout", "knowledge", "recipe"], required: true },
  content: { type: String, required: true, trim: true, maxlength: 800 },
  mediaData: { type: String, default: "" },
  mediaType: { type: String, enum: ["", "image", "video"], default: "" },
  likes: { type: Number, default: 0 },
  comments: { type: [commentSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Post", postSchema);
