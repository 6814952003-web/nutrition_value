const User = require("../models/user.model");
const { verifyToken } = require("../config/auth");

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ message: "Authentication is required." });
    const payload = verifyToken(token);
    const user = await User.findById(payload.id).select("_id name email role avatarData createdAt");
    if (!user) return res.status(401).json({ message: "User no longer exists." });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired access token." });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action." });
  next();
};

module.exports = { authenticate, authorize };
