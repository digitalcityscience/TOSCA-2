import { describe, expect, test } from "vitest";
import { isSameOrigin, nextPageLink, remainingPageUrls } from "./ogcPaging";

describe("OGC paging", () => {
    test("prefers the GeoJSON next link", () => {
        expect(nextPageLink([
            { rel: "next", type: "text/html", href: "https://x.test/items?f=html&offset=10" },
            { rel: "next", type: "application/geo+json", href: "https://x.test/items?f=json&offset=10" },
        ])).toBe("https://x.test/items?f=json&offset=10");
        expect(nextPageLink([{ rel: "self", href: "https://x.test/items" }])).toBeUndefined();
    });

    test("derives every remaining page from an offset next link", () => {
        const urls = remainingPageUrls(
            "https://x.test/items?f=json&properties=a%2Cgeom&limit=20000&offset=10000",
            10000,
            35000
        )!;
        expect(urls.map((url) => new URL(url).searchParams.get("offset"))).toEqual(["10000", "20000", "30000"]);
        // The server capped the requested limit; follow-up pages use the real page size.
        expect(new URL(urls[0]).searchParams.get("limit")).toBe("10000");
        expect(new URL(urls[0]).searchParams.get("properties")).toBe("a,geom");
    });

    test("falls back when the server does not page by offset", () => {
        expect(remainingPageUrls("https://x.test/items?f=json&cursor=abc", 100, 1000)).toBeUndefined();
        expect(remainingPageUrls("https://x.test/items?offset=10", 0, 1000)).toBeUndefined();
    });

    test("compares origins", () => {
        expect(isSameOrigin("https://x.test/a?offset=1", "https://x.test/b")).toBe(true);
        expect(isSameOrigin("https://evil.test/a", "https://x.test/b")).toBe(false);
    });
});
