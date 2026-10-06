const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model");
const { updateUser } = require("../src/controllers/user.controller");

test("editing an admin account preserves its existing avatar and join date in the response", async t => {
  const existing = {
    _id: "admin-fixture", name: "Existing name", email: "admin@example.com", role: "admin",
    avatarData: "https://assets.example.com/avatar.png", createdAt: "2026-10-01T08:00:00.000Z",
    passwordHash: "must-never-be-returned", passwordSalt: "must-never-be-returned",
  };
  t.mock.method(User, "findByIdAndUpdate", (id, updates) => ({
    select: async projection => Object.fromEntries(projection.split(" ").map(key => [key, ({ ...existing, ...updates })[key]])),
  }));
  let response;
  const res = { status: () => { assert.fail("the valid account update must succeed"); }, json: value => { response = value; } };
  await updateUser({ params: { id: existing._id }, body: { name: "Edited name" } }, res, error => { throw error; });
  assert.deepEqual(response, {
    id: existing._id, name: "Edited name", email: existing.email, role: existing.role,
    avatarData: existing.avatarData, createdAt: existing.createdAt,
  });
  assert.equal(response.passwordHash, undefined);
  assert.equal(response.passwordSalt, undefined);
});
