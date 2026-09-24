const crypto = require("crypto");

const secret = () => {
  const value = process.env.JWT_SECRET || process.env.jwt_secret;
  if (!value && (process.env.VERCEL || process.env.NODE_ENV === "production")) throw new Error("JWT_SECRET is required in production.");
  return value || "development-only-change-this-secret";
};
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = value => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

const signToken = (payload) => {
  const body = encode({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
};

const verifyToken = (token) => {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Invalid token");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid token");
  const payload = decode(body);
  if (!payload.exp || payload.exp < Date.now()) throw new Error("Token expired");
  return payload;
};

module.exports = { signToken, verifyToken };
