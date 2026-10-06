const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");

const sourceRoot = path.resolve(__dirname, "../src");
function loadSource(name, dependencies = {}) {
  const filename = path.join(sourceRoot, `${name}.js`);
  const compiled = esbuild.transformSync(fs.readFileSync(filename, "utf8"), { sourcefile: filename, loader: "js", format: "cjs" });
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(sourceRoot);
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = specifier => Object.hasOwn(dependencies, specifier) ? dependencies[specifier] : originalRequire(specifier);
  loaded._compile(compiled.code, filename);
  return loaded.exports;
}
const session = loadSource("session");
const { request } = loadSource("api", { "./session": session });
let sdkPut;
const { uploadFile, validateUploadFile } = loadSource("upload", {
  "./session": session,
  "./api": { request },
  "@vercel/blob/client": { put: (...args) => sdkPut(...args) },
});
const file = changes => ({ name: "มื้ออาหาร test.png", type: "image/png", size: 1024, ...changes });
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tokenResponse = () => response(200, { type: "blob.generate-client-token", clientToken: "vercel_blob_client_scoped_fixture" });
function fixture(t, token = "member-token") {
  const originals = Object.fromEntries(["localStorage", "window", "fetch", "crypto"].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const values = new Map(token ? [[session.TOKEN_KEY, token]] : []);
  const requests = []; const puts = []; const expired = [];
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  global.window = new EventTarget();
  global.window.addEventListener(session.SESSION_EXPIRED_EVENT, event => expired.push(event));
  if (!global.crypto?.randomUUID) Object.defineProperty(global, "crypto", { configurable: true, value: require("node:crypto").webcrypto });
  let answer = async () => tokenResponse();
  global.fetch = async (url, options) => { requests.push({ url, options }); return answer(url, options); };
  sdkPut = async (pathname, body, options) => { puts.push({ pathname, body, options }); return { url: `https://fixture.public.blob.vercel-storage.com/${pathname}` }; };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
    sdkPut = undefined;
  });
  return { requests, puts, expired, answer: value => { answer = value; } };
}

test("negotiates an authenticated client token and uploads PNG bytes directly to Blob", async t => {
  const { requests, puts } = fixture(t);
  const selected = file({ size: 1_500_000 });
  const progress = () => {};
  const url = await uploadFile(selected, "user-123", "site", progress);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/uploads");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer member-token");
  assert.equal(requests[0].options.cache, "no-store");
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(Object.keys(payload).sort(), ["payload", "type"]);
  assert.equal(payload.type, "blob.generate-client-token");
  assert.equal(payload.payload.clientPayload, null);
  assert.equal(payload.payload.multipart, false);
  assert.match(payload.payload.pathname, /^uploads\/user-123\/site\/[a-f\d-]+-[a-zA-Z0-9._-]+\.png$/);
  assert.ok(requests[0].options.body.length < 512, "file bytes must never enter the API JSON payload");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].pathname, payload.payload.pathname);
  assert.equal(puts[0].body, selected);
  assert.deepEqual(puts[0].options, { access: "public", token: "vercel_blob_client_scoped_fixture", contentType: "image/png", multipart: false, onUploadProgress: progress });
  assert.equal(url, `https://fixture.public.blob.vercel-storage.com/${payload.payload.pathname}`);
});

test("100 MB community photos and videos use matching multipart negotiation and preserve progress", async t => {
  const { requests, puts } = fixture(t);
  const progressEvents = [];
  const progress = event => progressEvents.push(event);
  sdkPut = async (pathname, body, options) => {
    puts.push({ pathname, body, options });
    options.onUploadProgress({ loaded: body.size, total: body.size, percentage: 100 });
    return { url: `https://fixture.public.blob.vercel-storage.com/${pathname}` };
  };
  for (const type of ["image/jpeg", "video/mp4"]) {
    const selected = file({
      type, size: 100_000_000,
      toJSON() { throw new Error("File content must not be serialized into an API request"); },
    });
    const url = await uploadFile(selected, "owner", "post", progress);
    const sent = requests.at(-1);
    const uploaded = puts.at(-1);
    const payload = JSON.parse(sent.options.body);
    assert.equal(sent.url, "/api/uploads");
    assert.ok(sent.options.body.length < 512, "100 MB files still need only a small token request");
    assert.deepEqual(Object.keys(payload.payload).sort(), ["clientPayload", "multipart", "pathname"]);
    assert.equal(payload.payload.multipart, true);
    assert.equal(uploaded.options.multipart, payload.payload.multipart);
    assert.equal(uploaded.options.contentType, type);
    assert.equal(uploaded.options.onUploadProgress, progress);
    assert.equal(uploaded.body, selected, "the original file must go directly to Blob");
    assert.equal(uploaded.pathname, payload.payload.pathname);
    assert.equal(url, `https://fixture.public.blob.vercel-storage.com/${payload.payload.pathname}`);
  }
  assert.equal(requests.length, 2);
  assert.equal(puts.length, 2);
  assert.deepEqual(progressEvents, [
    { loaded: 100_000_000, total: 100_000_000, percentage: 100 },
    { loaded: 100_000_000, total: 100_000_000, percentage: 100 },
  ]);
});

test("community uploads switch to multipart at 8 MB while avatar and site uploads stay single part", async t => {
  const { requests, puts } = fixture(t);
  for (const [purpose, size, multipart] of [
    ["post", 7_999_999, false], ["post", 8_000_000, true],
    ["avatar", 1_500_000, false], ["site", 1_500_000, false],
  ]) {
    await uploadFile(file({ size }), "owner", purpose);
    const payload = JSON.parse(requests.at(-1).options.body);
    assert.equal(payload.payload.multipart, multipart);
    assert.equal(puts.at(-1).options.multipart, multipart);
  }
});

test("the 100 MB post limit accepts every supported image and video format", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]) {
    assert.doesNotThrow(() => validateUploadFile(file({ type, size: 100_000_000 }), "post"));
  }
});

test("missing storage reports an actionable Thai error and never pretends a base64 file was uploaded", async t => {
  const { answer, puts } = fixture(t);
  answer(async () => response(503, { message: "File storage is not configured." }));
  await assert.rejects(uploadFile(file(), "owner", "post"), error => error.status === 503 && /ยังไม่ได้ตั้งค่า.*พื้นที่เก็บรูปภาพ/.test(error.message));
  assert.equal(puts.length, 0);
});

test("database unavailability is distinct from missing file storage", async t => {
  const { answer, puts } = fixture(t);
  answer(async () => response(503, { message: "Database is unavailable. Please try again later." }));
  await assert.rejects(uploadFile(file(), "owner", "post"), error => error.status === 503 && /ลองอีกครั้งในภายหลัง/.test(error.message) && !/ยังไม่ได้ตั้งค่า/.test(error.message));
  assert.equal(puts.length, 0);
});

test("a 401 token request expires the same session and returns a Thai sign-in instruction", async t => {
  const { answer, puts, expired } = fixture(t);
  answer(async () => response(401, { message: "Invalid or expired token." }));
  await assert.rejects(uploadFile(file(), "owner", "avatar"), error => error.status === 401 && /เข้าสู่ระบบใหม่/.test(error.message));
  assert.equal(session.readAccessToken(), null);
  assert.equal(expired.length, 1);
  assert.equal(puts.length, 0);
});

test("a delayed 401 from an older upload does not expire a newly signed-in session", async t => {
  const { answer, expired, puts } = fixture(t, "old-token");
  let complete;
  answer(() => new Promise(resolve => { complete = resolve; }));
  const uploading = uploadFile(file(), "owner", "post");
  assert.equal(typeof complete, "function");
  session.saveAccessToken("new-token");
  complete(response(401, { message: "Token expired." }));
  await assert.rejects(uploading, error => error.status === 401);
  assert.equal(session.readAccessToken(), "new-token");
  assert.equal(expired.length, 0);
  assert.equal(puts.length, 0);
});

test("403 permissions and 400 upload validation stay distinct from authentication errors", async t => {
  const { answer, expired, puts } = fixture(t);
  answer(async () => response(403, { message: "เฉพาะผู้ดูแลระบบเท่านั้นที่อัปโหลดรูปเว็บไซต์ได้" }));
  await assert.rejects(uploadFile(file(), "owner", "site"), error => error.status === 403 && /เฉพาะผู้ดูแลระบบ/.test(error.message));
  answer(async () => response(400, { message: "Unable to authorize this upload." }));
  await assert.rejects(uploadFile(file(), "owner", "post"), error => error.status === 400 && /ชนิดและขนาดไฟล์/.test(error.message));
  assert.equal(session.readAccessToken(), "member-token");
  assert.equal(expired.length, 0);
  assert.equal(puts.length, 0);
});

test("network failures can be retried with a new scoped token request", async t => {
  const { answer, requests, puts } = fixture(t);
  answer(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(uploadFile(file(), "owner", "post"), error => /ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง/.test(error.message));
  answer(async () => tokenResponse());
  const url = await uploadFile(file(), "owner", "post");
  assert.match(url, /^https:\/\/fixture\.public\.blob\.vercel-storage\.com\//);
  assert.equal(requests.length, 2);
  assert.notEqual(JSON.parse(requests[0].options.body).payload.pathname, JSON.parse(requests[1].options.body).payload.pathname);
  assert.equal(puts.length, 1);
});

test("the SDK's double-space token error is translated instead of exposed or converted to base64", async t => {
  fixture(t);
  sdkPut = async () => { throw new Error("Vercel Blob: Failed to  retrieve the client token"); };
  await assert.rejects(uploadFile(file(), "owner", "post"), error => /ขอสิทธิ์อัปโหลดไม่สำเร็จ/.test(error.message) && !/Vercel Blob/.test(error.message));
});

test("oversized, empty and unsupported files are rejected before any API or Blob request", async t => {
  const { requests, puts } = fixture(t);
  await assert.rejects(uploadFile(file({ size: 1_500_001 }), "owner", "site"), /1.5 MB/);
  await assert.rejects(uploadFile(file({ size: 1_500_001 }), "owner", "avatar"), /1.5 MB/);
  await assert.rejects(uploadFile(file({ size: 100_000_001 }), "owner", "post"), /100 MB/);
  await assert.rejects(uploadFile(file({ size: 0 }), "owner", "post"), /ไฟล์ที่มีข้อมูล/);
  await assert.rejects(uploadFile(file({ type: "text/html" }), "owner", "post"), /ชนิดไฟล์ไม่รองรับ/);
  await assert.rejects(uploadFile(file({ type: "video/mp4" }), "owner", "avatar"), /ชนิดไฟล์ไม่รองรับ/);
  assert.equal(requests.length, 0);
  assert.equal(puts.length, 0);
  assert.doesNotThrow(() => validateUploadFile(file({ type: "video/mp4", size: 100_000_000 }), "post"));
});

test("anonymous uploads and invalid owner paths cannot manufacture local upload success", async t => {
  const { requests, puts } = fixture(t, null);
  await assert.rejects(uploadFile(file(), "owner", "post"), error => error.status === 401 && /เข้าสู่ระบบก่อน/.test(error.message));
  session.saveAccessToken("member-token");
  await assert.rejects(uploadFile(file(), "other/owner", "post"), error => error.status === 400);
  await assert.rejects(uploadFile(file(), "owner", "unknown"), /ประเภทการอัปโหลดไม่ถูกต้อง/);
  assert.equal(requests.length, 0); assert.equal(puts.length, 0);
});

test("malformed negotiation responses stop before passing invalid credentials to the SDK", async t => {
  const { answer, puts } = fixture(t);
  for (const body of [{}, { type: "blob.generate-client-token", clientToken: "secret-read-write-token" }, { type: "blob.upload-completed", clientToken: "vercel_blob_client_test" }]) {
    answer(async () => response(200, body));
    await assert.rejects(uploadFile(file(), "owner", "post"), error => error.code === "UPLOAD_TOKEN_INVALID");
  }
  assert.equal(puts.length, 0);
});

test("only public HTTPS Blob URLs for the same owner and purpose are returned", async t => {
  fixture(t);
  const invalid = ["data:image/png;base64,YQ==", "http://fixture.public.blob.vercel-storage.com/uploads/owner/post/test.png", "https://fixture.private.blob.vercel-storage.com/uploads/owner/post/test.png", "https://images.example.com/test.png", "https://fixture.public.blob.vercel-storage.com/uploads/other/post/test.png", "https://fixture.public.blob.vercel-storage.com/uploads/owner/site/test.png", "https://fixture.public.blob.vercel-storage.com/uploads/owner/post/test.png?token=secret", "https://fixture.public.blob.vercel-storage.com/uploads/owner/post/test.png#fragment"];
  for (const url of invalid) {
    sdkPut = async () => ({ url });
    await assert.rejects(uploadFile(file(), "owner", "post"), error => error.code === "UPLOAD_URL_INVALID");
  }
});
