import { uploadFile } from "./upload";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import AdminPage from "./AdminPage";
import AuthPage from "./AuthPage";
import Dashboard from "./Dashboard";
import CommunityPage from "./CommunityPage";
export { default as CommunityPage } from "./CommunityPage";
import { BrandLogo, SiteContext, SiteSymbol, defaultSite, useSite } from "./SiteContext";

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [view, setView] = useState(() => location.pathname === "/admin" ? "admin" : "dashboard");
  const [site, setSite] = useState(defaultSite);
  const sessionStartedAt = useRef(Date.now());
  useEffect(() => {
    let mounted = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching || document.visibilityState === "hidden") return;
      fetching = true;
      try {
        const config = await api.site();
        if (mounted) setSite(current => config.revision > current.revision ? config : current);
      } catch { /* Keep the last usable content and retry when the connection recovers. */ }
      finally { fetching = false; }
    };
    // Load saved values even when their first revision is zero.
    api.site().then(config => { if (mounted) setSite(current => config.revision >= current.revision ? config : current); }).catch(() => {});
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    const styles = document.documentElement.style;
    styles.setProperty("--forest", site.theme.primary);
    styles.setProperty("--forest-deep", site.theme.primary);
    styles.setProperty("--sage", site.theme.accent);
    styles.setProperty("--bg-ivory", site.theme.background);
    styles.setProperty("--bg-stone", site.theme.background);
    styles.setProperty("--ink", site.theme.text);
    document.title = `${site.brand.name} | Nutrition Tracker`;
    let favicon = document.querySelector("link[data-site-favicon]");
    if (site.brand.faviconUrl) {
      if (!favicon) { favicon = document.createElement("link"); favicon.rel = "icon"; favicon.dataset.siteFavicon = "true"; document.head.appendChild(favicon); }
      favicon.href = site.brand.faviconUrl;
    } else { favicon?.remove(); }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", site.theme.background);
  }, [site]);
  useEffect(() => {
    const changed = event => {
      const guard = new Event("nouri-admin-navigate", { cancelable: true });
      if (!window.dispatchEvent(guard)) { history.pushState({ view: "admin" }, "", "/admin"); return; }
      setView(event.state?.view || (location.pathname === "/admin" ? "admin" : "dashboard"));
    };
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => { if (localStorage.getItem("nouri-token")) api.me().then(currentUser => setUser(currentUser)).catch(() => localStorage.removeItem("nouri-token")); }, []);
  useEffect(() => { if (user) sessionStartedAt.current = Date.now(); }, [user?.id]);
  useEffect(() => {
    if (!user) return undefined;
    const checkpoint = setInterval(async () => {
      const seconds = Math.floor((Date.now() - sessionStartedAt.current) / 1000);
      if (seconds < 60) return;
      try { await api.recordSession(seconds); sessionStartedAt.current = Date.now(); } catch { /* Retry next checkpoint. */ }
    }, 60000);
    return () => clearInterval(checkpoint);
  }, [user?.id]);
  const navigate = next => { history.pushState({ view: next }, "", next === "admin" ? "/admin" : "/"); setView(next); };
  const logout = async () => {
    const seconds = Math.floor((Date.now() - sessionStartedAt.current) / 1000);
    if (seconds > 0) await api.recordSession(seconds).catch(() => {});
    localStorage.removeItem("nouri-token"); navigate("dashboard"); setUser(null);
  };
  let page;
  if (!user) page = <AuthPage {...{ mode, setMode, setUser, message, setMessage }} />;
  else if (view === "admin" && user.role === "admin") page = <AdminPage user={user} site={site} setUser={setUser} onSaved={setSite} goBack={() => navigate("dashboard")} />;
  else if (view === "community") page = <CommunityPage user={user} setUser={setUser} goBack={() => navigate("dashboard")} />;
  else if (view === "account") page = <AccountPage user={user} setUser={setUser} goAdmin={() => navigate("admin")} goBack={() => navigate("dashboard")} logout={logout} sessionStartedAt={sessionStartedAt.current} />;
  else page = <Dashboard user={user} logout={logout} openAccount={() => navigate("account")} openAdmin={() => navigate("admin")} community={<CommunityPage key={user.id} user={user} setUser={setUser} embedded />} />;
  return <SiteContext.Provider value={site}>{page}</SiteContext.Provider>;
}
export function AccountPage({ user, setUser, goBack, goAdmin, logout, sessionStartedAt }) {
  const { brand, copy: { account: c } } = useSite();
  const [data, setData] = useState({ activities: [], onlineSeconds: 0 });
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [openSection, setOpenSection] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  useEffect(() => { api.activity().then(setData).catch(error => setError(error.message)); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const totalSeconds = data.onlineSeconds + Math.floor((now - sessionStartedAt) / 1000);
  const activityLabel = { registered: c.registeredActivity, login: c.loginActivity, session: c.sessionActivity };
  const changeAvatar = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || uploading) return;
    setUploading(true); setError(""); setUploadStatus("Uploading 0%");
    try {
      const avatarUrl = await uploadFile(file, user.id, "avatar", progress => setUploadStatus(`Uploading ${Math.round(progress.percentage)}%`));
      setUploadStatus("Saving profile photo…");
      const updatedUser = await api.updateProfile(avatarUrl);
      setUser(updatedUser);
    } catch (uploadError) { setError(uploadError.message); }
    finally { setUploading(false); setUploadStatus(""); input.value = ""; }
  };
  const toggleSection = id => setOpenSection(current => current === id ? "" : id);
  const rows = [
    { id: "history", title: c.historyTitle, detail: `${data.activities.length} ${c.historyDetail}`, icon: "clock" },
    { id: "security", title: c.securityTitle, detail: user.email, icon: "user" },
    { id: "time", title: c.timeTitle, detail: `${c.timeDetail} ${formatDuration(totalSeconds)}`, icon: "clock" },
  ];
  if (user.role === "admin") rows.push({ id: "admin", title: "จัดการเว็บไซต์", detail: "เนื้อหา รูปภาพ เมนูอาหาร ผู้ใช้ และชุมชน", icon: "spark", action: goAdmin });
  return <main className="account-shell min-h-screen px-5 py-7 text-[var(--ink)] sm:px-8 sm:py-10"><div className="mx-auto max-w-4xl">
    <header className="mb-7 flex items-center justify-between"><button onClick={goBack} className="group flex items-center gap-2 rounded-full border border-[#bfcbbd] bg-white/80 px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-x-1"><Icon name="arrow"/> {c.backButton}</button><span className="font-bold tracking-[.18em] text-[var(--forest)]"><BrandLogo compact /></span></header>
    <section className="account-hero rounded-[1.8rem] p-6 text-white shadow-[0_20px_50px_rgba(24,56,46,.18)] sm:p-8"><div className="flex flex-wrap items-center gap-5"><label className="group relative grid h-24 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-4 border-[var(--sage)] bg-[var(--sage)] text-[var(--forest)] shadow-lg" title={c.changePhoto}><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={changeAvatar}/>{user.avatarData ? <img className="h-full w-full object-cover" src={user.avatarData} alt="รูปโปรไฟล์"/> : <span className="text-4xl font-semibold">{(user.name || "N").trim().charAt(0).toUpperCase()}</span>}<span className="absolute inset-x-0 bottom-0 bg-[var(--forest)] py-1 text-center text-[10px] font-semibold text-white">{c.changePhoto}</span></label><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--sage)]">{c.eyebrow}</p><h1 className="mt-1 break-words text-3xl font-bold sm:text-4xl">{user.name}</h1><p className="mt-2 text-emerald-100">{user.email}</p></div><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#e7f4d0]">● {c.onlineLabel}</span></div>{uploadStatus && <p role="status" className="mt-4 text-sm text-[var(--sage)]">{uploadStatus}</p>}</section>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="mt-6 overflow-hidden rounded-[1.6rem] border border-[#d9dfd7] bg-[#fffefa]/90 shadow-[0_14px_35px_rgba(29,43,33,.08)]" aria-label="เมนูบัญชี">
      {rows.map((row, index) => <article key={row.id} className={index ? "border-t border-[#e3e8df]" : ""}><button onClick={() => row.action ? row.action() : toggleSection(row.id)} aria-expanded={row.action ? undefined : openSection === row.id} className="group flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-[#f1f5e9] sm:px-7"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eaf0dd] text-[var(--forest)]"><Icon name={row.icon}/></span><span className="min-w-0 flex-1"><span className="block font-semibold">{row.title}</span><span className="mt-0.5 block truncate text-sm text-[#66746c]">{row.detail}</span></span><span className="text-lg text-[#56705d] transition group-hover:translate-x-1">{row.action ? "↗" : openSection === row.id ? "−" : "+"}</span></button>
      {openSection === row.id && row.id === "history" && <div className="border-t border-[#e3e8df] bg-[#f7f8f2] px-5 py-4 sm:px-7">{error ? <p className="text-sm text-red-700">{error}</p> : data.activities.length ? <div className="divide-y divide-[#e3e8df]">{data.activities.map(activity => <div key={activity.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[var(--forest)]"><Icon name={activity.type === "session" ? "clock" : activity.type === "login" ? "arrow" : "spark"}/></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{activityLabel[activity.type]}</p><p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</p></div>{activity.type === "session" && <b className="text-xs text-[var(--forest)]">{formatDuration(activity.durationSeconds)}</b>}</div>)}</div> : <p className="text-sm text-slate-500">{c.emptyHistory}</p>}</div>}
      {openSection === row.id && row.id === "security" && <dl className="grid gap-3 border-t border-[#e3e8df] bg-[#f7f8f2] px-5 py-4 text-sm sm:grid-cols-2 sm:px-7"><ProfileRow label={c.emailLabel} value={user.email}/><ProfileRow label={c.roleLabel} value={user.role === "admin" ? c.adminLabel : c.memberLabel}/><ProfileRow label={c.joinedLabel} value={user.createdAt ? new Date(user.createdAt).toLocaleDateString("th-TH") : "—"}/></dl>}
      {openSection === row.id && row.id === "time" && <p className="border-t border-[#e3e8df] bg-[#f7f8f2] px-5 py-4 text-sm text-[#56705d] sm:px-7">{c.timeDescription}</p>}
      </article>)}
      <div className="border-t border-[#e3e8df]"><button onClick={logout} className="flex w-full items-center gap-4 px-5 py-5 text-left font-semibold text-[#8a513d] transition hover:bg-[#fbf1e9] sm:px-7"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#f7e9dd]">↪</span><span className="flex-1">{c.logoutButton}</span><span aria-hidden="true">→</span></button></div>
    </section>
    <p className="mt-4 text-center text-xs text-[#718076]">{user.role === "admin" ? c.adminLabel : `${c.memberLabel} ${brand.name}`}</p>
  </div></main>;
}
function ProfileRow({ label, value }) { return <div className="flex items-start justify-between gap-6 border-b border-[#edf0eb] pb-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>; }
function formatDuration(seconds) { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const secs = seconds % 60; return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${secs}s` : `${secs}s`; }
function Icon({ name }) { const { icons } = useSite(); if (icons[name]) return <SiteSymbol value={icons[name]} />; const paths = { user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.4 3.2-5.2 7.5-5.2s6.7 1.8 7.5 5.2"/></>, clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/></>, arrow: <><path d="M14.5 5.5 8 12l6.5 6.5"/><path d="M9 12h10"/></>, spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></> }; return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.spark}</svg>; }
