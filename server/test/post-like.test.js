const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const Post = require("../src/models/post.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const routes = require("../src/routes/post.routes");

process.env.JWT_SECRET = "post-like-fixture-secret";
const postId = "a".repeat(24);
const firstUser = "1".repeat(24);
const secondUser = "2".repeat(24);
const adminUser = "3".repeat(24);
const commentId = "b".repeat(24);
let server;
let endpoint;
const auth = t => {
  t.mock.method(User, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  return t.mock.method(User, "findById", id => ({ select: async () => ({
  _id: new mongoose.Types.ObjectId(id), name: "Fixture member", email: "fixture@example.com", role: id === adminUser ? "admin" : "user",
}) }));
};
const request = (method, path, body, userId = firstUser) => fetch(`${endpoint}${path}`, {
  method,
  headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${signToken({ id: userId })}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const publicPost = response => {
  assert.equal(Object.hasOwn(response, "likedBy"), false, "other members' heart identities must remain private");
  return response;
};
const storage = (t, initial = {}) => {
  let stored = { _id: postId, content: "Fixture post", author: firstUser, comments: [], likes: 0, ...initial };
  const update = t.mock.method(Post, "findOneAndUpdate", async (filter, pipeline, options) => {
    // Model writes are replaced by this isolated fixture; the actual operation
    // still has to express an atomic union and count in a single Mongo update.
    assert.deepEqual(filter, { _id: postId });
    assert.equal(options.new, true);
    assert.equal(options.updatePipeline, true);
    assert.deepEqual(pipeline[0].$set.likedBy.$setUnion[0], { $ifNull: ["$likedBy", []] });
    assert.deepEqual(pipeline[1], { $set: { likes: { $size: "$likedBy" } } });
    const userId = pipeline[0].$set.likedBy.$setUnion[1][0];
    assert.ok(userId instanceof mongoose.Types.ObjectId, "pipeline updates must carry a cast authenticated ObjectId");
    await new Promise(resolve => setImmediate(resolve));
    if (!stored) return null;
    stored.likedBy = [...new Set([...(stored.likedBy || []).map(String), String(userId)])];
    stored.likes = stored.likedBy.length;
    return structuredClone(stored);
  });
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => stored ? [structuredClone(stored)] : [] }) }) }));
  return { update, get: () => stored, remove: () => { stored = null; } };
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", routes);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/posts`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("parallel and repeated heart requests from one account persist exactly one heart", async t => {
  auth(t);
  const fixture = storage(t);
  const responses = await Promise.all(Array.from({ length: 16 }, () => request("POST", `/${postId}/like`, { likes: 999, likedBy: [secondUser], author: secondUser, role: "admin" })));
  for (const response of responses) {
    assert.equal(response.status, 200);
    const post = publicPost(await response.json());
    assert.equal(post.likes, 1);
    assert.equal(post.likedByMe, true);
  }
  assert.deepEqual(fixture.get().likedBy, [firstUser]);
  assert.equal(fixture.get().likes, 1);
  const repeated = publicPost(await (await request("POST", `/${postId}/like`, {}, firstUser)).json());
  assert.equal(repeated.likes, 1);
  assert.equal(fixture.update.mock.callCount(), 17);
});

test("different accounts contribute distinct hearts and fresh feeds restore the account flag", async t => {
  auth(t);
  const fixture = storage(t);
  const responses = await Promise.all([request("POST", `/${postId}/like`, {}, firstUser), request("POST", `/${postId}/like`, {}, secondUser)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(fixture.get().likes, 2);
  assert.deepEqual(new Set(fixture.get().likedBy), new Set([firstUser, secondUser]));
  for (const id of [firstUser, secondUser, adminUser]) {
    const response = await request("GET", "", undefined, id);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const [post] = await response.json();
    publicPost(post);
    assert.equal(post.likes, 2);
    assert.equal(post.likedByMe, id !== adminUser);
  }
});

test("legacy anonymous totals restart at zero and the first account heart establishes the new count", async t => {
  auth(t);
  const fixture = storage(t, { likes: 430 });
  const [oldPost] = await (await request("GET", "")).json();
  assert.equal(publicPost(oldPost).likes, 0);
  assert.equal(oldPost.likedByMe, false);
  assert.equal(fixture.get().likes, 430, "reading must not perform a production migration");
  const response = await request("POST", `/${postId}/like`, {});
  assert.equal(response.status, 200);
  assert.equal(publicPost(await response.json()).likes, 1);
  assert.equal(fixture.get().likes, 1);
});

test("anonymous heart requests are rejected and missing posts return 404", async t => {
  auth(t);
  const fixture = storage(t);
  assert.equal((await request("POST", `/${postId}/like`, {}, null)).status, 401);
  assert.equal(fixture.update.mock.callCount(), 0);
  fixture.remove();
  assert.equal((await request("POST", `/${postId}/like`, {})).status, 404);
});

test("all post write responses compute account hearts while omitting the private identity array", async t => {
  auth(t);
  const recorded = {
    _id: postId, author: firstUser, content: "Saved post", category: "food", comments: [],
    likes: 99, likedBy: [firstUser, secondUser, firstUser, "invalid-id"],
  };
  const create = t.mock.method(Post, "create", async fields => new Post({ _id: postId, ...fields }));
  const created = await request("POST", "", { category: "food", content: "New post", likes: 100, likedBy: [firstUser] });
  assert.equal(created.status, 201);
  const post = publicPost(await created.json());
  assert.equal(post.likes, 0);
  assert.equal(post.likedByMe, false);
  assert.equal(Object.hasOwn(create.mock.calls[0].arguments[0], "likedBy"), false);
  assert.equal(Object.hasOwn(create.mock.calls[0].arguments[0], "likes"), false);
  t.mock.method(Post, "findByIdAndUpdate", async () => recorded);
  t.mock.method(Post, "findOneAndUpdate", async () => recorded);
  for (const [method, path, body, id] of [
    ["POST", `/${postId}/comments`, { content: "Comment" }, firstUser],
    ["PATCH", `/${postId}`, { content: "Changed" }, adminUser],
    ["DELETE", `/${postId}/comments/${commentId}`, undefined, firstUser],
  ]) {
    const response = await request(method, path, body, id);
    assert.equal(response.status, 200);
    const result = publicPost(await response.json());
    assert.equal(result.likes, 2);
    assert.equal(result.likedByMe, id === firstUser);
  }
});
