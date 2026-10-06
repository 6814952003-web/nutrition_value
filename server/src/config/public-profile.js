const mongoose = require("mongoose");

const PROFILE_FIELDS = "_id name avatarData username displayName bio profileVisibility createdAt";
const USERNAME_PATTERN = /^[a-z0-9_-]{3,30}$/;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const bangkokDayStart = value => {
  const date = new Date(value);
  return new Date(Math.floor((date.getTime() + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS);
};

const streakPipeline = (userId, now = new Date()) => {
  const today = bangkokDayStart(now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  return [
    { $match: { user: new mongoose.Types.ObjectId(String(userId)), type: { $in: ["registered", "login", "session"] }, createdAt: { $lte: now } } },
    { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "day", timezone: "Asia/Bangkok" } } } },
    { $setWindowFields: {
      sortBy: { _id: -1 },
      output: { ordinal: { $documentNumber: {} }, newestDay: { $first: "$_id", window: { documents: ["unbounded", "unbounded"] } } },
    } },
    { $match: { $expr: { $and: [
      { $gte: ["$newestDay", yesterday] }, { $lte: ["$newestDay", today] },
      { $eq: [{ $dateDiff: { startDate: "$_id", endDate: "$newestDay", unit: "day", timezone: "Asia/Bangkok" } }, { $subtract: ["$ordinal", 1] }] },
    ] } } },
    { $count: "streak" },
  ];
};

const publicPostPipeline = userId => [
  { $match: { author: new mongoose.Types.ObjectId(String(userId)) } },
  { $sort: { createdAt: -1, _id: -1 } },
  { $limit: 50 },
  { $project: {
    _id: 1, content: 1, category: 1, mediaData: 1, mediaType: 1, createdAt: 1,
    likes: { $size: { $setUnion: [{ $filter: { input: { $ifNull: ["$likedBy", []] }, as: "identity", cond: { $eq: [{ $type: "$$identity" }, "objectId"] } } }, []] } },
    commentCount: { $size: { $ifNull: ["$comments", []] } },
  } },
];

// Keep a second explicit allowlist at the response boundary even though Mongo
// projections already exclude account identities and all comment bodies.
const publicPostResponse = post => ({
  _id: post._id, content: post.content, category: post.category,
  mediaData: post.mediaData || "", mediaType: post.mediaType || "", createdAt: post.createdAt,
  likes: Number.isSafeInteger(post.likes) && post.likes >= 0 ? post.likes : 0,
  commentCount: Number.isSafeInteger(post.commentCount) && post.commentCount >= 0 ? post.commentCount : 0,
});

const publicProfileResponse = (user, streak, posts) => ({
  avatarUrl: user.avatarData || "", displayName: user.displayName || user.name,
  bio: user.bio || "", joinedAt: user.createdAt,
  streak: Number.isSafeInteger(streak) && streak >= 0 ? streak : 0,
  posts: posts.map(publicPostResponse),
});

module.exports = { PROFILE_FIELDS, USERNAME_PATTERN, bangkokDayStart, streakPipeline, publicPostPipeline, publicProfileResponse };
