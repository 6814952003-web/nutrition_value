const { validateBlob } = require("../config/blob");
const mongoose = require("mongoose");
const Post = require("../models/post.model");
// Community data is shared between accounts. Never spread database documents:
// legacy email snapshots, populated users, and future private fields stay out.
const responseId = value => {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  return value._id !== value ? responseId(value._id) : undefined;
};
const pickFields = (source, textFields, dateFields = []) => {
  const result = {};
  for (const field of ["_id", "author"]) {
    const id = responseId(source[field]);
    if (id !== undefined) result[field] = id;
  }
  for (const field of textFields) if (typeof source[field] === "string") result[field] = source[field];
  for (const field of dateFields) {
    if (source[field] instanceof Date || typeof source[field] === "string") result[field] = source[field];
  }
  return result;
};
const postResponse = (document, userId) => {
  const source = typeof document.toObject === "function" ? document.toObject() : document;
  const { likedBy } = source;
  const publicPost = pickFields(source,
    ["authorName", "authorAvatar", "category", "content", "mediaData", "mediaType"], ["createdAt", "updatedAt"]);
  if (Array.isArray(source.comments)) publicPost.comments = source.comments.map(comment =>
    pickFields(comment, ["authorName", "content"], ["createdAt", "updatedAt"]));
  const identities = new Set((Array.isArray(likedBy) ? likedBy : [])
    .filter(value => mongoose.isObjectIdOrHexString(value)).map(value => String(value).toLowerCase()));
  return { ...publicPost, likes: identities.size, likedByMe: identities.has(String(userId).toLowerCase()) };
};
const getPosts = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { res.json((await Post.find().sort({ createdAt: -1, _id: -1 }).limit(50).lean()).map(post => postResponse(post, req.user._id))); }
  catch (error) { next(error); }
};
const createPost = async (req, res, next) => { try { const { category, content, mediaData = "", mediaType = "" } = req.body; if (!content?.trim()) return res.status(400).json({ message: "Post content is required." }); if (!["food", "workout", "knowledge", "recipe"].includes(category)) return res.status(400).json({ message: "Invalid post category." }); if (mediaData && !["image", "video"].includes(mediaType)) return res.status(400).json({ message: "Invalid media type." }); if (typeof mediaData !== "string" || (mediaData && !await validateBlob(mediaData, req.user._id, "post", mediaType))) return res.status(400).json({ message: "Upload valid media no larger than 100 MB to Blob first." }); const post = await Post.create({ author: req.user._id, authorName: req.user.name, authorAvatar: req.user.avatarData || "", category, content: content.trim(), mediaData, mediaType }); res.status(201).json(postResponse(post, req.user._id)); } catch (error) { next(error); } };
const likePost = async (req, res, next) => {
  try {
    // Pipeline updates are atomic and are not cast by Mongoose. Supply the
    // authenticated ObjectId explicitly, then derive the total from its union.
    const userId = new mongoose.Types.ObjectId(String(req.user._id));
    const post = await Post.findOneAndUpdate({ _id: req.params.id }, [
      { $set: { likedBy: { $setUnion: [{ $ifNull: ["$likedBy", []] }, [userId]] } } },
      { $set: { likes: { $size: "$likedBy" } } },
    ], { new: true, updatePipeline: true });
    if (!post) return res.status(404).json({ message: "Post not found." });
    res.json(postResponse(post, req.user._id));
  } catch (error) { next(error); }
};
const commentPost = async (req, res, next) => { try { const content = req.body.content?.trim(); if (!content || content.length > 500) return res.status(400).json({ message: "Comment must be between 1 and 500 characters." }); const post = await Post.findByIdAndUpdate(req.params.id, { $push: { comments: { author: req.user._id, authorName: req.user.name, content } } }, { new: true }); if (!post) return res.status(404).json({ message: "Post not found." }); res.json(postResponse(post, req.user._id)); } catch (error) { next(error); } };
const updatePost = async (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)
      || !Object.keys(updates).length || Object.keys(updates).some(key => !["content", "category"].includes(key))
      || (Object.hasOwn(updates, "content") && (typeof updates.content !== "string" || !updates.content.trim() || updates.content.trim().length > 800))
      || (Object.hasOwn(updates, "category") && !["food", "workout", "knowledge", "recipe"].includes(updates.category))) {
      return res.status(400).json({ message: "ข้อความหรือหมวดหมู่โพสต์ไม่ถูกต้อง" });
    }
    const values = { ...updates };
    if (Object.hasOwn(values, "content")) values.content = values.content.trim();
    const post = await Post.findByIdAndUpdate(req.params.id, { $set: values }, { new: true, runValidators: true });
    if (!post) return res.status(404).json({ message: "ไม่พบโพสต์นี้" });
    res.json(postResponse(post, req.user._id));
  } catch (error) { next(error); }
};
const deletePost = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, ...(req.user.role === "admin" ? {} : { author: req.user._id }) };
    if (!await Post.findOneAndDelete(filter)) return res.status(404).json({ message: "ไม่พบโพสต์นี้" });
    res.status(204).end();
  } catch (error) { next(error); }
};
const deleteComment = async (req, res, next) => {
  try {
    const commentFilter = { _id: req.params.commentId, ...(req.user.role === "admin" ? {} : { author: req.user._id }) };
    const post = await Post.findOneAndUpdate({ _id: req.params.id, comments: { $elemMatch: commentFilter } },
      { $pull: { comments: commentFilter } }, { new: true, runValidators: true });
    if (!post) return res.status(404).json({ message: "ไม่พบโพสต์หรือความคิดเห็นนี้" });
    res.json(postResponse(post, req.user._id));
  } catch (error) { next(error); }
};
module.exports = { getPosts, createPost, likePost, commentPost, updatePost, deletePost, deleteComment };
