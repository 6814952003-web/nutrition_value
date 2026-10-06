import { useEffect, useMemo, useState } from "react";
import { BrandLogo, SiteSymbol, useSite } from "./SiteContext";

function readToday() {
  try {
    const stored = JSON.parse(localStorage.getItem("nouri-today") || "[]");
    return Array.isArray(stored) ? stored.filter(m => m && ["calories", "protein", "carbs", "fat"].every(k => Number.isFinite(m[k]) && m[k] >= 0)) : [];
  } catch { return []; }
}

export default function Dashboard({ user, logout, openAccount, openAdmin, community }) {
  const { brand, meals, guides, goals, icons, copy: { dashboard: c } } = useSite();
  const [today, setToday] = useState(readToday);
  const [filter, setFilter] = useState("");
  const [bmi, setBmi] = useState(null);
  useEffect(() => { localStorage.setItem("nouri-today", JSON.stringify(today)); }, [today]);
  const total = useMemo(() => today.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [today]);
  const tags = [...new Set(meals.map(m => m.tag))];
  const effectiveFilter = tags.includes(filter) ? filter : "";
  const items = effectiveFilter ? meals.filter(m => m.tag === effectiveFilter) : meals;
  const percentage = key => Math.min(100, Math.round(total[key] / goals[key] * 100));
  const pct = percentage("protein");
  const displayNumber = n => Math.round(n * 10) / 10;
  return <div className="classic-shell min-h-screen text-[var(--ink)]">
    <header className="sticky top-0 z-10 border-b border-[#d3d5cd] bg-[var(--bg-ivory)] backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <a href="#top" aria-label={brand.name}><BrandLogo compact /></a>
        <div className="hidden gap-7 text-sm text-slate-600 lg:flex"><a href="#tracker">{c.trackerNav}</a><a href="#menu">{c.menuNav}</a><a href="#guide">{c.guideNav}</a></div>
        <div className="flex flex-wrap items-center gap-2"><span className="hidden text-sm md:inline">{user.name}</span>{user.role === "admin" && <button onClick={openAdmin} className="rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-semibold text-white">แอดมิน</button>}<a href="#community" className="rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-semibold text-white">{c.communityNav || "ชุมชน Nouri"}</a><button onClick={openAccount} className="rounded-full border border-[#bfcbbd] bg-white/70 px-4 py-2 text-sm">{c.accountButton}</button><button onClick={logout} className="rounded-full border border-[#bfcbbd] bg-white/70 px-4 py-2 text-sm">{c.logoutButton}</button></div>
      </nav>
    </header>
    <main id="top">
      <section className="overflow-hidden bg-[var(--forest)]"><div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
        <div><p className="text-xs font-bold tracking-[.22em] text-[var(--sage)]">{c.heroEyebrow}</p><h1 className="mt-5 whitespace-pre-line text-5xl font-bold leading-tight text-white sm:text-7xl">{c.heroTitle}<br/><i className="font-serif text-[var(--sage)]">{c.heroHighlight}</i></h1><p className="mt-6 max-w-md whitespace-pre-line text-lg leading-8 text-white/80">{c.heroDescription}</p><a href="#menu" className="mt-8 inline-block rounded-full bg-[var(--sage)] px-6 py-3 font-bold text-[var(--ink)] shadow-lg">{c.heroButton}</a></div>
        <div className="relative grid min-h-72 place-items-center"><div className="floating-orb absolute h-72 w-72 rounded-full bg-[var(--gold)] shadow-xl"/><div className="hero-bowl relative grid h-60 w-60 place-items-center overflow-hidden rounded-full border-[14px] border-white/90 bg-[var(--forest)] text-8xl shadow-2xl"><SiteSymbol value={icons.hero} className={icons.hero.startsWith("https://") ? "h-full w-full" : ""}/></div><span className="absolute bottom-4 right-2 whitespace-pre-line rounded-xl bg-white/95 px-4 py-3 text-sm font-bold text-[var(--ink)] shadow-lg">{c.heroBadge}</span></div>
      </div></section>
      <section id="tracker" className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[.8fr_1.2fr]">
        <div><p className="text-xs font-bold tracking-[.2em] text-[var(--forest)]">{c.trackerEyebrow}</p><h2 className="mt-3 text-4xl font-bold leading-tight">{c.trackerTitle}<br/><i className="font-serif text-[var(--forest)]">{c.trackerHighlight}</i></h2><p className="mt-5 max-w-sm whitespace-pre-line leading-7 text-slate-600">{c.trackerDescription}</p><button onClick={() => setToday([])} className="mt-6 rounded-full border border-[var(--forest)] bg-white/70 px-5 py-2 text-sm font-semibold text-[var(--forest)]">{c.resetButton}</button></div>
        <div className="rounded-[2rem] bg-white/85 p-7 shadow-lg ring-1 ring-[#dfe7dd]"><div className="flex items-center justify-between gap-4"><div><p className="text-slate-500">{c.proteinToday}</p><p className="mt-1 text-5xl font-bold">{displayNumber(total.protein)}g</p><small className="text-slate-500">{c.goalLabel} {goals.protein}g</small></div><div className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--forest) ${pct * 3.6}deg,var(--sage) 0)` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white font-bold text-[var(--forest)]">{pct}%</div></div></div><div className="mt-8 grid gap-5 sm:grid-cols-3"><Metric label={c.caloriesLabel} value={`${displayNumber(total.calories)} kcal`} percent={percentage("calories")}/><Metric label={c.carbsLabel} value={`${displayNumber(total.carbs)}g`} percent={percentage("carbs")}/><Metric label={c.fatLabel} value={`${displayNumber(total.fat)}g`} percent={percentage("fat")}/></div></div>
      </section>
      <section id="menu" className="bg-white/70 px-6 py-16"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold tracking-[.2em] text-[var(--forest)]">{c.menuEyebrow}</p><h2 className="mt-3 text-4xl font-bold">{c.menuTitle} <i className="font-serif text-[var(--forest)]">{c.menuHighlight}</i></h2></div><p className="max-w-sm whitespace-pre-line leading-6 text-slate-500">{c.menuDescription}</p></div>
        <div className="mt-8 flex flex-wrap gap-2">{["", ...tags].map(tag => <button key={tag} onClick={() => setFilter(tag)} className={`rounded-full px-4 py-2 text-sm font-medium ${effectiveFilter === tag ? "bg-[var(--forest)] text-white shadow-lg" : "border border-[#d9dfd7] bg-white text-slate-600"}`}>{tag || c.allFilter}</button>)}</div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map(meal => <article key={meal.id} className="meal-card group overflow-hidden rounded-[1.6rem] border border-[#d9dfd7] bg-white/80 shadow-lg"><div className="meal-visual" style={{ backgroundColor: meal.color }}>{meal.photo ? <img src={meal.photo} alt={meal.name} loading="lazy" className="h-full w-full object-cover"/> : <span>{meal.emoji}</span>}</div><div className="p-5"><span className="rounded-full bg-[var(--sage)] px-3 py-1 text-xs font-semibold text-[var(--forest)]">{meal.tag}</span><div className="mt-4 flex justify-between gap-3"><h3 className="text-xl font-bold">{meal.name}</h3><span className="whitespace-nowrap text-xs text-slate-500">{meal.calories} kcal</span></div><p className="mt-3 text-sm text-slate-500">{c.proteinLabel} {meal.protein}g · {c.carbsLabel} {meal.carbs}g · {c.fatLabel} {meal.fat}g</p><button onClick={() => setToday(current => [...current, meal])} className="mt-5 w-full rounded-xl bg-[var(--forest)] py-2.5 text-sm font-bold text-white">{c.addMealButton}</button></div></article>)}</div>{!items.length && <p className="py-12 text-center text-slate-500">{c.emptyMeals}</p>}
      </div></section>
      {community && <section id="community" className="scroll-mt-28 border-y border-[#d9dfd7] bg-[var(--bg-ivory)] px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-4xl">{community}</div></section>}
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-[var(--sage)] p-8 shadow-lg"><p className="text-xs font-bold tracking-[.2em] text-[var(--forest)]">{c.bmiEyebrow}</p><h2 className="mt-3 text-3xl font-bold">{c.bmiTitle}</h2><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const height = Number(form.get("height")) / 100; setBmi((Number(form.get("weight")) / (height * height)).toFixed(1)); }} className="mt-6 grid gap-3 sm:grid-cols-3"><input name="height" required type="number" min={80} max={250} step="any" placeholder={c.heightPlaceholder} aria-label={c.heightPlaceholder} className="min-w-0 rounded-xl border border-[#a7b79a] bg-white/80 px-4 py-3"/><input name="weight" required type="number" min={20} max={400} step="any" placeholder={c.weightPlaceholder} aria-label={c.weightPlaceholder} className="min-w-0 rounded-xl border border-[#a7b79a] bg-white/80 px-4 py-3"/><button className="rounded-xl bg-[var(--forest)] px-4 py-3 font-bold text-white">{c.calculateButton}</button></form>{bmi && <p role="status" className="mt-5 text-lg">{c.bmiResult} <b>{bmi}</b></p>}</div>
        <div id="guide" className="rounded-[2rem] bg-[var(--forest)] p-8 text-white shadow-lg"><p className="text-xs font-bold tracking-[.2em] text-[var(--sage)]">{c.guideEyebrow}</p><h2 className="mt-3 text-3xl font-bold">{c.guideTitle}<br/><i className="font-serif text-[var(--sage)]">{c.guideHighlight}</i></h2><div className="mt-6 space-y-4 text-sm">{guides.map((guide, index) => <div key={guide.id} className="flex gap-4 border-t border-white/30 pt-4"><b className="text-[var(--sage)]">{String(index + 1).padStart(2, "0")}</b><div><b>{guide.title}</b><p className="mt-1 whitespace-pre-line text-white/80">{guide.text}</p></div></div>)}</div></div>
      </section>
    </main>
    <footer className="whitespace-pre-line bg-[var(--forest)] px-6 py-8 text-center text-sm text-white/90">{c.footer}</footer>
  </div>;
}

function Metric({ label, value, percent }) {
  return <div><div className="flex flex-wrap justify-between gap-1 text-sm"><span>{label}</span><b>{value}</b></div><div className="mt-2 h-2 overflow-hidden rounded bg-[var(--sage)]"><div className="h-full rounded bg-[var(--forest)]" style={{ width: `${percent}%` }}/></div></div>;
}
