const crypto = require("crypto");
const { validateBlob } = require("../config/blob");
const { promisify } = require("util");
const User = require("../models/user.model");
const { signToken } = require("../config/auth");
const { createActivity } = require("./activity.controller");

const userResponse = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, avatarData: user.avatarData || "", createdAt: user.createdAt });
const authResponse = user => ({ user: userResponse(user), token: signToken({ id: user._id, role: user.role }) });
const bootstrapAdminEmail = () => process.env.ADMIN_EMAIL?.trim().toLowerCase();
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
const validName = value => typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 80;
const validEmail = value => typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const validPassword = value => typeof value === "string" && value.length >= 6 && value.length <= 128;
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
    if ((name !== undefined && !validName(name)) || (email !== undefined && !validEmail(email))
      || !validPassword(password)) {
      return res.status(400).json({ message: "Provide a valid username (up to 80 characters) or email and a password between 6 and 128 characters." });
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
  try { res.json((await User.find().select("_id name email role createdAt").sort({ createdAt: -1 })).map(userResponse)); }
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
      if (!validEmail(body.email)) return res.status(400).json({ message: "A valid email address of up to 254 characters is required." });
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
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select("_id name email role avatarData createdAt");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(userResponse(user));
  } catch (error) {
    if (error?.code === 11000) return duplicateResponse(res);
    next(error);
  }
};

const updateMyProfile = async (req, res, next) => {
  try {
    const avatarData = bodyFields(req).avatarData;
    if (typeof avatarData !== "string" || !await validateBlob(avatarData, req.user._id, "avatar")) {
      return res.status(400).json({ message: "Please upload a PNG, JPG, or WebP image smaller than 1.5 MB to Blob first." });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { avatarData }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(userResponse(user));
  } catch (error) { next(error); }
};

module.exports = { registerUser, loginUser, getMe, listUsers, updateUser, updateMyProfile };
