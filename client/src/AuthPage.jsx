import { useState } from "react";
import { api } from "./api";
import { BrandLogo, useSite } from "./SiteContext";

const input = "w-full rounded-xl border border-slate-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-[var(--forest)] focus:bg-white";

export default function AuthPage({ mode, setMode, setUser, message, setMessage }) {
  const { copy: { auth: c } } = useSite();
  const login = mode === "login";
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setMessage("");
    setSubmitting(true);
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = login ? await api.login(data) : await api.register(data);
      localStorage.setItem("nouri-token", result.token);
      setUser(result.user);
    } catch (error) { setMessage(error.message); }
    finally { setSubmitting(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[var(--bg-ivory)] p-6">
    <section className="w-full max-w-md rounded-[2rem] border border-[#d7d0c5] bg-white/90 p-8 shadow-xl">
      <div className="text-[var(--forest)]"><BrandLogo /></div>
      <h1 className="mt-8 text-3xl font-bold text-[var(--ink)]">{login ? c.loginTitle : c.registerTitle}</h1>
      <p className="mt-2 text-slate-500">{login ? c.loginDescription : c.registerDescription}</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block text-sm font-medium">{login ? c.emailLabel : c.nameLabel}<input name={login ? "email" : "name"} required maxLength={login ? 254 : 80} type={login ? "email" : "text"} autoComplete={login ? "email" : "name"} className={`${input} mt-1`} /></label>
        {!login && <label className="block text-sm font-medium">{c.emailLabel}<input name="email" required maxLength={254} type="email" autoComplete="email" className={`${input} mt-1`} /></label>}
        <label className="block text-sm font-medium">{c.passwordLabel}<input name="password" required type="password" minLength={6} autoComplete={login ? "current-password" : "new-password"} className={`${input} mt-1`} /></label>
        {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button disabled={submitting} className="w-full rounded-xl bg-[var(--forest)] py-3 font-semibold text-white shadow-lg disabled:opacity-50">{login ? c.loginButton : c.registerButton}</button>
      </form>
      <button disabled={submitting} onClick={() => { setMode(login ? "register" : "login"); setMessage(""); }} className="mt-5 w-full text-sm font-medium text-[var(--forest)]">{login ? c.registerLink : c.loginLink}</button>
    </section>
  </main>;
}
