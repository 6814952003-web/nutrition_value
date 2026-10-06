import { useEffect, useState } from "react";
import { api } from "./api";
import { uploadFile } from "./upload";
import { NutritionTable, nutrientFields, stateLabels } from "./Catalog";

const placeholder = { imageUrl: "/images/catalog/placeholder.svg", photographer: "", sourceUrl: "", source: "Placeholder", license: "Original placeholder" };
const licenses = { Unsplash: "Unsplash License", Pexels: "Pexels License", Pixabay: "Pixabay Content License", "Admin upload": "Owner-provided rights" };
const blankItem = kind => ({ id: "", nameTh: "", nameEn: "", category: kind === "ingredients" ? "เนื้อสัตว์และอาหารทะเล" : "ตามสั่ง", image: { ...placeholder }, needsImage: true,
  ...(kind === "ingredients" ? { state: "raw", referenceBasis: "ส่วนที่รับประทานได้", referenceGrams: 100, nutrients: Object.fromEntries(Object.keys(nutrientFields).map(key => [key, null])), source: null, notes: "", dataStatus: "unmatched" } : { servingGrams: 300, ingredients: [] }),
});
export function recipeInput(item) {
  return Object.fromEntries(["id", "nameTh", "nameEn", "category", "servingGrams", "ingredients", "image", "needsImage"].map(key => [key, item[key]]));
}
export function previewRecipe(item, ingredients) {
  return Object.fromEntries(Object.keys(nutrientFields).map(key => {
    if (!item.ingredients?.length) return [key, null];
    let total = 0;
    for (const part of item.ingredients) {
      const value = ingredients.find(entry => entry.id === part.ingredientId)?.nutrients?.[key];
      if (!Number.isFinite(value) || !Number.isFinite(part.grams) || part.grams <= 0) return [key, null];
      total += value * part.grams / 100;
    }
    return [key, total];
  }));
}

export function matchBatchImages(files, items) {
  const unused = new Set(items.filter(item => item.needsImage).map(item => item.id));
  return [...files].map((file, index) => {
    const name = file.name.replace(/\.[^.]+$/, "").toLowerCase();
    const itemId = unused.has(name) ? name : "";
    if (itemId) unused.delete(itemId);
    return { key: `${file.name}-${file.lastModified}-${file.size}-${index}`, file, itemId };
  });
}

export function validateBatchImages(rows, items, photographer, rights) {
  if (!rows.length || rows.length > 10) return "เลือกภาพครั้งละ 1–10 ภาพ";
  if (!photographer.trim()) return "กรอกชื่อผู้ถ่ายภาพ";
  if (!rights) return "กรุณายืนยันว่ามีสิทธิ์ใช้ภาพและอนุญาตให้นำขึ้นเว็บไซต์";
  if (rows.some(row => !row.itemId)) return "กรุณาเลือกรายการเมนูหรือวัตถุดิบให้ครบทุกภาพ";
  const ids = rows.map(row => row.itemId);
  if (new Set(ids).size !== ids.length) return "ห้ามจับคู่หลายภาพกับรายการเดียวกันในชุดเดียว";
  if (rows.some(row => !items.some(item => item.id === row.itemId && item.needsImage))) {
    return "รายการที่เลือกไม่มีอยู่แล้วหรือมีรูปแล้ว กรุณาโหลดคลังล่าสุด";
  }
  return "";
}

export function energyPruneCounts(catalog) {
  return {
    ingredients: catalog.ingredients.filter(item => !Number.isFinite(item.nutrients?.energyKcal)).length,
    recipes: catalog.recipes.filter(item => !Number.isFinite(item.nutrients?.energyKcal)).length,
  };
}

export default function CatalogAdmin({ user, markDirty, markBusy }) {
  const [catalog, setCatalog] = useState(null);
  const [kind, setKind] = useState("ingredients");
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rights, setRights] = useState(false);
  const [imageMetadata, setImageMetadata] = useState({ source: "Pexels", photographer: "", sourceUrl: "" });
  const [batchRows, setBatchRows] = useState([]);
  const [batchPhotographer, setBatchPhotographer] = useState("");
  const [batchRights, setBatchRights] = useState(false);
  useEffect(() => { const controller = new AbortController(); api.catalog({ signal: controller.signal }).then(setCatalog).catch(failure => { if (failure.name !== "AbortError") setError("โหลดคลังอาหารไม่สำเร็จ"); }); return () => controller.abort(); }, []);
  useEffect(() => { markDirty?.("catalog", !!draft); }, [draft, markDirty]);
  useEffect(() => { markBusy?.("catalog", busy); }, [busy, markBusy]);
  useEffect(() => () => { markDirty?.("catalog", false); markBusy?.("catalog", false); }, []);
  const choose = item => {
    if (draft && !window.confirm("ยกเลิกแบบร่างที่ยังไม่บันทึกหรือไม่?")) return;
    setDraft(item ? structuredClone(kind === "recipes" ? recipeInput(item) : item) : blankItem(kind));
    setEditing(!!item); setMessage(""); setError(""); setRights(false);
  };
  const patch = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setMessage(""); };
  const changeKind = next => { if (draft && !window.confirm("ยกเลิกแบบร่างที่ยังไม่บันทึกหรือไม่?")) return; setKind(next); setDraft(null); setError(""); setMessage(""); };
  const save = async event => {
    event.preventDefault(); if (busy || !draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const value = kind === "recipes" ? recipeInput(draft) : draft;
      const result = await api.saveCatalogItem(kind, value.id, catalog.revision, value, !editing);
      setCatalog(result); setDraft(null); setMessage("บันทึกคลังอาหารแล้ว โภชนาการเมนูคำนวณจากวัตถุดิบโดยระบบ");
    } catch (failure) { setError(failure.status === 409 ? "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดคลังอาหารล่าสุดก่อนบันทึก" : failure.message); }
    finally { setBusy(false); }
  };
  const replacePhoto = async event => {
    const input = event.currentTarget; const file = input.files?.[0]; input.value = "";
    if (!file || busy) return;
    const ownerUpload = imageMetadata.source === "Admin upload";
    if (!rights || !imageMetadata.photographer.trim() || (ownerUpload ? imageMetadata.sourceUrl !== "" : !imageMetadata.sourceUrl.startsWith("https://"))) { setError("ระบุชื่อผู้ถ่าย ลิงก์หน้ารูป (ถ้ามี) และยืนยันสิทธิ์ก่อนอัปโหลด"); return; }
    try {
      if (!ownerUpload) {
        const url = new URL(imageMetadata.sourceUrl);
        const domain = { Unsplash: "unsplash.com", Pexels: "pexels.com", Pixabay: "pixabay.com" }[imageMetadata.source];
        if (![domain, `www.${domain}`].includes(url.hostname)) throw new Error("ลิงก์หน้ารูปต้องตรงกับแหล่งรูปที่เลือก");
      }
      setBusy(true); setError("");
      const imageUrl = await uploadFile(file, user.id, "site");
      setDraft(current => ({ ...current, image: { ...imageMetadata, photographer: imageMetadata.photographer.trim(), imageUrl, license: licenses[imageMetadata.source] }, needsImage: false }));
      setMessage("อัปโหลดแล้ว กดบันทึกคลังอาหารเพื่อเผยแพร่รูปและเครดิต");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const chooseBatchFiles = event => {
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = "";
    if (files.length > 10) {
      setBatchRows([]);
      setError("เลือกภาพครั้งละไม่เกิน 10 ภาพ เพื่อให้ตรวจสอบและบันทึกเป็นชุดได้");
      return;
    }
    setBatchRows(matchBatchImages(files, catalog?.[kind] || []));
    setError("");
    setMessage("");
  };
  const uploadBatch = async event => {
    event.preventDefault();
    if (busy || !catalog) return;
    const validation = validateBatchImages(batchRows, catalog[kind], batchPhotographer, batchRights);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setMessage("");
    let current = catalog;
    let completed = 0;
    try {
      for (const row of batchRows) {
        const item = current[kind].find(entry => entry.id === row.itemId);
        if (!item?.needsImage) throw new Error(`รายการ ${row.itemId} มีการเปลี่ยนแปลง กรุณาโหลดคลังล่าสุด`);
        setMessage(`กำลังอัปโหลด ${completed + 1}/${batchRows.length}: ${item.nameTh}`);
        const imageUrl = await uploadFile(row.file, user.id, "site");
        const updatedItem = {
          ...item,
          image: { imageUrl, photographer: batchPhotographer.trim(), sourceUrl: "", source: "Admin upload", license: licenses["Admin upload"] },
          needsImage: false,
        };
        current = await api.saveCatalogItem(kind, item.id, current.revision, updatedItem);
        setCatalog(current);
        setBatchRows(rows => rows.filter(entry => entry.key !== row.key));
        completed += 1;
      }
      setBatchRights(false);
      setMessage(`อัปโหลดและบันทึกรูปสำเร็จ ${completed} ภาพ`);
    } catch (failure) {
      setCatalog(current);
      setError(`อัปโหลดหยุดหลังบันทึกสำเร็จ ${completed}/${batchRows.length} ภาพ: ${failure.message}`);
    } finally { setBusy(false); }
  };
  const remove = async item => {
    if (busy || !window.confirm(`ลบ ${item.nameTh} ออกจากคลังอาหารหรือไม่?`)) return;
    setBusy(true); setError("");
    try { setCatalog(await api.deleteCatalogItem(kind, item.id, catalog.revision)); setMessage("ลบรายการแล้ว"); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const pruneWithoutEnergy = async () => {
    if (busy || !catalog) return;
    const counts = energyPruneCounts(catalog);
    if (!counts.ingredients && !counts.recipes) return;
    const confirmed = window.confirm(`ลบวัตถุดิบ ${counts.ingredients} รายการและเมนู ${counts.recipes} รายการที่ไม่มีค่าพลังงานออกจากคลังหรือไม่? การลบย้อนกลับไม่ได้ แต่ไม่ลบบันทึกการกินเดิม`);
    if (!confirmed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.pruneCatalogWithoutEnergy(catalog.revision, counts.ingredients, counts.recipes);
      setCatalog(result.catalog);
      setDraft(null);
      setMessage(`ลบวัตถุดิบ ${result.removedIngredients} รายการและเมนู ${result.removedRecipes} รายการแล้ว`);
    } catch (failure) {
      setError(failure.status === 409 ? "คลังเปลี่ยนระหว่างตรวจสอบ กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง" : failure.message);
    } finally { setBusy(false); }
  };
  return <section className="catalog-admin"><h2>คลังวัตถุดิบและเมนูอาหารไทย</h2><p className="catalog-muted">วัตถุดิบใช้ข้อมูลอ้างอิงต่อ 100 กรัม ส่วนเมนูคำนวณจากกรัมวัตถุดิบ ไม่มีช่องกรอกยอดโภชนาการเมนูเอง</p>
    {error && <p role="alert" className="catalog-admin-status catalog-admin-error">{error}</p>}{message && <p role="status" className="catalog-admin-status">{message}</p>}
    {!catalog ? <p role="status">กำลังโหลดคลังอาหาร…</p> : <><div className="catalog-tabs"><button type="button" aria-pressed={kind === "ingredients"} disabled={busy} onClick={() => changeKind("ingredients")}>วัตถุดิบ {catalog.ingredients.length}</button><button type="button" aria-pressed={kind === "recipes"} disabled={busy} onClick={() => changeKind("recipes")}>เมนู {catalog.recipes.length}</button></div>
      <p className="catalog-muted">ขาดรูป {catalog[kind].filter(item => item.needsImage).length} รายการ · ค่าที่ไม่มีแหล่งข้อมูลต้องเว้นว่าง</p>
      <div className="catalog-admin-actions"><button type="button" className="catalog-button" disabled={busy} onClick={() => choose(null)}>＋ เพิ่ม{kind === "ingredients" ? "วัตถุดิบ" : "เมนู"}</button><button type="button" className="catalog-button catalog-button-light" disabled={busy} onClick={async () => { if (draft && !window.confirm("โหลดใหม่จะยกเลิกแบบร่าง ยืนยันหรือไม่?")) return; try { setCatalog(await api.catalog()); setDraft(null); setError(""); } catch { setError("โหลดคลังอาหารไม่สำเร็จ"); } }}>โหลดข้อมูลล่าสุด</button></div>
      {!draft && <div className="catalog-prune-warning"><p className="catalog-muted">ไม่มีพลังงาน: {energyPruneCounts(catalog).ingredients} วัตถุดิบ · {energyPruneCounts(catalog).recipes} เมนู</p><button type="button" className="catalog-button catalog-button-light" disabled={busy || (!energyPruneCounts(catalog).ingredients && !energyPruneCounts(catalog).recipes)} onClick={pruneWithoutEnergy}>ลบรายการที่ไม่มีค่าพลังงาน</button></div>}
      {!draft && <form className="catalog-batch-upload" onSubmit={uploadBatch}>
        <h3>อัปโหลดรูปหลายรายการ</h3>
        <p className="catalog-muted">เลือกภาพได้ครั้งละไม่เกิน 10 ไฟล์ ระบบจะจับคู่ชื่อไฟล์ที่ตรงกับรหัสรายการให้อัตโนมัติ หรือเลือกชื่อรายการเอง รูปต้องเป็น PNG, JPG หรือ WebP ไม่เกิน 1.5 MB ต่อรูป และจะแสดงหลังบันทึกแต่ละรายการสำเร็จ</p>
        <label>เลือกรูปภาพ<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={chooseBatchFiles}/></label>
        {!!batchRows.length && <><div className="catalog-batch-list">{batchRows.map(row => <label className="catalog-batch-row" key={row.key}><span>{row.file.name}</span><select required value={row.itemId} disabled={busy} onChange={event => setBatchRows(rows => rows.map(entry => entry.key === row.key ? { ...entry, itemId: event.target.value } : entry))}><option value="">เลือก{kind === "ingredients" ? "วัตถุดิบ" : "เมนู"}</option>{catalog[kind].filter(item => item.needsImage).map(item => <option key={item.id} value={item.id}>{item.nameTh} · {item.id}</option>)}</select></label>)}</div>
          <label>ชื่อผู้ถ่ายภาพ (ใช้ร่วมกันทั้งชุด)<input required maxLength={200} value={batchPhotographer} disabled={busy} onChange={event => setBatchPhotographer(event.target.value)} placeholder="ชื่อผู้ถ่าย หรือชื่อของคุณ"/></label>
          <label className="catalog-rights-confirm"><input type="checkbox" checked={batchRights} disabled={busy} onChange={event => setBatchRights(event.target.checked)}/>ฉันยืนยันว่ามีสิทธิ์ใช้ภาพทุกภาพในชุดนี้ และข้อมูลผู้ถ่ายถูกต้อง</label>
          <button className="catalog-button" type="submit" disabled={busy}>{busy ? "กำลังอัปโหลดและบันทึก…" : `อัปโหลดและบันทึก ${batchRows.length} ภาพ`}</button>
        </>}
      </form>}
      {draft ? <form onSubmit={save}><fieldset disabled={busy}><div className="catalog-admin-grid">
        <label>รหัสรายการ (a–z, ตัวเลข และ -)<input required disabled={editing} value={draft.id} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} onChange={event => patch("id", event.target.value.toLowerCase())}/></label>
        <label>ชื่อไทย<input required value={draft.nameTh} maxLength={160} onChange={event => patch("nameTh", event.target.value)}/></label><label>ชื่ออังกฤษ<input required value={draft.nameEn} maxLength={160} onChange={event => patch("nameEn", event.target.value)}/></label><label>หมวด<input required value={draft.category} maxLength={120} onChange={event => patch("category", event.target.value)}/></label>
      </div>{kind === "ingredients" ? <><div className="catalog-admin-grid"><label>สถานะ<select value={draft.state} onChange={event => patch("state", event.target.value)}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>ปริมาณอ้างอิง<input value="100 กรัม" readOnly/></label><label>ส่วนที่ใช้อ้างอิง<input required value={draft.referenceBasis} maxLength={500} onChange={event => patch("referenceBasis", event.target.value)}/></label></div>
        <div className="catalog-admin-grid">{Object.entries(nutrientFields).map(([key, [label, unit]]) => <label key={key}>{label} ({unit})<input type="number" min="0" step="any" placeholder="ไม่มีข้อมูล" value={draft.nutrients[key] ?? ""} onChange={event => patch("nutrients", { ...draft.nutrients, [key]: event.target.value === "" ? null : Number(event.target.value) })}/></label>)}</div>
        <label>หมายเหตุแหล่งข้อมูล<textarea value={draft.notes || ""} maxLength={2000} onChange={event => patch("notes", event.target.value)}/></label>
        <label>แหล่งอ้างอิง<select value={draft.source?.provider || ""} onChange={event => patch("source", event.target.value ? { provider: event.target.value, title: "", url: "", foodId: "", matchedDescription: "", retrievedAt: new Date().toISOString() } : null)}><option value="">ยังไม่มีแหล่งข้อมูลที่ตรง (ตัวเลขต้องว่าง)</option><option value="USDA FoodData Central">USDA FoodData Central</option><option value="INMUCAL">INMUCAL / ตารางอาหารไทย</option></select></label>
        {draft.source && <div className="catalog-admin-grid">{[["title", "ชื่อข้อมูลอ้างอิง"], ["url", "ลิงก์ข้อมูลทางการ"], ["foodId", "รหัสอาหารในแหล่งอ้างอิง"], ["matchedDescription", "รายละเอียดอาหารที่ตรงกัน"]].map(([key, label]) => <label key={key}>{label}<input required type={key === "url" ? "url" : "text"} value={draft.source[key]} onChange={event => patch("source", { ...draft.source, [key]: event.target.value })}/></label>)}</div>}
      </> : <><label>ขนาดเสิร์ฟ (กรัม)<input required type="number" min="0.01" max="100000" step="any" value={draft.servingGrams} onChange={event => patch("servingGrams", Number(event.target.value))}/></label><h3>วัตถุดิบและปริมาณในหนึ่งเสิร์ฟ</h3>{draft.ingredients.map((part, index) => <div className="catalog-admin-part" key={index}><select required aria-label={`วัตถุดิบที่ ${index + 1}`} value={part.ingredientId} onChange={event => patch("ingredients", draft.ingredients.map((entry, position) => position === index ? { ...entry, ingredientId: event.target.value } : entry))}><option value="">เลือกวัตถุดิบ</option>{catalog.ingredients.map(entry => <option value={entry.id} key={entry.id}>{entry.nameTh} ({stateLabels[entry.state]})</option>)}</select><input aria-label={`กรัมวัตถุดิบที่ ${index + 1}`} required type="number" min="0.01" max="100000" step="any" value={part.grams} onChange={event => patch("ingredients", draft.ingredients.map((entry, position) => position === index ? { ...entry, grams: Number(event.target.value) } : entry))}/><button type="button" onClick={() => patch("ingredients", draft.ingredients.filter((entry, position) => position !== index))}>ลบ</button></div>)}<button type="button" className="catalog-button catalog-button-light" onClick={() => patch("ingredients", [...draft.ingredients, { ingredientId: "", grams: 100 }])}>＋ เพิ่มวัตถุดิบ</button><h3>ตัวอย่างโภชนาการจากวัตถุดิบ</h3><NutritionTable nutrients={previewRecipe(draft, catalog.ingredients)}/><p className="catalog-muted">ระบบคำนวณซ้ำจากฐานข้อมูลเมื่อบันทึก หากส่วนประกอบไม่มีข้อมูล ยอดนั้นแสดงว่าไม่มีข้อมูล</p></>}
      <h3>รูปและเครดิต</h3><img src={draft.image.imageUrl} alt="ตัวอย่างรูป" style={{ maxWidth: 180, maxHeight: 120, objectFit: "contain" }}/><div className="catalog-admin-grid"><label>แหล่งรูป<select value={imageMetadata.source} onChange={event => { setImageMetadata(current => ({ ...current, source: event.target.value, sourceUrl: event.target.value === "Admin upload" ? "" : current.sourceUrl })); setRights(false); }}>{Object.keys(licenses).map(value => <option key={value}>{value}</option>)}</select></label><label>ชื่อผู้ถ่าย<input value={imageMetadata.photographer} onChange={event => setImageMetadata(current => ({ ...current, photographer: event.target.value }))}/></label><label>ลิงก์หน้ารูปต้นฉบับ<input type="url" disabled={imageMetadata.source === "Admin upload"} required={imageMetadata.source !== "Admin upload"} value={imageMetadata.sourceUrl} onChange={event => { setImageMetadata(current => ({ ...current, sourceUrl: event.target.value })); setRights(false); }}/></label></div>
      <label><input style={{ width: "auto", display: "inline", marginRight: 8 }} type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)}/>{imageMetadata.source === "Admin upload" ? "ยืนยันว่าเป็นภาพที่ฉันถ่ายเองหรือมีสิทธิ์ใช้งาน พร้อมระบุชื่อผู้ถ่าย" : "ตรวจแล้วว่ารูปตรงกับรายการ เป็นรูปฟรี และอนุญาตให้ใช้บนเว็บไซต์ตามสิทธิ์ของแหล่งที่เลือก"}</label><label>อัปโหลดรูปใหม่ (PNG/JPG/WebP ไม่เกิน 1.5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={replacePhoto}/></label><button type="button" className="catalog-button catalog-button-light" onClick={() => { patch("image", { ...placeholder }); patch("needsImage", true); }}>ใช้รูปสำรอง</button>
      <div className="catalog-admin-actions"><button className="catalog-button" type="submit">{busy ? "กำลังบันทึก…" : "บันทึกคลังอาหาร"}</button><button type="button" className="catalog-button catalog-button-light" onClick={() => setDraft(null)}>ยกเลิกแบบร่าง</button></div></fieldset></form> : <div className="admin-item-list">{catalog[kind].map(item => <article className="admin-accordion" key={item.id}><div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", padding: 16, gap: 8 }}><span>{item.nameTh} <small>{item.nameEn}</small></span><div><button type="button" disabled={busy} className="admin-text-btn" onClick={() => choose(item)}>แก้ไข / เปลี่ยนรูป</button><button type="button" disabled={busy} className="admin-text-btn" onClick={() => remove(item)}>ลบ</button></div></div></article>)}</div>}
    </>}<p className="catalog-disclaimer">ค่าโภชนาการเป็นค่าประมาณ</p>
  </section>;
}
