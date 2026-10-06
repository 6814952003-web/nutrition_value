import { useState } from "react";
import { api } from "./api";
import { saveAccessToken } from "./session";
import { BrandLogo, SiteSymbol, useSite } from "./SiteContext";
import "./auth.css";

export default function AuthPage({ mode, setMode, setUser, message, setMessage, adminRequested = false }) {
  const { brand, goals, icons, copy: { auth: c, dashboard } } = useSite();
  const login = mode === "login";
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const switchMode = next => {
    if (submitting || next === mode) return;
    setShowPassword(false); setMessage(""); setMode(next);
  };
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setMessage("");
    if (!login && data.password !== data.confirmPassword) {
      setMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง");
      return;
    }
    const credentials = { email: data.email.trim().toLowerCase(), password: data.password };
    if (!login) credentials.name = data.name.trim();
    if (!login && !credentials.name) { setMessage("กรุณาระบุชื่อที่แสดง"); return; }
    setSubmitting(true);
    try {
      const result = login ? await api.login(credentials) : await api.register(credentials);
      saveAccessToken(result.token);
      setUser(result.user);
    } catch (error) { setMessage(error.message); }
    finally { setSubmitting(false); }
  }
  const passwordType = showPassword ? "text" : "password";
  return <main className="auth-shell">
    <div className="auth-layout">
      <aside className="auth-story">
        <BrandLogo />
        <div className="auth-story-copy">
          <p className="auth-eyebrow">{dashboard.heroEyebrow}</p>
          <h2>{dashboard.heroTitle}<br/><span>{dashboard.heroHighlight}</span></h2>
          <p>{dashboard.heroDescription}</p>
          <div className="auth-symbol"><SiteSymbol value={icons.hero || "🥗"} className="auth-symbol-image" /></div>
          <div className="auth-goals">
            <div><b>{goals.calories.toLocaleString()}</b><span>{dashboard.caloriesLabel} · kcal</span></div>
            <div><b>{goals.protein}g</b><span>{dashboard.proteinLabel}</span></div>
            <div><b>{goals.carbs}g</b><span>{dashboard.carbsLabel}</span></div>
          </div>
          <p className="auth-story-note">เป้าหมายโภชนาการประจำวันของ {brand.name}</p>
        </div>
        <p className="auth-story-footer">{dashboard.footer}</p>
      </aside>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-mobile-brand"><BrandLogo /></div>
        <div className="auth-mode" role="group" aria-label="เลือกเข้าสู่ระบบหรือสมัครสมาชิก">
          <button type="button" aria-pressed={login} disabled={submitting} onClick={() => switchMode("login")}>{c.loginButton}</button>
          <button type="button" aria-pressed={!login} disabled={submitting} onClick={() => switchMode("register")}>{c.registerButton}</button>
        </div>
        {adminRequested && <p className="auth-admin-note">เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อจัดการเว็บไซต์</p>}
        <h1 id="auth-title">{login ? c.loginTitle : c.registerTitle}</h1>
        <p className="auth-description">{login ? c.loginDescription : c.registerDescription}</p>
        <form key={mode} onSubmit={submit} aria-busy={submitting} className="auth-form">
          <fieldset disabled={submitting}>
            {!login && <label className="auth-field">{c.nameLabel}<input name="name" required maxLength={80} autoComplete="name" className="auth-input" /></label>}
            <label className="auth-field">{c.emailLabel}<input name="email" required maxLength={254} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="auth-input" /></label>
            <label className="auth-field">{c.passwordLabel}<input name="password" required type={passwordType} minLength={login ? undefined : 6} maxLength={128} autoComplete={login ? "current-password" : "new-password"} aria-describedby={!login ? "auth-password-hint" : undefined} className="auth-input" /></label>
            {!login && <><p id="auth-password-hint" className="auth-hint">ใช้รหัสผ่าน 6–128 ตัวอักษร</p><label className="auth-field">ยืนยันรหัสผ่าน<input name="confirmPassword" required type={passwordType} minLength={6} maxLength={128} autoComplete="new-password" className="auth-input" /></label></>}
            <label className="auth-password-toggle"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />แสดงรหัสผ่าน</label>
            {message && <p role="alert" className="auth-error">{message}</p>}
            <button disabled={submitting} className="auth-submit">{submitting ? (login ? "กำลังเข้าสู่ระบบ…" : "กำลังสร้างบัญชี…") : (login ? c.loginButton : c.registerButton)}<span aria-hidden="true">→</span></button>
          </fieldset>
          {submitting && <p role="status" className="auth-hint">กำลังตรวจสอบข้อมูล กรุณารอสักครู่</p>}
        </form>
        <button type="button" disabled={submitting} onClick={() => switchMode(login ? "register" : "login")} className="auth-switch">{login ? c.registerLink : c.loginLink}</button>
      </section>
    </div>
  </main>;
}
