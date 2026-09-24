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

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Name, email, and a password of at least 6 characters are required." });
    }
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ $or: [{ email: normalizedEmail }, { name: normalizedName }] })) {
      return res.status(409).json({ message: "This name or email is already registered." });
    }
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scrypt(password, passwordSalt, 64)).toString("hex");
    const isBootstrapAdmin = process.env.ADMIN_EMAIL?.trim().toLowerCase() === normalizedEmail;
    const user = await User.create({ name: normalizedName, email: normalizedEmail, passwordHash, passwordSalt, role: isBootstrapAdmin ? "admin" : "user" });
    await createActivity(user._id, "registered");
    res.status(201).json(authResponse(user));
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if ((!normalizedName && !normalizedEmail) || typeof password !== "string") {
      return res.status(400).json({ message: "Username or email and password are required." });
    }

    const query = normalizedName
      ? { $or: [{ name: normalizedName }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] }
      : { email: normalizedEmail };

    const user = await User.findOne(query);
    if (!user) return res.status(401).json({ message: "Invalid username or password." });

    const suppliedHash = (await scrypt(password, user.passwordSalt, 64)).toString("hex");
    const hashMatches = crypto.timingSafeEqual(Buffer.from(suppliedHash, "hex"), Buffer.from(user.passwordHash, "hex"));
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
    const updates = {};
    if (typeof req.body.name === "string" && req.body.name.trim()) updates.name = req.body.name.trim();
    if (typeof req.body.email === "string" && req.body.email.trim()) updates.email = req.body.email.trim().toLowerCase();
    if (["user", "admin"].includes(req.body.role)) updates.role = req.body.role;
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No valid fields to update." });
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select("_id name email role");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(userResponse(user));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "This name or email is already registered." });
    next(error);
  }
};

const updateMyProfile = async (req, res, next) => {
  try {
    const avatarData = req.body.avatarData;
    if (typeof avatarData !== "string" || !await validateBlob(avatarData, req.user._id, "avatar")) {
      return res.status(400).json({ message: "Please upload a PNG, JPG, or WebP image smaller than 1.5 MB to Blob first." });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { avatarData }, { new: true, runValidators: true });
    res.json(userResponse(user));
  } catch (error) { next(error); }
};

module.exports = { registerUser, loginUser, getMe, listUsers, updateUser, updateMyProfile };
