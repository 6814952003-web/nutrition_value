import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { CatalogEmoji } from "./catalog-emoji";
import { summarizeFoodLogs } from "./food-log-summary";

const mealOrder = ["breakfast", "lunch", "dinner", "snack"];
const mealLabels = { breakfast: "เช้า", lunch: "กลางวัน", dinner: "เย็น", snack: "ของว่าง" };
const nutrientFields = [
  ["energyKcal", "พลังงาน", "kcal", "calories"],
  ["proteinG", "โปรตีน", "g", "protein"],
  ["carbohydrateG", "คาร์โบไฮเดรต", "g", "carbs"],
  ["fatG", "ไขมัน", "g", "fat"],
];
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const formatNumber = value => Number.isFinite(value) ? new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value) : "ไม่มีข้อมูล";
const formatTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
};
const displayQuantity = log => log.itemType === "ingredient"
  ? Math.round(log.servings * (log.referenceGrams || 100) * 10) / 10
  : log.servings;
const addDays = (date, offset) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

export default function FoodLogHistory({ goals }) {
  const [date, setDate] = useState(todayKey);
  const [logs, setLogs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    api.foodLogs(date, new Date(`${date}T12:00:00`).getTimezoneOffset(), { signal: controller.signal })
      .then(result => {
        if (active) { setLogs(result); setDrafts({}); }
      })
      .catch(failure => { if (active && failure.name !== "AbortError") setError(failure.message || "โหลดบันทึกการกินไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [date]);

  const summary = useMemo(() => summarizeFoodLogs(logs), [logs]);
  const totals = {
    energyKcal: summary.totals.calories,
    proteinG: summary.totals.protein,
    carbohydrateG: summary.totals.carbs,
    fatG: summary.totals.fat,
  };
  const hasIncompleteNutrition = Object.values(summary.incomplete).some(Boolean);

  const updateLog = async log => {
    const enteredQuantity = Number(drafts[log._id] ?? displayQuantity(log));
    const servings = log.itemType === "ingredient"
      ? enteredQuantity / (log.referenceGrams || 100)
      : enteredQuantity;
    if (!Number.isFinite(servings) || servings < 0.1 || servings > 100) {
      setError(log.itemType === "ingredient" ? "ปริมาณวัตถุดิบต้องอยู่ในช่วง 10–10,000 กรัม" : "จำนวนเสิร์ฟต้องอยู่ระหว่าง 0.1 ถึง 100");
      return;
    }
    setBusyId(log._id); setError(""); setNotice("");
    try {
      const saved = await api.updateFoodLog(log._id, { servings });
      setLogs(current => current.map(item => item._id === saved._id ? saved : item));
      setDrafts(current => { const next = { ...current }; delete next[log._id]; return next; });
      setNotice("อัปเดตจำนวนเสิร์ฟแล้ว");
    } catch (failure) { setError(failure.message || "แก้ไขบันทึกไม่สำเร็จ"); }
    finally { setBusyId(""); }
  };

  const removeLog = async log => {
    if (!window.confirm(`ลบบันทึก "${log.menuName}" ใช่หรือไม่`)) return;
    setBusyId(log._id); setError(""); setNotice("");
    try {
      await api.deleteFoodLog(log._id);
      setLogs(current => current.filter(item => item._id !== log._id));
      setNotice("ลบบันทึกแล้ว");
    } catch (failure) { setError(failure.message || "ลบบันทึกไม่สำเร็จ"); }
    finally { setBusyId(""); }
  };

  return <section className="food-log-history mt-7 rounded-[1.6rem] border border-[#d9dfd7] bg-[#fffefa]/95 p-5 shadow-sm sm:p-7" aria-labelledby="food-log-history-title">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="food-log-history-title" className="text-xl font-bold">บันทึกการกิน</h2><p className="mt-1 text-xs text-[#66746c]">ข้อมูลนี้เป็นส่วนตัวและไม่แสดงบนโปรไฟล์สาธารณะ</p></div>
      <label className="text-sm font-semibold">เลือกวันที่<input aria-label="วันที่บันทึกการกิน" className="ml-2 rounded-lg border border-[#ccd8c5] bg-white px-3 py-2 font-normal" type="date" value={date} max={todayKey()} onChange={event => setDate(event.target.value)}/></label>
    </header>
    <nav className="mt-4 flex gap-2"><button type="button" className="food-log-secondary" onClick={() => setDate(current => addDays(current, -1))}>← วันก่อน</button><button type="button" className="food-log-secondary" disabled={date >= todayKey()} onClick={() => setDate(current => addDays(current, 1))}>วันถัดไป →</button></nav>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#edf5df] p-3 text-sm text-[var(--forest)]">{notice}</p>}
    {loading ? <p role="status" className="mt-6 text-center text-sm text-[#66746c]">กำลังโหลดบันทึก…</p>
      : !logs.length ? <p className="mt-6 rounded-xl bg-[#f4f7ed] p-5 text-center text-sm text-[#66746c]">ยังไม่มีบันทึกการกินในวันนี้</p>
        : <>
          {hasIncompleteNutrition && <p className="mt-4 text-xs text-amber-800" role="note">ยอดรวมเป็นตัวเลขจากค่าที่มี ไม่รวมรายการที่ไม่มีข้อมูลโภชนาการ</p>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {nutrientFields.map(([key, label, unit, goalKey]) => {
              const goal = goals?.[goalKey];
              const percent = Number.isFinite(totals[key]) && Number.isFinite(goal) && goal > 0 ? Math.min(100, Math.round(totals[key] / goal * 100)) : null;
              return <article key={key} className="rounded-xl border border-[#e0e7d9] bg-white p-4"><div className="flex justify-between gap-2 text-sm"><span>{label}</span><b>{formatNumber(totals[key])}{Number.isFinite(totals[key]) && ` ${unit}`}</b></div>
                {Number.isFinite(goal) && <><p className="mt-2 text-xs text-[#66746c]">เป้าหมาย {formatNumber(goal)} {unit}{percent !== null && ` · ${percent}%`}</p>{percent !== null && <div className="mt-2 h-2 overflow-hidden rounded bg-[#edf4df]"><div className="h-full bg-[var(--forest)]" style={{ width: `${percent}%` }}/></div>}</>}
              </article>;
            })}
          </div>
          <div className="mt-6 space-y-5">{mealOrder.map(meal => {
            const entries = logs.filter(log => log.meal === meal);
            if (!entries.length) return null;
            return <section key={meal} aria-labelledby={`food-log-${meal}`}><h3 id={`food-log-${meal}`} className="mb-3 font-bold">{mealLabels[meal]}</h3><div className="space-y-3">
              {entries.map(log => <article key={log._id} className="food-log-entry"><CatalogEmoji item={{ id: log.menuId, nameTh: log.menuName }} kind={log.itemType === "ingredient" ? "ingredients" : "recipes"} label={log.menuName}/><div className="min-w-0 flex-1"><h4 className="font-semibold">{log.menuName}</h4><p className="mt-1 text-xs text-[#66746c]">{formatTime(log.eatenAt)} · {formatNumber(log.nutrients?.energyKcal)} kcal</p><label className="mt-3 flex items-center gap-2 text-xs">{log.itemType === "ingredient" ? "ปริมาณ (กรัม)" : "จำนวนเสิร์ฟ"}<input type="number" min={log.itemType === "ingredient" ? 10 : 0.1} max={log.itemType === "ingredient" ? 10000 : 100} step={log.itemType === "ingredient" ? 1 : 0.1} value={drafts[log._id] ?? displayQuantity(log)} disabled={busyId === log._id} onChange={event => setDrafts(current => ({ ...current, [log._id]: event.target.value }))} className="w-24 rounded-lg border border-[#ccd8c5] px-2 py-1"/></label></div><div className="flex flex-col gap-2"><button type="button" disabled={busyId === log._id || String(drafts[log._id] ?? displayQuantity(log)) === String(displayQuantity(log))} onClick={() => updateLog(log)} className="food-log-secondary">บันทึกจำนวน</button><button type="button" disabled={busyId === log._id} onClick={() => removeLog(log)} className="food-log-danger">ลบ</button></div></article>)}
            </div></section>;
          })}</div>
        </>}
  </section>;
}
