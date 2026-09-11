import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, test } from "vitest";
import BaseSlideoverSidebarComponent from "./BaseSlideoverSidebarComponent.vue";

const SlideoverStub = defineComponent({
    name: "TestSlideover",
    props: {
        open: Boolean,
        unmountOnHide: Boolean,
    },
    template: "<div><slot name='content' /></div>",
});

const global = {
    stubs: {
        Slideover: SlideoverStub,
        USlideover: SlideoverStub,
        UButton: true,
    },
};

describe("BaseSlideoverSidebarComponent", () => {
    test("unmounts hidden content by default", () => {
        const wrapper = mount(BaseSlideoverSidebarComponent, {
            props: { id: "default-sidebar", collapsed: false },
            global,
        });

        expect(wrapper.getComponent(SlideoverStub).props("unmountOnHide")).toBe(true);
    });

    test("can preserve content while the sidebar is hidden", () => {
        const wrapper = mount(BaseSlideoverSidebarComponent, {
            props: {
                id: "persistent-sidebar",
                collapsed: false,
                unmountOnHide: false,
            },
            global,
        });

        expect(wrapper.getComponent(SlideoverStub).props("unmountOnHide")).toBe(false);
    });
});
