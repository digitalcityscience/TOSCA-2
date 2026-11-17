import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { authSession, type SessionChangeReason } from "./session";
import { useCloseWhenPrivateAfterLogout } from "./privateContent";

const replace = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => ({ ...await importOriginal<object>(), useRouter: () => ({ replace }) }));
vi.mock("vue-i18n", async (importOriginal) => ({ ...await importOriginal<object>(), useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../core/helpers/toast", () => ({ useToast: () => ({ add: toastAdd }) }));

function openItem(status: number) {
    let notify: (reason: SessionChangeReason) => void = () => undefined;
    vi.spyOn(authSession, "onSessionChange").mockImplementation((listener) => {
        notify = listener;
        return () => undefined;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    mount(defineComponent({
        setup() {
            useCloseWhenPrivateAfterLogout(() => new URL("http://localhost:8000/api/v1/stories/s1/"), { name: "geostory-list" });
            return () => h("div");
        },
    }));
    return (reason: SessionChangeReason) => notify(reason);
}

describe("an open item when the user logs out", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        replace.mockClear();
        toastAdd.mockClear();
    });

    test("a private item closes and the list opens", async () => {
        const notify = openItem(404);
        notify("logout");
        await vi.waitFor(() => expect(replace).toHaveBeenCalledWith({ name: "geostory-list" }));
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ summary: "auth.privateItemClosedTitle" }));
    });

    test("a public item stays open", async () => {
        const notify = openItem(200);
        notify("expired");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(replace).not.toHaveBeenCalled();
    });

    test("signing in does not close anything", async () => {
        const notify = openItem(404);
        notify("login");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(replace).not.toHaveBeenCalled();
    });
});
