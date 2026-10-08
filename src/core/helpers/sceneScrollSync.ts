import { SCENE_ANCHOR_CLASS } from "./editorJsMapSceneAnchor";

export const SCENE_SCROLL_DEBOUNCE_MS = 150;

export interface AnchorPosition {
    sceneId: string;
    /** Viewport y of the anchor (`getBoundingClientRect().top`). */
    top: number;
}

/**
 * The scene for the current scroll position: the last anchor at or above the
 * midline; above the first anchor, the story's first scene.
 */
export function activeAnchorSceneId(
    anchors: AnchorPosition[],
    midline: number,
    firstSceneId: string | undefined
): string | undefined {
    let active = firstSceneId;
    for (const anchor of [...anchors].sort((a, b) => a.top - b.top)) {
        if (anchor.top > midline) break;
        active = anchor.sceneId;
    }
    return active;
}

/**
 * Offset of the trigger line from the top of the scroll container.
 *
 * @remarks
 * Normally the vertical middle. Anchors in the first or last half-screen of a
 * story could never cross a fixed middle (the content cannot scroll far
 * enough), so near both ends the line slides: from the top edge to the middle
 * over the first half-screen of scrolling, and from the middle to the bottom
 * edge over the last. Every anchor is then reached, in order. Content that does
 * not scroll keeps the line at the top (first scene only).
 */
export function triggerLineOffset(scrollTop: number, clientHeight: number, scrollHeight: number): number {
    const maxScroll = Math.max(scrollHeight - clientHeight, 0);
    if (maxScroll === 0) return 0;
    const y = Math.min(Math.max(scrollTop, 0), maxScroll);
    if (maxScroll <= clientHeight) return (y / maxScroll) * clientHeight;
    const half = clientHeight / 2;
    if (y < half) return y;
    const remaining = maxScroll - y;
    if (remaining < half) return clientHeight - remaining;
    return half;
}

/**
 * Scroll position at which an anchor has just passed the trigger line, i.e. the
 * smallest `scrollTop` that activates its scene.
 *
 * @param anchorOffset - The anchor's offset from the top of the scroll content.
 * @returns A scroll position in `[0, scrollHeight - clientHeight]`; the maximum
 * when no position reaches the anchor.
 */
export function scrollTopForAnchor(anchorOffset: number, clientHeight: number, scrollHeight: number): number {
    const maxScroll = Math.max(scrollHeight - clientHeight, 0);
    const passes = (y: number) => y + triggerLineOffset(y, clientHeight, scrollHeight) >= anchorOffset;
    if (!passes(maxScroll)) return maxScroll;
    // y + line(y) never decreases as y grows, so bisect for the first position that passes.
    let low = 0;
    let high = maxScroll;
    while (high - low > 0.5) {
        const middle = (low + high) / 2;
        if (passes(middle)) high = middle;
        else low = middle;
    }
    return Math.min(Math.ceil(high) + 1, maxScroll);
}

export interface SceneScrollSyncOptions {
    /** Switch the map; called only when the scene for the scroll position changes. */
    onActivate: (sceneId: string) => void;
    /** Scene shown before the first anchor (the story's first scene by order). */
    getFirstSceneId: () => string | undefined;
    /**
     * Latest scene requested from the map (even while it is still switching), so
     * an unchanged scroll position never re-requests it.
     */
    getTargetSceneId: () => string | undefined;
    /** Anchors whose scene is not part of the open story are ignored. */
    isKnownScene: (sceneId: string) => boolean;
    delayMs?: number;
}

export interface SceneScrollSync {
    /** Watch `root` scrolling over the anchors inside `content`. Replaces any previous attachment. */
    attach: (root: HTMLElement, content: HTMLElement) => void;
    /** Re-evaluate now (e.g. after the open story changed). */
    refresh: () => void;
    detach: () => void;
}

/**
 * Switch GeoStory scenes as the reader scrolls the story sidebar.
 *
 * @remarks
 * The story scrolls inside the sidebar's `<main>`, not the window, so positions
 * are measured against that element: the active scene belongs to the last anchor
 * at or above its trigger line (the vertical middle, sliding to the edges near
 * the start and end; see {@link triggerLineOffset}). Measurements run at most once per animation
 * frame, and a scene change is applied only after scrolling settles for
 * `delayMs`, so fast flicks end on the right scene without intermediate switches.
 */
export function createSceneScrollSync(options: SceneScrollSyncOptions): SceneScrollSync {
    const delayMs = options.delayMs ?? SCENE_SCROLL_DEBOUNCE_MS;
    let root: HTMLElement | undefined;
    let anchors: HTMLElement[] = [];
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function evaluate(): void {
        // A hidden container (e.g. the story sidebar collapsed while its content
        // stays mounted) measures every anchor at 0, which would look as if all
        // were passed. Keep the current scene until it is shown again.
        if (root === undefined || root.clientHeight === 0) return;
        const rootTop = root.getBoundingClientRect().top;
        const midline = rootTop + triggerLineOffset(root.scrollTop, root.clientHeight, root.scrollHeight);
        const positions = anchors
            .map((anchor) => ({ sceneId: anchor.dataset.sceneId ?? "", top: anchor.getBoundingClientRect().top }))
            .filter((anchor) => options.isKnownScene(anchor.sceneId));
        schedule(activeAnchorSceneId(positions, midline, options.getFirstSceneId()));
    }

    function schedule(sceneId: string | undefined): void {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        if (sceneId === undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (sceneId !== options.getTargetSceneId()) options.onActivate(sceneId);
        }, delayMs);
    }

    function onScroll(): void {
        if (frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            evaluate();
        });
    }

    function attach(nextRoot: HTMLElement, content: HTMLElement): void {
        detach();
        root = nextRoot;
        anchors = Array.from(content.querySelectorAll<HTMLElement>(`.${SCENE_ANCHOR_CLASS}`));
        root.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        evaluate();
    }

    function detach(): void {
        root?.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (timer !== undefined) clearTimeout(timer);
        frame = undefined;
        timer = undefined;
        root = undefined;
        anchors = [];
    }

    return { attach, refresh: evaluate, detach };
}

/** Closest scrolling ancestor, for content rendered outside a sidebar. */
export function findScrollParent(element: HTMLElement): HTMLElement | undefined {
    let current = element.parentElement;
    while (current !== null) {
        const { overflowY } = getComputedStyle(current);
        if (overflowY === "auto" || overflowY === "scroll") return current;
        current = current.parentElement;
    }
    return undefined;
}
