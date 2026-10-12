import { afterEach, describe, expect, it, vi } from "vitest";
import { flyToAdminArea, flyToBounds, flyToPoint, leftInset } from "./urbanStoryCamera";

function fakeMap(canvasWidth = 1200) {
    return {
        getCanvas: () => ({ getBoundingClientRect: () => ({ left: 0, width: canvasWidth }) }) as unknown as HTMLCanvasElement,
        cameraForBounds: vi.fn(() => ({ zoom: 12.3 })),
        flyTo: vi.fn(),
    };
}

function sidebar(right: number): void {
    const section = document.createElement("section");
    section.dataset.position = "left";
    section.getBoundingClientRect = () => ({ right, width: right, height: 600 }) as DOMRect;
    document.body.appendChild(section);
}

afterEach(() => { document.body.innerHTML = ""; });

describe("urbanStoryCamera", () => {
    it("centres the bounds in the visible region and pads by the sidebar once", () => {
        sidebar(420);
        const map = fakeMap();
        flyToBounds(map, [9.9, 53.4, 10.1, 53.6], { duration: 0 });
        expect(map.cameraForBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ padding: { left: 460, right: 40, top: 40, bottom: 40 } }));
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10, 53.5], zoom: 12.3, padding: { left: 420, right: 0, top: 0, bottom: 0 } }));
    });

    it("caps the zoom and ignores a sidebar that covers most of the map", () => {
        sidebar(1000);
        expect(leftInset(fakeMap())).toBe(0);
        const map = fakeMap();
        map.cameraForBounds.mockReturnValue({ zoom: 18 });
        flyToBounds(map, [10, 53, 10.01, 53.01], { duration: 0, maxZoom: 14 });
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 14 }));
    });

    it("flies to a point with the same padding", () => {
        sidebar(300);
        const map = fakeMap();
        flyToPoint(map, [10, 53], { zoom: 16, pitch: 55, duration: 0 });
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10, 53], padding: { left: 300, right: 0, top: 0, bottom: 0 } }));
    });

    it("uses a fixed zoom per level and fits only Bezirke", () => {
        sidebar(420);
        const bounds: [number, number, number, number] = [9.9388, 53.4539, 10.079, 53.5264];
        const map = fakeMap();
        flyToAdminArea(map, bounds, "stadtteil", { duration: 0 });
        flyToAdminArea(map, bounds, "statisticalUnit", { duration: 0 });
        expect(map.flyTo).toHaveBeenNthCalledWith(1, expect.objectContaining({ zoom: 14, padding: { left: 420, right: 0, top: 0, bottom: 0 } }));
        expect(map.flyTo).toHaveBeenNthCalledWith(2, expect.objectContaining({ zoom: 15 }));
        expect(map.cameraForBounds).not.toHaveBeenCalled();
        flyToAdminArea(map, bounds, "bezirk", { duration: 0 });
        expect(map.cameraForBounds).toHaveBeenCalledTimes(1);
    });
});
