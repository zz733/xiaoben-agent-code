import { app, ipcMain } from "electron";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export type LocaleId = "en" | "zh-CN";

interface LocaleEntry {
  label: string;
  data: Record<string, string>;
}

const LOCALES: Record<LocaleId, LocaleEntry> = {
  en: { label: "English", data: en as Record<string, string> },
  "zh-CN": { label: "简体中文", data: zhCN as Record<string, string> },
};

let currentLocale: LocaleId = "en";
let onLocaleChange: ((locale: LocaleId) => void) | null = null;

export function getAvailableLocales(): Array<{ id: LocaleId; label: string }> {
  return Object.entries(LOCALES).map(([id, entry]) => ({
    id: id as LocaleId,
    label: entry.label,
  }));
}

export function getCurrentLocale(): LocaleId {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = LOCALES[currentLocale]?.data[key] ?? LOCALES.en.data[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function setLocale(locale: LocaleId): void {
  if (!LOCALES[locale]) return;
  currentLocale = locale;
  onLocaleChange?.(locale);
}

export function onLocaleChanged(callback: (locale: LocaleId) => void): void {
  onLocaleChange = callback;
}

function detectLocale(): LocaleId {
  const systemLocale = app.getLocale();
  if (systemLocale in LOCALES) return systemLocale as LocaleId;
  const base = systemLocale.split("-")[0];
  if (base === "zh") return "zh-CN";
  return "en";
}

export function setupI18n(): void {
  currentLocale = detectLocale();

  ipcMain.handle("paseo:i18n:getLocale", () => currentLocale);
  ipcMain.handle("paseo:i18n:setLocale", (_event, locale: string) => {
    setLocale(locale as LocaleId);
    return currentLocale;
  });
  ipcMain.handle("paseo:i18n:getAvailableLocales", () => getAvailableLocales());
}
