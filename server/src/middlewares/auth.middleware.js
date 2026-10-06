const User = require("../models/user.model");
const { verifyToken, InvalidTokenError } = require("../config/auth");

const authenticate = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) return res.status(401).json({ message: "Authentication is required." });
  const match = typeof authorization === "string" && /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) return res.status(401).json({ message: "Invalid or expired access token." });
  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch (error) {
    if (error instanceof InvalidTokenError) return res.status(401).json({ message: "Invalid or expired access token." });
    return next(error);
  }
  try {
    const user = await User.findById(payload.id).select("_id name email role avatarData createdAt");
    if (!user) return res.status(401).json({ message: "User no longer exists." });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "CastError" && error.path === "_id") return res.status(401).json({ message: "Invalid or expired access token." });
    return next(error);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Authentication is required." });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action." });
  next();
};

module.exports = { authenticate, authorize };
