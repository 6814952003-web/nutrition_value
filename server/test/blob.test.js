const test = require("node:test");
const assert = require("node:assert/strict");
const blobStorage = require("@vercel/blob");
const { blobPublicOrigin, uploadPolicy, validateBlob } = require("../src/config/blob");

const origin = "https://test.public.blob.vercel-storage.com";
const avatarUrl = `${origin}/uploads/user1/avatar/photo.png`;
const avatarMetadata = { url: avatarUrl, pathname: "uploads/user1/avatar/photo.png", contentType: "image/png", size: 1_500_000 };
process.env.BLOB_PUBLIC_ORIGIN = origin;
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_fixture";

test("upload tokens restrict owner, purpose, content types and size", () => {
  const avatar = uploadPolicy("uploads/user1/avatar/photo.png", "user1");
  assert.equal(avatar.maximumSizeInBytes, 1_500_000);
  assert.deepEqual(avatar.allowedContentTypes, ["image/png", "image/jpeg", "image/webp"]);
  assert.equal(avatar.addRandomSuffix, true);
  assert.equal(avatar.allowOverwrite, false);
  assert.ok(avatar.validUntil > Date.now() && avatar.validUntil <= Date.now() + 5 * 60 * 1000);
  const post = uploadPolicy("uploads/user1/post/video.mp4", "user1");
  assert.equal(post.maximumSizeInBytes, 4_000_000);
  assert.ok(post.allowedContentTypes.includes("video/mp4"));
  for (const path of ["uploads/user2/avatar/photo.png", "uploads/user1/other/a", "uploads/user1/post/../a", "uploads/user1/post/..", "uploads/user1/post/%2fphoto.png", "arbitrary.html", null, {}]) {
    assert.throws(() => uploadPolicy(path, "user1"), /Invalid upload path/);
  }
});

test("media references reject base64, other stores, other owners and URL tricks before fetching", async t => {
  const head = t.mock.method(blobStorage, "head", () => assert.fail("invalid URLs must never trigger a storage request"));
  for (const value of [
    "data:image/png;base64,AAAA",
    "https://evil.example/uploads/user1/avatar/a.png",
    "https://test.public.blob.vercel-storage.com.evil.example/uploads/user1/avatar/a.png",
    "https://test.public.blob.vercel-storage.com/uploads/user2/avatar/a.png",
    "https://test.public.blob.vercel-storage.com/uploads/user1/post/a.png",
    "https://test.public.blob.vercel-storage.com/uploads/user1/avatar/a.png?x=1",
    "http://test.public.blob.vercel-storage.com/uploads/user1/avatar/a.png",
    `${avatarUrl}#fragment`,
    `${origin}/uploads/user1/avatar/nested/a.png`,
    `${origin}/uploads/user1/avatar/%2fphoto.png`,
    `${origin}/uploads/user1/avatar/../avatar/photo.png`,
    `${origin}/uploads/user1/avatar/`,
    ` ${avatarUrl}`,
    null,
    {},
  ]) assert.equal(await validateBlob(value, "user1", "avatar"), false);
  assert.equal(await validateBlob(avatarUrl, "user1", "unknown"), false);
  assert.equal(head.mock.callCount(), 0);
});

test("media references accept verified avatar and video metadata at the size limits", async t => {
  const head = t.mock.method(blobStorage, "head", async () => avatarMetadata);
  assert.equal(await validateBlob(avatarUrl, "user1", "avatar"), true);
  assert.deepEqual(head.mock.calls[0].arguments, [avatarUrl, { token: "vercel_blob_rw_test_fixture" }]);

  const videoUrl = `${origin}/uploads/user1/post/video.mp4`;
  head.mock.mockImplementation(async () => ({ url: videoUrl, pathname: "uploads/user1/post/video.mp4", contentType: "video/mp4", size: 4_000_000 }));
  assert.equal(await validateBlob(videoUrl, "user1", "post", "video"), true);
  assert.equal(await validateBlob(videoUrl, "user1", "post", "image"), false);
});

test("media references reject missing blobs and invalid server metadata", async t => {
  const head = t.mock.method(blobStorage, "head", async () => avatarMetadata);
  for (const metadata of [
    { size: 1_500_001 }, { size: 0 }, { size: -1 }, { size: "100" },
    { contentType: "text/html" }, { contentType: "image/gif" },
    { url: `${origin}/uploads/user2/avatar/photo.png` },
    { pathname: "uploads/user2/avatar/photo.png" },
  ]) {
    head.mock.mockImplementation(async () => ({ ...avatarMetadata, ...metadata }));
    assert.equal(await validateBlob(avatarUrl, "user1", "avatar"), false);
  }
  head.mock.mockImplementation(async () => { throw new Error("Blob not found"); });
  assert.equal(await validateBlob(avatarUrl, "user1", "avatar"), false);
});

test("storage configuration requires a public Vercel Blob origin", t => {
  t.after(() => { process.env.BLOB_PUBLIC_ORIGIN = origin; });
  assert.equal(blobPublicOrigin(), origin);
  for (const configuredOrigin of ["", "https://example.com", "http://test.public.blob.vercel-storage.com", `${origin}/uploads`, `${origin}?query=1`, "https://user:pass@test.public.blob.vercel-storage.com"]) {
    process.env.BLOB_PUBLIC_ORIGIN = configuredOrigin;
    assert.equal(blobPublicOrigin(), null);
  }
});
