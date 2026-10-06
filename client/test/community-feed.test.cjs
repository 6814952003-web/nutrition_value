const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");

const filename = path.resolve(__dirname, "../src/communityFeed.js");
const compiled = esbuild.transformSync(fs.readFileSync(filename, "utf8"), { loader: "js", format: "cjs", sourcefile: filename });
const loadedModule = new Module(filename, module);
loadedModule.filename = filename;
loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
loadedModule._compile(compiled.code, filename);
const { createCommunityFeed, canDeleteCommunityItem, COMMUNITY_POLL_INTERVAL } = loadedModule.exports;

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeScheduler() {
  let now = 0; let next = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(duration) {
      const end = now + duration;
      for (;;) {
        const entry = [...timers.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].callback();
      }
      now = end;
    },
    get pending() { return timers.size; },
  };
}
function harness(t, options = {}) {
  const scheduler = fakeScheduler();
  const snapshots = []; const errors = []; const requests = [];
  const feed = createCommunityFeed({
    scheduler,
    fetchPosts: request => { const result = deferred(); requests.push({ ...request, ...result }); return result.promise; },
    onSnapshot: value => snapshots.push(value),
    onError: error => errors.push(error),
    ...options,
  });
  t.after(() => feed.stop());
  return { scheduler, feed, snapshots, errors, requests };
}
const post = (id, changes = {}) => ({ _id: id, author: "owner", content: `โพสต์ ${id}`, category: "food", likes: 0, comments: [], ...changes });

test("loads first, then polls every two seconds without overlapping delayed requests", async t => {
  const { scheduler, feed, requests } = harness(t);
  assert.equal(COMMUNITY_POLL_INTERVAL, 2000);
  feed.start(); await settle();
  assert.equal(requests.length, 1);
  assert.equal(feed.getSnapshot().loaded, false);
  assert.equal(feed.getSnapshot().loading, true);
  scheduler.advance(10000); await settle();
  assert.equal(requests.length, 1, "a slow API request must not start overlapping polls");
  requests[0].resolve([post("first")]); await settle();
  assert.equal(feed.getSnapshot().loaded, true);
  assert.equal(feed.getSnapshot().loading, false);
  scheduler.advance(1999); await settle(); assert.equal(requests.length, 1);
  scheduler.advance(1); await settle(); assert.equal(requests.length, 2);
  requests[1].resolve([post("new"), post("first", { likes: 3, comments: [{ _id: "reply", content: "ความคิดเห็นใหม่" }] })]); await settle();
  assert.deepEqual(feed.getSnapshot().posts.map(item => item._id), ["new", "first"]);
  assert.equal(feed.getSnapshot().posts[1].likes, 3);
  assert.equal(feed.getSnapshot().posts[1].comments[0].content, "ความคิดเห็นใหม่");
});

test("hidden tabs suspend polling; focus or visibility refreshes immediately and coalesces in-flight events", async t => {
  let visible = true;
  const { scheduler, feed, requests } = harness(t, { getVisibility: () => visible });
  feed.start(); await settle(); requests[0].resolve([post("first")]); await settle();
  visible = false; scheduler.advance(2000); await settle();
  assert.equal(requests.length, 1);
  assert.equal(scheduler.pending, 0);
  scheduler.advance(20000); await settle(); assert.equal(requests.length, 1);
  visible = true; feed.refresh(); await settle(); assert.equal(requests.length, 2);
  feed.refresh(); feed.refresh(); await settle(); assert.equal(requests.length, 2);
  requests[1].resolve([post("second")]); await settle();
  scheduler.advance(0); await settle(); assert.equal(requests.length, 3, "queued focus events cause just one follow-up refresh");
});

test("failed requests preserve the last feed and recover through automatic retry", async t => {
  const { scheduler, feed, requests, errors } = harness(t);
  feed.start(); await settle(); requests[0].resolve([post("first")]); await settle();
  scheduler.advance(2000); await settle(); requests[1].reject(new Error("connection lost")); await settle();
  assert.equal(feed.getSnapshot().offline, true);
  assert.equal(feed.getSnapshot().posts[0]._id, "first");
  assert.equal(errors.length, 1);
  scheduler.advance(2000); await settle(); requests[2].resolve([post("latest")]); await settle();
  assert.equal(feed.getSnapshot().offline, false);
  assert.equal(feed.getSnapshot().posts[0]._id, "latest");
});

test("offline starts wait for reconnect without displaying a loaded empty feed", async t => {
  let online = false;
  const { scheduler, feed, requests } = harness(t, { getOnline: () => online });
  feed.start(); await settle();
  assert.equal(requests.length, 0);
  assert.equal(feed.getSnapshot().loaded, false);
  assert.equal(feed.getSnapshot().offline, true);
  scheduler.advance(2000); await settle(); assert.equal(requests.length, 0);
  online = true; feed.refresh(); await settle(); assert.equal(requests.length, 1);
  requests[0].resolve([]); await settle();
  assert.equal(feed.getSnapshot().loaded, true);
  assert.equal(feed.getSnapshot().offline, false);
});

test("unmount aborts the active fetch and late resolution cannot notify or restart polling", async t => {
  const { scheduler, feed, requests, snapshots, errors } = harness(t);
  feed.start(); await settle();
  const before = snapshots.length;
  feed.stop();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve([post("late")]); await settle(); scheduler.advance(20000); await settle();
  assert.equal(snapshots.length, before);
  assert.equal(requests.length, 1);
  assert.equal(scheduler.pending, 0);
  assert.equal(errors.length, 0);
});

test("local post deletion is immediate and stale responses never restore it", async t => {
  const { scheduler, feed, requests } = harness(t);
  feed.start(); await settle(); requests[0].resolve([post("deleted"), post("kept")]); await settle();
  scheduler.advance(2000); await settle();
  feed.removePost("deleted");
  assert.deepEqual(feed.getSnapshot().posts.map(item => item._id), ["kept"]);
  requests[1].resolve([post("deleted"), post("kept", { content: "stale" })]); await settle();
  assert.deepEqual(feed.getSnapshot().posts.map(item => item._id), ["kept"]);
  assert.equal(feed.getSnapshot().posts[0].content, "โพสต์ kept", "the entire request started before deletion is stale");
  scheduler.advance(0); await settle();
  requests[2].resolve([post("deleted"), post("kept", { content: "fresh" })]); await settle();
  assert.deepEqual(feed.getSnapshot().posts.map(item => item._id), ["kept"]);
  assert.equal(feed.getSnapshot().posts[0].content, "fresh");
});

test("successful create, comment and like responses update immediately and invalidate an earlier poll", async t => {
  const { scheduler, feed, requests } = harness(t);
  feed.start(); await settle();
  feed.upsertPost(post("mine"));
  assert.equal(feed.getSnapshot().posts[0]._id, "mine");
  assert.equal(feed.getSnapshot().loaded, true);
  requests[0].resolve([]); await settle();
  assert.equal(feed.getSnapshot().posts[0]._id, "mine");
  scheduler.advance(0); await settle();
  const updated = post("mine", { likes: 1, comments: [{ _id: "reply", content: "เพิ่งเขียน" }] });
  feed.upsertPost(updated);
  requests[1].resolve([post("mine")]); await settle();
  assert.equal(feed.getSnapshot().posts[0].likes, 1);
  assert.equal(feed.getSnapshot().posts[0].comments[0].content, "เพิ่งเขียน");
});

test("deleted comments stay removed even when an older snapshot contains them", async t => {
  const { scheduler, feed, requests } = harness(t);
  const original = post("discussion", { comments: [{ _id: "removed", content: "ลบแล้ว" }, { _id: "kept", content: "ยังอยู่" }] });
  feed.start(); await settle(); requests[0].resolve([original]); await settle();
  const updated = { ...original, comments: [original.comments[1]] };
  feed.removeComment("discussion", "removed", updated);
  assert.deepEqual(feed.getSnapshot().posts[0].comments.map(item => item._id), ["kept"]);
  scheduler.advance(0); await settle(); requests[1].resolve([original]); await settle();
  assert.deepEqual(feed.getSnapshot().posts[0].comments.map(item => item._id), ["kept"]);
});

test("other users' server-side deletions appear in the next feed snapshot", async t => {
  const { scheduler, feed, requests } = harness(t);
  feed.start(); await settle(); requests[0].resolve([post("first"), post("remote")]); await settle();
  scheduler.advance(2000); await settle(); requests[1].resolve([post("first")]); await settle();
  assert.deepEqual(feed.getSnapshot().posts.map(item => item._id), ["first"]);
});

test("delete controls belong to owners and admins, never unrelated members", () => {
  const owned = post("mine");
  assert.equal(canDeleteCommunityItem(owned, { id: "owner", role: "user" }), true);
  assert.equal(canDeleteCommunityItem(owned, { id: "other", role: "user" }), false);
  assert.equal(canDeleteCommunityItem(owned, { id: "admin", role: "admin" }), true);
  assert.equal(canDeleteCommunityItem({ author: { _id: "owner" } }, { id: "owner", role: "user" }), true);
  assert.equal(canDeleteCommunityItem({ author: "" }, { id: "", role: "user" }), false);
  assert.equal(canDeleteCommunityItem(owned, null), false);
});
