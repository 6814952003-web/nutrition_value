const defaults = require("../../../shared/site-defaults.json");

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (max, required = false) => ({ kind: "string", valid: value => value.length <= max && (!required || value.trim().length > 0) });
const httpsUrl = value => {
  if (value === "") return true;
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.href === value && !!url.hostname && !url.hash;
  } catch { return false; }
};
const image = { kind: "string", valid: httpsUrl };
const emoji = value => value === "" || (value.length <= 32 && /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}]/u.test(value)
  && /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f\u20e3\u0030-\u0039\u0023\u002a]+$/u.test(value));
const icon = { kind: "string", valid: value => emoji(value) || (value.startsWith("https://") && httpsUrl(value)) };
const color = { kind: "string", valid: value => /^#[0-9a-f]{6}$/i.test(value) };
const identifier = { kind: "string", valid: value => /^[a-zA-Z0-9_-]{1,64}$/.test(value) };
const number = positive => ({ kind: "number", valid: value => Number.isFinite(value) && value <= 1_000_000 && (positive ? value > 0 : value >= 0) });
const object = fields => ({ kind: "object", fields });
const stringFields = value => object(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, isObject(child) ? stringFields(child) : text(3000)])));
const guideSchema = object({ id: identifier, title: text(160, true), text: text(3000) });
const schema = object({
  brand: object({ name: text(80, true), logoText: text(32), logoUrl: image, faviconUrl: image }),
  theme: object({ primary: color, accent: color, background: color, text: color }),
  goals: object({ calories: number(true), protein: number(true), carbs: number(true), fat: number(true) }),
  copy: stringFields(defaults.copy),
  icons: object({ user: icon, clock: icon, arrow: icon, spark: icon, hero: icon }),
  meals: { kind: "array", item: object({}), max: 0 },
  guides: { kind: "array", item: guideSchema, max: 40 },
});

const valid = (definition, value) => {
  if (definition.kind === "object") {
    if (!isObject(value)) return false;
    const keys = Object.keys(definition.fields);
    return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && valid(definition.fields[key], value[key]));
  }
  if (definition.kind === "array") {
    return Array.isArray(value) && value.length <= definition.max
      && value.every(item => valid(definition.item, item)) && new Set(value.map(item => item.id)).size === value.length;
  }
  return typeof value === definition.kind && definition.valid(value);
};

// Older documents acquire newly added fields from the shipped defaults. Invalid
// values and unknown keys never make it into the public configuration response.
const mergeSafe = (definition, value, fallback) => {
  if (definition.kind === "object") return Object.fromEntries(Object.entries(definition.fields).map(([key, child]) => [key, mergeSafe(child, isObject(value) ? value[key] : undefined, fallback[key])]));
  if (definition.kind === "array") {
    if (!Array.isArray(value) || value.length > definition.max) return structuredClone(fallback);
    const seen = new Set();
    return value.filter(isObject).map(item => mergeSafe(definition.item, item, fallback.find(entry => entry.id === item.id) || fallback[0]))
      .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
  }
  return typeof value === definition.kind && definition.valid(value) ? value : fallback;
};

const validateSiteConfig = value => valid(schema, value);
const mergeSiteConfig = value => mergeSafe(schema, value, defaults);
module.exports = { defaults, validateSiteConfig, mergeSiteConfig };
