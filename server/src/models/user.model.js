const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user", index: true },
  avatarData: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
