const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const Post = require("../src/models/post.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const routes = require("../src/routes/post.routes");

process.env.JWT_SECRET = "post-privacy-fixture-secret";
const postId = "a".repeat(24);
const userId = "1".repeat(24);
const otherUserId = "2".repeat(24);
const commentId = "b".repeat(24);
const timestamp = "2026-10-06T10:00:00.000Z";
let server;
let endpoint;
const auth = t => t.mock.method(User, "findById", id => ({ select: async () => ({
  _id: new mongoose.Types.ObjectId(id), name: "Fixture member", role: "admin",
  email: "private-account@example.com", passwordHash: "private-password-hash", weight: 77,
}) }));
const request = (method, path = "", body) => fetch(`${endpoint}${path}`, {
  method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: userId })}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const storedPost = () => ({
  _id: new mongoose.Types.ObjectId(postId),
  author: { _id: new mongoose.Types.ObjectId(userId), email: "private-author@example.com", weight: 77 },
  authorName: "Fixture member", authorEmail: "private-snapshot@example.com", authorAvatar: "https://example.com/avatar.png",
  category: "food", content: "Community post", mediaData: "", mediaType: "", createdAt: timestamp, updatedAt: timestamp,
  likes: 999, likedBy: [userId, otherUserId, userId], __v: 8,
  passwordHash: "private-post-hash", health: { weight: 77, dailyCalories: 2000 }, email: "private-extra@example.com",
  comments: [{
    _id: commentId,
    author: { _id: otherUserId, email: "private-comment-author@example.com", passwordHash: "secret" },
    authorName: "Another member", content: "Comment", createdAt: timestamp, updatedAt: timestamp,
    authorEmail: "private-comment@example.com", health: { weight: 66 }, __v: 3,
  }],
});
const assertSafe = actual => {
  assert.deepEqual(actual, {
    _id: postId, author: userId, authorName: "Fixture member", authorAvatar: "https://example.com/avatar.png",
    category: "food", content: "Community post", mediaData: "", mediaType: "", createdAt: timestamp, updatedAt: timestamp,
    likes: 2, likedByMe: true,
    comments: [{ _id: commentId, author: otherUserId, authorName: "Another member", content: "Comment", createdAt: timestamp, updatedAt: timestamp }],
  });
  assert.equal(JSON.stringify(actual).includes("private-"), false);
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", routes);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/posts`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("community feed allowlists post and comment fields without returning email, health or populated user records", async t => {
  auth(t);
  const fixture = storedPost();
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [fixture] }) }) }));
  const response = await request("GET");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [result] = await response.json();
  assertSafe(result);
  assert.equal(fixture.authorEmail, "private-snapshot@example.com", "serialization must not modify old stored documents");
});

test("heart, comment, admin edit and comment deletion responses share the same privacy boundary", async t => {
  auth(t);
  const fixture = storedPost();
  t.mock.method(Post, "findOneAndUpdate", async () => fixture);
  t.mock.method(Post, "findByIdAndUpdate", async () => ({ toObject: () => fixture }));
  for (const [method, path, body] of [
    ["POST", `/${postId}/like`, {}],
    ["POST", `/${postId}/comments`, { content: "New comment" }],
    ["PATCH", `/${postId}`, { content: "Updated" }],
    ["DELETE", `/${postId}/comments/${commentId}`, undefined],
  ]) {
    const response = await request(method, path, body);
    assert.equal(response.status, 200);
    assertSafe(await response.json());
  }
});

test("new community posts never persist authenticated email or accept spoofed private snapshots", async t => {
  auth(t);
  const create = t.mock.method(Post, "create", async fields => {
    assert.equal(Object.hasOwn(fields, "authorEmail"), false);
    assert.equal(Object.hasOwn(fields, "email"), false);
    assert.equal(Object.hasOwn(fields, "health"), false);
    const document = new Post({ _id: postId, ...fields });
    await document.validate(); // No email snapshot is needed to create a valid post.
    return document;
  });
  const response = await request("POST", "", {
    content: "New post", category: "food", authorEmail: "spoof@example.com", email: "spoof@example.com", health: { weight: 99 },
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.author, userId);
  assert.equal(result.authorName, "Fixture member");
  for (const field of ["email", "authorEmail", "health", "passwordHash", "__v", "likedBy"]) assert.equal(Object.hasOwn(result, field), false);
  assert.equal(create.mock.callCount(), 1);
});
