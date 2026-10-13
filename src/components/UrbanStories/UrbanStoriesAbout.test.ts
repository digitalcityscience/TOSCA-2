import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { describe, expect, test } from "vitest";
import en from "../../locales/en.json";
import de from "../../locales/de.json";
import tr from "../../locales/tr.json";
import { DATA_CREDITS } from "../../config/urbanStories/dataCredits";
import UrbanStoriesAbout from "./UrbanStoriesAbout.vue";

function mountAbout(locale = "en") {
    const i18n = createI18n({ legacy: false, locale, messages: { en, de, tr } });
    return mount(UrbanStoriesAbout, { global: { plugins: [i18n], stubs: { UIcon: true } } });
}

describe("UrbanStoriesAbout", () => {
    test("shows attribution and disclaimer; credits start collapsed", () => {
        const wrapper = mountAbout();
        expect(wrapper.text()).toContain("SUMO-15 / NGCN Engineering Team at HafenCity University Hamburg");
        expect(wrapper.text()).toContain("do not constitute official assessments or operational guidance");
        const toggle = wrapper.get("[data-testid=urban-stories-credits-toggle]");
        expect(toggle.attributes("aria-expanded")).toBe("false");
        expect(wrapper.get("[data-testid=urban-stories-credits-panel]").isVisible()).toBe(false);
    });

    test("toggle expands the credits and keeps aria state in sync", async () => {
        const wrapper = mountAbout();
        const toggle = wrapper.get("[data-testid=urban-stories-credits-toggle]");
        await toggle.trigger("click");
        expect(toggle.attributes("aria-expanded")).toBe("true");
        expect(toggle.attributes("aria-controls")).toBe(wrapper.get("[data-testid=urban-stories-credits-panel]").attributes("id"));
        expect(wrapper.get("[data-testid=urban-stories-credits-panel]").isVisible()).toBe(true);
        expect(wrapper.get("[data-credit=osm]").text()).toContain("© OpenStreetMap contributors");
        await toggle.trigger("click");
        expect(toggle.attributes("aria-expanded")).toBe("false");
    });

    test("every credit has a text in all locales", () => {
        for (const messages of [en, de, tr]) {
            for (const credit of DATA_CREDITS) {
                expect(messages.urbanStories.credits.items).toHaveProperty(credit.id);
            }
        }
    });
});
