const User = require("../models/user.model");
const Activity = require("../models/activity.model");
const Post = require("../models/post.model");
const { PROFILE_FIELDS, USERNAME_PATTERN, streakPipeline, publicPostPipeline, publicProfileResponse } = require("../config/public-profile");

const loadPublicView = async user => {
  const [activity, posts] = await Promise.all([
    Activity.aggregate(streakPipeline(user._id)),
    Post.aggregate(publicPostPipeline(user._id)),
  ]);
  return publicProfileResponse(user, activity[0]?.streak || 0, posts);
};

const unavailable = res => res.status(404).json({ message: "Profile not found." });
const temporarilyUnavailable = res => res.status(503).json({ message: "Profile is temporarily unavailable. Please try again." });

const getPublicProfile = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    // The public route deliberately does not authenticate or grant an owner
    // exception. A private account always has the same response as missing.
    const username = req.params.username;
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) return unavailable(res);
    const user = await User.findOne({ username, profileVisibility: "public" }).select(PROFILE_FIELDS).lean();
    if (!user) return unavailable(res);
    res.json(await loadPublicView(user));
  } catch (error) { temporarilyUnavailable(res); }
};

const getPublicProfileCard = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const username = req.params.username;
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) return unavailable(res);
    const user = await User.findOne({ username, profileVisibility: "public" }).select(PROFILE_FIELDS).lean();
    if (!user || user.profileVisibility !== "public") return unavailable(res);
    const activity = await Activity.aggregate(streakPipeline(user._id));
    // Reuse the public profile allowlist, excluding community content entirely
    // from the small hover response. Bearer tokens grant no privacy exception.
    const { posts, ...card } = publicProfileResponse(user, activity[0]?.streak || 0, []);
    res.json(card);
  } catch (error) { temporarilyUnavailable(res); }
};

const previewMyPublicProfile = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    // Reload only the authenticated owner; params/body/query cannot select
    // another identity and unsaved client drafts cannot become public here.
    const user = await User.findById(req.user._id).select(PROFILE_FIELDS).lean();
    if (!user) return unavailable(res);
    res.json(await loadPublicView(user));
  } catch (error) { temporarilyUnavailable(res); }
};

module.exports = { getPublicProfile, getPublicProfileCard, previewMyPublicProfile };
