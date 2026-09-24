const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const express = require("express");
const { getPayloadFromClientToken } = require("@vercel/blob/client");
const database = require("../src/config/db");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const uploadRoutes = require("../src/routes/upload.routes");

// All credentials and users here are fixtures; no external service is contacted.
const blobToken = "vercel_blob_rw_teststore_fixture";
process.env.BLOB_READ_WRITE_TOKEN = blobToken;
process.env.BLOB_PUBLIC_ORIGIN = "https://teststore.public.blob.vercel-storage.com";
process.env.JWT_SECRET = "blob-route-test-secret";
let server;
let endpoint;
const generateEvent = pathname => ({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } });
const post = (body, headers = {}) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const authHeaders = () => ({ Authorization: `Bearer ${signToken({ id: "user1", role: "user" })}` });

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/uploads", uploadRoutes);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/uploads`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test("authenticated uploads receive an owner-scoped token without a completion callback", async t => {
  const connected = t.mock.method(database, "connectDB", async () => true);
  t.mock.method(User, "findById", () => ({ select: async () => ({ _id: "user1" }) }));
  const response = await post(generateEvent("uploads/user1/avatar/photo.png"), authHeaders());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  const payload = getPayloadFromClientToken(result.clientToken);
  assert.equal(payload.pathname, "uploads/user1/avatar/photo.png");
  assert.equal(payload.maximumSizeInBytes, 1_500_000);
  assert.equal(payload.allowOverwrite, false);
  assert.equal(payload.onUploadCompleted, undefined);
  assert.equal(connected.mock.callCount(), 1);
});

test("unauthenticated and malformed upload requests do not connect to MongoDB", async t => {
  const connected = t.mock.method(database, "connectDB", async () => assert.fail("database must not be contacted"));
  assert.equal((await post(generateEvent("uploads/user1/post/video.mp4"))).status, 401);
  for (const event of [{}, { type: "invalid", payload: {} }, { type: "blob.generate-client-token", payload: {} }]) {
    assert.equal((await post(event, authHeaders())).status, 400);
  }
  assert.equal(connected.mock.callCount(), 0);
});

test("tokens cannot authorize another user's path", async t => {
  t.mock.method(database, "connectDB", async () => true);
  t.mock.method(User, "findById", () => ({ select: async () => ({ _id: "user1" }) }));
  assert.equal((await post(generateEvent("uploads/user2/post/photo.png"), authHeaders())).status, 400);
});

test("token requests return a service error when MongoDB is unavailable", async t => {
  t.mock.method(database, "connectDB", async () => false);
  assert.equal((await post(generateEvent("uploads/user1/post/photo.png"), authHeaders())).status, 503);
});

test("legacy completion callbacks require a valid Blob signature and do not need MongoDB", async t => {
  const connected = t.mock.method(database, "connectDB", async () => assert.fail("callbacks must not contact MongoDB"));
  const event = { type: "blob.upload-completed", payload: { blob: { url: "https://teststore.public.blob.vercel-storage.com/uploads/user1/avatar/photo.png" }, tokenPayload: null } };
  assert.equal((await post(event)).status, 400);
  assert.equal((await post(event, { "x-vercel-signature": "0".repeat(64) })).status, 400);
  const signature = createHmac("sha256", blobToken).update(JSON.stringify(event)).digest("hex");
  const response = await post(event, { "x-vercel-signature": signature });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: "blob.upload-completed", response: "ok" });
  assert.equal(connected.mock.callCount(), 0);
});
