import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import "./AuthorProfileLink.css";

const HOVER_DELAY = 250;
const LEAVE_DELAY = 160;
const HOLD_DELAY = 500;

export default function AuthorProfileLink({ username, name, avatar, compact = false, meta }) {
  // Only a current public username supplied by the API can create a profile link.
  const publicUsername = typeof username === "string" && /^[a-z0-9_-]{3,30}$/.test(username) ? username : "";
  const href = publicUsername ? `/u/${encodeURIComponent(publicUsername)}` : undefined;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState({ username: "", profile: null, error: "" });
  const [position, setPosition] = useState({ left: 12, top: 12, width: 328, maxHeight: 420 });
  const trigger = useRef(null);
  const card = useRef(null);
  const timers = useRef({ enter: null, leave: null, hold: null });
  const touch = useRef(null);
  const suppressClick = useRef(false);
  const lastTouch = useRef(-Infinity);
  const cardId = useId();
  const clearTimer = key => { clearTimeout(timers.current[key]); timers.current[key] = null; };
  const clearTimers = () => Object.keys(timers.current).forEach(clearTimer);
  const close = () => { clearTimers(); setOpen(false); setLoaded({ username: "", profile: null, error: "" }); };
  const show = () => {
    clearTimer("enter"); clearTimer("leave");
    if (trigger.current && typeof window !== "undefined") {
      setPosition(profileCardPosition(trigger.current.getBoundingClientRect(), window.innerWidth, window.innerHeight));
    }
    setOpen(true);
  };
  const scheduleOpen = () => { clearTimer("leave"); clearTimer("enter"); timers.current.enter = setTimeout(show, HOVER_DELAY); };
  const scheduleClose = () => { clearTimer("enter"); clearTimer("leave"); timers.current.leave = setTimeout(close, LEAVE_DELAY); };

  useEffect(() => {
    close(); touch.current = null; suppressClick.current = false;
    return clearTimers;
  }, [publicUsername]);

  useEffect(() => {
    if (!open || !publicUsername) return;
    const controller = new AbortController();
    let active = true;
    setLoaded({ username: publicUsername, profile: null, error: "" });
    api.publicProfileCard(publicUsername, { signal: controller.signal }).then(profile => {
      if (active) setLoaded({ username: publicUsername, profile, error: "" });
    }).catch(error => {
      if (active && error.name !== "AbortError") setLoaded({ username: publicUsername, profile: null, error: error.status === 404 ? "unavailable" : "connection" });
    });
    return () => { active = false; controller.abort(); };
  }, [open, publicUsername]);

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !card.current?.contains(event.target)) close();
    };
    const escape = event => {
      if (event.key !== "Escape") return;
      const focusInCard = card.current?.contains(document.activeElement);
      if (focusInCard) trigger.current?.focus({ preventScroll: true });
      close(); // Returning focus can schedule an opening; cancel that timer too.
    };
    const scroll = event => { if (!card.current?.contains(event.target)) close(); };
    const hidden = () => { if (document.visibilityState === "hidden") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", close);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (open && card.current && trigger.current) {
      setPosition(profileCardPosition(trigger.current.getBoundingClientRect(), window.innerWidth, window.innerHeight, card.current.getBoundingClientRect().height));
    }
  }, [open, loaded]);

  const pointerDown = event => {
    suppressClick.current = false;
    if (event.pointerType !== "touch") return;
    lastTouch.current = Date.now();
    clearTimer("enter"); clearTimer("hold");
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timers.current.hold = setTimeout(() => {
      if (!touch.current) return;
      suppressClick.current = true;
      show();
    }, HOLD_DELAY);
  };
  const pointerMove = event => {
    const start = touch.current;
    if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearTimer("hold"); touch.current = null;
      if (suppressClick.current) close();
    }
  };
  const pointerEnd = () => { clearTimer("hold"); touch.current = null; };
  const click = event => {
    if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; return; }
    if (!href) show();
    else close(); // Navigation remains a native anchor action, including modifier clicks.
  };
  const triggerProps = {
    ref: trigger,
    className: `nouri-author-trigger${compact ? " nouri-author-trigger--compact" : ""}`,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? cardId : undefined,
    onMouseEnter: () => { if (Date.now() - lastTouch.current > 800) scheduleOpen(); },
    onMouseLeave: scheduleClose,
    onFocus: () => { if (Date.now() - lastTouch.current > 800) scheduleOpen(); },
    onBlur: scheduleClose,
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerUp: pointerEnd,
    onPointerCancel: () => { pointerEnd(); suppressClick.current = false; close(); },
    onClick: click,
    onKeyDown: event => { if (event.key === "Enter" || event.key === " ") suppressClick.current = false; if (event.key === "Escape") close(); },
    onContextMenu: event => { if (suppressClick.current) event.preventDefault(); },
  };
  const identity = <>{!compact && <ProfileAvatar url={avatar} name={name}/>}<span className="nouri-author-text"><b>{name}</b>{meta && <span className="nouri-author-meta">{meta}</span>}</span></>;
  const state = loaded.username === publicUsername ? loaded : { profile: null, error: "" };
  return <span className={`nouri-author-identity${compact ? " nouri-author-identity--compact" : ""}`}>
    {href ? <a {...triggerProps} href={href}>{identity}</a> : <button {...triggerProps} type="button">{identity}</button>}
    {open && typeof document !== "undefined" && createPortal(<section
      id={cardId} ref={card} className="nouri-profile-card" role="dialog" aria-modal="false" aria-label="โปรไฟล์แบบย่อ"
      style={position} onMouseEnter={() => clearTimer("leave")} onMouseLeave={scheduleClose}
      onFocusCapture={() => clearTimer("leave")} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose(); }}>
      <button type="button" className="nouri-profile-card-close" aria-label="ปิดโปรไฟล์แบบย่อ" onClick={close}>×</button>
      <AuthorProfileCard profile={state.profile} loading={!!publicUsername && !state.profile && !state.error} error={publicUsername ? state.error : "unavailable"} href={href} onNavigate={close}/>
    </section>, document.body)}
  </span>;
}

export function AuthorProfileCard({ profile, loading = false, error = "", href, onNavigate }) {
  if (loading) return <p className="nouri-profile-card-notice" role="status">กำลังโหลดโปรไฟล์…</p>;
  if (error || !profile) return <div className="nouri-profile-card-notice"><p className="nouri-profile-card-title">{error === "connection" ? "โหลดโปรไฟล์ไม่สำเร็จ" : "ไม่สามารถดูโปรไฟล์นี้ได้"}</p><p>{error === "connection" ? "กรุณาลองใหม่อีกครั้ง" : "โปรไฟล์นี้ไม่พร้อมให้ดูสาธารณะ"}</p></div>;
  const name = typeof profile.displayName === "string" ? profile.displayName : "สมาชิก Nouri";
  const streak = Number.isSafeInteger(profile.streak) && profile.streak >= 0 ? profile.streak : 0;
  const joined = new Date(profile.joinedAt);
  const joinedLabel = profile.joinedAt && !Number.isNaN(joined.getTime()) ? joined.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }) : "—";
  return <>
    <p className="nouri-profile-card-eyebrow">NOURI · COMMUNITY</p>
    <div className="nouri-profile-card-heading"><ProfileAvatar url={profile.avatarUrl} name={name}/><h2 className="nouri-profile-card-title">{name}</h2></div>
    {typeof profile.bio === "string" && profile.bio && <p className="nouri-profile-card-bio">{profile.bio}</p>}
    <dl className="nouri-profile-card-facts"><div><dt>เข้าร่วมเมื่อ</dt><dd>{joinedLabel}</dd></div><div><dt>Streak</dt><dd>{streak} วันต่อเนื่อง</dd></div></dl>
    {href && <a className="nouri-profile-card-link" href={href} onClick={onNavigate}>ดูโปรไฟล์เต็ม <span aria-hidden="true">↗</span></a>}
  </>;
}

function ProfileAvatar({ url, name }) {
  const safeUrl = typeof url === "string" && (/^https?:\/\//i.test(url) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(url));
  return <span className="nouri-author-avatar">{safeUrl ? <img src={url} alt="" loading="lazy"/> : <span aria-hidden="true">{String(name || "N").trim().charAt(0).toUpperCase() || "N"}</span>}</span>;
}

export function profileCardPosition(rect, viewportWidth, viewportHeight, height = 280) {
  const width = Math.max(0, Math.min(328, viewportWidth - 24));
  const maxHeight = Math.max(0, viewportHeight - 24);
  const cardHeight = Math.min(height, maxHeight);
  const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
  const below = rect.bottom + 10;
  const top = below + cardHeight <= viewportHeight - 12 ? below : Math.max(12, Math.min(rect.top - cardHeight - 10, viewportHeight - cardHeight - 12));
  return { left, top, width, maxHeight };
}
