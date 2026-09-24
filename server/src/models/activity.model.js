const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["registered", "login", "session"], required: true },
  durationSeconds: { type: Number, default: 0, min: 0, max: 86400 },
}, { timestamps: true });

activitySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
