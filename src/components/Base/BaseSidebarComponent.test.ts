import { mount } from "@vue/test-utils";
import BaseSidebarComponent from "./BaseSidebarComponent.vue";
import { expect, test } from "vitest";

test("should be visible, if initialized with colapsed=false", () => {
    const wrapper = mount(BaseSidebarComponent, {
        props: {
            position: "left",
            id: "testId",
            collapsed: false,
        },
    });
    const component = wrapper.find("[id=testId]");
    expect(component.classes()).not.toContain("collapsed");
});
