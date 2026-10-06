import { useEffect, useState } from "react";
import { api } from "./api";

export function savedProfileFields(user) {
  return { username: user.username || "", displayName: user.displayName || user.name || "", bio: user.bio || "", profileVisibility: user.profileVisibility === "public" ? "public" : "private" };
}

export function validateProfileFields(fields) {
  if (fields.username && !/^[a-z0-9_-]{3,30}$/.test(fields.username)) return "ชื่อผู้ใช้ต้องยาว 3–30 ตัว ใช้ a–z ตัวเล็ก ตัวเลข _ หรือ -";
  if (!fields.displayName.trim() || fields.displayName.trim().length > 80) return "ชื่อที่แสดงต้องยาว 1–80 ตัวอักษร";
  if (fields.bio.length > 300) return "ไบโอต้องไม่เกิน 300 ตัวอักษร";
  if (fields.profileVisibility === "public" && !fields.username) return "กรุณาตั้งชื่อผู้ใช้ก่อนเปิดโปรไฟล์สาธารณะ";
  return "";
}

export default function ProfileSettings({ user, setUser, onPreview, initialDraft, onDraftChange, onSavingChange, busy = false }) {
  const [draft, setDraft] = useState(() => initialDraft || savedProfileFields(user));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Avatar-only server responses must not overwrite unsaved profile fields.
  useEffect(() => { onDraftChange?.(draft); }, [draft, onDraftChange]);
  const update = (field, value) => { setDraft(current => ({ ...current, [field]: value })); setMessage(""); setError(""); };
  const submit = async event => {
    event.preventDefault();
    if (saving || busy) return;
    const values = { ...draft, displayName: draft.displayName.trim() };
    const invalid = validateProfileFields(values);
    if (invalid) { setError(invalid); return; }
    setSaving(true); onSavingChange?.(true); setError(""); setMessage("");
    try {
      const updated = await api.updateMyProfile(values);
      setUser(updated); setDraft(savedProfileFields(updated)); setMessage("บันทึกโปรไฟล์แล้ว");
    } catch (failure) { setError(failure.message || "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSaving(false); onSavingChange?.(false); }
  };
  const publicPath = user.username ? `/u/${encodeURIComponent(user.username)}` : "";
  return <section className="mt-6 rounded-[1.6rem] border border-[#d9dfd7] bg-[#fffefa]/95 p-5 shadow-sm sm:p-7" aria-labelledby="profile-settings-title"><h2 id="profile-settings-title" className="text-xl font-bold">โปรไฟล์และความเป็นส่วนตัว</h2><p className="mt-2 text-sm leading-6 text-[#66746c]">โปรไฟล์สาธารณะแสดงเฉพาะรูป ชื่อที่แสดง ไบโอ วันที่เข้าร่วม streak และโพสต์ในชุมชน</p>
    <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={saving}><fieldset disabled={saving || busy} className="space-y-4">
      <label className="block text-sm font-semibold" htmlFor="profile-username">ชื่อผู้ใช้สำหรับ URL<input id="profile-username" name="username" value={draft.username} onChange={event => update("username", event.target.value.toLowerCase())} minLength={3} maxLength={30} pattern="[a-z0-9_\-]{3,30}" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-2 block w-full rounded-xl border border-[#ccd8c5] bg-white px-4 py-3 font-normal" aria-describedby="profile-username-hint"/><span id="profile-username-hint" className="mt-2 block text-xs font-normal text-[#66746c]">3–30 ตัว ใช้ a–z ตัวเล็ก ตัวเลข _ หรือ - เช่น /u/nouri_friend</span></label>
      <label className="block text-sm font-semibold" htmlFor="profile-display-name">ชื่อที่แสดง<input id="profile-display-name" name="displayName" value={draft.displayName} onChange={event => update("displayName", event.target.value)} required maxLength={80} className="mt-2 block w-full rounded-xl border border-[#ccd8c5] bg-white px-4 py-3 font-normal"/></label>
      <label className="block text-sm font-semibold" htmlFor="profile-bio">ไบโอ<textarea id="profile-bio" name="bio" value={draft.bio} onChange={event => update("bio", event.target.value)} maxLength={300} rows={3} className="mt-2 block w-full resize-y rounded-xl border border-[#ccd8c5] bg-white px-4 py-3 font-normal"/><span className="mt-1 block text-right text-xs font-normal text-[#66746c]">{draft.bio.length}/300</span></label>
      <fieldset className="rounded-xl border border-[#d9dfd7] p-4"><legend className="px-1 text-sm font-semibold">ความเป็นส่วนตัว</legend><label className="mr-6 inline-flex items-center gap-2 text-sm"><input type="radio" name="profileVisibility" value="private" checked={draft.profileVisibility === "private"} onChange={() => update("profileVisibility", "private")}/>ส่วนตัว</label><label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="profileVisibility" value="public" checked={draft.profileVisibility === "public"} onChange={() => update("profileVisibility", "public")}/>สาธารณะ</label><p className="mt-3 text-xs leading-6 text-[#66746c]">ส่วนตัว: คนอื่นเปิดหน้าโปรไฟล์ไม่ได้ โพสต์ในชุมชนยังแสดงในชุมชนตามเดิม การเปลี่ยนค่านี้มีผลหลังบันทึก</p></fieldset>
      <button type="submit" className="rounded-xl bg-[var(--forest)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}</button>
    </fieldset>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-[#edf5df] p-3 text-sm text-[var(--forest)]">{message}</p>}</form>
    {publicPath && <p className="mt-5 break-all text-sm"><span className="font-semibold">URL โปรไฟล์: </span><a className="underline underline-offset-4" href={publicPath}>{typeof location === "undefined" ? publicPath : `${location.origin}${publicPath}`}</a><span className="mt-1 block text-xs text-[#66746c]">{user.profileVisibility === "public" ? "โปรไฟล์ที่บันทึกแล้วเปิดให้ทุกคนดู" : "โปรไฟล์ที่บันทึกแล้วยังเป็นส่วนตัว"}</span></p>}
    <button type="button" disabled={saving || busy} onClick={() => onPreview?.(draft)} className="mt-5 rounded-xl border border-[#bfcbbd] px-4 py-3 text-sm font-semibold text-[var(--forest)] disabled:opacity-60">พรีวิวมุมมองคนอื่น</button><p className="mt-2 text-xs leading-6 text-[#66746c]">พรีวิวแสดงข้อมูลที่บันทึกแล้วเท่านั้น กรุณาบันทึกก่อนดูการแก้ไขล่าสุด</p>
  </section>;
}
