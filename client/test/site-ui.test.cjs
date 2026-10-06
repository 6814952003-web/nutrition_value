const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const esbuild = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Compile the actual JSX modules with a shared cache. Relative imports stay
// inside this project, so tests do not need to discover parent configuration.
const sourceRoot = path.resolve(__dirname, "../src");
const projectRoot = path.resolve(sourceRoot, "../..");
const modules = new Map();
function loadUiModule(candidate) {
  const filename = [candidate, ...[".jsx", ".js", ".json"].map(extension => candidate + extension)].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!filename) throw new Error(`Missing UI fixture module: ${candidate}`);
  const relative = path.relative(projectRoot, filename);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("UI fixture imports must stay inside the project");
  if (filename.endsWith(".css")) return {};
  if (modules.has(filename)) return modules.get(filename).exports;
  if (filename.endsWith(".json")) {
    const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
    modules.set(filename, { exports: parsed });
    return parsed;
  }
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  modules.set(filename, loaded);
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = specifier => specifier.startsWith(".") ? loadUiModule(path.resolve(path.dirname(filename), specifier)) : nativeRequire(specifier);
  const compiled = esbuild.transformSync(fs.readFileSync(filename, "utf8"), {
    sourcefile: filename, loader: filename.endsWith(".jsx") ? "jsx" : "js", jsx: "automatic", format: "cjs",
  });
  loaded._compile(compiled.code, filename);
  return loaded.exports;
}
const { SiteContext, defaultSite } = loadUiModule(path.join(sourceRoot, "SiteContext"));
const { default: AuthPage } = loadUiModule(path.join(sourceRoot, "AuthPage"));
const { default: Dashboard } = loadUiModule(path.join(sourceRoot, "Dashboard"));
const { default: AdminPage } = loadUiModule(path.join(sourceRoot, "AdminPage"));
const { default: App, AccountPage, AdminRoute } = loadUiModule(path.join(sourceRoot, "App"));
const { default: CommunityPage, CommunityPost } = loadUiModule(path.join(sourceRoot, "CommunityPage"));
const user = { id: "ui-fixture-user", name: "สมาชิกทดสอบ", role: "admin" };
const noop = () => {};
const siteFixture = () => structuredClone(defaultSite);
const withStorage = (t, value) => {
  const previous = global.localStorage;
  global.localStorage = { getItem: () => value, setItem: noop };
  t.after(() => { if (previous === undefined) delete global.localStorage; else global.localStorage = previous; });
};
const render = (Component, site, props = {}) => renderToStaticMarkup(React.createElement(SiteContext.Provider,
  { value: site }, React.createElement(Component, props)));
const dashboard = site => render(Dashboard, site, { user, logout: noop, openAccount: noop, openAdmin: noop });

test("saved branding, page copy and image icons reach the login page and dashboard", t => {
  withStorage(t, "[]");
  const site = siteFixture();
  site.brand.name = "ครัวของเรา";
  site.brand.logoUrl = "https://assets.example.com/edited-logo.png";
  site.copy.auth.loginTitle = "เข้าสู่ครัวใหม่";
  site.copy.auth.loginButton = "เริ่มใช้งานครัว";
  site.copy.dashboard.heroTitle = "มื้อดีจากแอดมิน";
  site.icons.hero = "https://assets.example.com/edited-hero.png";
  const login = render(AuthPage, site, { mode: "login", setMode: noop, setUser: noop, message: "", setMessage: noop });
  const home = dashboard(site);
  for (const html of [login, home]) {
    assert.ok(html.includes("ครัวของเรา"));
    assert.ok(html.includes('src="https://assets.example.com/edited-logo.png"'));
  }
  assert.ok(login.includes("เข้าสู่ครัวใหม่"));
  assert.ok(login.includes("เริ่มใช้งานครัว"));
  assert.ok(home.includes("มื้อดีจากแอดมิน"));
  assert.ok(home.includes('src="https://assets.example.com/edited-hero.png"'));
});

test("saved meal values, nutrition goals and newly added categories appear together", t => {
  const meal = { id: "edited-meal", name: "ซุปพิเศษของเรา", tag: "หมวดใหม่จากแอดมิน", calories: 321, protein: 42, carbs: 17, fat: 9, emoji: "🍲", color: "#fedcba", photo: "" };
  withStorage(t, JSON.stringify([meal]));
  const site = siteFixture();
  site.meals = [meal];
  site.goals = { calories: 642, protein: 84, carbs: 34, fat: 18 };
  site.copy.dashboard.proteinLabel = "โปรตีนที่ปรับแล้ว";
  site.guides = [{ id: "edited-guide", title: "คู่มือใหม่", text: "รายละเอียดจากแอดมิน" }];
  const html = dashboard(site);
  assert.ok(html.includes("ซุปพิเศษของเรา"));
  assert.match(html, /<button[^>]*>หมวดใหม่จากแอดมิน<\/button>/);
  for (const value of ["321 kcal", "42g", "17g", "9g", "84g", "50%", "โปรตีนที่ปรับแล้ว", "🍲", "คู่มือใหม่", "รายละเอียดจากแอดมิน"]) {
    assert.ok(html.includes(value), `the rendered dashboard must include ${value}`);
  }
  assert.equal((html.match(/style="width:50%"/g) || []).length, 3);
  assert.ok(!html.includes(defaultSite.meals[0].name));
});

test("saved copy is escaped and damaged local nutrition history does not break rendering", t => {
  const site = siteFixture();
  site.copy.auth.loginTitle = '<img src=x onerror="alert(1)">';
  site.copy.dashboard.heroTitle = '<script>alert("saved")</script>';
  withStorage(t, "{invalid JSON");
  const login = render(AuthPage, site, { mode: "login", setMode: noop, setUser: noop, message: "", setMessage: noop });
  assert.ok(login.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(!login.includes('<img src="x"'));
  for (const damaged of ["{invalid JSON", '{"not":"an array"}', '[null,{"calories":-1,"protein":20,"carbs":2,"fat":1}]']) {
    global.localStorage.getItem = () => damaged;
    const html = dashboard(site);
    assert.ok(html.includes("&lt;script&gt;alert(&quot;saved&quot;)&lt;/script&gt;"));
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("0 kcal"));
    assert.ok(!html.includes("NaN"));
  }
});

test("admin edits remain locked until a fresh server configuration has loaded", () => {
  const site = siteFixture();
  site.revision = 4;
  site.updatedAt = "2026-10-06T08:00:00.000Z";
  const html = render(AdminPage, site, { user, site, onSaved: noop, goBack: noop, setUser: noop });
  assert.match(html, /<button[^>]*disabled=""[^>]*>บันทึกทั้งหมด<\/button>/);
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.ok(html.includes("กำลังโหลดข้อมูล…"));
  assert.ok(html.includes("ตัวอย่างแบบร่าง"));
});

test("account and community pages use saved text, categories and shared custom icons", () => {
  const site = siteFixture();
  site.brand.name = "ครัวชุมชนที่ปรับใหม่";
  site.icons.clock = "https://assets.example.com/edited-clock.png";
  site.icons.user = "https://assets.example.com/edited-user.png";
  site.copy.account.historyTitle = "ประวัติจากผู้ดูแล";
  site.copy.account.communityTitle = "เข้าสู่ชุมชนที่ปรับใหม่";
  site.copy.dashboard.communityNav = "เข้าสู่ชุมชนที่ปรับใหม่";
  Object.assign(site.copy.community, {
    title: "พื้นที่สนทนาใหม่",
    description: "เรื่องราวจากครัวของทุกคน",
    placeholder: "เขียนเรื่องราวที่นี่",
    foodCategory: "อาหารปรุงใหม่",
    recipeCategory: "สูตรของชุมชน",
    knowledgeCategory: "ความรู้จากครัว",
    workoutCategory: "กิจกรรมใหม่",
  });
  const member = { ...user, role: "user", email: "member@example.com" };
  const account = render(AccountPage, site, {
    user: member, setUser: noop, goBack: noop, goCommunity: noop, goAdmin: noop, logout: noop, sessionStartedAt: Date.now(),
  });
  for (const text of ["ครัวชุมชนที่ปรับใหม่", "ประวัติจากผู้ดูแล"]) assert.ok(account.includes(text));
  assert.ok(!account.includes("เข้าสู่ชุมชนที่ปรับใหม่"));
  assert.ok(account.includes('src="https://assets.example.com/edited-clock.png"'));
  const community = render(CommunityPage, site, { user: member, setUser: noop, goBack: noop });
  for (const text of ["พื้นที่สนทนาใหม่", "เรื่องราวจากครัวของทุกคน", "อาหารปรุงใหม่", "สูตรของชุมชน", "ความรู้จากครัว", "กิจกรรมใหม่"]) assert.ok(community.includes(text));
  assert.ok(community.includes('placeholder="เขียนเรื่องราวที่นี่"'));
  assert.ok(community.includes('src="https://assets.example.com/edited-user.png"'));
});

test("the main menu links directly to the community feed on the dashboard", t => {
  withStorage(t, "[]");
  const site = siteFixture();
  site.copy.dashboard.communityNav = "ชุมชนของเรา";
  site.copy.community.title = "ข้อความจากชุมชนบนหน้าหลัก";
  const html = render(Dashboard, site, {
    user, logout: noop, openAccount: noop, openAdmin: noop,
    community: React.createElement(CommunityPage, { user, setUser: noop, embedded: true }),
  });
  assert.match(html, /<a[^>]*href="#community"[^>]*>ชุมชนของเรา<\/a>/);
  assert.match(html, /<section[^>]*id="community"/);
  assert.ok(html.includes("ข้อความจากชุมชนบนหน้าหลัก"));
  assert.ok(html.includes(site.copy.community.placeholder));
});

test("community posts show deletion controls only for the message owner or an administrator", () => {
  const site = siteFixture();
  const post = {
    _id: "post-ui-fixture", author: "post-owner", authorName: "เจ้าของโพสต์", category: "food",
    createdAt: "2026-10-06T11:00:00.000Z", content: "ข้อความของชุมชน", likes: 3,
    comments: [
      { _id: "comment-1", author: "post-owner", authorName: "เจ้าของโพสต์", content: "ความคิดเห็นแรก" },
      { _id: "comment-2", author: "comment-owner", authorName: "ผู้แสดงความคิดเห็น", content: "ความคิดเห็นที่สอง" },
    ],
  };
  for (const [id, role, postDeletes, commentDeletes] of [
    ["post-owner", "user", 1, 1], ["comment-owner", "user", 0, 1],
    ["another-member", "user", 0, 0], ["admin-member", "admin", 1, 2],
  ]) {
    const html = render(CommunityPost, site, { post, user: { id, role }, commentDraft: "ความคิดเห็นที่กำลังพิมพ์" });
    assert.equal((html.match(/>ลบโพสต์<\/button>/g) || []).length, postDeletes);
    assert.equal((html.match(/>ลบความคิดเห็น<\/button>/g) || []).length, commentDeletes);
    assert.ok(html.includes('value="ความคิดเห็นที่กำลังพิมพ์"'));
  }
});

test("the heart remembers the account's vote and prevents another click after reloading a post", () => {
  const site = siteFixture();
  const post = {
    _id: "heart-ui-fixture", author: "another-member", authorName: "เจ้าของโพสต์", category: "food",
    createdAt: "2026-10-06T11:00:00.000Z", content: "โพสต์ที่ถูกใจได้ครั้งเดียว", likes: 2, comments: [],
  };
  const before = render(CommunityPost, site, { post: { ...post, likedByMe: false }, user });
  const after = render(CommunityPost, site, { post: { ...post, likedByMe: true }, user });
  const beforeButton = before.match(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?<\/button>/)?.[0];
  const afterButton = after.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(beforeButton && afterButton);
  assert.ok(!beforeButton.includes('disabled=""'));
  assert.ok(beforeButton.includes("♡"));
  assert.ok(afterButton.includes('disabled=""'));
  assert.ok(afterButton.includes("♥"));
  assert.ok(afterButton.includes("text-red-600"));
  assert.ok(afterButton.includes("ถูกใจแล้ว"));
});

test("the admin route explains a member's missing permission instead of rendering the dashboard", () => {
  const site = siteFixture();
  const member = { id: "member-fixture", name: "guy", email: "member@example.com", role: "user" };
  const html = render(AdminRoute, site, { user: member, site, setUser: noop, onSaved: noop, goBack: noop, onSwitchAccount: noop });
  for (const text of ["บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล", "เฉพาะบัญชีผู้ดูแลระบบ", "guy", "member@example.com", "ออกจากระบบและเข้าสู่ระบบด้วยบัญชีผู้ดูแล", "กลับหน้าหลัก"]) assert.ok(html.includes(text));
  assert.ok(html.includes('aria-labelledby="admin-access-title"'));
  assert.ok(!html.includes(site.copy.dashboard.heroTitle));
  assert.ok(!html.includes("บันทึกทั้งหมด"));
});

test("the same admin route still opens the full admin page for an administrator", () => {
  const site = siteFixture();
  const html = render(AdminRoute, site, { user, site, setUser: noop, onSaved: noop, goBack: noop, onSwitchAccount: noop });
  assert.ok(html.includes("บันทึกทั้งหมด"));
  assert.ok(html.includes("เมนูอาหาร"));
  assert.ok(!html.includes("บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล"));
});

function appStateFixture(t, view) {
  // Exercise the callbacks created by the real App, without mounting effects
  // that would contact an API. Restore all hooks and globals after this test.
  const states = [{ id: "member-fixture", name: "guy", email: "member@example.com", role: "user" }, "register", "old-message", view, siteFixture()];
  const originalHooks = { useState: React.useState, useEffect: React.useEffect, useRef: React.useRef };
  const originalGlobals = Object.fromEntries(["localStorage", "history"].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const originalRecord = api.recordSession;
  let stateIndex = 0; let token = "member-token";
  const routes = []; const durations = [];
  React.useState = () => { const index = stateIndex++; return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; };
  React.useEffect = noop;
  React.useRef = () => ({ current: Date.now() - 65000 });
  global.localStorage = { getItem: () => token, removeItem: () => { token = null; }, setItem: (key, value) => { token = value; } };
  global.history = { pushState: (state, title, pathname) => routes.push({ state, pathname }) };
  api.recordSession = async seconds => { durations.push(seconds); };
  t.after(() => {
    Object.assign(React, originalHooks); api.recordSession = originalRecord;
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }
  });
  return { states, routes, durations, token: () => token, page: () => { stateIndex = 0; return App().props.children; } };
}

test("switching the member out of /admin saves the session and keeps the admin login intent", async t => {
  const fixture = appStateFixture(t, "admin");
  const gateRoute = fixture.page();
  assert.equal(gateRoute.type, AdminRoute);
  await gateRoute.props.onSwitchAccount();
  assert.equal(fixture.token(), null);
  assert.equal(fixture.durations.length, 1);
  assert.ok(fixture.durations[0] >= 65);
  assert.deepEqual(fixture.routes, [{ state: { view: "admin" }, pathname: "/admin" }]);
  const login = fixture.page();
  assert.equal(login.type, AuthPage);
  assert.equal(login.props.adminRequested, true);
  assert.equal(login.props.mode, "login");
  assert.equal(login.props.message, "");
});

test("ordinary member routes and logout retain their existing dashboard behavior", async t => {
  const fixture = appStateFixture(t, "dashboard");
  const home = fixture.page();
  assert.equal(home.type, Dashboard);
  await home.props.logout();
  assert.equal(fixture.token(), null);
  assert.equal(fixture.durations.length, 1);
  assert.deepEqual(fixture.routes, [{ state: { view: "dashboard" }, pathname: "/" }]);
  const login = fixture.page();
  assert.equal(login.type, AuthPage);
  assert.equal(login.props.adminRequested, false);
});

test("login accepts an existing five-character password while new registration still requires six", () => {
  const site = siteFixture();
  const props = { setMode: noop, setUser: noop, message: "", setMessage: noop };
  const login = render(AuthPage, site, { ...props, mode: "login", adminRequested: true });
  const registration = render(AuthPage, site, { ...props, mode: "register" });
  const loginPassword = login.match(/<input[^>]*name="password"[^>]*>/)?.[0];
  const registerPassword = registration.match(/<input[^>]*name="password"[^>]*>/)?.[0];
  const confirmation = registration.match(/<input[^>]*name="confirmPassword"[^>]*>/)?.[0];
  assert.ok(loginPassword && registerPassword && confirmation);
  assert.ok(!/minlength=/i.test(loginPassword), "the login input must not reject an existing short password before the server verifies it");
  assert.match(registerPassword, /minlength="6"/i);
  assert.match(confirmation, /minlength="6"/i);
  assert.ok(login.includes("เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อจัดการเว็บไซต์"));
});
