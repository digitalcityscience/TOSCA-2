import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import EventMapPopup from "./EventMapPopup.vue";
import { type EventMapProperties } from "@store/events";

describe("EventMapPopup", () => {
    test("renders short event info and emits detail intent", async () => {
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

        expect(wrapper.emitted("open-details")).toHaveLength(1);
    });

    test("renders taxonomy chips when map feature properties serialize nested values", () => {
        const wrapper = mount(EventMapPopup, {
            global: {
                stubs: {
                    Button: true,
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
                    series_id: null,
                    series_name: "",
                    occurrence_index: null,
                    total_occurrences: null,
                    is_exception: false,
                    taxonomy_assignments: JSON.stringify([
                        {
                            dimension_code: "accessibility",
                            dimension_label: "Accessibility",
                            terms: [{ code: "barrier_free", label: "Barrier-free" }],
                        },
                    ]) as unknown as EventMapProperties["taxonomy_assignments"],
                },
            },
        });

        expect(wrapper.text()).toContain("Barrier-free");
    });

    test("does not render series badge when map properties omit series metadata", () => {
        const wrapper = mount(EventMapPopup, {
            global: {
                stubs: {
                    Button: true,
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
                    series_name: "",
                    is_exception: false,
                } as EventMapProperties,
            },
        });

        expect(wrapper.text()).not.toContain("undefined / undefined");
    });
});
