const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Post = require("../src/models/post.model");
const User = require("../src/models/user.model");
const { signToken } = require("../src/config/auth");
const routes = require("../src/routes/post.routes");

process.env.JWT_SECRET = "moderation-fixture-secret";
let server;
let endpoint;
const postId = "a".repeat(24);
const commentId = "b".repeat(24);
const request = (method, suffix = "", body, role = "admin") => fetch(`${endpoint}/${postId}${suffix}`, {
  method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${signToken({ id: role })}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const auth = t => t.mock.method(User, "findById", role => ({ select: async () => ({ _id: role, role }) }));
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", routes);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/posts`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("members and anonymous visitors cannot edit/delete posts or comments", async t => {
  auth(t);
  t.mock.method(Post, "findByIdAndUpdate", () => assert.fail("members cannot mutate posts"));
  t.mock.method(Post, "findByIdAndDelete", () => assert.fail("members cannot delete posts"));
  t.mock.method(Post, "findOneAndUpdate", () => assert.fail("members cannot delete comments"));
  for (const role of ["user", null]) {
    const expected = role ? 403 : 401;
    assert.equal((await request("PATCH", "", { content: "Changed" }, role)).status, expected);
    assert.equal((await request("DELETE", "", undefined, role)).status, expected);
    assert.equal((await request("DELETE", `/comments/${commentId}`, undefined, role)).status, expected);
  }
});

test("admins can edit allowed post fields, delete posts and remove a specific comment", async t => {
  auth(t);
  const update = t.mock.method(Post, "findByIdAndUpdate", async () => ({ _id: postId, content: "Updated", category: "recipe" }));
  assert.equal((await request("PATCH", "", { content: "  Updated  ", category: "recipe" })).status, 200);
  assert.deepEqual(update.mock.calls[0].arguments, [postId, { $set: { content: "Updated", category: "recipe" } }, { new: true, runValidators: true }]);
  const deletePost = t.mock.method(Post, "findByIdAndDelete", async () => ({ _id: postId }));
  assert.equal((await request("DELETE")).status, 204);
  assert.equal(deletePost.mock.calls[0].arguments[0], postId);
  const comment = t.mock.method(Post, "findOneAndUpdate", async () => ({ _id: postId, comments: [] }));
  const response = await request("DELETE", `/comments/${commentId}`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).comments, []);
  assert.deepEqual(comment.mock.calls[0].arguments[0], { _id: postId, "comments._id": commentId });
  assert.deepEqual(comment.mock.calls[0].arguments[1], { $pull: { comments: { _id: commentId } } });
});

test("moderation rejects empty/invalid updates and reports missing posts/comments", async t => {
  auth(t);
  const update = t.mock.method(Post, "findByIdAndUpdate", async () => null);
  t.mock.method(Post, "findByIdAndDelete", async () => null);
  t.mock.method(Post, "findOneAndUpdate", async () => null);
  for (const body of [{}, { content: " " }, { content: 3 }, { content: "x".repeat(801) }, { category: "invalid" }, { likes: 100 }]) {
    assert.equal((await request("PATCH", "", body)).status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
  assert.equal((await request("PATCH", "", { content: "Updated" })).status, 404);
  assert.equal((await request("DELETE")).status, 404);
  assert.equal((await request("DELETE", `/comments/${commentId}`)).status, 404);
});
