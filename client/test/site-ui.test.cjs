const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Bundle all components together so the provider and consumers share the same
// SiteContext instance. Render actual JSX using the project's existing tools.
const sourceRoot = path.resolve(__dirname, "../src");
const compiled = esbuild.buildSync({
  stdin: {
    contents: 'export { SiteContext, defaultSite } from "./SiteContext"; export { default as AuthPage } from "./AuthPage"; export { default as Dashboard } from "./Dashboard"; export { default as AdminPage } from "./AdminPage"; export { AccountPage, CommunityPage } from "./App"; export { CommunityPost } from "./CommunityPage";',
    resolveDir: sourceRoot,
    sourcefile: "site-ui-test-entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
  logLevel: "silent",
});
const bundleFilename = path.join(sourceRoot, "site-ui-test-bundle.cjs");
const loaded = new Module(bundleFilename, module);
loaded.filename = bundleFilename;
loaded.paths = Module._nodeModulePaths(sourceRoot);
loaded._compile(compiled.outputFiles[0].text, bundleFilename);
const { SiteContext, defaultSite, AuthPage, Dashboard, AdminPage, AccountPage, CommunityPage, CommunityPost } = loaded.exports;
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
