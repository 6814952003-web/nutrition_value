const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Post = require("../src/models/post.model");
const Activity = require("../src/models/activity.model");
const { signToken } = require("../src/config/auth");
const { PROFILE_FIELDS, bangkokDayStart, streakPipeline, publicPostPipeline } = require("../src/config/public-profile");
const { updateMyProfile, getMe } = require("../src/controllers/user.controller");
const profileRoutes = require("../src/routes/profile.routes");
const userRoutes = require("../src/routes/user.routes");

process.env.JWT_SECRET = "profile-fixture-secret";
const ownerId = "1".repeat(24);
const otherId = "2".repeat(24);
const postId = "a".repeat(24);
const privateUser = {
  _id: new mongoose.Types.ObjectId(ownerId), name: "Old name", username: "fixture-owner", displayName: "Public name", bio: "A short bio",
  avatarData: "https://assets.example.test/avatar.png", createdAt: new Date("2026-09-01T00:00:00Z"), profileVisibility: "private",
  email: "must-never-leak@example.test", role: "admin", passwordHash: "secret-hash", passwordSalt: "secret-salt",
  health: { weight: 77 }, activity: [{ durationSeconds: 55 }], goal: "private-goal",
};
const storedPost = {
  _id: postId, content: "Shared food", category: "food", mediaData: "https://assets.example.test/photo.png", mediaType: "image",
  createdAt: new Date("2026-10-05T00:00:00Z"), likes: 2, commentCount: 3,
  authorEmail: privateUser.email, author: ownerId, authorName: privateUser.name,
  comments: [{ author: otherId, content: "Comment private identity" }], likedBy: [ownerId, otherId], nutrition: { calories: 999 }, extra: "unexpected",
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
const unexpected = error => { throw error || new Error("Unexpected next call"); };
let server;
let endpoint;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/profiles", profileRoutes);
  app.use("/api/users", userRoutes);
  app.use((error, req, res, next) => res.status(500).json({ message: "Service unavailable." }));
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));

const authHeader = id => ({ Authorization: `Bearer ${signToken({ id })}` });
const auth = (t, user = privateUser) => t.mock.method(User, "findById", id => ({ select: () => {
  if (String(id) !== ownerId) return { then: resolve => resolve({ ...user, _id: id }), lean: async () => ({ ...user, _id: id }) };
  return { then: resolve => resolve(user), lean: async () => user };
} }));
const aggregates = t => {
  const activity = t.mock.method(Activity, "aggregate", async pipeline => {
    assert.equal(String(pipeline[0].$match.user), ownerId);
    return [{ streak: 7 }];
  });
  const posts = t.mock.method(Post, "aggregate", async pipeline => {
    assert.equal(String(pipeline[0].$match.author), ownerId);
    assert.equal(pipeline[2].$limit, 50);
    return [storedPost];
  });
  return { activity, posts };
};
const assertVisitor = profile => {
  assert.deepEqual(Object.keys(profile).sort(), ["avatarUrl", "bio", "displayName", "joinedAt", "posts", "streak"].sort());
  assert.equal(profile.displayName, privateUser.displayName);
  assert.equal(profile.streak, 7);
  assert.deepEqual(Object.keys(profile.posts[0]).sort(), ["_id", "content", "category", "mediaData", "mediaType", "createdAt", "likes", "commentCount"].sort());
  const serialized = JSON.stringify(profile);
  for (const secret of [privateUser.email, privateUser.passwordHash, privateUser.passwordSalt, privateUser.goal, ownerId, otherId, "calories", "nutrition", "Comment private identity"]) {
    assert.equal(serialized.includes(secret), false, `must not expose ${secret}`);
  }
};

test("public profile works without authentication and strictly allowlists profile/posts even if storage returns extra fields", async t => {
  t.mock.method(User, "findOne", query => ({ select: fields => {
    assert.deepEqual(query, { username: "fixture-owner", profileVisibility: "public" });
    assert.equal(fields, PROFILE_FIELDS);
    assert.equal(fields.includes("email"), false);
    return { lean: async () => ({ ...privateUser, profileVisibility: "public" }) };
  } }));
  aggregates(t);
  const res = await fetch(`${endpoint}/api/profiles/fixture-owner`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assertVisitor(await res.json());
});

test("private and nonexistent profiles return identical no-store 404 even with the owner's token", async t => {
  const query = t.mock.method(User, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(Activity, "aggregate", () => assert.fail("unavailable profile must not load activity"));
  t.mock.method(Post, "aggregate", () => assert.fail("unavailable profile must not load posts"));
  const hidden = await fetch(`${endpoint}/api/profiles/fixture-owner`, { headers: authHeader(ownerId) });
  const missing = await fetch(`${endpoint}/api/profiles/not-registered`);
  assert.equal(hidden.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(hidden.headers.get("cache-control"), "no-store");
  assert.deepEqual(await hidden.json(), await missing.json());
  assert.equal(query.mock.calls[0].arguments[0].profileVisibility, "public");
});

test("invalid profile names cannot trigger injected or broadened database lookups", async t => {
  t.mock.method(User, "findOne", () => assert.fail("malformed username must not query"));
  for (const username of ["ab", "x".repeat(31), "OWNER", "$ne", "name@example.test", "thai%20name"]) {
    const res = await fetch(`${endpoint}/api/profiles/${username}`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("owner preview requires auth, ignores other identities and client drafts, and returns only the saved sanitized view", async t => {
  const unauth = await fetch(`${endpoint}/api/users/me/public-preview`);
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get("cache-control"), "no-store");
  const lookup = auth(t);
  aggregates(t);
  const res = await fetch(`${endpoint}/api/users/me/public-preview?userId=${otherId}&bio=client-draft`, { headers: authHeader(ownerId) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const profile = await res.json();
  assertVisitor(profile);
  assert.equal(profile.bio, privateUser.bio);
  assert.equal(lookup.mock.callCount(), 2, "auth lookup and independent fresh owner preview lookup");
  assert.ok(lookup.mock.calls.every(call => String(call.arguments[0]) === ownerId));
});

test("profile GET and preview hide service errors without returning partial private data", async t => {
  const failure = new Error(`database failure: ${privateUser.email}; health: weight=77`);
  t.mock.method(User, "findOne", () => ({ select: () => ({ lean: async () => { throw failure; } }) }));
  const res = await fetch(`${endpoint}/api/profiles/fixture-owner`);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { message: "Profile is temporarily unavailable. Please try again." });
  auth(t);
  t.mock.method(Activity, "aggregate", async () => { throw failure; });
  t.mock.method(Post, "aggregate", async () => [storedPost]);
  const preview = await fetch(`${endpoint}/api/users/me/public-preview`, { headers: authHeader(ownerId) });
  assert.equal(preview.status, 503);
  assert.deepEqual(await preview.json(), { message: "Profile is temporarily unavailable. Please try again." });
});

test("new and legacy owner DTOs default private and expose owner settings separately from public DTOs", () => {
  const user = new User({ name: "Member", email: "member@example.test", passwordHash: "hash", passwordSalt: "salt" });
  assert.equal(user.profileVisibility, "private");
  assert.equal(user.username, undefined);
  const res = response();
  getMe({ user: { _id: ownerId, name: "Legacy member", email: "own@example.test" } }, res);
  assert.equal(res.body.username, "");
  assert.equal(res.body.displayName, "Legacy member");
  assert.equal(res.body.bio, "");
  assert.equal(res.body.profileVisibility, "private");
  assert.equal(res.body.email, "own@example.test", "owner may still access their own email");
});

test("self profile updates reject foreign identities, privileges and health fields before writing", async t => {
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("forbidden update must not write"));
  t.mock.method(User, "findOneAndUpdate", () => assert.fail("forbidden update must not write"));
  for (const field of ["_id", "id", "user", "email", "role", "password", "health", "weight", "tracks", "$set"]) {
    const res = response();
    await updateMyProfile({ user: privateUser, body: { bio: "Safe", [field]: "injected" } }, res, unexpected);
    assert.equal(res.statusCode, 400, field);
  }
});

test("self profile validation rejects invalid address/display name/bio/privacy and requires a username to publish", async t => {
  t.mock.method(User, "findByIdAndUpdate", () => assert.fail("invalid update must not write"));
  t.mock.method(User, "findOneAndUpdate", () => assert.fail("invalid update must not write"));
  const invalid = [{ username: 123 }, { username: "ab" }, { username: "x".repeat(31) }, { username: "คนไทย" }, { username: "user.name" },
    { displayName: " " }, { displayName: "x".repeat(81) }, { displayName: {} }, { bio: [] }, { bio: "x".repeat(301) },
    { profileVisibility: "friends" }, { profileVisibility: {} }, { profileVisibility: "public" }, { username: "", profileVisibility: "public" }];
  for (const body of invalid) {
    const res = response();
    await updateMyProfile({ user: { ...privateUser, username: undefined }, body }, res, unexpected);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

test("public opt-in atomically reserves a normalized username and uses only the authenticated owner's identity", async t => {
  const update = t.mock.method(User, "findOneAndUpdate", async (filter, values) => ({ ...privateUser, ...values }));
  const res = response();
  await updateMyProfile({ user: privateUser, body: { username: "  New_Owner-3  ", displayName: " New display ", bio: " New bio ", profileVisibility: "public" } }, res, unexpected);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments, [{ _id: privateUser._id, username: "fixture-owner", profileVisibility: { $in: ["private", null] } },
    { username: "new_owner-3", displayName: "New display", bio: "New bio", profileVisibility: "public" }, { new: true, runValidators: true }]);
  assert.equal(res.body.profileVisibility, "public");
  assert.equal(res.body.username, "new_owner-3");
  assert.equal(res.body.passwordHash, undefined);
});

test("duplicate username races and stale privacy transitions return 409 without automatic public publication", async t => {
  const update = t.mock.method(User, "findOneAndUpdate", async () => { throw Object.assign(new Error("Duplicate index key"), { code: 11000 }); });
  const duplicate = response();
  await updateMyProfile({ user: privateUser, body: { username: "already-taken", profileVisibility: "public" } }, duplicate, unexpected);
  assert.equal(duplicate.statusCode, 409);
  assert.match(duplicate.body.message, /username/);
  update.mock.mockImplementation(async () => null);
  const race = response();
  await updateMyProfile({ user: privateUser, body: { profileVisibility: "public" } }, race, unexpected);
  assert.equal(race.statusCode, 409);
  assert.match(race.body.message, /changed/);
});

test("private owners can reserve or clear a username; public accounts cannot clear an address without switching private", async t => {
  const update = t.mock.method(User, "findOneAndUpdate", async (filter, operation) => ({ ...privateUser, ...(operation.$set || operation), username: operation.$unset ? undefined : operation.username }));
  const cleared = response();
  await updateMyProfile({ user: privateUser, body: { username: " " } }, cleared, unexpected);
  assert.equal(cleared.statusCode, 200);
  assert.deepEqual(update.mock.calls[0].arguments[1], { $set: {}, $unset: { username: 1 } });
  assert.equal(cleared.body.profileVisibility, "private");
  const blocked = response();
  await updateMyProfile({ user: { ...privateUser, profileVisibility: "public" }, body: { username: "" } }, blocked, unexpected);
  assert.equal(blocked.statusCode, 400);
  assert.equal(update.mock.callCount(), 1);
  const hidden = response();
  await updateMyProfile({ user: { ...privateUser, profileVisibility: "public" }, body: { username: "", profileVisibility: "private" } }, hidden, unexpected);
  assert.equal(hidden.statusCode, 200);
});

test("the username model index is unique/sparse without assigning addresses or visibility to existing users", async () => {
  assert.ok(User.schema.indexes().some(([fields, options]) => fields.username === 1 && options.unique && options.sparse));
  for (const username of ["ab", "UPPER", "invalid space", "x".repeat(31)]) {
    const user = new User({ name: "Member", email: "member@example.test", passwordHash: "hash", passwordSalt: "salt", username });
    // Model intentionally normalizes case at write boundaries.
    if (username === "UPPER") assert.equal(user.username, "upper");
    else await assert.rejects(user.validate(), { name: "ValidationError" });
  }
});

test("Bangkok date boundaries use midnight at UTC17:00 and pipeline groups duplicate active days before counting a contiguous run", () => {
  assert.equal(bangkokDayStart("2026-10-05T16:59:59.999Z").toISOString(), "2026-10-04T17:00:00.000Z");
  assert.equal(bangkokDayStart("2026-10-05T17:00:00.000Z").toISOString(), "2026-10-05T17:00:00.000Z");
  assert.equal(bangkokDayStart("2026-10-05T23:59:59.999Z").toISOString(), "2026-10-05T17:00:00.000Z");
  const now = new Date("2026-10-05T17:00:00Z");
  const pipeline = streakPipeline(ownerId, now);
  assert.equal(String(pipeline[0].$match.user), ownerId);
  assert.deepEqual(pipeline[0].$match.type.$in, ["registered", "login", "session"]);
  assert.equal(pipeline[0].$match.createdAt.$lte, now, "future activities do not count");
  assert.equal(pipeline[1].$group._id.$dateTrunc.timezone, "Asia/Bangkok");
  assert.equal(pipeline[2].$setWindowFields.output.ordinal.$documentNumber.constructor, Object);
  const conditions = pipeline[3].$match.$expr.$and;
  assert.equal(conditions[0].$gte[1].toISOString(), "2026-10-04T17:00:00.000Z", "last active day may be yesterday");
  assert.equal(conditions[1].$lte[1].toISOString(), "2026-10-05T17:00:00.000Z");
  assert.deepEqual(conditions[2].$eq[1], { $subtract: ["$ordinal", 1] }, "a gap makes elapsed days greater than the grouped-day ordinal");
  assert.deepEqual(pipeline.at(-1), { $count: "streak" }, "only one scalar leaves Mongo, never raw activity");
  const posts = publicPostPipeline(ownerId);
  assert.equal(posts[2].$limit, 50);
  assert.deepEqual(Object.keys(posts[3].$project).sort(), ["_id", "content", "category", "mediaData", "mediaType", "createdAt", "likes", "commentCount"].sort());
});
