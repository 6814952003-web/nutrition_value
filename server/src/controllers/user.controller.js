const crypto = require("crypto");
const { validateBlob } = require("../config/blob");
const { promisify } = require("util");
const User = require("../models/user.model");
const { signToken } = require("../config/auth");
const { createActivity } = require("./activity.controller");
const { configuredAdminEmail: bootstrapAdminEmail, validName, validEmail, validConfiguredLocalEmail, validLoginEmail, validPassword, validLoginPassword } = require("../config/user-validation");

const userResponse = user => ({
  id: user._id, name: user.name, email: user.email, role: user.role, avatarData: user.avatarData || "", createdAt: user.createdAt,
  username: user.username || "", displayName: user.displayName || user.name, bio: user.bio || "",
  profileVisibility: user.profileVisibility === "public" ? "public" : "private",
  shareFoodLogs: user.shareFoodLogs === true,
});
const authResponse = user => ({ user: userResponse(user), token: signToken({ id: user._id, role: user.role }) });
const promoteAdminIfNeeded = async user => {
  const configuredAdminEmail = bootstrapAdminEmail();
  if (configuredAdminEmail && user.email === configuredAdminEmail && user.role !== "admin") {
    user.role = "admin";
    await user.save();
  }
  return user;
};

const scrypt = promisify(crypto.scrypt);
const bodyFields = req => req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
const duplicateResponse = res => res.status(409).json({ message: "This name or email is already registered." });

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = bodyFields(req);
    if (!validName(name)) return res.status(400).json({ message: "Name must be between 1 and 80 characters." });
    if (!validEmail(email)) return res.status(400).json({ message: "A valid email address of up to 254 characters is required." });
    if (!validPassword(password)) {
      return res.status(400).json({ message: "Password must be between 6 and 128 characters." });
    }
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ $or: [{ email: normalizedEmail }, { name: normalizedName }] })) {
      return duplicateResponse(res);
    }
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scrypt(password, passwordSalt, 64)).toString("hex");
    const isBootstrapAdmin = bootstrapAdminEmail() === normalizedEmail;
    const user = await User.create({ name: normalizedName, email: normalizedEmail, passwordHash, passwordSalt, role: isBootstrapAdmin ? "admin" : "user" });
    await createActivity(user._id, "registered");
    res.status(201).json(authResponse(user));
  } catch (error) {
    if (error?.code === 11000) return duplicateResponse(res);
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { name, email, password } = bodyFields(req);
    if ((name !== undefined && !validName(name)) || (email !== undefined && !validLoginEmail(email))
      || !validLoginPassword(password)) {
      return res.status(400).json({ message: "Provide a valid username (up to 80 characters) or email and a password between 1 and 128 characters." });
    }
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if ((!normalizedName && !normalizedEmail) || typeof password !== "string") {
      return res.status(400).json({ message: "Username or email and password are required." });
    }

    const query = normalizedName
      ? { $or: [{ name: normalizedName }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] }
      : { email: normalizedEmail };

    const user = await User.findOne(query);
    if (!user) return res.status(401).json({ message: "Invalid username or password." });

    const suppliedHash = await scrypt(password, user.passwordSalt, 64);
    const storedHash = Buffer.from(user.passwordHash, "hex");
    const hashMatches = suppliedHash.length === storedHash.length && crypto.timingSafeEqual(suppliedHash, storedHash);
    if (!hashMatches) return res.status(401).json({ message: "Invalid username or password." });

    const promotedUser = await promoteAdminIfNeeded(user);
    await createActivity(promotedUser._id, "login");
    res.json(authResponse(promotedUser));
  } catch (error) {
    next(error);
  }
};

const getMe = (req, res) => res.json(userResponse(req.user));

const listUsers = async (req, res, next) => {
  try { res.json((await User.find().select("_id name email role avatarData createdAt username displayName bio profileVisibility shareFoodLogs").sort({ createdAt: -1 })).map(userResponse)); }
  catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
  try {
    const body = bodyFields(req);
    const updates = {};
    if (Object.hasOwn(body, "name")) {
      if (!validName(body.name)) return res.status(400).json({ message: "Name must be between 1 and 80 characters." });
      updates.name = body.name.trim();
    }
    if (Object.hasOwn(body, "email")) {
      if (!validLoginEmail(body.email)) return res.status(400).json({ message: "A valid email address of up to 254 characters is required." });
      updates.email = body.email.trim().toLowerCase();
    }
    if (Object.hasOwn(body, "role")) {
      if (!["user", "admin"].includes(body.role)) return res.status(400).json({ message: "Role must be user or admin." });
      updates.role = body.role;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No valid fields to update." });
    if (updates.role === "user" && req.user && String(req.user._id).toLowerCase() === String(req.params.id).toLowerCase()) {
      return res.status(409).json({ message: "You cannot remove administrator access from your own account." });
    }
    const configuredAdminEmail = bootstrapAdminEmail();
    if (configuredAdminEmail && (updates.email !== undefined || updates.role === "user")) {
      const existing = await User.findById(req.params.id).select("_id email role");
      if (!existing) return res.status(404).json({ message: "User not found." });
      if (existing.email === configuredAdminEmail && updates.email !== undefined && updates.email !== configuredAdminEmail) {
        return res.status(409).json({ message: "The configured administrator email cannot be changed here. Update ADMIN_EMAIL first." });
      }
      if (updates.role === "user" && (existing.email === configuredAdminEmail || updates.email === configuredAdminEmail)) {
        return res.status(409).json({ message: "The configured administrator cannot be demoted while ADMIN_EMAIL is set to this email." });
      }
      if (updates.email !== undefined && validConfiguredLocalEmail(updates.email)) {
        if (existing.email !== configuredAdminEmail || existing.role !== "admin") {
          return res.status(400).json({ message: "This local email is reserved for the existing configured administrator." });
        }
        // Query validators cannot read the existing document's role. Preserve
        // the verified administrator role when its local email is re-submitted.
        updates.role = "admin";
      }
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select("_id name email role avatarData createdAt username displayName bio profileVisibility shareFoodLogs");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(userResponse(user));
  } catch (error) {
    if (error?.code === 11000) return duplicateResponse(res);
    next(error);
  }
};

const updateMyProfile = async (req, res, next) => {
  try {
    const body = bodyFields(req);
    const allowed = ["avatarData", "username", "displayName", "bio", "profileVisibility", "shareFoodLogs"];
    if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) {
      return res.status(400).json({ message: "Only avatar, username, display name, bio, profile visibility and food-log sharing may be updated." });
    }
    const updates = {};
    let clearUsername = false;
    if (Object.hasOwn(body, "avatarData")) {
      if (typeof body.avatarData !== "string" || !await validateBlob(body.avatarData, req.user._id, "avatar")) {
        return res.status(400).json({ message: "Please upload a PNG, JPG, or WebP image smaller than 1.5 MB to Blob first." });
      }
      updates.avatarData = body.avatarData;
    }
    if (Object.hasOwn(body, "username")) {
      if (typeof body.username !== "string") return res.status(400).json({ message: "Username must use 3 to 30 lowercase letters, numbers, underscores or hyphens." });
      const username = body.username.trim().toLowerCase();
      if (username && !/^[a-z0-9_-]{3,30}$/.test(username)) return res.status(400).json({ message: "Username must use 3 to 30 lowercase letters, numbers, underscores or hyphens." });
      if (username) updates.username = username;
      else clearUsername = true;
    }
    if (Object.hasOwn(body, "displayName")) {
      if (!validName(body.displayName)) return res.status(400).json({ message: "Display name must be between 1 and 80 characters." });
      updates.displayName = body.displayName.trim();
    }
    if (Object.hasOwn(body, "bio")) {
      if (typeof body.bio !== "string" || body.bio.trim().length > 300) return res.status(400).json({ message: "Bio must be at most 300 characters." });
      updates.bio = body.bio.trim();
    }
    if (Object.hasOwn(body, "profileVisibility")) {
      if (!["private", "public"].includes(body.profileVisibility)) return res.status(400).json({ message: "Profile visibility must be private or public." });
      updates.profileVisibility = body.profileVisibility;
    }
    if (Object.hasOwn(body, "shareFoodLogs")) {
      if (typeof body.shareFoodLogs !== "boolean") return res.status(400).json({ message: "Food-log sharing must be true or false." });
      updates.shareFoodLogs = body.shareFoodLogs;
    }
    const visibility = updates.profileVisibility || req.user.profileVisibility || "private";
    const username = clearUsername ? "" : updates.username || req.user.username;
    if (visibility === "public" && !/^[a-z0-9_-]{3,30}$/.test(username || "")) return res.status(400).json({ message: "Choose a username before making your profile public." });
    const operation = clearUsername ? { $set: updates, $unset: { username: 1 } } : updates;
    const changesAddressOrVisibility = Object.hasOwn(body, "username") || Object.hasOwn(body, "profileVisibility");
    // Privacy transitions must use the same saved state that was validated.
    // Otherwise simultaneous publish / clear-username requests could race.
    const user = changesAddressOrVisibility
      ? await User.findOneAndUpdate({
        _id: req.user._id,
        username: req.user.username || null,
        profileVisibility: req.user.profileVisibility === "public" ? "public" : { $in: ["private", null] },
      }, operation, { new: true, runValidators: true })
      : await User.findByIdAndUpdate(req.user._id, operation, { new: true, runValidators: true });
    if (!user) return res.status(changesAddressOrVisibility ? 409 : 404).json({ message: changesAddressOrVisibility
      ? "Profile settings changed. Reload your account and try again." : "User not found." });
    res.json(userResponse(user));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "This username is already taken." });
    next(error);
  }
};

module.exports = { registerUser, loginUser, getMe, listUsers, updateUser, updateMyProfile };
