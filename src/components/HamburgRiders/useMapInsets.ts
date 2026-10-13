import { onBeforeUnmount, onMounted, type Ref } from "vue";

/**
 * TOSCA's slideover sidebars cover the map instead of shrinking it, so the Riders panels must stay inside the
 * part of the map that is actually visible. This reads the open sidebars (`section[data-position]`) and publishes
 * the free area as CSS variables on the module root: `--hr-left`, `--hr-right` (px from the map edge). It only
 * observes the DOM; it never touches the sidebars.
 */
const EDGE_GAP = 12;
/** Room kept clear for TOSCA's bottom map controls (basemap switcher on the left, zoom and scale on the right). */
const LEFT_CONTROLS = 108;
const RIGHT_CONTROLS = 76;
const SETTLE_MS = 700;

export function useMapInsets(root: Ref<HTMLElement | undefined>): void {
    let frame: number | undefined;
    let settleUntil = 0;
    let observer: MutationObserver | undefined;

    function measure(): void {
        const element = root.value;
        if (element === undefined || element === null) return;
        const area = element.getBoundingClientRect();
        let left = 0;
        let right = 0;
        document.querySelectorAll<HTMLElement>("section[data-position='left'], section[data-position='right']").forEach((section) => {
            const rect = section.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (section.dataset.position === "left") left = Math.max(left, rect.right - area.left);
            else right = Math.max(right, area.right - rect.left);
        });
        element.style.setProperty("--hr-left", `${left > 0 ? Math.round(left) + EDGE_GAP : LEFT_CONTROLS}px`);
        element.style.setProperty("--hr-right", `${right > 0 ? Math.round(right) + EDGE_GAP : RIGHT_CONTROLS}px`);
        element.style.setProperty("--hr-side-right", `${right > 0 ? Math.round(right) + EDGE_GAP : EDGE_GAP}px`);
    }

    // Sidebars slide in over a few hundred ms, so keep sampling for a moment after any change.
    function schedule(): void {
        settleUntil = performance.now() + SETTLE_MS;
        if (frame !== undefined) return;
        const step = (): void => {
            measure();
            frame = performance.now() < settleUntil ? requestAnimationFrame(step) : undefined;
        };
        frame = requestAnimationFrame(step);
    }

    onMounted(() => {
        measure();
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-state"] });
        window.addEventListener("resize", schedule);
    });

    onBeforeUnmount(() => {
        observer?.disconnect();
        window.removeEventListener("resize", schedule);
        if (frame !== undefined) cancelAnimationFrame(frame);
    });
}
