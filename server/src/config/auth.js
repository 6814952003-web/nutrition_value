const crypto = require("crypto");

class InvalidTokenError extends Error {
  constructor(message = "Invalid token") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

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
  if (typeof token !== "string" || token.length > 4096) throw new InvalidTokenError();
  const parts = token.split(".");
  if (parts.length !== 2) throw new InvalidTokenError();
  const [body, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new InvalidTokenError();
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new InvalidTokenError();
  let payload;
  try { payload = decode(body); }
  catch { throw new InvalidTokenError(); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || typeof payload.id !== "string" || !payload.id.trim() || payload.id !== payload.id.trim() || payload.id.length > 128
    || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) throw new InvalidTokenError();
  if (payload.exp <= Date.now()) throw new InvalidTokenError("Token expired");
  return payload;
};

module.exports = { signToken, verifyToken, InvalidTokenError };
