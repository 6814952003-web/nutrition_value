const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const User = require("../src/models/user.model");
const { provisionAdmin, ProvisioningError } = require("../scripts/provision-admin.cjs");
const fixtureEnv = { ADMIN_NAME: "Operator fixture", ADMIN_EMAIL: "operator@localhost", ADMIN_PASSWORD: "q8!Zv" };
const mockUsers = (accounts = []) => {
  let creates = 0;
  return {
    accounts,
    get creates() { return creates; },
    find: query => ({ limit: async () => accounts.filter(account => query.$or.some(clause => account.email === clause.email || account.name === clause.name)).slice(0, 2) }),
    create: async fields => { creates++; accounts.push({ ...fields }); return fields; },
  };
};

test("manual provisioning creates a hashed administrator and is idempotent with matching credentials", async () => {
  const users = mockUsers();
  const env = { ...fixtureEnv, ADMIN_NAME: "  Operator fixture  ", ADMIN_EMAIL: " OPERATOR@LOCALHOST " };
  assert.deepEqual(await provisionAdmin({ env, users }), { status: "created", name: "Operator fixture", email: "operator@localhost", role: "admin" });
  assert.equal(users.creates, 1);
  const [stored] = users.accounts;
  assert.equal(stored.role, "admin");
  assert.equal(stored.passwordHash, crypto.scryptSync(fixtureEnv.ADMIN_PASSWORD, stored.passwordSalt, 64).toString("hex"));
  assert.equal(stored.passwordSalt.length, 32);
  assert.equal(stored.password, undefined);
  const originalHash = stored.passwordHash;
  assert.deepEqual(await provisionAdmin({ env, users }), { status: "unchanged", name: "Operator fixture", email: "operator@localhost", role: "admin" });
  assert.equal(users.creates, 1);
  assert.equal(stored.passwordHash, originalHash);
});

test("manual provisioning refuses identity, role and password conflicts without changing accounts", async () => {
  const salt = "operator-fixture-salt";
  const hash = crypto.scryptSync(fixtureEnv.ADMIN_PASSWORD, salt, 64).toString("hex");
  const original = { name: fixtureEnv.ADMIN_NAME, email: fixtureEnv.ADMIN_EMAIL, role: "admin", passwordSalt: salt, passwordHash: hash };
  for (const account of [
    { ...original, name: "Different name" },
    { ...original, email: "different@example.com" },
    { ...original, role: "user" },
    { ...original, passwordHash: crypto.scryptSync("different-fixture-password", salt, 64).toString("hex") },
  ]) {
    const users = mockUsers([account]);
    const before = structuredClone(account);
    await assert.rejects(provisionAdmin({ env: fixtureEnv, users }), ProvisioningError);
    assert.equal(users.creates, 0);
    assert.deepEqual(account, before);
  }
});

test("invalid operator configuration and database failures are rejected without exposing credentials", async () => {
  const users = { find: () => assert.fail("invalid configuration must not query accounts") };
  for (const env of [{}, { ...fixtureEnv, ADMIN_NAME: " " }, { ...fixtureEnv, ADMIN_EMAIL: "bad address" },
    { ...fixtureEnv, ADMIN_PASSWORD: "" }, { ...fixtureEnv, ADMIN_PASSWORD: "x".repeat(129) }]) {
    await assert.rejects(provisionAdmin({ env, users }), ProvisioningError);
  }
  for (const failure of [new Error("private-database-connection-details"), Object.assign(new Error("private-duplicate-details"), { code: 11000 })]) {
    await assert.rejects(provisionAdmin({ env: fixtureEnv, users: { find: () => { throw failure; } } }), error => {
      assert.ok(error instanceof ProvisioningError);
      assert.ok(!error.message.includes("private-"));
      assert.ok(!error.message.includes(fixtureEnv.ADMIN_PASSWORD));
      return true;
    });
  }
});

test("importing the provisioning script performs no database connection or user write", t => {
  const database = require("../src/config/db");
  const connect = t.mock.method(database, "connectDB", () => assert.fail("module import must not connect"));
  const find = t.mock.method(User, "find", () => assert.fail("module import must not query users"));
  const create = t.mock.method(User, "create", () => assert.fail("module import must not create users"));
  delete require.cache[require.resolve("../scripts/provision-admin.cjs")];
  assert.equal(typeof require("../scripts/provision-admin.cjs").provisionAdmin, "function");
  assert.equal(connect.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});
