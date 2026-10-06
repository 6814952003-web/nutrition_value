const mongoose = require("mongoose");
const User = require("../models/user.model");
const { USERNAME_PATTERN } = require("./public-profile");

const AUTHOR_FIELDS = "_id username displayName name avatarData profileVisibility";
const authorKey = value => mongoose.isObjectIdOrHexString(value) ? String(value).toLowerCase() : null;

// Receive already allowlisted community DTOs. Stored usernames and populated
// account records are never candidates for a public profile address.
const attachAuthorProfiles = async posts => {
  const authorIds = new Set();
  for (const post of posts) {
    for (const entry of [post, ...(post.comments || [])]) {
      const key = authorKey(entry.author);
      if (key) authorIds.add(key);
    }
  }
  let users = [];
  if (authorIds.size) {
    try {
      users = await User.find({
        _id: { $in: [...authorIds] }, profileVisibility: "public",
      }).select(AUTHOR_FIELDS).lean();
    } catch {
      // Links are optional. Never turn an already committed comment or post
      // into a retryable mutation failure, or publish an unverified snapshot.
      users = [];
    }
  }
  const publicAuthors = new Map(users.filter(user => authorKey(user._id) && user.profileVisibility === "public"
    && typeof user.username === "string" && USERNAME_PATTERN.test(user.username))
    .map(user => [authorKey(user._id), user]));

  const attach = entry => {
    const user = publicAuthors.get(authorKey(entry.author));
    if (!user) return { ...entry, authorUsername: null };
    return {
      ...entry,
      authorName: (typeof user.displayName === "string" && user.displayName)
        || (typeof user.name === "string" && user.name) || entry.authorName,
      authorAvatar: typeof user.avatarData === "string" ? user.avatarData : "",
      authorUsername: user.username,
    };
  };
  return posts.map(post => {
    const result = attach(post);
    if (Array.isArray(post.comments)) result.comments = post.comments.map(attach);
    return result;
  });
};

module.exports = { AUTHOR_FIELDS, attachAuthorProfiles };
