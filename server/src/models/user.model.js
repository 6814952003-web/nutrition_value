const mongoose = require("mongoose");
const { validEmail, validConfiguredLocalEmail } = require("../config/user-validation");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, minlength: 1, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254, validate: {
    validator: function(value) {
      if (validEmail(value)) return true;
      if (!validConfiguredLocalEmail(value)) return false;
      if (this instanceof mongoose.Query) {
        const update = this.getUpdate() || {};
        return (update.role || update.$set?.role) === "admin";
      }
      return this.role === "admin";
    }, message: "A valid email address is required.",
  } },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user", index: true },
  avatarData: { type: String, default: "" },
  // No default username: a sparse unique index lets existing accounts remain
  // private until their owner chooses a public address.
  username: { type: String, trim: true, lowercase: true, minlength: 3, maxlength: 30, match: /^[a-z0-9_-]{3,30}$/ },
  displayName: { type: String, trim: true, minlength: 1, maxlength: 80 },
  bio: { type: String, trim: true, maxlength: 300, default: "" },
  profileVisibility: { type: String, enum: ["private", "public"], default: "private" },
  shareFoodLogs: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.index({ username: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
