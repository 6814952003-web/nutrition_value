const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const User = require("../src/models/user.model");
const Activity = require("../src/models/activity.model");
const { verifyToken } = require("../src/config/auth");
const { registerUser, loginUser, updateUser, updateMyProfile } = require("../src/controllers/user.controller");

process.env.JWT_SECRET = "user-controller-fixture-secret";
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
const unexpected = error => { throw error || new Error("Unexpected next call"); };
const validRegistration = { name: "Member", email: "member@example.com", password: "secret123" };
const configureAdmin = (t, value) => {
  const previous = process.env.ADMIN_EMAIL;
  if (value === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = value;
  t.after(() => {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  });
};

test("editing an admin account preserves its existing avatar and join date in the response", async t => {
  const existing = {
    _id: "admin-fixture", name: "Existing name", email: "admin@example.com", role: "admin",
    avatarData: "https://assets.example.com/avatar.png", createdAt: "2026-10-01T08:00:00.000Z",
    passwordHash: "must-never-be-returned", passwordSalt: "must-never-be-returned",
  };
  t.mock.method(User, "findByIdAndUpdate", (id, updates) => ({
    select: async projection => Object.fromEntries(projection.split(" ").map(key => [key, ({ ...existing, ...updates })[key]])),
  }));
  let response;
  const res = { status: () => { assert.fail("the valid account update must succeed"); }, json: value => { response = value; } };
  await updateUser({ params: { id: existing._id }, body: { name: "Edited name" } }, res, error => { throw error; });
  assert.deepEqual(response, {
    id: existing._id, name: "Edited name", email: existing.email, role: existing.role,
    avatarData: existing.avatarData, createdAt: existing.createdAt,
  });
  assert.equal(response.passwordHash, undefined);
  assert.equal(response.passwordSalt, undefined);
});

test("registration rejects malformed input and length bounds before querying or hashing", async t => {
  t.mock.method(User, "findOne", () => assert.fail("invalid input must not query users"));
  t.mock.method(User, "create", () => assert.fail("invalid input must not create users"));
  const invalid = [undefined, null, [], "text", {},
    { ...validRegistration, name: { $gt: "" } }, { ...validRegistration, name: " " }, { ...validRegistration, name: "x".repeat(81) },
    { ...validRegistration, email: ["member@example.com"] }, { ...validRegistration, email: "member" },
    { ...validRegistration, email: "a@ b.com" }, { ...validRegistration, email: "a".repeat(250) + "@b.com" },
    { ...validRegistration, password: 123456 }, { ...validRegistration, password: "short" }, { ...validRegistration, password: "x".repeat(129) }];
  for (const body of invalid) {
    const res = response();
    await registerUser({ body }, res, unexpected);
    assert.equal(res.statusCode, 400);
  }
});

test("registration normalizes input, hashes the complete bounded password and ignores a requested admin role", async t => {
  configureAdmin(t, undefined);
  const lookup = t.mock.method(User, "findOne", async () => null);
  const create = t.mock.method(User, "create", async fields => new User(fields));
  const activity = t.mock.method(Activity, "create", async () => ({}));
  const password = "x".repeat(128);
  const res = response();
  await registerUser({ body: { name: "  " + "n".repeat(80) + "  ", email: " Member@Example.com ", password, role: "admin" } }, res, unexpected);
  assert.equal(res.statusCode, 201);
  const stored = create.mock.calls[0].arguments[0];
  assert.equal(stored.name, "n".repeat(80));
  assert.equal(stored.email, "member@example.com");
  assert.equal(stored.role, "user");
  assert.equal(stored.passwordHash, crypto.scryptSync(password, stored.passwordSalt, 64).toString("hex"));
  assert.equal(lookup.mock.calls[0].arguments[0].$or[0].email, stored.email);
  assert.equal(activity.mock.calls[0].arguments[0].type, "registered");
  assert.equal(verifyToken(res.body.token).id, String(res.body.user.id));
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(res.body.user.passwordSalt, undefined);
});

test("registration reports existing accounts and duplicate index races as conflicts", async t => {
  const lookup = t.mock.method(User, "findOne", async () => ({ _id: "existing" }));
  const create = t.mock.method(User, "create", async () => { throw Object.assign(new Error("Duplicate key"), { code: 11000 }); });
  const res = response();
  await registerUser({ body: validRegistration }, res, unexpected);
  assert.equal(res.statusCode, 409);
  assert.equal(create.mock.callCount(), 0);
  lookup.mock.mockImplementation(async () => null);
  const racedRes = response();
  await registerUser({ body: validRegistration }, racedRes, unexpected);
  assert.equal(racedRes.statusCode, 409);
  assert.equal(racedRes.body.message, res.body.message);
});

test("registration retains the configured administrator bootstrap", async t => {
  configureAdmin(t, " ADMIN@Example.com ");
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async fields => new User(fields));
  t.mock.method(Activity, "create", async () => ({}));
  const res = response();
  await registerUser({ body: { ...validRegistration, email: "admin@example.com" } }, res, unexpected);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, "admin");
});

test("login rejects malformed identifiers/passwords before querying", async t => {
  t.mock.method(User, "findOne", () => assert.fail("invalid input must not query users"));
  for (const body of [undefined, null, [], { password: "secret123" },
    { name: {}, password: "secret123" }, { email: {}, password: "secret123" },
    { name: "x".repeat(81), password: "secret123" }, { email: "invalid", password: "secret123" },
    { email: "a".repeat(250) + "@b.com", password: "secret123" },
    { email: "member@example.com", password: [] }, { email: "member@example.com", password: "x".repeat(129) }]) {
    const res = response();
    await loginUser({ body }, res, unexpected);
    assert.equal(res.statusCode, 400);
  }
});

test("login accepts normalized email or username, checks passwords and promotes the configured administrator", async t => {
  configureAdmin(t, "ADMIN@example.com");
  const passwordSalt = "fixture-salt";
  const passwordHash = crypto.scryptSync(validRegistration.password, passwordSalt, 64).toString("hex");
  let saved = 0;
  const user = { _id: "fixture-admin", name: "Admin", email: "admin@example.com", role: "user", passwordSalt, passwordHash, save: async () => { saved++; } };
  const lookup = t.mock.method(User, "findOne", async () => user);
  const activity = t.mock.method(Activity, "create", async () => ({}));
  for (const body of [{ email: " ADMIN@Example.com ", password: validRegistration.password }, { name: " Admin ", password: validRegistration.password }]) {
    const res = response();
    await loginUser({ body }, res, unexpected);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.role, "admin");
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(verifyToken(res.body.token).id, user._id);
  }
  assert.deepEqual(lookup.mock.calls[0].arguments[0], { email: "admin@example.com" });
  assert.deepEqual(lookup.mock.calls[1].arguments[0], { $or: [{ name: "Admin" }] });
  assert.equal(saved, 1);
  assert.equal(activity.mock.callCount(), 2);
  const wrongPassword = response();
  await loginUser({ body: { email: user.email, password: "incorrect" } }, wrongPassword, unexpected);
  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(activity.mock.callCount(), 2);
});

test("unknown accounts and mismatched stored password hashes return invalid credentials", async t => {
  const lookup = t.mock.method(User, "findOne", async () => null);
  const missing = response();
  await loginUser({ body: validRegistration }, missing, unexpected);
  assert.equal(missing.statusCode, 401);
  lookup.mock.mockImplementation(async () => ({ passwordSalt: "salt", passwordHash: "00" }));
  const malformedHash = response();
  await loginUser({ body: validRegistration }, malformedHash, unexpected);
  assert.equal(malformedHash.statusCode, 401);
});

test("authentication controllers forward database/service failures", async t => {
  const failure = new Error("Database unavailable");
  t.mock.method(User, "findOne", async () => { throw failure; });
  for (const controller of [registerUser, loginUser]) {
    const res = response();
    let forwarded;
    await controller({ body: validRegistration }, res, error => { forwarded = error; });
    assert.equal(forwarded, failure);
    assert.equal(res.body, undefined);
  }
});

test("member editing rejects invalid recognized fields instead of partially saving", async t => {
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("invalid updates must not be saved"));
  for (const body of [undefined, null, [], {}, { password: "ignored" }, { name: " " }, { name: "x".repeat(81) },
    { name: 123, role: "admin" }, { email: "invalid", name: "Valid" }, { email: "a".repeat(250) + "@b.com" },
    { email: {} }, { role: "owner", name: "Valid" }, { role: {} }]) {
    const res = response();
    await updateUser({ params: { id: "target" }, body }, res, unexpected);
    assert.equal(res.statusCode, 400);
  }
});

test("member editing normalizes changes, preserves profile fields and excludes credentials", async t => {
  configureAdmin(t, undefined);
  const update = t.mock.method(User, "findByIdAndUpdate", (id, updates, options) => ({ select: async () => ({
    _id: id, ...updates, avatarData: "avatar", createdAt: "date", passwordHash: "hidden", passwordSalt: "hidden",
  }) }));
  const res = response();
  await updateUser({ params: { id: "target" }, user: { _id: "admin" }, body: { name: " Member ", email: " MEMBER@Example.com ", role: "user" } }, res, unexpected);
  assert.deepEqual(update.mock.calls[0].arguments, ["target", { name: "Member", email: "member@example.com", role: "user" }, { new: true, runValidators: true }]);
  assert.deepEqual(res.body, { id: "target", name: "Member", email: "member@example.com", role: "user", avatarData: "avatar", createdAt: "date" });
});

test("administrators cannot demote their own account, including a differently cased identifier", async t => {
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("self-demotion must not be saved"));
  for (const id of ["a".repeat(24), "A".repeat(24)]) {
    const res = response();
    await updateUser({ params: { id }, user: { _id: "a".repeat(24) }, body: { role: "user" } }, res, unexpected);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /your own account/);
  }
});

test("the configured administrator cannot be demoted or have its email replaced", async t => {
  configureAdmin(t, " ADMIN@Example.com ");
  t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, email: "admin@example.com", role: "admin" }) }));
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("configured administrator protection must prevent saving"));
  for (const body of [{ role: "user" }, { email: "replacement@example.com" }, { email: "replacement@example.com", role: "user" }]) {
    const res = response();
    await updateUser({ params: { id: "configured-admin" }, user: { _id: "other-admin" }, body }, res, unexpected);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /configured administrator/);
  }
});

test("ordinary member roles can change while ADMIN_EMAIL is configured", async t => {
  configureAdmin(t, "admin@example.com");
  t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, email: "member@example.com", role: "admin" }) }));
  t.mock.method(User, "findByIdAndUpdate", (id, updates) => ({ select: async () => ({ _id: id, email: "member@example.com", name: "Member", ...updates }) }));
  const res = response();
  await updateUser({ params: { id: "member" }, user: { _id: "other-admin" }, body: { role: "user" } }, res, unexpected);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, "user");
});

test("member editing reports missing accounts and duplicate fields", async t => {
  configureAdmin(t, undefined);
  const update = t.mock.method(User, "findByIdAndUpdate", () => ({ select: async () => null }));
  const missing = response();
  await updateUser({ params: { id: "target" }, body: { name: "Member" } }, missing, unexpected);
  assert.equal(missing.statusCode, 404);
  update.mock.mockImplementation(() => ({ select: async () => { throw Object.assign(new Error("Duplicate"), { code: 11000 }); } }));
  const duplicate = response();
  await updateUser({ params: { id: "target" }, body: { name: "Member" } }, duplicate, unexpected);
  assert.equal(duplicate.statusCode, 409);
});

test("profile editing rejects missing and malformed bodies", async t => {
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("invalid profile update must not be saved"));
  for (const body of [undefined, null, [], { avatarData: {} }]) {
    const res = response();
    await updateMyProfile({ body, user: { _id: "member" } }, res, unexpected);
    assert.equal(res.statusCode, 400);
  }
});

test("the user model enforces name/email constraints for other write paths", async () => {
  for (const values of [{ name: "x".repeat(81), email: "member@example.com" }, { name: "Member", email: "invalid" }, { name: " ", email: "member@example.com" }]) {
    const user = new User({ ...values, passwordHash: "fixture", passwordSalt: "fixture" });
    await assert.rejects(user.validate(), { name: "ValidationError" });
  }
});

test("the provisioned local-domain administrator signs in with a short stored password, never an environment bypass", async t => {
  configureAdmin(t, "operator@localhost");
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "environment-only-fixture";
  t.after(() => { if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword; });
  const password = "q8!Zv";
  const salt = "operator-login-fixture-salt";
  const user = { _id: "fixture-operator", name: "Operator fixture", email: "operator@localhost", role: "admin", passwordSalt: salt, passwordHash: crypto.scryptSync(password, salt, 64).toString("hex") };
  const lookup = t.mock.method(User, "findOne", async () => user);
  const activity = t.mock.method(Activity, "create", async () => ({}));
  for (const body of [{ email: " OPERATOR@LOCALHOST ", password }, { name: user.name, password }]) {
    const res = response();
    await loginUser({ body }, res, unexpected);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.role, "admin");
    assert.equal(res.body.user.email, user.email);
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(verifyToken(res.body.token).id, user._id);
  }
  assert.deepEqual(lookup.mock.calls[0].arguments[0], { email: user.email });
  const wrong = response();
  await loginUser({ body: { email: user.email, password: process.env.ADMIN_PASSWORD } }, wrong, unexpected);
  assert.equal(wrong.statusCode, 401);
  assert.equal(activity.mock.callCount(), 2);
});

test("public registration still rejects local-domain emails and passwords below six characters", async t => {
  configureAdmin(t, "operator@localhost");
  t.mock.method(User, "findOne", () => assert.fail("invalid public registration must not query users"));
  t.mock.method(User, "create", () => assert.fail("invalid public registration must not create users"));
  for (const body of [{ ...validRegistration, email: "operator@localhost" }, { ...validRegistration, password: "q8!Zv" }]) {
    const res = response();
    await registerUser({ body }, res, unexpected);
    assert.equal(res.statusCode, 400);
  }
});

test("only the configured administrator may retain a local-domain address while being renamed", async t => {
  configureAdmin(t, "operator@localhost");
  const existing = { _id: "configured-operator", name: "Operator fixture", email: "operator@localhost", role: "admin" };
  t.mock.method(User, "findById", () => ({ select: async () => existing }));
  const update = t.mock.method(User, "findByIdAndUpdate", (id, fields) => ({ select: async () => ({ ...existing, ...fields }) }));
  const res = response();
  await updateUser({ params: { id: existing._id }, user: { _id: existing._id }, body: { name: "Renamed operator", email: existing.email } }, res, unexpected);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, "Renamed operator");
  assert.equal(res.body.email, existing.email);
  assert.equal(res.body.role, "admin");
  assert.deepEqual(update.mock.calls[0].arguments[1], { name: "Renamed operator", email: existing.email, role: "admin" });
});

test("the user model accepts only an admin's exact configured local-domain address", async t => {
  configureAdmin(t, "operator@localhost");
  const fields = { name: "Operator fixture", passwordHash: "fixture-hash", passwordSalt: "fixture-salt" };
  await new User({ ...fields, email: "operator@localhost", role: "admin" }).validate();
  for (const account of [{ email: "operator@localhost", role: "user" }, { email: "other@localhost", role: "admin" }]) {
    await assert.rejects(new User({ ...fields, ...account }).validate(), { name: "ValidationError" });
  }
});
