import { createContext, useContext } from "react";
import defaults from "../../shared/site-defaults.json";

export const defaultSite = { ...defaults, revision: 0, updatedAt: null };
export const SiteContext = createContext(defaultSite);
export const useSite = () => useContext(SiteContext);

export function BrandLogo({ compact = false }) {
  const { brand } = useSite();
  return <span className="flex items-center gap-2 font-bold tracking-[.18em]">
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--forest)] text-[var(--sage)] ${compact ? "h-8 w-8 text-lg" : "h-10 w-10 text-xl"}`}>
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" /> : brand.logoText}
    </span><span>{brand.name}</span>
  </span>;
}

export function SiteSymbol({ value, className = "h-5 w-5" }) {
  if (!value) return null;
  return value.startsWith("https://")
    ? <img src={value} alt="" className={`${className} object-contain`} />
    : <span aria-hidden="true" className={className}>{value}</span>;
}
