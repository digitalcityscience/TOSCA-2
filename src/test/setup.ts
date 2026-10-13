import { config } from "@vue/test-utils";
import { vi } from "vitest";
import { createI18n } from "vue-i18n";
import en from "@locales/en.json";

const testI18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: { en },
});

config.global.plugins.push(testI18n);

// .env is gitignored, so CI has no GeoServer root; the WFS helpers build absolute URLs from it.
vi.stubEnv("VITE_GEOSERVER_BASE_URL", "http://geoserver.test/geoserver");
