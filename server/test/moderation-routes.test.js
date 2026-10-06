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
const request = (method, suffix = "", body, userId = "admin") => fetch(`${endpoint}/${postId}${suffix}`, {
  method, headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${signToken({ id: userId })}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const auth = t => t.mock.method(User, "findById", id => ({ select: async () => ({ _id: id, role: id === "admin" ? "admin" : "user" }) }));
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", routes);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}/api/posts`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test("post editing remains admin-only and anonymous visitors cannot delete content", async t => {
  auth(t);
  t.mock.method(Post, "findByIdAndUpdate", () => assert.fail("members cannot mutate posts"));
  t.mock.method(Post, "findOneAndDelete", () => assert.fail("anonymous visitors cannot delete posts"));
  t.mock.method(Post, "findOneAndUpdate", () => assert.fail("anonymous visitors cannot delete comments"));
  for (const role of ["user", null]) {
    const expected = role ? 403 : 401;
    assert.equal((await request("PATCH", "", { content: "Changed" }, role)).status, expected);
  }
  assert.equal((await request("DELETE", "", undefined, null)).status, 401);
  assert.equal((await request("DELETE", `/comments/${commentId}`, undefined, null)).status, 401);
});

test("admins can edit allowed post fields, delete posts and remove a specific comment", async t => {
  auth(t);
  const update = t.mock.method(Post, "findByIdAndUpdate", async () => ({ _id: postId, content: "Updated", category: "recipe" }));
  assert.equal((await request("PATCH", "", { content: "  Updated  ", category: "recipe" })).status, 200);
  assert.deepEqual(update.mock.calls[0].arguments, [postId, { $set: { content: "Updated", category: "recipe" } }, { new: true, runValidators: true }]);
  const deletePost = t.mock.method(Post, "findOneAndDelete", async () => ({ _id: postId }));
  assert.equal((await request("DELETE")).status, 204);
  assert.deepEqual(deletePost.mock.calls[0].arguments[0], { _id: postId });
  const comment = t.mock.method(Post, "findOneAndUpdate", async () => ({ _id: postId, comments: [] }));
  const response = await request("DELETE", `/comments/${commentId}`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).comments, []);
  assert.deepEqual(comment.mock.calls[0].arguments[0], { _id: postId, comments: { $elemMatch: { _id: commentId } } });
  assert.deepEqual(comment.mock.calls[0].arguments[1], { $pull: { comments: { _id: commentId } } });
});

test("moderation rejects empty/invalid updates and reports missing posts/comments", async t => {
  auth(t);
  const update = t.mock.method(Post, "findByIdAndUpdate", async () => null);
  t.mock.method(Post, "findOneAndDelete", async () => null);
  t.mock.method(Post, "findOneAndUpdate", async () => null);
  for (const body of [{}, { content: " " }, { content: 3 }, { content: "x".repeat(801) }, { category: "invalid" }, { likes: 100 }]) {
    assert.equal((await request("PATCH", "", body)).status, 400);
  }
  assert.equal(update.mock.callCount(), 0);
  assert.equal((await request("PATCH", "", { content: "Updated" })).status, 404);
  assert.equal((await request("DELETE")).status, 404);
  assert.equal((await request("DELETE", `/comments/${commentId}`)).status, 404);
});

test("members can delete their own posts using the authenticated author in the atomic filter", async t => {
  auth(t);
  let stored = { _id: postId, author: "owner", content: "Owner's post" };
  const remove = t.mock.method(Post, "findOneAndDelete", async filter => {
    if (!stored || filter._id !== stored._id || (filter.author && filter.author !== stored.author)) return null;
    const deleted = stored; stored = null; return deleted;
  });
  // Body claims of ownership or admin status must never authorize deletion.
  assert.equal((await request("DELETE", "", { author: "owner", role: "admin" }, "outsider")).status, 404);
  assert.equal(stored.author, "owner");
  assert.deepEqual(remove.mock.calls[0].arguments[0], { _id: postId, author: "outsider" });
  assert.equal((await request("DELETE", "", undefined, "owner")).status, 204);
  assert.deepEqual(remove.mock.calls[1].arguments[0], { _id: postId, author: "owner" });
  assert.equal(stored, null);
  assert.equal((await request("DELETE", "", undefined, "owner")).status, 404);
});

test("comment deletion requires the comment id and author to match the same array entry", async t => {
  auth(t);
  const otherCommentId = "c".repeat(24);
  const stored = { _id: postId, author: "post-author", comments: [
    { _id: commentId, author: "owner", content: "Owner's comment" },
    { _id: otherCommentId, author: "outsider", content: "Outsider's comment" },
  ] };
  const remove = t.mock.method(Post, "findOneAndUpdate", async (filter, update) => {
    const match = filter.comments.$elemMatch;
    const exists = filter._id === stored._id && stored.comments.some(comment => comment._id === match._id && (!match.author || comment.author === match.author));
    if (!exists) return null;
    const pull = update.$pull.comments;
    stored.comments = stored.comments.filter(comment => !(comment._id === pull._id && (!pull.author || comment.author === pull.author)));
    return structuredClone(stored);
  });
  // The outsider owns a different comment on this post. Separate dotted
  // author/id filters could wrongly match two entries; $elemMatch must pair them.
  assert.equal((await request("DELETE", `/comments/${commentId}`, { author: "owner" }, "outsider")).status, 404);
  assert.equal(stored.comments.length, 2);
  assert.deepEqual(remove.mock.calls[0].arguments[0], { _id: postId, comments: { $elemMatch: { _id: commentId, author: "outsider" } } });
  assert.deepEqual(remove.mock.calls[0].arguments[1], { $pull: { comments: { _id: commentId, author: "outsider" } } });
  const response = await request("DELETE", `/comments/${commentId}`, undefined, "owner");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).comments, [{ _id: otherCommentId, author: "outsider", content: "Outsider's comment" }]);
  assert.deepEqual(remove.mock.calls[1].arguments, [
    { _id: postId, comments: { $elemMatch: { _id: commentId, author: "owner" } } },
    { $pull: { comments: { _id: commentId, author: "owner" } } },
    { new: true, runValidators: true },
  ]);
  assert.equal((await request("DELETE", `/comments/${commentId}`, undefined, "owner")).status, 404);
  assert.equal((await request("DELETE", `/comments/${otherCommentId}`, undefined, "admin")).status, 200);
  assert.equal(stored.comments.length, 0);
});

test("feed polling returns fresh JSON with stable descending ordering and requires authentication", async t => {
  auth(t);
  let posts = [{ _id: postId, content: "Initial post" }];
  const sorts = [];
  const limits = [];
  const find = t.mock.method(Post, "find", () => ({
    sort: value => { sorts.push(value); return { limit: count => { limits.push(count); return { lean: async () => structuredClone(posts) }; } }; },
  }));
  const get = id => fetch(endpoint, { headers: id ? { Authorization: `Bearer ${signToken({ id })}` } : {} });
  assert.equal((await get(null)).status, 401);
  assert.equal(find.mock.callCount(), 0);
  const first = await get("owner");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.deepEqual(await first.json(), posts.map(post => ({ ...post, likes: 0, likedByMe: false })));
  posts = [{ _id: "d".repeat(24), content: "New post" }, ...posts];
  const second = await get("owner");
  assert.equal(second.headers.get("cache-control"), "no-store");
  assert.deepEqual(await second.json(), posts.map(post => ({ ...post, likes: 0, likedByMe: false })));
  assert.deepEqual(sorts, [{ createdAt: -1, _id: -1 }, { createdAt: -1, _id: -1 }]);
  assert.deepEqual(limits, [50, 50]);
});
