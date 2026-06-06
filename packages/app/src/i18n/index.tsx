import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { isNative } from "@/constants/platform";
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

interface I18nContextValue {
  locale: LocaleId;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: LocaleId) => void;
  availableLocales: Array<{ id: LocaleId; label: string }>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectLocale(): LocaleId {
  if (isNative) {
    const Locale = require("expo-localization");
    const systemLocale = Locale.getLocales?.()?.[0]?.languageTag ?? "en";
    if (systemLocale.startsWith("zh")) return "zh-CN";
    return "en";
  }
  const lang = typeof navigator !== "undefined" ? navigator.language : "en";
  if (lang.startsWith("zh")) return "zh-CN";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(detectLocale);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = LOCALES[locale]?.data[key] ?? LOCALES.en.data[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [locale],
  );

  const setLocale = useCallback((newLocale: LocaleId) => {
    if (LOCALES[newLocale]) {
      setLocaleState(newLocale);
      if (!isNative && window.paseoDesktop?.invoke) {
        void window.paseoDesktop.invoke("paseo:i18n:setLocale", { locale: newLocale });
      }
    }
  }, []);

  const availableLocales = useMemo(
    () =>
      Object.entries(LOCALES).map(([id, entry]) => ({ id: id as LocaleId, label: entry.label })),
    [],
  );

  const value = useMemo(
    () => ({ locale, t, setLocale, availableLocales }),
    [locale, t, setLocale, availableLocales],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useTranslation(namespace?: string) {
  const { t, locale } = useI18n();
  const nt = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return t(fullKey, params);
    },
    [t, namespace],
  );
  return { t: nt, locale };
}

export { LOCALES };
