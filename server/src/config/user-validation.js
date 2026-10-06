const configuredAdminEmail = () => process.env.ADMIN_EMAIL?.trim().toLowerCase();
const validName = value => typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 80;
const validEmail = value => typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const validConfiguredLocalEmail = (value, expected = configuredAdminEmail()) => {
  if (typeof value !== "string" || !expected || value.trim().length > 254) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized !== expected || !/^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) return false;
  const local = normalized.slice(0, normalized.indexOf("@"));
  return !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
};
const validLoginEmail = value => validEmail(value) || validConfiguredLocalEmail(value);
const validPassword = value => typeof value === "string" && value.length >= 6 && value.length <= 128;
const validLoginPassword = value => typeof value === "string" && value.length >= 1 && value.length <= 128;

module.exports = { configuredAdminEmail, validName, validEmail, validConfiguredLocalEmail, validLoginEmail, validPassword, validLoginPassword };
