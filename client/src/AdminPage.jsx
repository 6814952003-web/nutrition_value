import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { uploadFile } from "./upload";
import "./admin.css";

const clone = value => JSON.parse(JSON.stringify(value));
const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const nutrientLabels = { calories: "พลังงาน (kcal)", protein: "โปรตีน (กรัม)", carbs: "คาร์โบไฮเดรต (กรัม)", fat: "ไขมัน (กรัม)" };
const tabs = [{ id: "general", label: "ตั้งค่าเว็บไซต์" }, { id: "content", label: "ข้อความ" }, { id: "media", label: "รูปภาพและไอคอน" }, { id: "meals", label: "เมนูอาหาร" }, { id: "guides", label: "คู่มือโภชนาการ" }, { id: "users", label: "สมาชิก" }, { id: "community", label: "ดูแลชุมชน" }];
const postCategories = { food: "มื้ออาหาร", recipe: "สูตรอาหาร", knowledge: "ความรู้ด้านอาหาร", workout: "สุขภาพและการออกกำลังกาย" };
const copyGroups = { auth: "หน้าเข้าสู่ระบบและสมัครสมาชิก", dashboard: "หน้าหลัก", account: "หน้าบัญชี", community: "หน้าชุมชน" };
const copyLabels = {
  loginTitle: "หัวข้อเข้าสู่ระบบ", registerTitle: "หัวข้อสมัครสมาชิก", loginDescription: "คำอธิบายเข้าสู่ระบบ", registerDescription: "คำอธิบายสมัครสมาชิก", emailLabel: "ป้ายชื่ออีเมล", nameLabel: "ป้ายชื่อสมาชิก", passwordLabel: "ป้ายรหัสผ่าน", loginButton: "ปุ่มเข้าสู่ระบบ", registerButton: "ปุ่มสร้างบัญชี", registerLink: "ลิงก์สมัครสมาชิก", loginLink: "ลิงก์เข้าสู่ระบบ",
  trackerNav: "เมนูนำทาง: บันทึกวันนี้", menuNav: "เมนูนำทาง: อาหาร", guideNav: "เมนูนำทาง: คู่มือ", accountButton: "ปุ่มบัญชี", logoutButton: "ปุ่มออกจากระบบ", heroEyebrow: "ข้อความเหนือหัวข้อหลัก", heroTitle: "หัวข้อหลัก", heroHighlight: "ข้อความเน้นในหัวข้อหลัก", heroDescription: "คำอธิบายหน้าแรก", heroButton: "ปุ่มในส่วนแนะนำ", heroBadge: "ข้อความบนป้ายรูปภาพ", trackerEyebrow: "ข้อความเหนือบันทึกวันนี้", trackerTitle: "หัวข้อบันทึกวันนี้", trackerHighlight: "ข้อความเน้นในบันทึกวันนี้", trackerDescription: "คำอธิบายบันทึกวันนี้", resetButton: "ปุ่มเริ่มบันทึกใหม่", proteinToday: "หัวข้อโปรตีนวันนี้", goalLabel: "ข้อความหน้าเป้าหมาย", caloriesLabel: "ป้ายพลังงาน", proteinLabel: "ป้ายโปรตีน", carbsLabel: "ป้ายคาร์โบไฮเดรต", fatLabel: "ป้ายไขมัน", menuEyebrow: "ข้อความเหนือเมนูอาหาร", menuTitle: "หัวข้อเมนูอาหาร", menuHighlight: "ข้อความเน้นในเมนูอาหาร", menuDescription: "คำอธิบายเมนูอาหาร", allFilter: "ตัวกรองทุกหมวด", addMealButton: "ปุ่มเพิ่มอาหารในวันนี้", emptyMeals: "ข้อความเมื่อไม่มีอาหาร", bmiEyebrow: "ข้อความเหนือเครื่องคำนวณ BMI", bmiTitle: "หัวข้อเครื่องคำนวณ BMI", heightPlaceholder: "คำแนะนำในช่องส่วนสูง", weightPlaceholder: "คำแนะนำในช่องน้ำหนัก", calculateButton: "ปุ่มคำนวณ", bmiResult: "ป้ายผล BMI", guideEyebrow: "ข้อความเหนือคู่มือ", guideTitle: "หัวข้อคู่มือ", guideHighlight: "ข้อความเน้นในคู่มือ", footer: "ข้อความท้ายเว็บไซต์",
  backButton: "ปุ่มย้อนกลับ", eyebrow: "ข้อความเหนือหัวข้อ", changePhoto: "ปุ่มเปลี่ยนรูป", onlineLabel: "สถานะออนไลน์", historyTitle: "หัวข้อประวัติใช้งาน", historyDetail: "คำอธิบายประวัติใช้งาน", securityTitle: "หัวข้อความปลอดภัย", communityTitle: "หัวข้อเมนูชุมชน", communityDetail: "คำอธิบายเมนูชุมชน", timeTitle: "หัวข้อเวลาใช้งาน", timeDetail: "ป้ายเวลาใช้งาน", emptyHistory: "ข้อความเมื่อไม่มีประวัติ", roleLabel: "ป้ายประเภทบัญชี", adminLabel: "ชื่อประเภทผู้ดูแล", memberLabel: "ชื่อประเภทสมาชิก", joinedLabel: "ป้ายวันที่สมัคร", timeDescription: "คำอธิบายการนับเวลา", registeredActivity: "กิจกรรม: สมัครสมาชิก", loginActivity: "กิจกรรม: เข้าสู่ระบบ", sessionActivity: "กิจกรรม: สิ้นสุดเซสชัน",
  title: "หัวข้อหน้า", description: "คำอธิบายหน้า", placeholder: "คำแนะนำในช่องเขียนโพสต์", foodCategory: "ชื่อหมวดมื้ออาหาร", recipeCategory: "ชื่อหมวดสูตรอาหาร", knowledgeCategory: "ชื่อหมวดความรู้", workoutCategory: "ชื่อหมวดออกกำลังกาย", mediaButton: "ปุ่มแนบรูปหรือวิดีโอ", removeButton: "ปุ่มนำไฟล์ออก", postButton: "ปุ่มโพสต์", waitButton: "ข้อความขณะรอ", uploadHint: "คำแนะนำอัปโหลด", commentLabel: "ป้ายความคิดเห็น", commentPlaceholder: "คำแนะนำช่องความคิดเห็น", sendButton: "ปุ่มส่ง", emptyPosts: "ข้อความเมื่อไม่มีโพสต์", contentRequired: "ข้อความเตือนให้เขียนโพสต์",
};

function isHttps(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && url.href === value && value.length <= 2048; } catch { return false; }
}
function isEmoji(value) { return value === "" || (value.length <= 32 && /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}]/u.test(value) && /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f\u20e3\u0030-\u0039\u0023\u002a]+$/u.test(value)); }
function colorOr(value, fallback) { return /^#[a-f\d]{6}$/i.test(value || "") ? value : fallback; }
function payloadOf(draft) { return { brand: draft.brand, theme: draft.theme, goals: draft.goals, copy: draft.copy, icons: draft.icons, meals: draft.meals, guides: draft.guides, revision: draft.revision }; }
function validateDraft(draft) {
  if (!draft.brand.name.trim()) return "กรุณาระบุชื่อเว็บไซต์";
  for (const key of ["logoUrl", "faviconUrl"]) if (draft.brand[key] && !isHttps(draft.brand[key])) return "ลิงก์โลโก้และไอคอนแท็บต้องเป็น HTTPS หรือเว้นว่าง";
  for (const value of Object.values(draft.theme)) if (!/^#[a-f\d]{6}$/i.test(value)) return "กรุณาระบุสีเป็นรหัส 6 หลัก เช่น #214d3f";
  for (const [key, value] of Object.entries(draft.goals)) if (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 1_000_000) return `เป้าหมาย${nutrientLabels[key]}ต้องมากกว่า 0 และไม่เกิน 1,000,000`;
  for (const value of Object.values(draft.icons)) if (!isEmoji(value) && !isHttps(value)) return "ไอคอนต้องเป็นอีโมจิ ลิงก์ HTTPS หรือเว้นว่าง";
  if (draft.meals.length > 40 || draft.guides.length > 40) return "เมนูอาหารและคู่มือเพิ่มได้หมวดละไม่เกิน 40 รายการ";
  for (const meal of draft.meals) {
    if (!meal.name.trim()) return "กรุณาระบุชื่ออาหารให้ครบทุกเมนู";
    if (!isEmoji(meal.emoji)) return `อีโมจิของเมนู ${meal.name} ไม่ถูกต้อง กรุณาใช้อีโมจิหรือเว้นว่าง`;
    if (!/^#[a-f\d]{6}$/i.test(meal.color)) return `สีของเมนู ${meal.name} ต้องเป็นรหัสสี 6 หลัก`;
    if (meal.photo && !isHttps(meal.photo)) return `รูปของเมนู ${meal.name} ต้องเป็นลิงก์ HTTPS หรือเว้นว่าง`;
    for (const key of Object.keys(nutrientLabels)) if (meal[key] === "" || !Number.isFinite(Number(meal[key])) || Number(meal[key]) < 0 || Number(meal[key]) > 1_000_000) return `ค่า${nutrientLabels[key]}ของ ${meal.name} ต้องเป็นตัวเลขตั้งแต่ 0 ถึง 1,000,000`;
  }
  if (draft.guides.some(guide => !guide.title.trim())) return "กรุณาระบุหัวข้อคู่มือให้ครบ";
  return "";
}

export default function AdminPage({ user, site, onSaved, goBack, setUser }) {
  const [draft, setDraft] = useState(() => clone(site));
  const [baseline, setBaseline] = useState(() => JSON.stringify(site));
  const [tab, setTab] = useState("general");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [rowDirty, setRowDirty] = useState({});
  const [rowBusy, setRowBusy] = useState({});
  const alive = useRef(true);
  const siteDirty = loaded && JSON.stringify(draft) !== baseline;
  const otherDirty = Object.values(rowDirty).some(Boolean);
  const dirty = siteDirty || otherDirty;
  const busy = loading || saving || uploading || Object.values(rowBusy).some(Boolean);
  const locked = !loaded || loading || saving || uploading;
  const markDirty = useCallback((id, value) => setRowDirty(current => current[id] === value ? current : { ...current, [id]: value }), []);
  const markBusy = useCallback((id, value) => setRowBusy(current => current[id] === value ? current : { ...current, [id]: value }), []);
  const panelProps = id => ({ id: `admin-panel-${id}`, role: "tabpanel", "aria-labelledby": `admin-tab-${id}`, hidden: tab !== id, tabIndex: 0 });
  const moveTab = event => {
    const index = tabs.findIndex(item => item.id === tab);
    const destination = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    setTab(tabs[destination].id);
    document.getElementById(`admin-tab-${tabs[destination].id}`)?.focus();
  };

  const loadSite = async () => {
    setLoading(true); setError("");
    try {
      const current = await api.site();
      if (!alive.current) return;
      setDraft(clone(current)); setBaseline(JSON.stringify(current)); setLoaded(true); setConflict(false);
    } catch (loadError) { if (alive.current) setError(`โหลดข้อมูลเว็บไซต์ไม่สำเร็จ: ${loadError.message} กรุณาลองอีกครั้งก่อนแก้ไขหรือบันทึก`); }
    finally { if (alive.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; loadSite(); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!dirty && !busy) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    const guard = event => {
      if (busy || (dirty && !window.confirm("มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากหน้าแอดมินและทิ้งแบบร่างหรือไม่?"))) event.preventDefault();
    };
    window.addEventListener("nouri-admin-navigate", guard);
    return () => window.removeEventListener("nouri-admin-navigate", guard);
  }, [dirty, busy]);

  const patch = (group, key, value) => { setNotice(""); setDraft(current => ({ ...current, [group]: { ...current[group], [key]: value } })); };
  const patchItem = (group, id, key, value) => { setNotice(""); setDraft(current => ({ ...current, [group]: current[group].map(item => item.id === id ? { ...item, [key]: value } : item) })); };
  const removeItem = (group, id) => {
    if (!window.confirm("นำรายการนี้ออกจากแบบร่าง? การเปลี่ยนแปลงจะมีผลเมื่อบันทึกทั้งหมด")) return;
    setDraft(current => ({ ...current, [group]: current[group].filter(item => item.id !== id) })); setNotice("");
  };
  const moveItem = (group, index, direction) => setDraft(current => {
    const items = [...current[group]]; const destination = index + direction;
    if (destination < 0 || destination >= items.length) return current;
    [items[index], items[destination]] = [items[destination], items[index]];
    return { ...current, [group]: items };
  });
  const leave = () => {
    if (busy) return;
    if (dirty && !window.confirm("มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากหน้าแอดมินและทิ้งแบบร่างหรือไม่?")) return;
    goBack();
  };
  const reloadSite = async () => {
    if (busy || (siteDirty && !window.confirm("โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์และทิ้งแบบร่างเว็บไซต์ที่ยังไม่บันทึก? คุณสามารถดาวน์โหลดแบบร่างเก็บไว้ก่อน"))) return;
    await loadSite();
  };
  const save = async () => {
    if (!loaded || busy || !siteDirty) return;
    const validationError = validateDraft(draft);
    if (validationError) { setError(validationError); setNotice(""); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await api.saveSite(payloadOf(draft));
      setDraft(clone(saved)); setBaseline(JSON.stringify(saved)); setConflict(false); onSaved(saved);
      setNotice("บันทึกเว็บไซต์แล้ว ข้อมูลใหม่จะแสดงบนเว็บออนไลน์เมื่อผู้ใช้โหลดหน้าใหม่");
    } catch (saveError) {
      if (saveError.status === 409) { setConflict(true); setError("มีผู้ดูแลคนอื่นบันทึกเวอร์ชันใหม่แล้ว แบบร่างของคุณยังอยู่ กรุณาเก็บแบบร่างและโหลดข้อมูลล่าสุดก่อนแก้ไขใหม่"); }
      else setError(saveError.message);
    } finally { setSaving(false); }
  };
  const uploadAsset = async (event, done) => {
    const input = event.currentTarget; const file = input.files?.[0];
    if (!file || locked || busy) { input.value = ""; return; }
    setUploading(true); setError(""); setUploadStatus("กำลังอัปโหลดรูป 0%");
    try {
      const url = await uploadFile(file, user.id, "site", progress => setUploadStatus(`กำลังอัปโหลดรูป ${Math.round(progress.percentage)}%`));
      if (!isHttps(url)) throw new Error("ยังไม่ได้ตั้งค่าพื้นที่เก็บรูปภาพ กรุณาวางลิงก์รูป HTTPS แทน แล้วตั้งค่าพื้นที่อัปโหลดก่อนใช้งาน");
      done(url); setNotice("อัปโหลดรูปแล้ว กดบันทึกทั้งหมดเพื่อแสดงบนเว็บไซต์");
    } catch (uploadError) { setError(uploadError.message); }
    finally { setUploading(false); setUploadStatus(""); input.value = ""; }
  };
  const downloadDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payloadOf(draft), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "nouri-site-draft.json"; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="admin-shell"><div className="admin-wrap">
    <header className="admin-top"><button className="admin-btn admin-btn-light" disabled={busy} onClick={leave}>← กลับไปที่เว็บไซต์</button><span className="admin-pill">ผู้ดูแลระบบ · {user.name}</span></header>
    <section className="admin-hero"><div><p className="admin-eyebrow">จัดการเว็บไซต์</p><h1>ทุกการเปลี่ยนแปลง<br/><span>เริ่มจากพื้นที่นี้.</span></h1><p>แก้แบรนด์ ข้อความ รูปภาพ เมนูอาหาร และดูแลสมาชิกในที่เดียว</p></div><div className="admin-save-box"><span className={`admin-status ${dirty ? "is-dirty" : ""}`}>{loading ? "กำลังโหลดข้อมูล…" : !loaded ? "ยังไม่ได้โหลดข้อมูลเว็บไซต์" : dirty ? "● มีข้อมูลที่ยังไม่บันทึก" : "✓ ข้อมูลตรงกับเว็บไซต์"}</span><button className="admin-btn admin-btn-save" disabled={!loaded || busy || !siteDirty} onClick={save}>{saving ? "กำลังบันทึก…" : uploading ? "กำลังอัปโหลด…" : "บันทึกทั้งหมด"}</button><p>บันทึกการตั้งค่า ข้อความ รูปภาพ เมนู และคู่มือ<br/>สมาชิกและโพสต์มีปุ่มบันทึกแยกแต่ละรายการ</p></div></section>
    <nav className="admin-tabs" role="tablist" aria-label="หมวดการจัดการ" onKeyDown={moveTab}>{tabs.map(item => <button type="button" key={item.id} id={`admin-tab-${item.id}`} role="tab" aria-controls={`admin-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} className={tab === item.id ? "active" : ""}>{item.label}{item.id === "meals" && <span>{draft.meals.length}</span>}</button>)}</nav>
    {error && <div className="admin-message admin-error" role="alert"><p>{error}</p>{!loaded && !loading && <button className="admin-btn admin-btn-light" onClick={loadSite}>ลองโหลดอีกครั้ง</button>}{conflict && <div className="admin-actions"><button className="admin-btn admin-btn-light" onClick={downloadDraft}>ดาวน์โหลดแบบร่าง</button><button className="admin-btn admin-btn-light" disabled={busy || loading} onClick={reloadSite}>โหลดเวอร์ชันล่าสุด</button></div>}</div>}
    {notice && <p className="admin-message admin-success" role="status">{notice}</p>}
    {uploadStatus && <p className="admin-message" role="status" aria-live="polite">{uploadStatus}</p>}
    <div className={`admin-workspace ${["users", "community"].includes(tab) ? "admin-workspace-wide" : ""}`}>
      <div className="admin-editor">
        <fieldset className="admin-fieldset" disabled={locked} hidden={["users", "community"].includes(tab)}>
          <div {...panelProps("general")} aria-busy={loading || saving}>
            <Card title="ชื่อและแบรนด์" text="ชื่อที่ผู้ใช้เห็นบนเว็บไซต์และข้อความแทนโลโก้"><div className="admin-grid"><Field label="ชื่อเว็บไซต์" value={draft.brand.name} maxLength={80} onChange={value => patch("brand", "name", value)}/><Field label="ตัวอักษรแทนโลโก้" value={draft.brand.logoText} maxLength={16} onChange={value => patch("brand", "logoText", value)} hint="ใช้เมื่อยังไม่มีรูปโลโก้"/></div></Card>
            <Card title="สีของเว็บไซต์" text="เลือกสีหลัก สีเน้น พื้นหลัง และตัวอักษร ดูผลทางด้านข้าง"><div className="admin-grid">{Object.entries({ primary: "สีหลัก", accent: "สีเน้น", background: "สีพื้นหลัง", text: "สีตัวอักษร" }).map(([key, label]) => <ColorField key={key} label={label} value={draft.theme[key]} onChange={value => patch("theme", key, value)}/>)}</div></Card>
            <Card title="เป้าหมายสารอาหารต่อวัน" text="ค่าเริ่มต้นสำหรับแถบติดตามโภชนาการ ระบุตัวเลขมากกว่า 0"><div className="admin-grid">{Object.entries(nutrientLabels).map(([key, label]) => <Field key={key} label={label} type="number" min="0.01" step="any" value={draft.goals[key]} onChange={value => patch("goals", key, value === "" ? "" : Number(value))}/>)}</div></Card>
          </div>
          <div {...panelProps("content")}><Card title="ข้อความบนเว็บไซต์" text="เลือกหน้าที่ต้องการแก้ ข้อความจะแสดงตามที่พิมพ์โดยไม่มีการแทรก HTML">{Object.entries(draft.copy).map(([group, fields], index) => <details key={group} className="admin-accordion" open={index === 0}><summary>{copyGroups[group] || `ข้อความหน้า ${index + 1}`}<span>{Object.keys(fields).length} ช่อง</span></summary><div className="admin-grid admin-accordion-body">{Object.entries(fields).map(([key, value], fieldIndex) => <Field key={key} label={copyLabels[key] || `ข้อความที่ ${fieldIndex + 1}`} value={value} multiline maxLength={3000} onChange={next => { setNotice(""); setDraft(current => ({ ...current, copy: { ...current.copy, [group]: { ...current.copy[group], [key]: next } } })); }}/>)}</div></details>)}</Card></div>
          <div {...panelProps("media")}>
            <Card title="โลโก้และไอคอนแท็บ" text="วางลิงก์ HTTPS หรืออัปโหลด PNG, JPG หรือ WebP ขนาดไม่เกิน 1.5 MB"><AssetField label="รูปโลโก้" value={draft.brand.logoUrl} onChange={value => patch("brand", "logoUrl", value)} onUpload={event => uploadAsset(event, url => patch("brand", "logoUrl", url))}/><AssetField label="ไอคอนบนแท็บเบราว์เซอร์" value={draft.brand.faviconUrl} onChange={value => patch("brand", "faviconUrl", value)} onUpload={event => uploadAsset(event, url => patch("brand", "faviconUrl", url))}/></Card>
            <Card title="ไอคอนและภาพหลัก" text="ใส่อีโมจิหรือลิงก์รูป HTTPS เว้นว่างเพื่อใช้ไอคอนเริ่มต้น">{Object.entries({ hero: "ภาพอาหารในส่วนแนะนำ", user: "ไอคอนบัญชีผู้ใช้", clock: "ไอคอนเวลาและประวัติ", arrow: "ไอคอนย้อนกลับ", spark: "ไอคอนชุมชนและกิจกรรม" }).map(([key, label]) => <AssetField key={key} label={label} value={draft.icons[key]} emoji onChange={value => patch("icons", key, value)} onUpload={event => uploadAsset(event, url => patch("icons", key, url))}/>)}</Card>
          </div>
          <div {...panelProps("meals")}><Card title="เมนูอาหาร" text="เพิ่ม แก้ไข ลบ หรือเลื่อนลำดับได้สูงสุด 40 เมนู เมนูชื่อซ้ำได้"><button className="admin-btn admin-btn-light" type="button" disabled={draft.meals.length >= 40} onClick={() => { setDraft(current => ({ ...current, meals: [...current.meals, { id: newId("meal"), name: "เมนูใหม่", tag: "ทั่วไป", calories: 0, protein: 0, carbs: 0, fat: 0, emoji: "🍽️", color: "#eaf0dd", photo: "" }] })); setNotice(""); }}>＋ เพิ่มเมนูอาหาร</button>{!draft.meals.length && <p className="admin-empty">ยังไม่มีเมนูอาหาร กดเพิ่มเมนูเพื่อเริ่มต้น</p>}<div className="admin-item-list">{draft.meals.map((meal, index) => <details className="admin-accordion" key={meal.id}><summary><span className="admin-item-number">{String(index + 1).padStart(2, "0")}</span><span className="admin-item-name">{meal.emoji} {meal.name || "เมนูยังไม่มีชื่อ"}</span><span className="admin-summary-meta">{meal.calories || 0} kcal</span></summary><div className="admin-accordion-body"><ItemActions name={meal.name} index={index} length={draft.meals.length} move={direction => moveItem("meals", index, direction)} remove={() => removeItem("meals", meal.id)}/><div className="admin-grid"><Field label="ชื่ออาหาร" value={meal.name} maxLength={120} onChange={value => patchItem("meals", meal.id, "name", value)}/><Field label="หมวดหมู่" value={meal.tag} maxLength={80} onChange={value => patchItem("meals", meal.id, "tag", value)} hint="ใช้ชื่อเดียวกันเพื่อจัดอาหารไว้ในตัวกรองเดียวกัน"/>{Object.entries(nutrientLabels).map(([key, label]) => <Field key={key} label={label} type="number" min="0" step="any" value={meal[key]} onChange={value => patchItem("meals", meal.id, key, value === "" ? "" : Number(value))}/>)}<Field label="อีโมจิแทนรูป" maxLength={32} value={meal.emoji} onChange={value => patchItem("meals", meal.id, "emoji", value)}/><ColorField label="สีพื้นหลังรูป" value={meal.color} onChange={value => patchItem("meals", meal.id, "color", value)}/></div><AssetField label="รูปอาหาร" value={meal.photo} onChange={value => patchItem("meals", meal.id, "photo", value)} onUpload={event => uploadAsset(event, url => patchItem("meals", meal.id, "photo", url))}/></div></details>)}</div></Card></div>
          <div {...panelProps("guides")}><Card title="คู่มือโภชนาการ" text="จัดการหัวข้อและคำอธิบายที่แสดงท้ายหน้าหลักได้สูงสุด 40 รายการ"><button type="button" className="admin-btn admin-btn-light" disabled={draft.guides.length >= 40} onClick={() => { setDraft(current => ({ ...current, guides: [...current.guides, { id: newId("guide"), title: "หัวข้อใหม่", text: "คำอธิบายโภชนาการ" }] })); setNotice(""); }}>＋ เพิ่มหัวข้อคู่มือ</button>{!draft.guides.length && <p className="admin-empty">ยังไม่มีคู่มือ กดเพิ่มหัวข้อเพื่อเริ่มต้น</p>}<div className="admin-item-list">{draft.guides.map((guide, index) => <article className="admin-guide" key={guide.id}><ItemActions name={guide.title} index={index} length={draft.guides.length} move={direction => moveItem("guides", index, direction)} remove={() => removeItem("guides", guide.id)}/><Field label={`หัวข้อที่ ${index + 1}`} value={guide.title} maxLength={160} onChange={value => patchItem("guides", guide.id, "title", value)}/><Field label="คำอธิบาย" value={guide.text} maxLength={3000} multiline onChange={value => patchItem("guides", guide.id, "text", value)}/></article>)}</div></Card></div>
        </fieldset>
        <div {...panelProps("users")}><UsersPanel currentUser={user} setUser={setUser} markDirty={markDirty} markBusy={markBusy}/></div>
        <div {...panelProps("community")}><PostsPanel markDirty={markDirty} markBusy={markBusy}/></div>
      </div>
      {!["users", "community"].includes(tab) && <DraftPreview draft={draft} dirty={siteDirty} loading={!loaded}/>}
    </div>
    <footer className="admin-footer"><span>{draft.updatedAt ? `บันทึกเว็บไซต์ล่าสุด: ${new Date(draft.updatedAt).toLocaleString("th-TH")}` : "เวอร์ชันเริ่มต้น"}</span><button className="admin-text-btn" disabled={!loaded || busy} onClick={reloadSite}>โหลดข้อมูลเว็บไซต์ล่าสุด</button></footer>
  </div></main>;
}

function Card({ title, text, children }) { return <section className="admin-card"><h2>{title}</h2>{text && <p className="admin-card-description">{text}</p>}<div className="admin-card-body">{children}</div></section>; }
function Field({ label, value, onChange, hint, multiline, ...props }) {
  const control = { ...props, value: value ?? "", onChange: event => onChange(event.target.value), className: "admin-input" };
  return <label className="admin-field"><span>{label}</span>{multiline ? <textarea {...control} rows={value?.includes("\n") || value?.length > 70 ? 3 : 2}/> : <input {...control}/>} {hint && <small>{hint}</small>}</label>;
}
function ColorField({ label, value, onChange }) { return <label className="admin-field"><span>{label}</span><div className="admin-color"><input type="color" aria-label={`เลือก${label}`} value={colorOr(value, "#214d3f")} onChange={event => onChange(event.target.value)}/><input className="admin-input" value={value} maxLength={7} aria-label={`${label} รหัส HEX`} onChange={event => onChange(event.target.value)}/></div></label>; }
function AssetField({ label, value, onChange, onUpload, emoji }) {
  return <div className="admin-asset"><div className="admin-asset-input"><Field label={label} value={value} maxLength={2048} onChange={onChange} placeholder={emoji ? "อีโมจิ หรือ https://…" : "https://…"}/><div className="admin-actions"><label className="admin-btn admin-btn-light admin-upload">อัปโหลดรูป<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload}/></label>{value && <button type="button" className="admin-text-btn" onClick={() => onChange("")}>นำออก</button>}</div></div><span className="admin-asset-preview"><Asset value={value} fallback={emoji ? "✦" : "รูป"}/></span></div>;
}
function Asset({ value, fallback }) { return isHttps(value) ? <img src={value} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <span>{value && !/^(https?:|data:|javascript:|\/)/i.test(value) ? value.slice(0, 32) : fallback}</span>; }
function ItemActions({ index, length, move, remove, name }) { return <div className="admin-item-actions"><span>ลำดับที่ {index + 1}</span><button type="button" className="admin-btn admin-btn-light" disabled={index === 0} aria-label={`เลื่อน ${name} ขึ้น`} onClick={() => move(-1)}>↑ เลื่อนขึ้น</button><button type="button" className="admin-btn admin-btn-light" disabled={index === length - 1} aria-label={`เลื่อน ${name} ลง`} onClick={() => move(1)}>↓ เลื่อนลง</button><button type="button" className="admin-text-btn admin-danger" onClick={remove}>ลบ</button></div>; }
function DraftPreview({ draft, dirty, loading }) {
  const copy = draft.copy.dashboard;
  const theme = { primary: colorOr(draft.theme.primary, "#214d3f"), accent: colorOr(draft.theme.accent, "#d8ed9f"), background: colorOr(draft.theme.background, "#f4efe8"), text: colorOr(draft.theme.text, "#1d2b21") };
  return <aside className="admin-preview"><div className="admin-preview-heading"><h2>ตัวอย่างแบบร่าง</h2><span>{loading ? "กำลังโหลด" : dirty ? "ยังไม่เผยแพร่" : "เวอร์ชันปัจจุบัน"}</span></div><div className="admin-preview-window" style={{ background: theme.background, color: theme.text }}><div className="admin-preview-brand"><span style={{ background: theme.primary, color: theme.accent }}><Asset value={draft.brand.logoUrl || draft.brand.logoText} fallback="n"/></span><b>{draft.brand.name}</b></div><div className="admin-preview-hero" style={{ background: theme.primary }}><small style={{ color: theme.accent }}>{copy.heroEyebrow}</small><h3>{copy.heroTitle}<br/><span style={{ color: theme.accent }}>{copy.heroHighlight}</span></h3><p>{copy.heroDescription}</p><div className="admin-preview-hero-row"><span className="admin-preview-cta" style={{ background: theme.accent, color: theme.primary }}>{copy.heroButton}</span><span className="admin-preview-hero-asset"><Asset value={draft.icons.hero} fallback="🥗"/></span></div></div><div className="admin-preview-meals"><h4>{copy.menuTitle} {copy.menuHighlight}</h4>{draft.meals.slice(0, 3).map(meal => <div key={meal.id} className="admin-preview-meal"><span style={{ background: colorOr(meal.color, "#eaf0dd") }}><Asset value={meal.photo || meal.emoji} fallback="🍽️"/></span><div><b>{meal.name || "เมนูยังไม่มีชื่อ"}</b><small>{meal.tag} · {meal.calories || 0} kcal</small></div></div>)}{!draft.meals.length && <p>{copy.emptyMeals}</p>}</div></div><p className="admin-preview-note">ตัวอย่างย่อของหน้าหลัก การแก้ไขเว็บไซต์มีผลเมื่อกดบันทึกทั้งหมด</p></aside>;
}

function useAdminList(fetchItems, discardMessage, prefix, markDirty, markBusy) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [hasBusyRows, setHasBusyRows] = useState(false);
  const dirtyRef = useRef({}); const busyRef = useRef({}); const loadingRef = useRef(false); const alive = useRef(true);
  const load = useCallback(async () => {
    if (loadingRef.current || Object.values(busyRef.current).some(Boolean)) return;
    if (Object.values(dirtyRef.current).some(Boolean) && !window.confirm(discardMessage)) return;
    loadingRef.current = true;
    setLoading(true); setError("");
    try {
      const next = await fetchItems();
      if (!alive.current) return;
      setItems(next); setVersion(value => value + 1);
    } catch (loadError) { if (alive.current) setError(loadError.message); }
    finally { loadingRef.current = false; if (alive.current) setLoading(false); }
  }, [fetchItems, discardMessage]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  const dirty = useCallback((id, value) => {
    dirtyRef.current[id] = value;
    markDirty(`${prefix}-${id}`, value);
  }, [prefix, markDirty]);
  const busy = useCallback((id, value) => {
    busyRef.current[id] = value;
    if (alive.current) setHasBusyRows(Object.values(busyRef.current).some(Boolean));
    markBusy(`${prefix}-${id}`, value);
  }, [prefix, markBusy]);
  return { items, setItems, loading, error, version, hasBusyRows, load, dirty, busy };
}

function UsersPanel({ currentUser, setUser, markDirty, markBusy }) {
  const { items: users, setItems: setUsers, loading, error, version, hasBusyRows, load, dirty, busy } = useAdminList(api.users, "โหลดรายชื่อสมาชิกใหม่และทิ้งการแก้ไขสมาชิกที่ยังไม่บันทึก?", "user", markDirty, markBusy);
  const [query, setQuery] = useState(""); const [role, setRole] = useState("all");
  const saved = updated => {
    setUsers(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
    if (updated.id === currentUser.id) setUser(current => current ? { ...current, ...updated } : current);
  };
  const needle = query.trim().toLocaleLowerCase();
  const matches = account => (role === "all" || account.role === role) && `${account.name} ${account.email}`.toLocaleLowerCase().includes(needle);
  const visibleCount = users.filter(matches).length;
  const adminCount = users.filter(account => account.role === "admin").length;
  return <Card title="จัดการสมาชิก" text="แก้ชื่อ อีเมล และสิทธิ์ แล้วบันทึกแยกทีละบัญชี">
    <div className="admin-list-summary"><span>ทั้งหมด <b>{users.length}</b></span><span>ผู้ดูแลระบบ <b>{adminCount}</b></span><span>สมาชิก <b>{users.length - adminCount}</b></span></div>
    <div className="admin-panel-toolbar">
      <Field label="ค้นหาสมาชิก" type="search" value={query} onChange={setQuery} placeholder="ชื่อหรืออีเมล"/>
      <label className="admin-field admin-filter"><span>ประเภทบัญชี</span><select className="admin-input" value={role} onChange={event => setRole(event.target.value)}><option value="all">ทุกประเภท</option><option value="admin">ผู้ดูแลระบบ</option><option value="user">สมาชิก</option></select></label>
      <button className="admin-btn admin-btn-light" disabled={loading || hasBusyRows} onClick={load}>{loading ? "กำลังโหลด…" : "โหลดรายชื่อล่าสุด"}</button>
    </div>
    {error && <div className="admin-message admin-error" role="alert"><p>โหลดรายชื่อสมาชิกไม่สำเร็จ: {error}</p><button className="admin-btn admin-btn-light" disabled={loading || hasBusyRows} onClick={load}>ลองอีกครั้ง</button></div>}
    <p className="admin-result-count" role="status">{loading ? "กำลังโหลดรายชื่อสมาชิก…" : `แสดง ${visibleCount} จาก ${users.length} บัญชี`}</p>
    <div className="admin-user-list" aria-busy={loading}>{users.map(account => <div key={`${account.id}-${version}`} hidden={!matches(account)}><AdminUserRow account={account} currentUser={currentUser} locked={loading} onSaved={saved} markDirty={dirty} markBusy={busy}/></div>)}</div>
    {!loading && !users.length && !error && <p className="admin-empty">ยังไม่มีสมาชิก</p>}
    {!loading && users.length > 0 && !visibleCount && <p className="admin-empty">ไม่พบสมาชิกที่ตรงกับตัวกรอง <button className="admin-text-btn" onClick={() => { setQuery(""); setRole("all"); }}>ล้างตัวกรอง</button></p>}
  </Card>;
}

function AdminUserRow({ account, currentUser, locked, onSaved, markDirty, markBusy }) {
  const [draft, setDraft] = useState(account); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  const ownAccount = account.id === currentUser.id;
  const dirty = ["name", "email", "role"].some(key => draft[key] !== account[key]);
  useEffect(() => { setDraft(account); }, [account]);
  useEffect(() => { markDirty(account.id, dirty); return () => markDirty(account.id, false); }, [account.id, dirty, markDirty]);
  useEffect(() => { markBusy(account.id, saving); return () => markBusy(account.id, false); }, [account.id, saving, markBusy]);
  const patch = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setNotice(""); setError(""); };
  const save = async event => {
    event.preventDefault(); if (savingRef.current || locked || !dirty) return;
    if (!draft.name.trim() || !draft.email.trim()) { setError("กรุณากรอกชื่อและอีเมลให้ครบ"); return; }
    if (ownAccount && draft.role !== "admin") { setError("ไม่สามารถลดสิทธิ์บัญชีของคุณเองได้ ให้ผู้ดูแลคนอื่นเป็นผู้เปลี่ยนสิทธิ์"); return; }
    savingRef.current = true; markBusy(account.id, true);
    setSaving(true); setError(""); setNotice("");
    try { const updated = await api.updateUser(account.id, { name: draft.name.trim(), email: draft.email.trim(), role: draft.role }); onSaved(updated); setNotice("บันทึกบัญชีแล้ว"); }
    catch (saveError) { setError(saveError.message); }
    finally { savingRef.current = false; markBusy(account.id, false); setSaving(false); }
  };
  return <form className={`admin-user-row ${ownAccount ? "is-current" : ""}`} onSubmit={save} aria-busy={saving}>
    <div className="admin-user-heading"><div><b>{account.name}</b>{account.createdAt && <small>สมัครเมื่อ {new Date(account.createdAt).toLocaleDateString("th-TH")}</small>}</div><span className="admin-role-badge">{ownAccount && "บัญชีของคุณ · "}{account.role === "admin" ? "ผู้ดูแลระบบ" : "สมาชิก"}</span></div>
    <fieldset disabled={saving || locked} className="admin-user-fields">
      <Field label="ชื่อ" value={draft.name} required maxLength={80} onChange={value => patch("name", value)}/>
      <Field label="อีเมล" type="email" required value={draft.email} maxLength={254} onChange={value => patch("email", value)}/>
      <label className="admin-field"><span>สิทธิ์</span><select className="admin-input" disabled={ownAccount} value={draft.role} onChange={event => patch("role", event.target.value)}><option value="user">สมาชิก</option><option value="admin">ผู้ดูแลระบบ</option></select></label>
      <button className="admin-btn admin-btn-primary" disabled={saving || locked || !dirty}>{saving ? "กำลังบันทึก…" : "บันทึกบัญชี"}</button>
    </fieldset>
    {ownAccount && <p className="admin-row-hint">หากต้องการเปลี่ยนสิทธิ์บัญชีของคุณ ให้ผู้ดูแลคนอื่นดำเนินการ</p>}
    {error && <p className="admin-row-error" role="alert">{error}</p>}{notice && <p className="admin-row-success" role="status">{notice}</p>}
  </form>;
}

function PostsPanel({ markDirty, markBusy }) {
  const { items: posts, setItems: setPosts, loading, error, version, hasBusyRows, load, dirty, busy } = useAdminList(api.posts, "โหลดโพสต์ล่าสุดและทิ้งการแก้ไขโพสต์ที่ยังไม่บันทึก?", "post", markDirty, markBusy);
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("all");
  const needle = query.trim().toLocaleLowerCase();
  const matches = post => (category === "all" || post.category === category) && `${post.authorName} ${post.content} ${(post.comments || []).map(comment => `${comment.authorName} ${comment.content}`).join(" ")}`.toLocaleLowerCase().includes(needle);
  const visibleCount = posts.filter(matches).length;
  return <Card title="ดูแลชุมชน" text="แก้ข้อความและหมวดหมู่ ลบโพสต์หรือความคิดเห็น การบันทึกและการลบมีผลทันที">
    <div className="admin-panel-toolbar">
      <Field label="ค้นหาโพสต์" type="search" value={query} onChange={setQuery} placeholder="ผู้เขียน ข้อความ หรือความคิดเห็น"/>
      <label className="admin-field admin-filter"><span>หมวดหมู่</span><select className="admin-input" value={category} onChange={event => setCategory(event.target.value)}><option value="all">ทุกหมวดหมู่</option>{Object.entries(postCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="admin-btn admin-btn-light" disabled={loading || hasBusyRows} onClick={load}>{loading ? "กำลังโหลด…" : "โหลดโพสต์ล่าสุด"}</button>
    </div>
    {error && <div role="alert" className="admin-message admin-error"><p>โหลดโพสต์ไม่สำเร็จ: {error}</p><button className="admin-btn admin-btn-light" disabled={loading || hasBusyRows} onClick={load}>ลองอีกครั้ง</button></div>}
    <p className="admin-result-count" role="status">{loading ? "กำลังโหลดโพสต์…" : `แสดง ${visibleCount} จาก ${posts.length} โพสต์ล่าสุด`}</p>
    <div className="admin-post-list" aria-busy={loading}>{posts.map(post => <div key={`${post._id}-${version}`} hidden={!matches(post)}><AdminPost post={post} locked={loading} markDirty={dirty} markBusy={busy} onSaved={updated => setPosts(current => current.map(item => item._id === updated._id ? updated : item))} onDeleted={() => setPosts(current => current.filter(item => item._id !== post._id))}/></div>)}</div>
    {!posts.length && !loading && !error && <p className="admin-empty">ยังไม่มีโพสต์ในชุมชน</p>}
    {!loading && posts.length > 0 && !visibleCount && <p className="admin-empty">ไม่พบโพสต์ที่ตรงกับตัวกรอง <button className="admin-text-btn" onClick={() => { setQuery(""); setCategory("all"); }}>ล้างตัวกรอง</button></p>}
  </Card>;
}

function AdminPost({ post, locked, onSaved, onDeleted, markDirty, markBusy }) {
  const [content, setContent] = useState(post.content); const [category, setCategory] = useState(post.category); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  const dirty = content !== post.content || category !== post.category;
  useEffect(() => { setContent(post.content); setCategory(post.category); }, [post.content, post.category]);
  useEffect(() => { markDirty(post._id, dirty); return () => markDirty(post._id, false); }, [post._id, dirty, markDirty]);
  useEffect(() => { markBusy(post._id, busy); return () => markBusy(post._id, false); }, [post._id, busy, markBusy]);
  const act = async (operation, message) => {
    if (busyRef.current || locked) return;
    busyRef.current = true; markBusy(post._id, true);
    setBusy(true); setError(""); setNotice("");
    try { await operation(); setNotice(message); } catch (actionError) { setError(actionError.message); }
    finally { busyRef.current = false; markBusy(post._id, false); setBusy(false); }
  };
  const save = () => {
    if (busyRef.current || locked || !dirty) return;
    if (!content.trim()) { setError("กรุณาระบุข้อความโพสต์"); return; }
    act(async () => onSaved(await api.updatePost(post._id, { content: content.trim(), category })), "บันทึกโพสต์แล้ว");
  };
  const removePost = () => {
    if (busyRef.current || locked || !window.confirm("ลบโพสต์นี้รวมถึงความคิดเห็นทั้งหมดอย่างถาวร?")) return;
    act(async () => { await api.deletePost(post._id); onDeleted(); }, "");
  };
  const removeComment = comment => {
    if (busyRef.current || locked || !window.confirm(`ลบความคิดเห็นของ ${comment.authorName} อย่างถาวร?`)) return;
    act(async () => {
      const updated = await api.deleteComment(post._id, comment._id);
      onSaved({ ...post, comments: updated.comments });
    }, "ลบความคิดเห็นแล้ว");
  };
  return <article className="admin-post" aria-busy={busy}>
    <div className="admin-user-heading"><div><b>{post.authorName}</b><small>{new Date(post.createdAt).toLocaleString("th-TH")}</small></div><span>{postCategories[post.category]} · {post.comments?.length || 0} ความคิดเห็น</span></div>
    <fieldset className="admin-fieldset" disabled={busy || locked}>
      <Field label="ข้อความโพสต์" multiline value={content} maxLength={800} onChange={value => { setContent(value); setNotice(""); setError(""); }}/>
      <label className="admin-field"><span>หมวดหมู่</span><select className="admin-input" value={category} onChange={event => { setCategory(event.target.value); setNotice(""); setError(""); }}>{Object.entries(postCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {post.mediaData && isHttps(post.mediaData) && <div className="admin-post-media">{post.mediaType === "video" ? <video src={post.mediaData} controls preload="metadata"/> : <img src={post.mediaData} alt="ไฟล์แนบโพสต์" loading="lazy"/>}</div>}
      <div className="admin-actions"><button type="button" className="admin-btn admin-btn-primary" disabled={busy || locked || !dirty} onClick={save}>{busy ? "กำลังดำเนินการ…" : "บันทึกโพสต์"}</button><button type="button" className="admin-text-btn admin-danger" onClick={removePost}>ลบโพสต์</button></div>
      <div className="admin-comments">{post.comments?.map(comment => <div key={comment._id}><p><b>{comment.authorName}</b><span>{comment.content}</span></p><button type="button" className="admin-text-btn admin-danger" onClick={() => removeComment(comment)} aria-label={`ลบความคิดเห็นของ ${comment.authorName}`}>ลบ</button></div>)}</div>
    </fieldset>
    {error && <p role="alert" className="admin-row-error">{error}</p>}{notice && <p role="status" className="admin-row-success">{notice}</p>}
  </article>;
}
