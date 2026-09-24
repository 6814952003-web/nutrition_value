const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const app = require("../../api/index");

test("Vercel handler serves health and rejects malformed/file-sized JSON without Atlas", async t => {
  const server = createServer(app);
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const malformed = await fetch(`${origin}/api/posts`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).message, /valid JSON/);

  const oversized = await fetch(`${origin}/api/posts`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaData: `data:image/png;base64,${"A".repeat(300_000)}` }),
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).message, /Upload files directly to Blob/);
});
