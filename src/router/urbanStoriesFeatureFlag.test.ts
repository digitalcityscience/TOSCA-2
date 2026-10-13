import { afterEach, describe, expect, test, vi } from "vitest";
import type { Router } from "vue-router";

vi.mock("../views/MapView.vue", () => ({ default: { template: "<div />" } }));
vi.mock("../components/UrbanStories/UrbanStoriesSidebar.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@store/participation", () => ({ useParticipationStore: () => ({ activeCampaigns: [] }) }));
vi.mock("@store/map", () => ({ useMapStore: () => ({ map: undefined, resetMapData: vi.fn() }) }));

async function routerWith(enabled: string[]): Promise<Router> {
    vi.resetModules();
    vi.doMock("../config/features", () => ({
        isFeatureEnabled: (id: string) => enabled.includes(id),
    }));
    const { default: router } = await import("./index");
    return router;
}

describe("urban stories feature flag in the router", () => {
    afterEach(() => {
        vi.doUnmock("../config/features");
        vi.resetModules();
    });

    test.each([["/urban-stories"], ["/urban-stories/green-spaces"]])("redirects %s to / when the feature is disabled", async (path) => {
        const router = await routerWith(["datastores", "events", "geostories"]);

        await router.push(path);

        expect(router.currentRoute.value.fullPath).toBe("/");
    });

    test("opens /urban-stories/:storyKey when the feature is enabled", async () => {
        const router = await routerWith(["urbanStories"]);

        await router.push("/urban-stories/green-spaces");

        expect(router.currentRoute.value.name).toBe("urban-stories");
        expect(router.currentRoute.value.params.storyKey).toBe("green-spaces");
        expect(router.currentRoute.value.meta).toMatchObject({ feature: "urbanStories", sidebar: "urbanStories", sidebarPosition: "left" });
    });

    test("redirects an unknown story key to /urban-stories when the feature is enabled", async () => {
        const router = await routerWith(["urbanStories"]);

        await router.push("/urban-stories/unknown");

        expect(router.currentRoute.value.fullPath).toBe("/urban-stories");
    });

    test("leaves the GeoStories routes unchanged", async () => {
        const router = await routerWith(["geostories"]);

        await router.push("/geostories/story-1");

        expect(router.currentRoute.value.name).toBe("geostory-detail");
    });
});
