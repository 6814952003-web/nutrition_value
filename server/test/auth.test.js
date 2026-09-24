const test = require("node:test");
const assert = require("node:assert/strict");
const { signToken, verifyToken } = require("../src/config/auth");
const User = require("../src/models/user.model");
const { authenticate, authorize } = require("../src/middlewares/auth.middleware");

process.env.JWT_SECRET = "test-secret";

test("signToken creates a verifiable token", () => {
  const payload = verifyToken(signToken({ id: "abc", role: "admin" }));
  assert.equal(payload.id, "abc");
  assert.equal(payload.role, "admin");
});

test("verifyToken rejects altered tokens", () => {
  assert.throws(() => verifyToken(`${signToken({ id: "abc" })}x`), /Invalid token/);
});

test("authenticate loads the signed-in user from a bearer token", async () => {
  const originalFindById = User.findById;
  const signedInUser = { _id: "abc", name: "Admin", email: "admin@example.com", role: "admin" };
  User.findById = () => ({ select: async () => signedInUser });
  const req = { headers: { authorization: `Bearer ${signToken({ id: "abc", role: "admin" })}` } };
  const res = { status: () => res, json: () => { throw new Error("unexpected response"); } };
  let called = false;

  await authenticate(req, res, () => { called = true; });
  User.findById = originalFindById;

  assert.equal(called, true);
  assert.equal(req.user, signedInUser);
});

test("authenticate rejects requests without a token", async () => {
  const req = { headers: {} };
  let statusCode;
  let body;
  const res = { status: code => { statusCode = code; return res; }, json: value => { body = value; } };

  await authenticate(req, res, () => assert.fail("next must not be called"));

  assert.equal(statusCode, 401);
  assert.match(body.message, /Authentication is required/);
});

test("authorize allows admins and blocks ordinary users", () => {
  let proceeded = false;
  authorize("admin")({ user: { role: "admin" } }, {}, () => { proceeded = true; });
  assert.equal(proceeded, true);

  let statusCode;
  const res = { status: code => { statusCode = code; return res; }, json: () => {} };
  authorize("admin")({ user: { role: "user" } }, res, () => assert.fail("next must not be called"));
  assert.equal(statusCode, 403);
});
