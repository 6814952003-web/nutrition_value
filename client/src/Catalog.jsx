import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { BrandLogo } from "./SiteContext";
import "./catalog.css";

export const nutrientFields = {
  energyKcal: ["พลังงาน", "kcal"], proteinG: ["โปรตีน", "g"], carbohydrateG: ["คาร์โบไฮเดรต", "g"],
  fatG: ["ไขมัน", "g"], saturatedFatG: ["ไขมันอิ่มตัว", "g"], sugarG: ["น้ำตาล", "g"],
  fiberG: ["ใยอาหาร", "g"], sodiumMg: ["โซเดียม", "mg"], cholesterolMg: ["คอเลสเตอรอล", "mg"],
};
export const stateLabels = { raw: "ดิบ", cooked: "สุก", processed: "แปรรูป" };
export const nutrientText = value => Number.isFinite(value) && value >= 0 ? new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value) : "ไม่มีข้อมูล";
export function filterCatalog(items, search, category) {
  const needle = search.trim().toLocaleLowerCase();
  return items.filter(item => (!category || item.category === category) && (!needle || `${item.nameTh} ${item.nameEn}`.toLocaleLowerCase().includes(needle)));
}

export function NutritionTable({ nutrients = {} }) {
  return <table className="catalog-nutrition"><caption className="sr-only">รายละเอียดโภชนาการ</caption><tbody>{Object.entries(nutrientFields).map(([key, [label, unit]]) => <tr key={key}><th scope="row">{label}</th><td>{nutrientText(nutrients[key])}{Number.isFinite(nutrients[key]) && <span> {unit}</span>}</td></tr>)}</tbody></table>;
}
export function PhotoCredit({ image, needsImage }) {
  if (needsImage || !image?.photographer) return <p className="catalog-muted">รูปสำรอง · ยังไม่มีรูปที่ตรวจสอบแล้ว</p>;
  return <p className="catalog-muted">ภาพโดย <a href={image.sourceUrl || undefined} target="_blank" rel="noreferrer">{image.photographer} / {image.source}</a> · {image.license}</p>;
}
export function SourceReference({ source }) {
  if (!source) return <p className="catalog-muted">ยังไม่มีข้อมูลจากแหล่งอ้างอิงที่ตรงกับวัตถุดิบนี้ ช่องที่ตรวจสอบไม่ได้จึงเว้นเป็นไม่มีข้อมูล</p>;
  return <div className="catalog-source"><b>แหล่งอ้างอิงโภชนาการ</b><a href={source.url} target="_blank" rel="noreferrer">{source.provider} · {source.title}</a><p>{source.matchedDescription}</p><small>รหัสข้อมูล {source.foodId} · ตรวจข้อมูล {source.retrievedAt?.slice(0, 10)}</small></div>;
}

export function CatalogDetail({ item, kind, ingredients, onClose, onAddRecipe }) {
  const closeButton = useRef(null);
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const key = event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
      if (!controls.length) return;
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus?.(); };
  }, [onClose]);
  const ingredient = kind === "ingredients";
  const canTrack = !ingredient && ["energyKcal", "proteinG", "carbohydrateG", "fatG"].every(key => Number.isFinite(item.nutrients?.[key]));
  return <div className="catalog-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="catalog-detail-title" className="catalog-detail">
    <button ref={closeButton} type="button" className="catalog-close" onClick={onClose} aria-label="ปิดรายละเอียด">×</button>
    <img className="catalog-detail-image" src={item.image?.imageUrl || "/images/catalog/placeholder.svg"} alt={item.needsImage ? "รูปสำรอง" : item.nameTh}/>
    <div className="catalog-detail-body"><span className="catalog-category">{item.category}</span><h2 id="catalog-detail-title">{item.nameTh}</h2><p className="catalog-muted">{item.nameEn}{ingredient && ` · ${stateLabels[item.state] || item.state}`}</p>
      <p className="catalog-basis">{ingredient ? `ต่อ ${item.referenceGrams} กรัม · ${item.referenceBasis}` : `ต่อหนึ่งเสิร์ฟ ${item.servingGrams} กรัม`}</p>
      <NutritionTable nutrients={item.nutrients}/>
      {!ingredient && <><h3>วัตถุดิบในหนึ่งเสิร์ฟ</h3><ul className="catalog-ingredients">{item.ingredients.map(part => { const entry = ingredients.find(value => value.id === part.ingredientId); return <li key={part.ingredientId}><span>{entry?.nameTh || part.ingredientId} {entry?.state && `(${stateLabels[entry.state]})`}</span><b>{part.grams} กรัม</b></li>; })}</ul><p className="catalog-muted">คำนวณจากข้อมูลต่อ 100 กรัมของวัตถุดิบ หากวัตถุดิบใดไม่มีข้อมูลสารอาหารนั้น ยอดรวมสารอาหารนั้นจะแสดงว่าไม่มีข้อมูล</p>{onAddRecipe && <button type="button" className="catalog-button" disabled={!canTrack} onClick={() => { onAddRecipe(item); onClose(); }}>{canTrack ? "บันทึกมื้อนี้" : "ข้อมูลพลังงานหรือสารอาหารหลักยังไม่ครบ"}</button>}</>}
      {ingredient ? <SourceReference source={item.source}/> : item.ingredients.map(part => { const entry = ingredients.find(value => value.id === part.ingredientId); return entry && <div key={part.ingredientId}><h4>{entry.nameTh}</h4><SourceReference source={entry.source}/></div>; })}
      {item.notes && <p className="catalog-muted">{item.notes}</p>}
      <PhotoCredit image={item.image} needsImage={item.needsImage}/><a href="/image-credits" className="catalog-credit-link">เครดิตรูปภาพทั้งหมด</a><p className="catalog-disclaimer">ค่าโภชนาการเป็นค่าประมาณ</p>
    </div>
  </section></div>;
}

export function CatalogGrid({ catalog, onAddRecipe }) {
  const [kind, setKind] = useState("recipes");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const entries = catalog[kind] || [];
  const categories = [...new Set(entries.map(item => item.category))];
  const items = useMemo(() => filterCatalog(entries, search, category), [entries, search, category]);
  const changeKind = next => { setKind(next); setCategory(""); setSelected(null); };
  return <><div className="catalog-tabs" role="group" aria-label="เลือกประเภทอาหาร"><button type="button" aria-pressed={kind === "ingredients"} onClick={() => changeKind("ingredients")}>วัตถุดิบ <span>{catalog.ingredients?.length || 0}</span></button><button type="button" aria-pressed={kind === "recipes"} onClick={() => changeKind("recipes")}>เมนูอาหารไทย <span>{catalog.recipes?.length || 0}</span></button></div>
    <div className="catalog-filters"><label><span>ค้นหาชื่อไทยหรืออังกฤษ</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาวัตถุดิบหรือเมนู…"/></label><label><span>หมวดหมู่</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">ทุกหมวด</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <p className="catalog-count">พบ {items.length} รายการ</p><div className="catalog-grid">{items.map(item => <article className="catalog-card" key={item.id}><button type="button" onClick={() => setSelected(item)} aria-label={`ดูโภชนาการ ${item.nameTh}`}><div className="catalog-cover"><img src={item.image?.imageUrl || "/images/catalog/placeholder.svg"} alt={item.needsImage ? "รูปสำรอง" : item.nameTh} loading="lazy"/>{item.needsImage && <span>รอรูปภาพ</span>}</div><div className="catalog-card-body"><span className="catalog-category">{item.category}</span><h3>{item.nameTh}</h3><p>{item.nameEn}</p><p className="catalog-muted">{kind === "ingredients" ? `${stateLabels[item.state]} · ต่อ 100 กรัม` : `หนึ่งเสิร์ฟ ${item.servingGrams} กรัม`}</p><b>{nutrientText(item.nutrients?.energyKcal)}{Number.isFinite(item.nutrients?.energyKcal) ? " kcal" : "พลังงาน"}</b><span className="catalog-detail-link">ดูโภชนาการเต็ม →</span></div></button></article>)}</div>
    {!items.length && <p className="catalog-empty">{entries.length ? "ไม่พบรายการที่ตรงกับการค้นหา" : kind === "recipes" ? "ยังไม่มีเมนูอาหารไทย" : "ยังไม่มีวัตถุดิบ"}</p>}
    <div className="catalog-bottom"><p className="catalog-disclaimer">ค่าโภชนาการเป็นค่าประมาณ</p><a href="/image-credits">เครดิตรูปภาพ</a></div>
    {selected && <CatalogDetail item={selected} kind={kind} ingredients={catalog.ingredients || []} onClose={() => setSelected(null)} onAddRecipe={onAddRecipe}/>}
  </>;
}

export default function Catalog({ onAddRecipe, standalone = false, credits = false, onBack }) {
  const [state, setState] = useState({ catalog: null, error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    api.catalog({ signal: controller.signal }).then(catalog => { if (active) setState({ catalog, error: "" }); }).catch(error => { if (active && error.name !== "AbortError") setState({ catalog: null, error: "โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง" }); });
    return () => { active = false; controller.abort(); };
  }, [retry]);
  const content = state.catalog ? credits ? <ImageCredits catalog={state.catalog}/> : <CatalogGrid catalog={state.catalog} onAddRecipe={onAddRecipe}/> : state.error ? <div role="alert" className="catalog-empty"><p>{state.error}</p><button type="button" className="catalog-button" onClick={() => setRetry(value => value + 1)}>ลองอีกครั้ง</button></div> : <p role="status" className="catalog-empty">กำลังโหลดคลังอาหาร…</p>;
  return standalone ? <main className="account-shell catalog-page"><header><button type="button" className="catalog-button catalog-button-light" onClick={onBack}>← กลับหน้าหลัก</button><BrandLogo compact/></header><h1>{credits ? "เครดิตรูปภาพ" : "วัตถุดิบและเมนูอาหารไทย"}</h1>{content}</main> : content;
}

export function ImageCredits({ catalog }) {
  const entries = [...(catalog.ingredients || []).map(item => ({ ...item, kindLabel: "วัตถุดิบ" })), ...(catalog.recipes || []).map(item => ({ ...item, kindLabel: "เมนู" }))];
  return <><p className="catalog-muted">ภาพอาหารที่ตรวจสอบแล้วเก็บบนเว็บไซต์นี้ พร้อมเครดิตและลิงก์ภาพต้นฉบับ ส่วนรายการที่ยังไม่มีรูปตรงใช้รูปสำรอง</p><div className="catalog-grid">{entries.map(item => <article key={`${item.kindLabel}-${item.id}`} className="catalog-card catalog-credit-card"><img src={item.image.imageUrl} alt={item.needsImage ? "รูปสำรอง" : item.nameTh} loading="lazy"/><h2>{item.nameTh}</h2><p>{item.kindLabel}</p><PhotoCredit image={item.image} needsImage={item.needsImage}/></article>)}</div><p className="catalog-disclaimer">ค่าโภชนาการเป็นค่าประมาณ</p></>;
}
