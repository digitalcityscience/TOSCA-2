import { createI18n } from "vue-i18n";
import en from "@locales/en.json";

export const SUPPORTED_LOCALES = ["en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_STORAGE_KEY = "tosca-locale";

function isSupportedLocale(locale: string): locale is SupportedLocale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

export function detectLocale(): SupportedLocale {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
        return stored;
    }

    const browserLocale = navigator.language?.split("-")[0];
    if (browserLocale && isSupportedLocale(browserLocale)) {
        return browserLocale;
    }

    return "en";
}

export const i18n = createI18n({
    legacy: false,
    locale: detectLocale(),
    fallbackLocale: "en",
    messages: { en },
});

export function setLocale(locale: SupportedLocale): void {
    i18n.global.locale.value = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
}
