import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    activeAnchorSceneId,
    createSceneScrollSync,
    findScrollParent,
    SCENE_SCROLL_DEBOUNCE_MS,
    scrollTopForAnchor,
    triggerLineOffset,
} from "./sceneScrollSync";

describe("activeAnchorSceneId", () => {
    const anchors = [
        { sceneId: "b", top: 400 },
        { sceneId: "c", top: 900 },
    ];

    test.each([
        [300, "a"], // above the first anchor: first scene
        [400, "b"], // anchor exactly on the midline counts as passed
        [650, "b"],
        [1200, "c"],
    ])("midline %i shows scene %s", (midline, expected) => {
        expect(activeAnchorSceneId(anchors, midline, "a")).toBe(expected);
    });

    test("handles anchors in any order and stories without anchors", () => {
        expect(activeAnchorSceneId([...anchors].reverse(), 1000, "a")).toBe("c");
        expect(activeAnchorSceneId([], 500, "a")).toBe("a");
        expect(activeAnchorSceneId([], 500, undefined)).toBeUndefined();
    });
});

describe("triggerLineOffset", () => {
    // Viewport 600 px, content 3000 px: max scroll 2400.
    test.each([
        [0, 0], // top: line at the top edge, so anchors on the first screen are not skipped
        [150, 150],
        [300, 300], // reaches the middle after half a screen
        [1200, 300],
        [2100, 300],
        [2250, 450], // last half-screen: line slides down
        [2400, 600], // bottom: every remaining anchor is reached
    ])("scrollTop %i puts the line at %i", (scrollTop, expected) => {
        expect(triggerLineOffset(scrollTop, 600, 3000)).toBe(expected);
    });

    test("spreads the line over a short scroll range", () => {
        expect(triggerLineOffset(0, 600, 800)).toBe(0);
        expect(triggerLineOffset(100, 600, 800)).toBe(300);
        expect(triggerLineOffset(200, 600, 800)).toBe(600);
    });

    test("keeps the line at the top when nothing scrolls", () => {
        expect(triggerLineOffset(0, 600, 600)).toBe(0);
    });
});

describe("scrollTopForAnchor", () => {
    // Viewport 600 px, content 3000 px: max scroll 2400.
    test.each([
        [100, 51], // first half-screen: line = scrollTop, so 50 + 50 reaches it
        [1500, 1201], // mid-story: anchor sits on the middle line
        [2850, 2326], // last half-screen: line slides down, reached near the bottom
        [5000, 2400], // beyond the content: scroll as far as possible
    ])("anchor at %i activates from scrollTop %i", (anchorOffset, expected) => {
        const scrollTop = scrollTopForAnchor(anchorOffset, 600, 3000);

        expect(scrollTop).toBeCloseTo(expected, -1);
        if (anchorOffset <= 3000) {
            expect(scrollTop + triggerLineOffset(scrollTop, 600, 3000)).toBeGreaterThanOrEqual(anchorOffset);
        }
    });

    test("activates the anchor without passing the next one", () => {
        const first = scrollTopForAnchor(1500, 600, 3000);

        expect(first + triggerLineOffset(first, 600, 3000)).toBeLessThan(1510);
    });
});

describe("createSceneScrollSync", () => {
    const ROOT_TOP = 100;
    const ROOT_HEIGHT = 600; // midline at viewport y = 400
    let root: HTMLElement;
    let content: HTMLElement;
    let anchorTops: Record<string, number>;
    let target: string | undefined;
    let onActivate: ReturnType<typeof vi.fn<(sceneId: string) => void>>;

    function addAnchor(sceneId: string, top: number): void {
        const anchor = document.createElement("div");
        anchor.className = "geostory-scene-anchor";
        anchor.dataset.sceneId = sceneId;
        anchorTops[sceneId] = top;
        anchor.getBoundingClientRect = () => ({ top: anchorTops[sceneId] } as DOMRect);
        content.append(anchor);
    }

    /** Scroll by `delta` px: every anchor moves up by that much. */
    function scrollBy(delta: number): void {
        for (const sceneId of Object.keys(anchorTops)) anchorTops[sceneId] -= delta;
        root.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(16); // one animation frame
    }

    function settle(): void {
        vi.advanceTimersByTime(SCENE_SCROLL_DEBOUNCE_MS);
    }

    const created: Array<ReturnType<typeof createSceneScrollSync>> = [];

    function createSync(known = ["a", "b", "c"]) {
        const sync = createSceneScrollSync({
            onActivate: (sceneId) => {
                target = sceneId;
                onActivate(sceneId);
            },
            getFirstSceneId: () => "a",
            getTargetSceneId: () => target,
            isKnownScene: (sceneId) => known.includes(sceneId),
        });
        created.push(sync);
        return sync;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            return setTimeout(() => callback(0), 16) as unknown as number;
        });
        vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
        root = document.createElement("main");
        root.getBoundingClientRect = () => ({ top: ROOT_TOP } as DOMRect);
        Object.defineProperty(root, "clientHeight", { value: ROOT_HEIGHT });
        // Mid-story scroll position, so the trigger line sits at the middle.
        Object.defineProperty(root, "scrollHeight", { value: 10_000 });
        Object.defineProperty(root, "scrollTop", { value: 5_000 });
        content = document.createElement("div");
        root.append(content);
        anchorTops = {};
        target = "a"; // the story opened on its first scene
        onActivate = vi.fn();
        addAnchor("b", 1000);
        addAnchor("c", 2000);
    });

    afterEach(() => {
        // Controllers listen on window; detach them so tests stay independent.
        created.splice(0).forEach((sync) => sync.detach());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test("does nothing while the first scene is already shown", () => {
        createSync().attach(root, content);
        settle();

        expect(onActivate).not.toHaveBeenCalled();
    });

    test("switches scenes as anchors cross the middle, in both directions", () => {
        createSync().attach(root, content);

        scrollBy(700); // b at 300: above the midline (400)
        settle();
        scrollBy(1000); // c at 300
        settle();
        scrollBy(-1700); // back to the top
        settle();

        expect(onActivate.mock.calls.map(([sceneId]) => sceneId)).toEqual(["b", "c", "a"]);
    });

    test("a fast flick past several anchors ends on the last one only", () => {
        createSync().attach(root, content);

        scrollBy(700);
        scrollBy(500);
        scrollBy(600); // c passes the midline before scrolling settles
        settle();

        expect(onActivate.mock.calls).toEqual([["c"]]);
    });

    test("does not re-request the scene the map is already switching to", () => {
        createSync().attach(root, content);
        scrollBy(700);
        settle();

        scrollBy(50); // still within scene b
        settle();

        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    test("ignores anchors to scenes that are not in the open story", () => {
        createSync(["a", "c"]).attach(root, content);

        scrollBy(700); // only the unknown "b" anchor has passed
        settle();

        expect(onActivate).not.toHaveBeenCalled();
    });

    test("evaluates on attach, e.g. when content re-renders mid-story", () => {
        anchorTops.b = 200;
        createSync().attach(root, content);
        settle();

        expect(onActivate.mock.calls).toEqual([["b"]]);
    });

    test("ignores scrolling and resizing while the container is hidden", () => {
        const hidden = document.createElement("main");
        hidden.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
        Object.defineProperty(hidden, "clientHeight", { value: 0 });
        hidden.append(content);
        for (const sceneId of Object.keys(anchorTops)) anchorTops[sceneId] = 0;
        createSync().attach(hidden, content);

        window.dispatchEvent(new Event("resize"));
        vi.advanceTimersByTime(16);
        settle();

        expect(onActivate).not.toHaveBeenCalled();
    });

    test("stops reacting after detach", () => {
        const sync = createSync();
        sync.attach(root, content);
        sync.detach();

        scrollBy(700);
        settle();

        expect(onActivate).not.toHaveBeenCalled();
    });
});

describe("findScrollParent", () => {
    test("returns the closest scrolling ancestor", () => {
        const outer = document.createElement("div");
        outer.style.overflowY = "auto";
        const inner = document.createElement("div");
        const content = document.createElement("div");
        outer.append(inner);
        inner.append(content);
        document.body.append(outer);

        expect(findScrollParent(content)).toBe(outer);
        outer.remove();
    });
});
