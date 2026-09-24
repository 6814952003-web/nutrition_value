const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");

const configure = (t, values) => {
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};

test("database connections share pending work and recover after failure", async t => {
  configure(t, { MONGO_URI: "mongodb://example.invalid/test", USE_LOCAL_MONGO: "false" });
  let finish;
  const connect = t.mock.method(mongoose, "connect", () => new Promise(resolve => { finish = resolve; }));
  const first = connectDB();
  const second = connectDB();
  assert.equal(connect.mock.callCount(), 1);
  finish();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);

  connect.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal(await connectDB(), false);
  connect.mock.mockImplementation(async () => {});
  assert.equal(await connectDB(), true);
  assert.equal(connect.mock.callCount(), 3);
});

test("warm requests reuse the open database connection", async t => {
  // Shadow Mongoose's non-configurable prototype accessor only for this test.
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => { delete mongoose.connection.readyState; });
  const connect = t.mock.method(mongoose, "connect", () => assert.fail("must reuse existing connection"));
  assert.equal(await connectDB(), true);
  assert.equal(connect.mock.callCount(), 0);
});

test("Vercel uses Atlas URI even when local Mongo and DNS overrides are set", async t => {
  const uri = "mongodb+srv://user:password@cluster.example.invalid/nutrition_value?retryWrites=true&w=majority";
  configure(t, {
    VERCEL: "1", MONGO_URI: uri, USE_LOCAL_MONGO: "true",
    LOCAL_MONGO_URI: "mongodb://127.0.0.1:27017/local",
    MONGO_DIRECT_HOSTS: "local-override.invalid:27017", MONGO_DIRECT_OPTIONS: "tls=false",
  });
  const connect = t.mock.method(mongoose, "connect", async () => {});
  assert.equal(await connectDB(), true);
  assert.equal(connect.mock.calls[0].arguments[0], uri);
});

test("missing Atlas configuration can recover without restarting the function", async t => {
  configure(t, { VERCEL: "1", MONGO_URI: undefined, USE_LOCAL_MONGO: "true" });
  const connect = t.mock.method(mongoose, "connect", async () => {});
  assert.equal(await connectDB(), false);
  assert.equal(connect.mock.callCount(), 0);
  process.env.MONGO_URI = "mongodb+srv://cluster.example.invalid/nutrition_value";
  assert.equal(await connectDB(), true);
  assert.equal(connect.mock.callCount(), 1);
});
