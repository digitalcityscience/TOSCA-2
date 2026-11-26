import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAiBridgeStore } from "@store/aiBridge";
import AiAssistantConnection from "./AiAssistantConnection.vue";

vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const ModalStub = defineComponent({
    name: "TestModal",
    props: { open: Boolean, title: String },
    template: "<div v-if='open' data-testid='modal'><slot name='body' /><slot name='footer' /></div>",
});
const ButtonStub = defineComponent({
    name: "TestButton",
    props: { label: String },
    emits: ["click"],
    template: "<button @click=\"$emit('click')\">{{ label }}<slot /></button>",
});
const AlertStub = defineComponent({
    name: "TestAlert",
    props: { title: String, description: String },
    template: "<div role='alert'>{{ title }} {{ description }}</div>",
});
const TooltipStub = defineComponent({ name: "TestTooltip", template: "<span><slot /></span>" });

// Nuxt UI components are auto-imported under their own names (Modal, Button, ...).
const global = {
    stubs: {
        Modal: ModalStub,
        UModal: ModalStub,
        Button: ButtonStub,
        UButton: ButtonStub,
        Alert: AlertStub,
        UAlert: AlertStub,
        Tooltip: TooltipStub,
        UTooltip: TooltipStub,
        Icon: true,
        UIcon: true,
    },
};

describe("AiAssistantConnection", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("shows nothing in the header until a connection was started", () => {
        const wrapper = mount(AiAssistantConnection, { global });

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.find("[data-testid='modal']").exists()).toBe(false);
    });

    test("start opens the dialog and asks for a code", async () => {
        const store = useAiBridgeStore();
        const connect = vi.spyOn(store, "connect").mockImplementation(() => undefined);
        const wrapper = mount(AiAssistantConnection, { global });

        (wrapper.vm as unknown as { start: () => void }).start();
        await wrapper.vm.$nextTick();

        expect(connect).toHaveBeenCalledTimes(1);
        expect(wrapper.find("[data-testid='modal']").exists()).toBe(true);
    });

    test("shows the pairing code while waiting for the assistant", async () => {
        const store = useAiBridgeStore();
        vi.spyOn(store, "connect").mockImplementation(() => undefined);
        store.state = { status: "waiting", code: "K7QM-3XTP", codeExpiresAt: Date.now() + 120_000, commandCount: 0 };
        const wrapper = mount(AiAssistantConnection, { global });

        (wrapper.vm as unknown as { start: () => void }).start();
        await wrapper.vm.$nextTick();

        expect(wrapper.get("[data-testid='ai-bridge-code']").text()).toBe("K7QM-3XTP");
        expect(wrapper.text()).toContain("valid for");
        // Already waiting: no second connection.
        expect(store.connect).not.toHaveBeenCalled();
    });

    test("offers a new code once the shown one has expired", async () => {
        const store = useAiBridgeStore();
        const requestNewCode = vi.spyOn(store, "requestNewCode").mockImplementation(() => undefined);
        store.state = { status: "waiting", code: "K7QM-3XTP", codeExpiresAt: Date.now() - 1000, commandCount: 0 };
        const wrapper = mount(AiAssistantConnection, { global });

        (wrapper.vm as unknown as { start: () => void }).start();
        await wrapper.vm.$nextTick();

        expect(wrapper.find("[data-testid='ai-bridge-code']").exists()).toBe(false);
        await wrapper.findAll("button").find((button) => button.text() === "New code")!.trigger("click");
        expect(requestNewCode).toHaveBeenCalled();
    });

    test("keeps a visible header button while an assistant is connected, and can disconnect", async () => {
        const store = useAiBridgeStore();
        const disconnect = vi.spyOn(store, "disconnect").mockImplementation(() => undefined);
        store.state = { status: "paired", commandCount: 3 };
        const wrapper = mount(AiAssistantConnection, { global });

        const headerButton = wrapper.get("button");
        expect(headerButton.text()).toBe("AI connected");
        await headerButton.trigger("click");

        expect(wrapper.get("[role='alert']").text()).toContain("3 commands run in this tab.");
        await wrapper.findAll("button").find((button) => button.text() === "Disconnect")!.trigger("click");
        expect(disconnect).toHaveBeenCalled();
    });

    test("explains a refused connection", async () => {
        const store = useAiBridgeStore();
        store.state = { status: "error", error: "forbidden", commandCount: 0 };
        vi.spyOn(store, "connect").mockImplementation(() => undefined);
        const wrapper = mount(AiAssistantConnection, { global });

        (wrapper.vm as unknown as { start: () => void }).start();
        await wrapper.vm.$nextTick();

        expect(wrapper.get("[role='alert']").text()).toContain("no role");
    });
});
