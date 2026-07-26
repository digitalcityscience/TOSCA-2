import { config } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@locales/en.json";

const testI18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: { en },
});

config.global.plugins.push(testI18n);
