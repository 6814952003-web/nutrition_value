const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

test("authenticate loads the signed-in user from a bearer token", async t => {
  const signedInUser = { _id: "abc", name: "Admin", email: "admin@example.com", role: "admin" };
  t.mock.method(User, "findById", () => ({ select: async () => signedInUser }));
  const req = { headers: { authorization: `Bearer ${signToken({ id: "abc", role: "admin" })}` } };
  const res = { status: () => res, json: () => { throw new Error("unexpected response"); } };
  let called = false;

  await authenticate(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.user, signedInUser);
});

const signedBody = json => {
  const body = Buffer.from(json).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url")}`;
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });

test("verifyToken rejects malformed formats and signed invalid payloads", () => {
  const token = signToken({ id: "abc" });
  for (const value of [undefined, null, 1, {}, [], "", token + ".extra", token + ".", token.replace(".", "=.")]) {
    assert.throws(() => verifyToken(value), /Invalid token/);
  }
  const future = Date.now() + 60000;
  for (const payload of [null, [], {}, { exp: future }, { id: "", exp: future }, { id: "  ", exp: future },
    { id: { $ne: null }, exp: future }, { id: "abc", exp: String(future) }, { id: "abc", exp: null }]) {
    assert.throws(() => verifyToken(signedBody(JSON.stringify(payload))), /Invalid token/);
  }
  assert.throws(() => verifyToken(signedBody('{"id":"abc","exp":1e309}')), /Invalid token/);
  assert.throws(() => verifyToken(signedBody("{broken")), /Invalid token/);
  assert.throws(() => verifyToken(signedBody(JSON.stringify({ id: "abc", exp: Date.now() - 1 }))), /Token expired/);
});

test("authenticate requires the Bearer scheme and rejects invalid tokens before a database lookup", async t => {
  t.mock.method(User, "findById", () => assert.fail("invalid credentials must not query users"));
  const token = signToken({ id: "abc" });
  for (const authorization of [token, `Basic ${token}`, `Bearer ${token} extra`, `Bearer ${token}.extra`, [token], 42]) {
    const res = response();
    await authenticate({ headers: { authorization } }, res, () => assert.fail("must not continue"));
    assert.equal(res.statusCode, 401);
  }
});

test("authorization uses the current database role after an administrator is demoted", async t => {
  t.mock.method(User, "findById", () => ({ select: async () => ({ _id: "abc", role: "user" }) }));
  const req = { headers: { authorization: `bearer ${signToken({ id: "abc", role: "admin" })}` } };
  const res = response();
  await authenticate(req, res, () => authorize("admin")(req, res, () => assert.fail("demoted user must not be authorized")));
  assert.equal(res.statusCode, 403);
});

test("authenticate rejects deleted users but forwards database failures", async t => {
  const lookup = t.mock.method(User, "findById", () => ({ select: async () => null }));
  const req = { headers: { authorization: `Bearer ${signToken({ id: "abc" })}` } };
  const res = response();
  await authenticate(req, res, () => assert.fail("deleted user must not be authorized"));
  assert.equal(res.statusCode, 401);
  const failure = new Error("Database unavailable");
  lookup.mock.mockImplementation(() => ({ select: async () => { throw failure; } }));
  const failedRes = response();
  let forwarded;
  await authenticate(req, failedRes, error => { forwarded = error; });
  assert.equal(forwarded, failure);
  assert.equal(failedRes.body, undefined);
});

test("authenticate reports an invalid database identifier as invalid credentials", async t => {
  const failure = Object.assign(new Error("Invalid identifier"), { name: "CastError", path: "_id" });
  t.mock.method(User, "findById", () => ({ select: async () => { throw failure; } }));
  const res = response();
  await authenticate({ headers: { authorization: `Bearer ${signToken({ id: "bad-id" })}` } }, res, () => assert.fail("must not continue"));
  assert.equal(res.statusCode, 401);
});

test("authenticate forwards a missing production signing secret as a service error", async t => {
  const token = signToken({ id: "abc" });
  const previous = { JWT_SECRET: process.env.JWT_SECRET, jwt_secret: process.env.jwt_secret, NODE_ENV: process.env.NODE_ENV };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  delete process.env.JWT_SECRET;
  delete process.env.jwt_secret;
  process.env.NODE_ENV = "production";
  const res = response();
  let forwarded;
  await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, error => { forwarded = error; });
  assert.match(forwarded.message, /JWT_SECRET is required/);
  assert.equal(res.body, undefined);
});

test("authorize rejects requests without an authenticated user", () => {
  const res = response();
  authorize("admin")({}, res, () => assert.fail("must not continue"));
  assert.equal(res.statusCode, 401);
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
