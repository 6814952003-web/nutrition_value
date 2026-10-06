import { useEffect, useState } from "react";
import { api } from "./api";
import { BrandLogo, useSite } from "./SiteContext";

export default function PublicProfilePage({ username, preview = false, isPrivate = false, onBack }) {
  const [loaded, setLoaded] = useState({ key: null, profile: null, error: "" });
  const key = preview ? "owner-preview" : username;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!preview && !username) {
      setLoaded({ key, profile: null, error: "unavailable" });
      return () => { active = false; controller.abort(); };
    }
    const load = preview ? api.publicPreview({ signal: controller.signal }) : api.publicProfile(username, { signal: controller.signal });
    load.then(profile => {
      if (active) setLoaded({ key, profile, error: "" });
    }).catch(error => {
      if (active && error.name !== "AbortError") setLoaded({ key, profile: null, error: error.status === 404 ? "unavailable" : "connection" });
    });
    return () => { active = false; controller.abort(); };
  }, [username, preview]);
  const state = loaded.key === key ? loaded : { profile: null, error: "" };
  return <PublicProfileView profile={state.profile} loading={!state.profile && !state.error} error={state.error} preview={preview} isPrivate={isPrivate} onBack={onBack}/>;
}

export function PublicProfileView({ profile, loading = false, error = "", preview = false, isPrivate = false, onBack }) {
  const { copy: { community: c } } = useSite();
  const categories = { food: c.foodCategory, recipe: c.recipeCategory, knowledge: c.knowledgeCategory, workout: c.workoutCategory };
  if (preview && isPrivate) { profile = null; loading = false; error = "unavailable"; }
  const displayName = typeof profile?.displayName === "string" ? profile.displayName : "สมาชิก Nouri";
  const posts = Array.isArray(profile?.posts) ? profile.posts : [];
  const streak = Number.isSafeInteger(profile?.streak) && profile.streak >= 0 ? profile.streak : 0;
  return <main className="account-shell min-h-screen px-5 py-7 text-[var(--ink)] sm:px-8 sm:py-10"><div className="mx-auto max-w-4xl">
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4"><button type="button" onClick={onBack} className="rounded-full border border-[#bfcbbd] bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm">← {preview ? "กลับไปตั้งค่าโปรไฟล์" : "หน้าหลัก"}</button><BrandLogo compact/></header>
    {preview && <aside className="mb-5 rounded-2xl border border-[#ccd8c5] bg-[#f1f5e9] p-4 text-sm leading-6" aria-label="พรีวิวมุมมองคนอื่น"><p className="font-semibold">พรีวิวมุมมองคนอื่น</p><p>{isPrivate ? "โปรไฟล์ที่บันทึกแล้วยังเป็นส่วนตัว คนอื่นจึงเห็นข้อความด้านล่างและดูข้อมูลโปรไฟล์ไม่ได้" : "นี่คือข้อมูลที่บันทึกแล้วซึ่งคนอื่นจะเห็นบนโปรไฟล์สาธารณะ"}</p></aside>}
    {loading ? <section role="status" className="rounded-[1.8rem] border border-[#d9dfd7] bg-[#fffefa] p-8 text-center">กำลังโหลดโปรไฟล์…</section>
      : error || !profile ? <section className="rounded-[1.8rem] border border-[#d9dfd7] bg-[#fffefa] p-8 text-center"><h1 className="text-2xl font-bold">{error === "connection" ? "โหลดโปรไฟล์ไม่สำเร็จ" : "ไม่สามารถดูโปรไฟล์นี้ได้"}</h1><p className="mt-3 text-sm text-[#66746c]">{error === "connection" ? "กรุณาลองใหม่เมื่อเชื่อมต่ออินเทอร์เน็ตได้" : "โปรไฟล์นี้ไม่พร้อมให้ดูสาธารณะ"}</p></section>
      : <><section aria-labelledby="public-profile-name" className="account-hero rounded-[1.8rem] p-6 text-white shadow-[0_20px_50px_rgba(24,56,46,.18)] sm:p-8"><div className="flex flex-wrap items-center gap-5">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[var(--sage)] bg-[var(--sage)] text-[var(--forest)]">{safeImage(profile.avatarUrl) ? <img src={profile.avatarUrl} alt={`รูปโปรไฟล์ของ ${displayName}`} className="h-full w-full object-cover"/> : <span aria-hidden="true" className="text-4xl font-semibold">{displayName.trim().charAt(0).toUpperCase() || "N"}</span>}</div>
        <div className="min-w-0 flex-1"><p className="text-xs font-bold tracking-[.2em] text-[var(--sage)]">โปรไฟล์ชุมชน</p><h1 id="public-profile-name" className="mt-2 break-words text-3xl font-bold sm:text-4xl">{displayName}</h1>{profile.bio && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-emerald-50">{profile.bio}</p>}</div>
      </div><dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/20 pt-5 text-sm"><div><dt className="text-emerald-100">เข้าร่วมเมื่อ</dt><dd className="mt-1 font-semibold">{formatProfileDate(profile.joinedAt)}</dd></div><div><dt className="text-emerald-100">Streak</dt><dd className="mt-1 font-semibold">{streak} วันต่อเนื่อง</dd></div></dl></section>
      <section className="mt-7" aria-labelledby="public-posts-title"><h2 id="public-posts-title" className="mb-4 text-xl font-bold">โพสต์ในชุมชน</h2>{posts.length ? <div className="space-y-5">{posts.map(post => <article key={post._id} className="overflow-hidden rounded-[1.6rem] border border-[#d9dfd7] bg-[#fffefa]/95 p-5 shadow-sm sm:p-7"><header className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#66746c]"><time dateTime={post.createdAt}>{formatProfileDate(post.createdAt, true)}</time><span>{categories[post.category] || "ชุมชน"}</span></header>{post.content && <p className="mt-4 whitespace-pre-wrap break-words leading-7">{post.content}</p>}{safeMedia(post.mediaData) && (post.mediaType === "video" ? <video controls playsInline preload="metadata" src={post.mediaData} className="mx-auto mt-4 block h-auto w-auto max-w-full rounded-xl bg-black object-contain" aria-label="วิดีโอในโพสต์"/> : post.mediaType === "image" && <img src={post.mediaData} alt="รูปภาพในโพสต์" className="mx-auto mt-4 block h-auto w-auto max-w-full rounded-xl object-contain" loading="lazy"/>)}<p className="mt-4 flex flex-wrap gap-4 text-xs text-[#66746c]"><span aria-label={`${safeCount(post.likes)} หัวใจ`}>♡ {safeCount(post.likes)}</span><span>{safeCount(post.commentCount)} ความคิดเห็น</span></p></article>)}</div> : <p className="rounded-2xl border border-[#d9dfd7] bg-[#fffefa] p-6 text-sm text-[#66746c]">ยังไม่มีโพสต์ในชุมชน</p>}</section></>}
  </div></main>;
}

function safeCount(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function safeImage(value) { return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(value)); }
function safeMedia(value) { return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:(?:image\/(?:png|jpeg|webp)|video\/(?:mp4|webm|quicktime));base64,/i.test(value)); }
function formatProfileDate(value, includeTime = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
