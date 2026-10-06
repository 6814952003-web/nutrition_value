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
const { default: Dashboard, summarizeFoodLogs } = loadUiModule(path.join(sourceRoot, "Dashboard"));
const { default: AdminPage } = loadUiModule(path.join(sourceRoot, "AdminPage"));
const { default: App, AccountPage, AdminRoute, resolveAppView } = loadUiModule(path.join(sourceRoot, "App"));
const { default: PublicProfilePage, PublicProfileView } = loadUiModule(path.join(sourceRoot, "PublicProfilePage"));
const { default: ProfileSettings, savedProfileFields, validateProfileFields } = loadUiModule(path.join(sourceRoot, "ProfileSettings"));
const { default: CommunityPage, CommunityPost } = loadUiModule(path.join(sourceRoot, "CommunityPage"));
const { default: AuthorProfileLink, AuthorProfileCard, profileCardPosition } = loadUiModule(path.join(sourceRoot, "AuthorProfileLink"));
const { CatalogDetail, CatalogGrid, FoodLogDialog, filterCatalog, ImageCredits } = loadUiModule(path.join(sourceRoot, "Catalog"));
const { CatalogEmoji, catalogEmoji, catalogEmojiById } = loadUiModule(path.join(sourceRoot, "catalog-emoji"));
const { matchBatchImages, validateBatchImages, energyPruneCounts } = loadUiModule(path.join(sourceRoot, "CatalogAdmin"));
const { default: FoodLogHistory } = loadUiModule(path.join(sourceRoot, "FoodLogs"));
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

test("legacy site meals stay removed while the dashboard catalog and nutrition tracker remain", t => {
  const legacyMeal = { id: "old-menu-item", name: "เมนูเก่าที่ต้องไม่แสดง", tag: "หมวดเดิม", calories: 321, protein: 42, carbs: 17, fat: 9 };
  withStorage(t, "[]");
  const site = siteFixture();
  site.meals = [legacyMeal];
  site.goals = { calories: 642, protein: 84, carbs: 34, fat: 18 };
  site.copy.dashboard.menuTitle = "เมนูจากคลัง";
  site.guides = [{ id: "edited-guide", title: "คู่มือใหม่", text: "รายละเอียดจากแอดมิน" }];
  const html = dashboard(site);
  assert.ok(html.includes('id="menu"'));
  assert.ok(html.includes("เมนูจากคลัง"));
  assert.ok(html.includes("84g"));
  assert.ok(html.includes("0%"));
  assert.ok(!html.includes("เมนูเก่าที่ต้องไม่แสดง"));
  for (const value of ["คู่มือใหม่", "รายละเอียดจากแอดมิน"]) {
    assert.ok(html.includes(value), `the rendered dashboard must include ${value}`);
  }
});

test("dashboard tracker totals use saved food-log snapshots and preserve unknown nutrients", () => {
  assert.deepEqual(summarizeFoodLogs([
    { nutrients: { energyKcal: 350, proteinG: 20, carbohydrateG: 45, fatG: 8 } },
    { nutrients: { energyKcal: 150, proteinG: 10, carbohydrateG: 25, fatG: 4 } },
  ]), {
    totals: { calories: 500, protein: 30, carbs: 70, fat: 12 },
    incomplete: { calories: false, protein: false, carbs: false, fat: false },
  });
  assert.deepEqual(summarizeFoodLogs([
    { nutrients: { energyKcal: null, proteinG: 10, carbohydrateG: 2, fatG: 1 } },
  ]), {
    totals: { calories: 0, protein: 10, carbs: 2, fat: 1 },
    incomplete: { calories: true, protein: false, carbs: false, fat: false },
  });
  assert.deepEqual(summarizeFoodLogs([]), {
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    incomplete: { calories: false, protein: false, carbs: false, fat: false },
  });
});

test("catalog cards provide search, category filtering, placeholders, credits, and the nutrition disclaimer", () => {
  const ingredients = [
    { id: "pork", nameTh: "หมูสับ", nameEn: "Ground pork", category: "เนื้อสัตว์", state: "raw", nutrients: { energyKcal: 200 }, referenceGrams: 100, image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true },
    { id: "rice", nameTh: "ข้าวสวย", nameEn: "Cooked rice", category: "ธัญพืช", state: "cooked", nutrients: { energyKcal: 130 }, referenceGrams: 100, image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true },
  ];
  assert.deepEqual(filterCatalog(ingredients, "ground", ""), [ingredients[0]]);
  assert.deepEqual(filterCatalog(ingredients, "", "ธัญพืช"), [ingredients[1]]);
  const recipe = { id: "kaprao", nameTh: "กะเพราหมู", nameEn: "Pork basil stir-fry", category: "ตามสั่ง", servingGrams: 350, nutrients: { energyKcal: null }, ingredients: [], image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true };
  const catalog = { ingredients, recipes: [recipe] };
  const html = render(CatalogGrid, siteFixture(), { catalog });
  assert.ok(html.includes('type="search"'));
  assert.ok(html.includes("<option value=\"ตามสั่ง\">ตามสั่ง</option>"));
  assert.ok(html.includes("กะเพราหมู"));
  assert.ok(html.includes("บันทึกว่ากินแล้ว"));
  assert.ok(html.includes('aria-label="บันทึกว่ากินแล้ว กะเพราหมู"'));
  assert.ok(html.includes("🐖🍚"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("ค่าโภชนาการเป็นค่าประมาณ"));
  const credits = render(ImageCredits, siteFixture(), { catalog });
  assert.equal((credits.match(/ใช้อิโมจิชั่วคราว · ยังไม่มีเครดิตรูปถ่าย/g) || []).length, 3);
  assert.ok(credits.includes("แสดงอิโมจิแทนรูปอาหารชั่วคราว"));
  assert.ok(!credits.includes("<img"));
});

test("every retained catalog seed item has a specific emoji mapping", () => {
  const ingredients = [
    ...loadUiModule(path.resolve(projectRoot, "shared/catalog-ingredients.json")),
    ...loadUiModule(path.resolve(projectRoot, "shared/catalog-extra-ingredients.json")),
  ];
  const recipes = loadUiModule(path.resolve(projectRoot, "shared/catalog-recipes.json"));
  for (const item of ingredients) {
    assert.ok(catalogEmojiById[item.id], `ingredient ${item.id} needs a specific emoji`);
  }
  for (const [id, nameTh] of recipes) {
    assert.ok(catalogEmojiById[id], `recipe ${id} needs a specific emoji`);
    assert.ok(catalogEmoji({ id, nameTh }, "recipes"));
  }
  const html = render(CatalogEmoji, siteFixture(), { item: ingredients[0], kind: "ingredients" });
  assert.ok(html.includes(`aria-label="วัตถุดิบ ${ingredients[0].nameTh}"`));
  assert.ok(html.includes(catalogEmojiById[ingredients[0].id]));
});

test("emoji fallback matches older recipe and ingredient food-log names", () => {
  assert.equal(catalogEmoji({ nameTh: "ต้มยำกุ้งน้ำข้น" }, "recipes"), "🦐🍲");
  assert.equal(catalogEmoji({ nameTh: "ข้าวต้มปลา" }, "recipes"), "🐟🍲");
  assert.equal(catalogEmoji({ nameTh: "มะนาว" }, "ingredients"), "🍋");
  assert.equal(catalogEmoji({ nameTh: "ต้นหอม" }, "ingredients"), "🌿");
});

test("every recipe card has its own visible and accessible food-log action", () => {
  const ingredients = [{ id: "rice", nameTh: "ข้าวสวย", nameEn: "Cooked rice", category: "ธัญพืช", state: "cooked", nutrients: {}, referenceGrams: 100, image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true }];
  const recipes = Array.from({ length: 100 }, (_, index) => ({
    id: `menu-${index}`, nameTh: `เมนู ${index + 1}`, nameEn: `Menu ${index + 1}`, category: "อาหาร",
    servingGrams: 300, nutrients: { energyKcal: null }, ingredients: [{ ingredientId: "rice", grams: 100 }],
    image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true,
  }));
  const html = render(CatalogGrid, siteFixture(), { catalog: { ingredients, recipes } });
  assert.equal((html.match(/class="catalog-button catalog-card-log-button"/g) || []).length, 100);
  assert.equal((html.match(/aria-label="บันทึกว่ากินแล้ว เมนู \d+"/g) || []).length, 100);
});

test("ingredient cards and details do not expose a food-log action", t => {
  const originals = { useState: React.useState, useMemo: React.useMemo, useEffect: React.useEffect };
  let stateIndex = 0;
  React.useState = initial => [stateIndex++ === 0 ? "ingredients" : typeof initial === "function" ? initial() : initial, noop];
  React.useMemo = calculate => calculate();
  React.useEffect = noop;
  t.after(() => Object.assign(React, originals));
  const ingredient = { id: "rice", nameTh: "ข้าวสวย", nameEn: "Cooked rice", category: "ธัญพืช", state: "cooked", referenceGrams: 100, nutrients: { energyKcal: 130 }, image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true };
  const html = render(CatalogGrid, siteFixture(), { catalog: { ingredients: [ingredient], recipes: [] } });
  const detail = render(CatalogDetail, siteFixture(), { item: ingredient, kind: "ingredients", ingredients: [ingredient], onClose: noop, onSaveRecipe: noop });
  assert.ok(!html.includes('aria-label="บันทึกว่ากินแล้ว ข้าวสวย"'));
  assert.ok(!html.includes("บันทึกว่ากินแล้ว"));
  assert.ok(!detail.includes("บันทึกว่ากินแล้ว"));
  assert.ok(html.includes("🍚"));
  assert.ok(detail.includes("🍚"));
  assert.ok(!detail.includes("<img"));
  assert.ok(detail.includes("ยังไม่มีข้อมูลจากแหล่งอ้างอิง"));
});

test("batch photo selection matches record IDs and validates ownership, credits, and duplicates", () => {
  const items = [
    { id: "kaprao-pork", needsImage: true },
    { id: "tom-yum", needsImage: true },
    { id: "pork", needsImage: false },
  ];
  const files = [
    { name: "kaprao-pork.jpg", lastModified: 1, size: 100 },
    { name: "photo-2.webp", lastModified: 2, size: 200 },
  ];
  const rows = matchBatchImages(files, items);
  assert.equal(rows[0].itemId, "kaprao-pork");
  assert.equal(rows[1].itemId, "");
  assert.equal(validateBatchImages(rows, items, "ผู้ถ่าย", true), "กรุณาเลือกรายการเมนูหรือวัตถุดิบให้ครบทุกภาพ");
  rows[1].itemId = "tom-yum";
  assert.equal(validateBatchImages(rows, items, "ผู้ถ่าย", true), "");
  assert.match(validateBatchImages(rows, items, "", true), /ชื่อผู้ถ่าย/);
  assert.match(validateBatchImages(rows, items, "ผู้ถ่าย", false), /ยืนยันว่ามีสิทธิ์/);
  assert.match(validateBatchImages([{ ...rows[0] }, { ...rows[1], itemId: rows[0].itemId }], items, "ผู้ถ่าย", true), /หลายภาพกับรายการเดียวกัน/);
  assert.match(validateBatchImages(rows, items.map(item => ({ ...item, needsImage: false })), "ผู้ถ่าย", true), /มีรูปแล้ว/);
  assert.match(validateBatchImages(Array(11).fill(rows[0]), items, "ผู้ถ่าย", true), /1–10/);
});

test("admin energy-prune preview counts only ingredients and recipes without calculated energy", () => {
  assert.deepEqual(energyPruneCounts({
    ingredients: [{ nutrients: { energyKcal: 120 } }, { nutrients: { energyKcal: null } }, { nutrients: {} }],
    recipes: [{ nutrients: { energyKcal: 350 } }, { nutrients: { energyKcal: null } }],
  }), { ingredients: 2, recipes: 1 });
});

test("menu logging requires an explicit action and prompts signed-out visitors to log in", t => {
  const previous = global.localStorage;
  global.localStorage = { getItem: () => null };
  t.after(() => { if (previous === undefined) delete global.localStorage; else global.localStorage = previous; });
  const recipe = { id: "kaprao", nameTh: "กะเพราหมู", nameEn: "Pork basil stir-fry", category: "ตามสั่ง", servingGrams: 350, nutrients: { energyKcal: null }, ingredients: [], image: { imageUrl: "/images/catalog/placeholder.svg" }, needsImage: true };
  const dialog = render(FoodLogDialog, siteFixture(), { item: recipe, onClose: noop });
  assert.ok(dialog.includes("กรุณาเข้าสู่ระบบก่อนบันทึกการกิน"));
  assert.ok(dialog.includes('href="/">เข้าสู่ระบบ</a>'));
  const history = render(FoodLogHistory, siteFixture(), { goals: defaultSite.goals });
  assert.ok(history.includes("บันทึกการกิน"));
  assert.ok(history.includes("เป็นส่วนตัว"));
  assert.ok(history.includes("ไม่แสดงบนโปรไฟล์สาธารณะ"));
});

test("food-log dialog defaults to one recipe serving and offers meal/date selection", t => {
  withStorage(t, "test-token");
  const recipe = { id: "menu", nameTh: "เมนูทดสอบ" };
  const dialog = render(FoodLogDialog, siteFixture(), { item: recipe, onClose: noop });
  assert.ok(dialog.includes("จำนวนเสิร์ฟ"));
  assert.ok(dialog.includes('value="1"'));
  assert.ok(!dialog.includes("ปริมาณวัตถุดิบ"));
  assert.ok(dialog.includes("มื้ออาหาร"));
  assert.ok(dialog.includes("วันที่และเวลา"));
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
  let stateIndex = 0; let refIndex = 0; let token = "member-token";
  const refs = [];
  const routes = []; const durations = [];
  const effects = [];
  React.useState = () => { const index = stateIndex++; return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; };
  React.useEffect = callback => effects.push(callback);
  React.useRef = initial => { const index = refIndex++; return refs[index] ||= { current: index === 0 ? Date.now() - 65000 : initial }; };
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
  return { states, routes, durations, effects, token: () => token, page: () => { stateIndex = 0; refIndex = 0; return App().props.children; } };
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

const publicProfile = () => ({
  avatarUrl: "https://assets.example.com/profile.png", displayName: "เพื่อนชุมชน", bio: "บรรทัดแรก\n<script>unsafe</script>",
  joinedAt: "2026-10-01T00:00:00.000Z", streak: 4,
  posts: [{ _id: "public-post", content: "ข้อความสาธารณะ", category: "food", mediaData: "https://assets.example.com/portrait.jpg", mediaType: "image", createdAt: "2026-10-06T11:00:00.000Z", likes: 2, commentCount: 3 }],
  foodLogs: [],
});

test("public URL parsing takes precedence over stale member/admin history and safely rejects malformed paths", () => {
  for (const pathname of ["/u/nouri_friend", "/u/NOURI_friend", "/u/nouri_friend/"]) {
    assert.equal(resolveAppView(pathname, { view: "admin" }), "public:nouri_friend");
  }
  for (const pathname of ["/u/%E0%A4%A", "/u/a%2Fb", "/u/two/parts", "/u/", "/u", "/u/ab", "/u/%25foo"]) {
    assert.equal(resolveAppView(pathname, { view: "account" }), "public:");
  }
  assert.equal(resolveAppView("/admin", { view: "dashboard" }), "admin");
  assert.equal(resolveAppView("/", { view: "account" }), "account");
  assert.equal(resolveAppView("/", { view: "profile-preview" }), "profile-preview");
  assert.equal(resolveAppView("/", { view: "public:stale" }), "dashboard");
  const shared = render(PublicProfileView, siteFixture(), { profile: { ...publicProfile(), foodLogs: [{ id: "log-1", menuName: "ข้าวผัดหมู", imageUrl: "/images/catalog/placeholder.svg", meal: "lunch", servings: 1, eatenAt: "2026-10-06T11:00:00.000Z", nutrients: { energyKcal: 450, proteinG: 20, carbohydrateG: 50, fatG: 15, sodiumMg: 700 } }] } });
  assert.ok(shared.includes("บันทึกการกินที่แชร์"));
  assert.ok(shared.includes("ข้าวผัดหมู"));
  assert.ok(shared.includes("450 kcal"));
});

test("public profiles bypass the authentication page for visitors and signed-in users", t => {
  const fixture = appStateFixture(t, "public:nouri_friend");
  fixture.states[0] = null;
  let page = fixture.page();
  assert.equal(page.type, PublicProfilePage);
  assert.equal(page.props.username, "nouri_friend");
  fixture.states[0] = { id: "private-user", email: "private@example.com", health: "private-health", role: "admin" };
  page = fixture.page();
  assert.equal(page.type, PublicProfilePage);
  assert.ok(!Object.hasOwn(page.props, "user"));
  fixture.states[3] = "public:";
  assert.equal(fixture.page().type, PublicProfilePage);
});

test("public routes skip owner session data and leaving restores only the account matching the current token", async t => {
  const fixture = appStateFixture(t, "public:nouri_friend");
  fixture.states[0] = null;
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const previousMe = api.me; let calls = 0; let resolve;
  api.me = () => { calls++; return new Promise(done => { resolve = done; }); };
  t.after(() => { api.me = previousMe; });
  fixture.page();
  assert.equal(fixture.effects[3](), undefined);
  assert.equal(fixture.effects[5](), undefined);
  assert.equal(calls, 0);
  fixture.states[3] = "dashboard"; fixture.effects.length = 0; fixture.page();
  const cleanup = fixture.effects[3]();
  assert.equal(calls, 1);
  const newAccount = { id: "new-account", email: "new@example.com" };
  global.localStorage.setItem("nouri-token", "new-account-token"); fixture.states[0] = newAccount;
  resolve({ id: "old-account", email: "old@example.com" });
  await Promise.resolve();
  assert.deepEqual(fixture.states[0], newAccount);
  cleanup();
});

test("browser back and forward follow the public pathname and restore the private account view", t => {
  const fixture = appStateFixture(t, "account");
  const previousWindow = global.window; const previousLocation = global.location;
  const listeners = {};
  global.window = { addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener: name => { delete listeners[name]; }, dispatchEvent: () => true };
  global.location = { pathname: "/" };
  t.after(() => { if (previousWindow === undefined) delete global.window; else global.window = previousWindow; if (previousLocation === undefined) delete global.location; else global.location = previousLocation; });
  fixture.page();
  const cleanup = fixture.effects[2]();
  global.location.pathname = "/u/nouri_friend";
  listeners.popstate({ state: { view: "account" } });
  assert.equal(fixture.states[3], "public:nouri_friend");
  global.location.pathname = "/";
  listeners.popstate({ state: { view: "account" } });
  assert.equal(fixture.states[3], "account");
  cleanup();
  assert.equal(listeners.popstate, undefined);
});

test("visitor preview keeps private drafts for returning to settings and respects saved privacy", t => {
  const fixture = appStateFixture(t, "account");
  const owner = { ...fixture.states[0], username: "saved_owner", profileVisibility: "private" };
  fixture.states[0] = owner;
  const draft = { username: "unsaved_owner", displayName: "Unsaved name", bio: "Unsaved bio", profileVisibility: "public" };
  fixture.page().props.onPreview(draft);
  const preview = fixture.page();
  assert.equal(preview.type, PublicProfilePage);
  assert.equal(preview.props.preview, true);
  assert.equal(preview.props.isPrivate, true);
  assert.ok(!Object.hasOwn(preview.props, "user"));
  assert.ok(!Object.hasOwn(preview.props, "draft"));
  preview.props.onBack();
  const settings = fixture.page();
  assert.equal(settings.type, AccountPage);
  assert.deepEqual(settings.props.initialDraft, draft);
  assert.deepEqual(fixture.states[0], owner);
  fixture.states[0] = { ...owner, id: "different-owner" };
  assert.equal(fixture.page().props.initialDraft, undefined);
});

test("public profile rendering exposes only its display fields and read-only posts, with full media proportions", () => {
  const profile = publicProfile();
  Object.assign(profile, { email: "secret@example.com", health: "medical-private", role: "admin", onlineSeconds: 999, username: "secret-username" });
  Object.assign(profile.posts[0], { authorEmail: "author-secret@example.com", author: "private-owner-id", likedBy: ["private-liker-id"], comments: [{ authorName: "private-comment-name", content: "private-comment-text" }] });
  const html = render(PublicProfileView, siteFixture(), { profile, onBack: noop });
  for (const visible of ["เพื่อนชุมชน", "บรรทัดแรก", "4 วันต่อเนื่อง", "ข้อความสาธารณะ", "2 หัวใจ", "3 ความคิดเห็น", "เข้าร่วมเมื่อ"]) assert.ok(html.includes(visible));
  for (const hidden of ["secret@example.com", "medical-private", "secret-username", "author-secret@example.com", "private-owner-id", "private-liker-id", "private-comment-name", "private-comment-text"]) assert.ok(!html.includes(hidden));
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<img[^>]*portrait\.jpg[^>]*class="[^"]*h-auto w-auto max-w-full[^"]*object-contain/);
  assert.ok(!html.includes("max-h-96"));
  assert.ok(!html.includes("<textarea"));
  assert.ok(!html.includes("<form"));
  assert.ok(!html.includes("aria-pressed"));
  assert.ok(!html.includes("ลบโพสต์"));
  profile.posts[0].mediaType = "video"; profile.posts[0].mediaData = "https://assets.example.com/portrait.mp4";
  const video = render(PublicProfileView, siteFixture(), { profile });
  assert.match(video, /<video[^>]*controls=""[^>]*playsinline=""[^>]*preload="metadata"/);
  assert.ok(video.includes("h-auto w-auto max-w-full"));
});

test("private and missing profiles use the same unavailable visitor state and private previews hide owner contents", () => {
  const missing = render(PublicProfileView, siteFixture(), { error: "unavailable" });
  const privateProfile = render(PublicProfileView, siteFixture(), { error: "unavailable" });
  assert.equal(privateProfile, missing);
  assert.ok(missing.includes("ไม่สามารถดูโปรไฟล์นี้ได้"));
  const preview = render(PublicProfileView, siteFixture(), { profile: publicProfile(), preview: true, isPrivate: true });
  assert.ok(preview.includes("โปรไฟล์ที่บันทึกแล้วยังเป็นส่วนตัว"));
  assert.ok(preview.includes("ไม่สามารถดูโปรไฟล์นี้ได้"));
  for (const hidden of ["เพื่อนชุมชน", "ข้อความสาธารณะ", "portrait.jpg"]) assert.ok(!preview.includes(hidden));
  const published = render(PublicProfileView, siteFixture(), { profile: publicProfile(), preview: true, isPrivate: false });
  assert.ok(published.includes("ข้อความสาธารณะ"));
  assert.ok(published.includes("ข้อมูลที่บันทึกแล้ว"));
  assert.ok(!published.includes("บันทึกการกินที่แชร์"));
});

test("existing accounts default private and settings explain saved visibility with blank usernames allowed only privately", () => {
  const member = { id: "new-settings", name: "ชื่อปัจจุบัน", email: "private@example.com" };
  assert.equal(savedProfileFields(member).profileVisibility, "private");
  assert.equal(savedProfileFields(member).shareFoodLogs, false);
  const html = render(ProfileSettings, siteFixture(), { user: member, setUser: noop, onPreview: noop });
  assert.match(html, /type="radio"[^>]*name="profileVisibility"[^>]*checked=""[^>]*value="private"/);
  assert.ok(html.includes("ชื่อปัจจุบัน"));
  assert.ok(html.includes("โพสต์ในชุมชนยังแสดงในชุมชนตามเดิม"));
  assert.ok(html.includes("แชร์บันทึกการกินบนโปรไฟล์สาธารณะ"));
  assert.ok(html.includes("ทุกวันที่คุณเคยบันทึก"));
  assert.ok(html.includes("พรีวิวแสดงข้อมูลที่บันทึกแล้วเท่านั้น"));
  assert.equal(validateProfileFields({ ...savedProfileFields(member), username: "" }), "");
  assert.ok(validateProfileFields({ ...savedProfileFields(member), profileVisibility: "public" }));
  for (const username of ["a", "UPPERCASE", "contains space", "ไทย", "a".repeat(31)]) assert.ok(validateProfileFields({ ...savedProfileFields(member), username }));
  assert.equal(validateProfileFields({ ...savedProfileFields(member), username: "nouri_friend-1", profileVisibility: "public" }), "");
  assert.ok(validateProfileFields({ ...savedProfileFields(member), displayName: "  " }));
  assert.ok(validateProfileFields({ ...savedProfileFields(member), bio: "a".repeat(301) }));
});

test("profile API uses an anonymous encoded URL while owner preview and editing remain authenticated", async t => {
  const previousFetch = global.fetch; const previousStorage = global.localStorage;
  const calls = [];
  global.localStorage = { getItem: () => "owner-token" };
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; };
  t.after(() => { global.fetch = previousFetch; if (previousStorage === undefined) delete global.localStorage; else global.localStorage = previousStorage; });
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const controller = new AbortController();
  await api.publicProfile("name/a", { signal: controller.signal, auth: true });
  await api.publicPreview({ signal: controller.signal });
  await api.updateMyProfile({ username: "nouri_friend", displayName: "เพื่อน", bio: "", profileVisibility: "private" });
  assert.equal(calls[0].url, "/api/profiles/name%2Fa");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[1].url, "/api/users/me/public-preview");
  assert.equal(calls[1].options.headers.Authorization, "Bearer owner-token");
  assert.equal(calls[2].url, "/api/users/me/profile");
  assert.equal(calls[2].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[2].options.body), { username: "nouri_friend", displayName: "เพื่อน", bio: "", profileVisibility: "private" });
});

function componentStateFixture(t, Component, props) {
  const original = { useState: React.useState, useEffect: React.useEffect };
  const states = []; let index = 0;
  React.useState = initial => {
    const key = index++;
    if (!Object.hasOwn(states, key)) states[key] = typeof initial === "function" ? initial() : initial;
    return [states[key], next => { states[key] = typeof next === "function" ? next(states[key]) : next; }];
  };
  React.useEffect = noop;
  t.after(() => Object.assign(React, original));
  return { states, page: next => { index = 0; return Component({ ...props, ...next }); } };
}
function findElement(element, predicate) {
  if (!React.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("profile saving waits for server success, handles failure, and avatar updates preserve drafts", async t => {
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const previousUpdate = api.updateMyProfile;
  t.after(() => { api.updateMyProfile = previousUpdate; });
  const member = { id: "owner", name: "ชื่อเก่า", username: "owner_name", displayName: "ชื่อเก่า", bio: "ไบโอเก่า", profileVisibility: "private" };
  const saved = []; const requests = []; const previews = [];
  const fixture = componentStateFixture(t, ProfileSettings, { user: member, setUser: value => saved.push(value), onPreview: draft => previews.push(draft) });
  let page = fixture.page();
  findElement(page, element => element.props.id === "profile-bio").props.onChange({ target: { value: "ไบโอที่ยังไม่บันทึก" } });
  page = fixture.page({ user: { ...member, avatarData: "new-avatar" } });
  assert.equal(findElement(page, element => element.props.id === "profile-bio").props.value, "ไบโอที่ยังไม่บันทึก");
  let resolve;
  api.updateMyProfile = data => { requests.push(data); return new Promise(done => { resolve = done; }); };
  const pending = findElement(page, element => element.type === "form").props.onSubmit({ preventDefault: noop });
  assert.equal(saved.length, 0);
  assert.equal(fixture.states[1], true);
  assert.equal(requests[0].bio, "ไบโอที่ยังไม่บันทึก");
  assert.ok(!Object.hasOwn(requests[0], "avatarData"));
  resolve({ ...member, ...requests[0], avatarData: "new-avatar" });
  await pending;
  assert.equal(saved.length, 1);
  assert.equal(fixture.states[1], false);
  assert.equal(fixture.states[2], "บันทึกโปรไฟล์แล้ว");
  page = fixture.page();
  findElement(page, element => element.props.id === "profile-bio").props.onChange({ target: { value: "เก็บฉบับร่างแม้บันทึกไม่ผ่าน" } });
  page = fixture.page();
  api.updateMyProfile = async () => { throw new Error("ชื่อผู้ใช้นี้มีคนใช้แล้ว"); };
  await findElement(page, element => element.type === "form").props.onSubmit({ preventDefault: noop });
  assert.equal(saved.length, 1);
  assert.equal(fixture.states[0].bio, "เก็บฉบับร่างแม้บันทึกไม่ผ่าน");
  assert.equal(fixture.states[3], "ชื่อผู้ใช้นี้มีคนใช้แล้ว");
  page = fixture.page();
  findElement(page, element => element.type === "button" && element.props.type === "button").props.onClick();
  assert.equal(previews.length, 1);
  assert.equal(saved.length, 1);
});

test("community avatar and name share a real public profile link and comment names use their own current username", () => {
  const post = { _id: "linked-post", author: "member", authorName: "ชื่อที่ไม่ใช่ username", authorAvatar: "https://assets.example.com/avatar.jpg", authorUsername: "current_author", category: "food", content: "โพสต์", createdAt: "2026-10-06T11:00:00Z", comments: [{ _id: "comment", authorName: "ผู้แสดงความคิดเห็น", authorUsername: "comment_author", content: "ความคิดเห็น" }] };
  const html = render(CommunityPost, siteFixture(), { post, user });
  assert.match(html, /<a[^>]*href="\/u\/current_author"[^>]*><span class="nouri-author-avatar"><img[^>]*avatar\.jpg/);
  assert.match(html, /href="\/u\/comment_author"/);
  assert.equal((html.match(/href="\/u\//g) || []).length, 2);
  assert.ok(!html.includes("/u/ชื่อ"));
  post.authorUsername = null; post.comments[0].authorUsername = null;
  const privateHtml = render(CommunityPost, siteFixture(), { post, user });
  assert.ok(!privateHtml.includes('href="/u/'));
  assert.ok(privateHtml.includes("ชื่อที่ไม่ใช่ username"));
  assert.ok(!privateHtml.includes("nouri-profile-card"));
});

test("mini profile renders only public summary fields and escapes biography contents", () => {
  const profile = { ...publicProfile(), email: "private-email@example.com", health: "private-health", username: "private-slug", role: "admin", onlineSeconds: 123, weight: 88 };
  const html = render(AuthorProfileCard, siteFixture(), { profile, href: "/u/public_author" });
  for (const visible of ["เพื่อนชุมชน", "บรรทัดแรก", "4 วันต่อเนื่อง", "เข้าร่วมเมื่อ", "ดูโปรไฟล์เต็ม"]) assert.ok(html.includes(visible));
  for (const hidden of ["private-email@example.com", "private-health", "private-slug", "โพสต์ในชุมชน", "ข้อความสาธารณะ", "88"]) assert.ok(!html.includes(hidden));
  assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  const unavailable = render(AuthorProfileCard, siteFixture(), { profile, error: "unavailable" });
  assert.ok(unavailable.includes("โปรไฟล์นี้ไม่พร้อมให้ดูสาธารณะ"));
  assert.ok(!unavailable.includes("เพื่อนชุมชน"));
  assert.ok(!unavailable.includes("href="));
});

test("mini profile requests use an encoded anonymous URL and propagate cancellation", async t => {
  const previousFetch = global.fetch; const previousStorage = global.localStorage;
  const calls = [];
  global.localStorage = { getItem: () => "member-token" };
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; };
  t.after(() => { global.fetch = previousFetch; if (previousStorage === undefined) delete global.localStorage; else global.localStorage = previousStorage; });
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const controller = new AbortController();
  await api.publicProfileCard("name/a", { signal: controller.signal, auth: true });
  assert.equal(calls[0].url, "/api/profiles/name%2Fa/card");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.signal, controller.signal);
});

// Exercise the real component event handlers, refs and effect cleanup with a
// deterministic clock. Browser pointer/navigation behavior is checked separately.
function authorInteractionFixture(t, initial = {}) {
  const original = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useId: React.useId };
  const previousWindow = global.window; const previousDocument = global.document;
  const states = []; const refs = []; const effects = [];
  let stateIndex = 0; let refIndex = 0; let effectIndex = 0; let dirty = false; let pending = [];
  let props = { username: "fixture_author", name: "ชื่อผู้โพสต์", avatar: "", ...initial };
  const docEvents = new Map(); const windowEvents = new Map();
  const triggerNode = { getBoundingClientRect: () => ({ left: 470, top: 380, bottom: 420 }), contains: target => target?.area === "trigger", focus: () => { global.document.activeElement = { area: "trigger" }; fixture.trigger().props.onFocus(); } };
  const cardNode = { getBoundingClientRect: () => ({ height: 280 }), contains: target => target?.area === "card" };
  global.document = { body: { nodeType: 1 }, activeElement: null, visibilityState: "visible", addEventListener: (name, callback) => docEvents.set(name, callback), removeEventListener: name => docEvents.delete(name) };
  global.window = { innerWidth: 500, innerHeight: 500, addEventListener: (name, callback) => windowEvents.set(name, callback), removeEventListener: name => windowEvents.delete(name) };
  React.useState = initialState => { const key = stateIndex++; if (!Object.hasOwn(states, key)) states[key] = typeof initialState === "function" ? initialState() : initialState; return [states[key], next => { const value = typeof next === "function" ? next(states[key]) : next; if (!Object.is(value, states[key])) { states[key] = value; dirty = true; } }]; };
  React.useRef = initialRef => { const key = refIndex++; return refs[key] ||= { current: initialRef }; };
  React.useId = () => "author-card-fixture";
  React.useEffect = (run, deps) => {
    const key = effectIndex++; const previous = effects[key];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) pending.push({ key, run, deps });
  };
  let tree;
  const renderComponent = () => {
    stateIndex = 0; refIndex = 0; effectIndex = 0; pending = []; dirty = false;
    tree = AuthorProfileLink(props);
    const triggerElement = findAuthorElement(tree, element => element.props.className?.startsWith("nouri-author-trigger"));
    triggerElement.ref.current = triggerNode;
    const dialog = findAuthorElement(tree, element => element.props.role === "dialog");
    if (dialog) dialog.ref.current = cardNode;
  };
  const fixture = {
    page: next => {
      props = { ...props, ...next }; renderComponent();
      for (let cycle = 0; cycle < 8; cycle++) {
        const current = pending; pending = [];
        current.forEach(({ key, run, deps }) => { effects[key]?.cleanup?.(); effects[key] = { deps, cleanup: run() }; });
        if (!dirty) break;
        renderComponent();
      }
      return tree;
    },
    trigger: () => findAuthorElement(tree, element => element.props.className?.startsWith("nouri-author-trigger")),
    card: () => findAuthorElement(tree, element => element.props.role === "dialog"),
    summary: () => findAuthorElement(tree, element => element.type === AuthorProfileCard),
    documentEvent: (name, event = {}) => docEvents.get(name)?.(event),
    windowEvent: (name, event = {}) => windowEvents.get(name)?.(event),
    cleanup: () => { effects.forEach(effect => effect.cleanup?.()); effects.length = 0; },
  };
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  t.after(() => { fixture.cleanup(); Object.assign(React, original); if (previousWindow === undefined) delete global.window; else global.window = previousWindow; if (previousDocument === undefined) delete global.document; else global.document = previousDocument; });
  fixture.page();
  return fixture;
}

function findAuthorElement(element, predicate) {
  if (element?.$$typeof === Symbol.for("react.portal")) return findAuthorElement(element.children, predicate);
  if (!React.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findAuthorElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function mockCardRequests(t) {
  const { api } = loadUiModule(path.join(sourceRoot, "api"));
  const original = api.publicProfileCard; const calls = [];
  api.publicProfileCard = (username, options) => new Promise((resolve, reject) => calls.push({ username, options, resolve, reject }));
  t.after(() => { api.publicProfileCard = original; });
  return calls;
}

test("hover and focus delay loading, crossing into the card preserves it, and Escape cannot reopen it", t => {
  const calls = mockCardRequests(t); const fixture = authorInteractionFixture(t);
  assert.equal(calls.length, 0);
  fixture.trigger().props.onMouseEnter(); t.mock.timers.tick(249); fixture.page();
  assert.equal(fixture.card(), null); assert.equal(calls.length, 0);
  t.mock.timers.tick(1); fixture.page();
  assert.ok(fixture.card()); assert.equal(calls.length, 1);
  fixture.trigger().props.onMouseLeave(); t.mock.timers.tick(80); fixture.card().props.onMouseEnter(); t.mock.timers.tick(200); fixture.page();
  assert.ok(fixture.card()); assert.equal(calls[0].options.signal.aborted, false);
  global.document.activeElement = { area: "card" };
  fixture.documentEvent("keydown", { key: "Escape" }); fixture.page();
  assert.equal(fixture.card(), null); assert.equal(calls[0].options.signal.aborted, true);
  t.mock.timers.tick(300); fixture.page();
  assert.equal(fixture.card(), null); assert.equal(calls.length, 1);
  fixture.trigger().props.onFocus(); t.mock.timers.tick(250); fixture.page();
  assert.ok(fixture.card()); assert.equal(calls.length, 2);
  fixture.documentEvent("pointerdown", { target: { area: "outside" } }); fixture.page();
  assert.equal(fixture.card(), null); assert.equal(calls[1].options.signal.aborted, true);
});

test("touch taps and native modified clicks navigate, while completed long press only suppresses its following click", t => {
  const calls = mockCardRequests(t); const fixture = authorInteractionFixture(t);
  let prevented = 0; const click = extra => ({ preventDefault: () => prevented++, ...extra });
  const down = { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 30 };
  fixture.trigger().props.onPointerDown(down); fixture.trigger().props.onFocus(); t.mock.timers.tick(100); fixture.trigger().props.onPointerUp(); fixture.trigger().props.onClick(click()); fixture.page();
  assert.equal(prevented, 0); assert.equal(calls.length, 0); assert.equal(fixture.trigger().props.href, "/u/fixture_author");
  fixture.trigger().props.onClick(click({ ctrlKey: true })); fixture.trigger().props.onKeyDown({ key: "Enter" }); fixture.trigger().props.onClick(click({ detail: 0 }));
  assert.equal(prevented, 0);
  fixture.trigger().props.onPointerDown(down); t.mock.timers.tick(499); fixture.page(); assert.equal(fixture.card(), null);
  t.mock.timers.tick(1); fixture.page(); assert.ok(fixture.card()); assert.equal(calls.length, 1);
  fixture.trigger().props.onContextMenu(click()); assert.equal(prevented, 1);
  fixture.trigger().props.onPointerUp(); fixture.trigger().props.onClick(click()); fixture.page();
  assert.equal(prevented, 2); assert.ok(fixture.card());
  fixture.trigger().props.onKeyDown({ key: "Enter" }); fixture.trigger().props.onClick(click({ detail: 0 })); fixture.page();
  assert.equal(prevented, 2); assert.equal(fixture.card(), null);
  fixture.trigger().props.onContextMenu(click()); assert.equal(prevented, 2);
});

test("touch scrolling and cancellation stop a pending hold without requesting a profile", t => {
  const calls = mockCardRequests(t); const fixture = authorInteractionFixture(t);
  const down = { pointerType: "touch", pointerId: 3, clientX: 20, clientY: 30 };
  fixture.trigger().props.onPointerDown(down); t.mock.timers.tick(200); fixture.trigger().props.onPointerMove({ ...down, clientY: 45 }); t.mock.timers.tick(500); fixture.page();
  assert.equal(calls.length, 0); assert.equal(fixture.card(), null);
  fixture.trigger().props.onPointerDown(down); fixture.trigger().props.onPointerCancel(); t.mock.timers.tick(600); fixture.page();
  assert.equal(calls.length, 0); assert.equal(fixture.card(), null);
});

test("every open refreshes public data and identity changes or hidden pages abort and discard loaded summaries", async t => {
  const calls = mockCardRequests(t); const fixture = authorInteractionFixture(t);
  fixture.trigger().props.onMouseEnter(); t.mock.timers.tick(250); fixture.page();
  calls[0].resolve(publicProfile()); await Promise.resolve(); fixture.page();
  assert.equal(fixture.summary().props.profile.displayName, "เพื่อนชุมชน");
  global.document.visibilityState = "hidden"; fixture.documentEvent("visibilitychange"); fixture.page();
  assert.equal(calls[0].options.signal.aborted, true); assert.equal(fixture.card(), null);
  global.document.visibilityState = "visible";
  fixture.trigger().props.onMouseEnter(); t.mock.timers.tick(250); fixture.page();
  assert.equal(calls.length, 2); assert.equal(fixture.summary().props.profile, null);
  fixture.page({ username: null });
  assert.equal(calls[1].options.signal.aborted, true); assert.equal(fixture.card(), null);
  assert.equal(fixture.trigger().type, "button"); assert.equal(fixture.trigger().props.href, undefined);
  calls[1].resolve(publicProfile()); await Promise.resolve(); fixture.page();
  fixture.trigger().props.onClick({ preventDefault: noop }); fixture.page();
  assert.equal(calls.length, 2); assert.equal(fixture.summary().props.profile, null); assert.equal(fixture.summary().props.error, "unavailable");
  fixture.page({ username: "another_author" });
  assert.equal(fixture.card(), null);
  fixture.trigger().props.onMouseEnter(); t.mock.timers.tick(250); fixture.page();
  assert.equal(calls.at(-1).username, "another_author");
  fixture.cleanup(); assert.equal(calls.at(-1).options.signal.aborted, true);
});

test("mini profile stays inside narrow screens and moves above authors near the viewport bottom", () => {
  const desktop = profileCardPosition({ left: 990, top: 740, bottom: 780 }, 1024, 800, 300);
  assert.ok(desktop.left >= 12); assert.ok(desktop.left + desktop.width <= 1012);
  assert.ok(desktop.top >= 12); assert.ok(desktop.top + 300 <= 788);
  assert.ok(desktop.top < 740);
  const mobile = profileCardPosition({ left: 280, top: 500, bottom: 540 }, 320, 568, 900);
  assert.equal(mobile.width, 296); assert.equal(mobile.left, 12); assert.equal(mobile.top, 12); assert.equal(mobile.maxHeight, 544);
});
