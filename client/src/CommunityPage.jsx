import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import AuthorProfileLink from "./AuthorProfileLink";
import { uploadFile, validateUploadFile } from "./upload";
import { SiteSymbol, useSite } from "./SiteContext";
import { canDeleteCommunityItem, createCommunityFeed } from "./communityFeed";

export default function CommunityPage({ user, setUser, goBack, embedded = false }) {
  const { copy: { community: c } } = useSite();
  const [feed, setFeed] = useState({ posts: [], loaded: false, loading: true, offline: false });
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState(null);
  const [category, setCategory] = useState("food");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [busyPosts, setBusyPosts] = useState({});
  const [postErrors, setPostErrors] = useState({});
  const controller = useRef(null);
  const uploadedMedia = useRef(null);
  const uploadBusy = useRef(false);
  const postBusy = useRef(new Set());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const current = createCommunityFeed({
      fetchPosts: options => api.posts(options),
      onSnapshot: setFeed,
      getVisibility: () => document.visibilityState !== "hidden",
      getOnline: () => navigator.onLine !== false,
    });
    controller.current = current;
    const refresh = () => current.refresh();
    current.start();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false; current.stop(); controller.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user.id]);

  const selectMedia = event => {
    const input = event.currentTarget; const file = input.files?.[0];
    if (!file || uploadBusy.current) return;
    setError("");
    try { validateUploadFile(file, "post"); setMedia(file); uploadedMedia.current = null; }
    catch (selectionError) { setError(uploadErrorText(selectionError)); }
    finally { input.value = ""; }
  };
  const progress = ({ percentage }) => { if (mounted.current) setUploadStatus(`กำลังอัปโหลด ${Math.round(percentage)}%`); };
  const publish = async event => {
    event.preventDefault();
    if (uploadBusy.current) return;
    if (!message.trim()) { setError(c.contentRequired); return; }
    if (message.trim().length > 800) { setError("ข้อความโพสต์ต้องไม่เกิน 800 ตัวอักษร"); return; }
    uploadBusy.current = true; setUploading(true); setError("");
    try {
      if (media && uploadedMedia.current?.file !== media) {
        setUploadStatus("กำลังอัปโหลด 0%");
        const url = await uploadFile(media, user.id, "post", progress);
        uploadedMedia.current = { file: media, url };
      }
      if (!mounted.current) return;
      setUploadStatus("กำลังบันทึกโพสต์…");
      const post = await api.createPost({ category, content: message.trim(), mediaData: media ? uploadedMedia.current.url : "", mediaType: media ? (media.type.startsWith("video/") ? "video" : "image") : "" });
      if (!mounted.current) return;
      controller.current?.upsertPost(post);
      setMessage(""); setMedia(null); uploadedMedia.current = null;
    } catch (publishError) { if (mounted.current) setError(uploadErrorText(publishError)); }
    finally { uploadBusy.current = false; if (mounted.current) { setUploading(false); setUploadStatus(""); } }
  };
  const changeAvatar = async event => {
    const input = event.currentTarget; const file = input.files?.[0];
    if (!file || uploadBusy.current) return;
    uploadBusy.current = true; setUploading(true); setError(""); setUploadStatus("กำลังอัปโหลด 0%");
    try {
      const avatarUrl = await uploadFile(file, user.id, "avatar", progress);
      if (!mounted.current) return;
      setUploadStatus("กำลังบันทึกรูปโปรไฟล์…");
      const updatedUser = await api.updateProfile(avatarUrl);
      if (mounted.current) setUser(updatedUser);
    } catch (avatarError) { if (mounted.current) setError(uploadErrorText(avatarError)); }
    finally { uploadBusy.current = false; input.value = ""; if (mounted.current) { setUploading(false); setUploadStatus(""); } }
  };
  const actOnPost = async (id, action) => {
    if (postBusy.current.has(id)) return;
    postBusy.current.add(id); setBusyPosts(current => ({ ...current, [id]: true })); setPostErrors(current => ({ ...current, [id]: "" }));
    try { await action(); }
    catch (actionError) { if (mounted.current) setPostErrors(current => ({ ...current, [id]: actionError.message || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง" })); }
    finally { postBusy.current.delete(id); if (mounted.current) setBusyPosts(current => ({ ...current, [id]: false })); }
  };
  const comment = (event, postId) => {
    event.preventDefault();
    const content = (commentDrafts[postId] || "").trim();
    if (!content || content.length > 500) { setPostErrors(current => ({ ...current, [postId]: "กรุณาเขียนความคิดเห็นตั้งแต่ 1 ถึง 500 ตัวอักษร" })); return; }
    actOnPost(postId, async () => {
      const updated = await api.commentPost(postId, content);
      if (mounted.current) { controller.current?.upsertPost(updated); setCommentDrafts(current => ({ ...current, [postId]: "" })); }
    });
  };
  const like = postId => {
    const post = controller.current?.getSnapshot().posts.find(item => String(item._id) === String(postId));
    if (!post || post.likedByMe || postBusy.current.has(postId)) return;
    return actOnPost(postId, async () => { const updated = await api.likePost(postId); if (mounted.current) controller.current?.upsertPost(updated); });
  };
  const deletePost = post => {
    if (!canDeleteCommunityItem(post, user) || postBusy.current.has(post._id) || !window.confirm("ลบโพสต์นี้และความคิดเห็นทั้งหมดอย่างถาวรหรือไม่?")) return;
    actOnPost(post._id, async () => { await api.deletePost(post._id); if (mounted.current) controller.current?.removePost(post._id); });
  };
  const deleteComment = (post, item) => {
    if (!canDeleteCommunityItem(item, user) || postBusy.current.has(post._id) || !window.confirm("ลบความคิดเห็นนี้อย่างถาวรหรือไม่?")) return;
    actOnPost(post._id, async () => { const updated = await api.deleteComment(post._id, item._id); if (mounted.current) controller.current?.removeComment(post._id, item._id, updated); });
  };
  const Wrapper = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const categories = { food: c.foodCategory, recipe: c.recipeCategory, knowledge: c.knowledgeCategory, workout: c.workoutCategory };
  return <Wrapper className={embedded ? "text-[var(--ink)]" : "account-shell min-h-screen px-5 py-8 text-[var(--ink)] sm:px-8"} aria-label={c.eyebrow}>
    <div className={`mx-auto ${embedded ? "max-w-4xl" : "max-w-3xl"}`}>
      {!embedded && <header className="mb-7 flex flex-wrap items-center justify-between gap-3"><button disabled={uploading} onClick={goBack} className="flex items-center gap-2 rounded-full border border-[#bfcbbd] bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50"><CommunityIcon name="arrow"/>{c.backButton}</button><label className="relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-semibold text-white"><span>{c.changePhoto}</span><input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={changeAvatar}/></label></header>}
      <div className="account-hero rounded-[2rem] p-7 text-white shadow-[0_16px_32px_rgba(24,56,46,.12)] sm:p-8"><div className="mb-3 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/10 text-[var(--sage)]"><CommunityIcon name="spark"/></span><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--sage)]">{c.eyebrow}</p></div><Heading className="text-3xl font-bold sm:text-4xl">{c.title}</Heading><p className="mt-3 max-w-2xl leading-7 text-emerald-100">{c.description}</p></div>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <form onSubmit={publish} className="mt-6 rounded-[1.7rem] border border-[#d9dfd7] bg-white/90 p-5 shadow-sm sm:p-6"><div className="flex gap-3"><Avatar url={user.avatarData}/><label className="min-w-0 flex-1"><span className="sr-only">{c.placeholder}</span><textarea disabled={uploading} required maxLength={800} value={message} onChange={event => setMessage(event.target.value)} placeholder={c.placeholder} className="min-h-28 w-full resize-y rounded-xl border border-[#d9dfd7] bg-stone-50 p-3 outline-none transition focus:border-[var(--forest)] focus:bg-white disabled:opacity-60"/></label></div><div className="mt-4 flex flex-wrap items-center gap-3"><label><span className="sr-only">หมวดหมู่โพสต์</span><select disabled={uploading} value={category} onChange={event => setCategory(event.target.value)} className="rounded-lg border border-[#d9dfd7] bg-white px-3 py-2 text-sm">{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="relative cursor-pointer overflow-hidden rounded-lg border border-[#cfd8cf] px-3 py-2 text-sm font-medium">{c.mediaButton}<input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={selectMedia}/></label>{media && <span className="max-w-36 truncate text-xs text-slate-500">{media.name}</span>}{media && <button type="button" disabled={uploading} onClick={() => { setMedia(null); uploadedMedia.current = null; }} className="text-xs text-slate-500">{c.removeButton}</button>}<button disabled={uploading} className="ml-auto rounded-lg bg-[var(--forest)] px-5 py-2 text-sm font-bold text-white transition disabled:opacity-50">{uploading ? c.waitButton : c.postButton}</button></div><p className="mt-3 text-xs leading-6 text-slate-500">{c.uploadHint}</p>{uploadStatus && <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-[var(--forest)]">{uploadStatus}</p>}</form>
      <div className="my-5 flex items-center justify-between gap-3 px-1"><span className={`inline-flex items-center gap-2 text-xs font-semibold ${feed.offline ? "text-amber-700" : "text-[var(--forest)]"}`} role="status"><span className={`h-2 w-2 shrink-0 rounded-full ${feed.offline ? "bg-amber-500" : "bg-emerald-600"}`}/>{feed.offline ? c.offlineStatus || "การเชื่อมต่อขัดข้อง กำลังลองใหม่…" : c.liveStatus || "อัปเดตอัตโนมัติ"}</span>{feed.offline && <button type="button" className="shrink-0 text-xs font-semibold text-[var(--forest)] underline underline-offset-4" onClick={() => controller.current?.refresh()}>ลองอีกครั้ง</button>}</div>
      <div className="space-y-5" aria-busy={feed.loading}>
        {!feed.loaded && !feed.offline && <p role="status" className="rounded-2xl bg-white/80 p-8 text-center text-sm text-slate-500">{c.loadingPosts || "กำลังโหลดโพสต์…"}</p>}
        {feed.posts.map(post => <CommunityPost key={post._id} post={post} user={user} busy={!!busyPosts[post._id]} commentDraft={commentDrafts[post._id] || ""} error={postErrors[post._id]} onComment={comment} onLike={like} onDeletePost={deletePost} onDeleteComment={deleteComment} onDraftChange={value => setCommentDrafts(current => ({ ...current, [post._id]: value }))}/>)}
        {feed.loaded && !feed.posts.length && <p className="rounded-2xl border border-[#d9dfd7] bg-white/80 p-8 text-center text-sm text-slate-500">{c.emptyPosts}</p>}
      </div>
    </div>
  </Wrapper>;
}

export function CommunityPost({ post, user, busy = false, commentDraft = "", error = "", onComment = () => {}, onLike = () => {}, onDeletePost = () => {}, onDeleteComment = () => {}, onDraftChange = () => {} }) {
  const { copy: { community: c } } = useSite();
  const categories = { food: c.foodCategory, recipe: c.recipeCategory, knowledge: c.knowledgeCategory, workout: c.workoutCategory };
  return <article className="rounded-[1.7rem] border border-[#d9dfd7] bg-white/90 p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><AuthorProfileLink username={post.authorUsername} name={post.authorName} avatar={post.authorAvatar} meta={<><time dateTime={post.createdAt}>{dateLabel(post.createdAt)}</time> · {categories[post.category] || post.category}</>}/></div>{canDeleteCommunityItem(post, user) && <button type="button" disabled={busy} onClick={() => onDeletePost(post)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#975340] transition hover:bg-[#fbf1e9] disabled:opacity-40">{c.deletePostButton || "ลบโพสต์"}</button>}</div><p className="mt-4 whitespace-pre-wrap break-words leading-7">{post.content}</p>{post.mediaData && (post.mediaType === "video" ? <video className="mx-auto mt-4 block h-auto w-auto max-w-full rounded-xl bg-black object-contain" controls playsInline preload="metadata" src={post.mediaData}/> : <img className="mx-auto mt-4 block h-auto w-auto max-w-full rounded-xl object-contain" src={post.mediaData} alt="รูปภาพประกอบโพสต์" loading="lazy"/>)}<div className="mt-4 flex items-center gap-4"><button type="button" disabled={busy || !!post.likedByMe} onClick={() => { if (!busy && !post.likedByMe) onLike(post._id); }} aria-pressed={!!post.likedByMe} aria-label={`${post.likedByMe ? "ถูกใจแล้ว" : "ถูกใจโพสต์ของ"} ${post.authorName}`} className={`rounded-lg px-1 py-1 text-sm font-semibold disabled:cursor-default ${post.likedByMe ? "text-red-600" : "text-[var(--forest)]"} ${busy ? "opacity-60" : ""}`}><span aria-hidden="true">{post.likedByMe ? "♥" : "♡"}</span> {post.likes || 0}</button><span className="text-xs text-slate-500">{post.comments?.length || 0} {c.commentLabel}</span></div><div className="mt-4 space-y-2">{post.comments?.map(item => <div key={item._id} className="flex items-start gap-3 rounded-xl bg-[#f4f7ed] px-3 py-3"><p className="min-w-0 flex-1 break-words text-sm leading-6"><AuthorProfileLink username={item.authorUsername} name={item.authorName} compact/><span className="ml-2 whitespace-pre-wrap text-slate-600">{item.content}</span></p>{canDeleteCommunityItem(item, user) && <button type="button" disabled={busy} onClick={() => onDeleteComment(post, item)} className="shrink-0 text-xs font-semibold leading-6 text-[#975340] disabled:opacity-40" aria-label={`${c.deleteCommentButton || "ลบความคิดเห็น"} ${item.authorName}`}>{c.deleteCommentButton || "ลบความคิดเห็น"}</button>}</div>)}</div><form onSubmit={event => onComment(event, post._id)} className="mt-4 flex items-start gap-2"><label className="min-w-0 flex-1"><span className="sr-only">{c.commentPlaceholder}</span><input disabled={busy} required name="comment" maxLength={500} value={commentDraft} onChange={event => onDraftChange(event.target.value)} placeholder={c.commentPlaceholder} className="w-full rounded-lg border border-[#d9dfd7] px-3 py-2 text-sm outline-none focus:border-[var(--forest)] disabled:opacity-60"/></label><button disabled={busy} className="rounded-lg bg-[#eef5de] px-4 py-2 text-sm font-semibold text-[var(--forest)] disabled:opacity-40">{busy ? "…" : c.sendButton}</button></form>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-6 text-red-700">{error}</p>}</article>;
}

function Avatar({ url }) { return <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--sage)] text-[var(--forest)]">{url ? <img className="h-full w-full object-cover" src={url} alt=""/> : <CommunityIcon name="user"/>}</span>; }
function CommunityIcon({ name }) {
  const { icons } = useSite();
  if (icons[name]) return <SiteSymbol value={icons[name]}/>;
  const paths = { user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.4 3.2-5.2 7.5-5.2s6.7 1.8 7.5 5.2"/></>, arrow: <><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/><path d="M9 12h10"/></>, spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></> };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.spark}</svg>;
}
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("th-TH"); }
function uploadErrorText(error) {
  const message = error?.message || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
  if (message.includes("File must be")) return "ไฟล์มีขนาดใหญ่เกินกำหนด รูปโปรไฟล์ไม่เกิน 1.5 MB ไฟล์โพสต์ไม่เกิน 100 MB";
  if (message.includes("Unsupported file type")) return "ชนิดไฟล์ไม่รองรับ กรุณาเลือกไฟล์ตามรูปแบบที่กำหนด";
  if (message.includes("non-empty")) return "กรุณาเลือกไฟล์ที่มีข้อมูล";
  if (message.includes("Failed to read")) return "อ่านไฟล์ที่เลือกไม่สำเร็จ กรุณาเลือกไฟล์ใหม่";
  return message;
}
