import { afterEach, describe, expect, test, vi } from "vitest";
import { errorDetails, runScene, SionnaRunnerError, targetAddressSpace } from "./sionnaRunner";

afterEach(() => {
    vi.unstubAllGlobals();
});

// A runner in the LAN: VITE_SIONNA_TEST_LAN_URL in .env.local, else a documentation address.
const lanRunner = (import.meta.env.VITE_SIONNA_TEST_LAN_URL as string | undefined) || "http://10.0.0.5:8770";

const request = { parameters: {}, transmitters: [], receivers: [], radio_map: true, paths: false };

describe("sionnaRunner", () => {
    test("reads one message or a list of parameter errors", () => {
        expect(errorDetails({ detail: "Scene not loaded" })).toEqual(["Scene not loaded"]);
        expect(errorDetails({ detail: ["rm_max_depth: too big", 3] })).toEqual(["rm_max_depth: too big"]);
        expect(errorDetails(undefined)).toEqual([]);
    });

    test("reports an unreachable runner with status 0", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
        await expect(runScene("abc", request)).rejects.toMatchObject({ status: 0 });
    });

    test("keeps the runner's parameter errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ detail: ["rm_max_depth: 99 is greater than the maximum of 10"] }), { status: 400 })
        ));
        const error = await runScene("abc", request).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(SionnaRunnerError);
        expect((error as SionnaRunnerError).details).toEqual(["rm_max_depth: 99 is greater than the maximum of 10"]);
    });
});

test("tells Chrome whether the runner is on this machine or in the LAN", () => {
    expect(targetAddressSpace("http://127.0.0.1:8770")).toBe("loopback");
    expect(targetAddressSpace("http://localhost:8770")).toBe("loopback");
    expect(targetAddressSpace("http://[::1]:8770")).toBe("loopback");
    expect(targetAddressSpace(lanRunner)).toBe("local");
    expect(targetAddressSpace("http://gpu-box.local:8770")).toBe("local");
    expect(targetAddressSpace("https://gpu.example.org")).toBeUndefined();
});
