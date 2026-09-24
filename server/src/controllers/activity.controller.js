const Activity = require("../models/activity.model");

const activityResponse = activity => ({
  id: activity._id,
  type: activity.type,
  durationSeconds: activity.durationSeconds,
  createdAt: activity.createdAt,
});

const createActivity = async (userId, type, durationSeconds = 0) =>
  Activity.create({ user: userId, type, durationSeconds });

const listMyActivity = async (req, res, next) => {
  try {
    const activities = await Activity.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30);
    const onlineSeconds = activities
      .filter(activity => activity.type === "session")
      .reduce((total, activity) => total + activity.durationSeconds, 0);
    res.json({ activities: activities.map(activityResponse), onlineSeconds });
  } catch (error) { next(error); }
};

const saveSession = async (req, res, next) => {
  try {
    const durationSeconds = Math.floor(Number(req.body.durationSeconds));
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400) {
      return res.status(400).json({ message: "Session duration must be between 1 second and 24 hours." });
    }
    const activity = await createActivity(req.user._id, "session", durationSeconds);
    res.status(201).json(activityResponse(activity));
  } catch (error) { next(error); }
};

module.exports = { createActivity, listMyActivity, saveSession };
