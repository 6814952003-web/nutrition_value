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
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
