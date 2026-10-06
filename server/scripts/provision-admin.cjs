const crypto = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const User = require("../src/models/user.model");
const { validName, validEmail, validConfiguredLocalEmail, validLoginPassword } = require("../src/config/user-validation");
const scrypt = promisify(crypto.scrypt);

class ProvisioningError extends Error {
  constructor(message) { super(message); this.name = "ProvisioningError"; }
}
const credentialsFrom = env => {
  if (!validName(env.ADMIN_NAME)) throw new ProvisioningError("Set ADMIN_NAME to a name between 1 and 80 characters.");
  const email = typeof env.ADMIN_EMAIL === "string" ? env.ADMIN_EMAIL.trim().toLowerCase() : "";
  if (!validEmail(email) && !validConfiguredLocalEmail(email, email)) throw new ProvisioningError("Set ADMIN_EMAIL to a valid email or a well-formed local-domain administrator address.");
  if (!validLoginPassword(env.ADMIN_PASSWORD) || !env.ADMIN_PASSWORD.trim()) throw new ProvisioningError("Set ADMIN_PASSWORD to a non-empty password of up to 128 characters.");
  return { name: env.ADMIN_NAME.trim(), email, password: env.ADMIN_PASSWORD };
};

// Importing this file never loads credentials, connects to Atlas or writes a
// user. Only a deliberate operator invocation performs the provisioning step.
const provisionAdmin = async ({ env = process.env, users = User } = {}) => {
  const { name, email, password } = credentialsFrom(env);
  try {
    const matches = await users.find({ $or: [{ email }, { name }] }).limit(2);
    if (matches.length) {
      const existing = matches[0];
      if (matches.length !== 1 || existing.name !== name || existing.email !== email || existing.role !== "admin") {
        throw new ProvisioningError("The requested administrator identity conflicts with an existing account. No existing account was changed.");
      }
      const stored = typeof existing.passwordHash === "string" ? Buffer.from(existing.passwordHash, "hex") : Buffer.alloc(0);
      const supplied = typeof existing.passwordSalt === "string" ? await scrypt(password, existing.passwordSalt, 64) : Buffer.alloc(64);
      if (stored.length !== 64 || !crypto.timingSafeEqual(stored, supplied)) {
        throw new ProvisioningError("The existing administrator's password does not match. No password or account was changed.");
      }
      return { status: "unchanged", name, email, role: "admin" };
    }
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scrypt(password, passwordSalt, 64)).toString("hex");
    await users.create({ name, email, passwordSalt, passwordHash, role: "admin" });
    return { status: "created", name, email, role: "admin" };
  } catch (error) {
    if (error instanceof ProvisioningError) throw error;
    if (error?.code === 11000) throw new ProvisioningError("The requested identity was created by another operation. Verify the existing account before retrying; no password was reset.");
    throw new ProvisioningError("Administrator provisioning failed. Verify the database connection and account constraints; no existing account was changed.");
  }
};

const main = async () => {
  credentialsFrom(process.env);
  const mongoose = require("mongoose");
  const { connectDB } = require("../src/config/db");
  try {
    if (!await connectDB()) throw new ProvisioningError("The database is unavailable. Verify the operator's database configuration and try again.");
    const result = await provisionAdmin();
    console.log(`Administrator ${result.status}: ${result.name} (${result.email}), role ${result.role}.`);
  } finally { await mongoose.disconnect(); }
};

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  main().catch(error => {
    console.error(error instanceof ProvisioningError ? error.message : "Administrator provisioning failed. Verify the operator configuration and try again.");
    process.exitCode = 1;
  });
}

module.exports = { provisionAdmin, ProvisioningError };
