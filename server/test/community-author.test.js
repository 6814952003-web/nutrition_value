const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Post = require("../src/models/post.model");
const { AUTHOR_FIELDS, attachAuthorProfiles } = require("../src/config/community-author");
const { signToken } = require("../src/config/auth");
const routes = require("../src/routes/post.routes");

process.env.JWT_SECRET = "community-author-fixture-secret";
const publicId = "1".repeat(24);
const privateId = "2".repeat(24);
const deletedId = "3".repeat(24);
const postId = "a".repeat(24);
const commentId = "b".repeat(24);
const publicUser = {
  _id: new mongoose.Types.ObjectId(publicId), username: "current-address", displayName: "Current public name",
  name: "Account name", avatarData: "https://assets.example.test/current.png", profileVisibility: "public",
  email: "private-email@example.test", health: { weight: 90 }, bio: "Only on profile card", passwordHash: "private-hash",
};
const storedPost = () => ({
  _id: postId, author: publicId, authorName: "Old public name", authorAvatar: "https://assets.example.test/old.png",
  authorUsername: "stale-legacy-address", authorEmail: "old-email@example.test", health: { weight: 70 },
  category: "food", content: "Community post", likedBy: [publicId], createdAt: "2026-10-05T00:00:00Z",
  comments: [{ _id: commentId, author: privateId, authorName: "Private snapshot", authorUsername: "private-address", content: "Comment" }],
});
let server;
let endpoint;
const users = (t, result = [publicUser]) => t.mock.method(User, "find", query => ({ select: fields => {
  assert.equal(fields, AUTHOR_FIELDS);
  assert.equal(fields.includes("email"), false);
  assert.equal(fields.includes("health"), false);
  assert.equal(fields.includes("bio"), false);
  assert.equal(query.profileVisibility, "public");
  return { lean: async () => result };
} }));
const auth = t => t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, name: "Account name", role: "admin" }) }));
const request = (method, suffix = "", body) => fetch(`${endpoint}${suffix}`, {
  method, headers: { Authorization: `Bearer ${signToken({ id: publicId })}`, "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", routes);
  app.use((error, req, res, next) => res.status(503).json({ message: "Community temporarily unavailable." }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/api/posts`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("one batch resolves existing post and comment authors from their current public addresses", async t => {
  const lookup = users(t, [publicUser, { ...publicUser, _id: privateId, username: "commenter", displayName: "Current commenter" }]);
  const source = [storedPost(), { ...storedPost(), _id: "c".repeat(24) }];
  auth(t);
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => source }) }) }));
  const response = await request("GET");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const posts = await response.json();
  for (const post of posts) {
    assert.equal(post.authorUsername, "current-address");
    assert.equal(post.authorName, "Current public name");
    assert.equal(post.authorAvatar, publicUser.avatarData);
    assert.equal(post.comments[0].authorUsername, "commenter");
    assert.equal(post.comments[0].authorName, "Current commenter");
    assert.equal(post.comments[0].authorAvatar, publicUser.avatarData);
    assert.equal(post.likes, 1);
    assert.equal(post.likedByMe, true);
  }
  assert.equal(lookup.mock.callCount(), 1, "50 posts and their comments must not create per-author queries");
  assert.deepEqual(new Set(lookup.mock.calls[0].arguments[0]._id.$in), new Set([publicId, privateId]));
  assert.equal(source[0].authorUsername, "stale-legacy-address", "reading never migrates stored snapshots");
  const serialized = JSON.stringify(posts);
  for (const secret of ["stale-legacy-address", "private-email", "old-email", "health", "weight", "passwordHash", "Only on profile card"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("private, deleted and invalid current users never publish stale usernames or private names and avatars", async t => {
  users(t, [
    { ...publicUser, _id: privateId, username: "private-address", profileVisibility: "private", displayName: "Private draft", avatarData: "private-avatar" },
    { ...publicUser, username: "invalid.address" },
  ]);
  auth(t);
  const fixture = [storedPost(), { ...storedPost(), author: deletedId, authorName: "Deleted snapshot" }];
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => fixture }) }) }));
  const response = await request("GET");
  assert.equal(response.status, 200);
  const posts = await response.json();
  assert.equal(posts[0].authorUsername, null);
  assert.equal(posts[0].authorName, "Old public name");
  assert.equal(posts[0].authorAvatar, "https://assets.example.test/old.png");
  assert.equal(posts[0].comments[0].authorUsername, null);
  assert.equal(posts[0].comments[0].authorName, "Private snapshot");
  assert.equal(posts[1].authorUsername, null);
  assert.equal(posts[1].authorName, "Deleted snapshot");
  for (const secret of ["private-address", "Private draft", "private-avatar", "stale-legacy-address"]) {
    assert.equal(JSON.stringify(posts).includes(secret), false, secret);
  }
});

test("realtime create, heart, comment, admin edit and comment deletion responses retain the same author enrichment", async t => {
  const lookup = users(t);
  auth(t);
  t.mock.method(Post, "create", async () => ({ toObject: storedPost }));
  t.mock.method(Post, "findByIdAndUpdate", async () => ({ toObject: storedPost }));
  t.mock.method(Post, "findOneAndUpdate", async () => storedPost());
  for (const [method, path, body, status] of [
    ["POST", "", { category: "food", content: "New post" }, 201],
    ["POST", `/${postId}/like`, {}, 200],
    ["POST", `/${postId}/comments`, { content: "New comment" }, 200],
    ["PATCH", `/${postId}`, { content: "Updated" }, 200],
    ["DELETE", `/${postId}/comments/${commentId}`, undefined, 200],
  ]) {
    const response = await request(method, path, body);
    assert.equal(response.status, status);
    const post = await response.json();
    assert.equal(post.authorUsername, "current-address");
    assert.equal(post.authorName, "Current public name");
    assert.equal(post.comments[0].authorUsername, null);
    assert.equal(Object.hasOwn(post, "likedBy"), false);
    assert.equal(Object.hasOwn(post, "authorEmail"), false);
  }
  assert.equal(lookup.mock.callCount(), 5);
});

test("a privacy toggle or rename immediately updates legacy authors on the next response without trusting snapshots", async t => {
  let current = publicUser;
  const lookup = users(t);
  lookup.mock.mockImplementation(() => ({ select: () => ({ lean: async () => current ? [current] : [] }) }));
  auth(t);
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [storedPost()] }) }) }));
  assert.equal((await (await request("GET")).json())[0].authorUsername, "current-address");
  current = { ...current, username: "renamed-address" };
  assert.equal((await (await request("GET")).json())[0].authorUsername, "renamed-address");
  current = { ...current, profileVisibility: "private" };
  assert.equal((await (await request("GET")).json())[0].authorUsername, null);
  current = null;
  assert.equal((await (await request("GET")).json())[0].authorUsername, null);
});

test("empty or malformed author IDs skip lookups and author lookup failures fail closed without breaking successful mutations", async t => {
  const lookup = users(t);
  assert.deepEqual(await attachAuthorProfiles([{ content: "No author", comments: [{ author: "invalid-id", content: "Legacy comment" }] }]),
    [{ content: "No author", authorUsername: null, comments: [{ author: "invalid-id", content: "Legacy comment", authorUsername: null }] }]);
  assert.equal(lookup.mock.callCount(), 0);
  lookup.mock.mockImplementation(() => ({ select: () => ({ lean: async () => { throw new Error("lookup failure"); } }) }));
  auth(t);
  t.mock.method(Post, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [storedPost()] }) }) }));
  const response = await request("GET");
  assert.equal(response.status, 200);
  const [post] = await response.json();
  assert.equal(post.authorUsername, null);
  assert.equal(post.comments[0].authorUsername, null);
  assert.equal(post.authorName, "Old public name");
  assert.equal(JSON.stringify(post).includes("stale-legacy-address"), false);
  t.mock.method(Post, "create", async () => storedPost());
  t.mock.method(Post, "findByIdAndUpdate", async () => storedPost());
  t.mock.method(Post, "findOneAndUpdate", async () => storedPost());
  for (const [method, path, body, status] of [
    ["POST", "", { category: "food", content: "New post" }, 201],
    ["POST", `/${postId}/like`, {}, 200],
    ["POST", `/${postId}/comments`, { content: "New comment" }, 200],
    ["PATCH", `/${postId}`, { content: "Updated" }, 200],
    ["DELETE", `/${postId}/comments/${commentId}`, undefined, 200],
  ]) {
    const mutation = await request(method, path, body);
    assert.equal(mutation.status, status);
    const result = await mutation.json();
    assert.equal(result.authorUsername, null);
    assert.equal(result.comments[0].authorUsername, null);
    assert.equal(result.likes, 1);
  }
});
