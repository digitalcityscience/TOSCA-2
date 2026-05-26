import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import EventMapPopup from "./EventMapPopup.vue";

const push = vi.fn(async () => {});

vi.mock("vue-router", () => ({
    useRouter: () => ({ push }),
}));

describe("EventMapPopup", () => {
    test("renders short event info and routes to detail", async () => {
        const wrapper = mount(EventMapPopup, {
            global: {
                stubs: {
                    Button: {
                        props: ["label"],
                        emits: ["click"],
                        template: "<button @click=\"$emit('click')\">{{ label }}</button>",
                    },
                    Tag: {
                        props: ["value"],
                        template: "<span>{{ value }}</span>",
                    },
                },
            },
            props: {
                event: {
                    id: "event-1",
                    title: "Neighborhood Walk",
                    summary: "Short info",
                    campaign: "campaign-1",
                    event_type: "type-1",
                    start_datetime: "2026-06-01T10:00:00Z",
                    end_datetime: "2026-06-01T11:00:00Z",
                    location_mode: "physical",
                    status: "published",
                    visibility: "public",
                    series_id: "series-1",
                    series_name: "Walks",
                    occurrence_index: 2,
                    total_occurrences: 4,
                    is_exception: false,
                },
            },
        });

        expect(wrapper.text()).toContain("Neighborhood Walk");
        expect(wrapper.text()).toContain("Short info");
        expect(wrapper.text()).toContain("2 / 4");

        await wrapper.get("button").trigger("click");

        expect(push).toHaveBeenCalledWith({
            name: "event-detail",
            params: { eventId: "event-1" },
        });
    });
});
