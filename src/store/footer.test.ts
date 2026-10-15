import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildPublishedFooterDocumentUrl,
    buildPublishedFooterUrl,
    useFooterStore,
} from "./footer";

const publishedFooter = {
    id: "footer-1",
    name: "Default footer",
    version: 3,
    published_at: "2026-09-28T09:00:00Z",
    logos: [
        {
            id: "logo-1",
            image: "footer/footer-1/logos/partner.png",
            url: "http://localhost:8000/media/footer/footer-1/logos/partner.png",
            alt_text: "Partner",
            destination_url: "",
            display_order: 0,
        },
    ],
    documents: [
        {
            id: "document-1",
            title: "Privacy",
            slug: "privacy",
            path: "/privacy",
            display_order: 0,
        },
    ],
};

const privacyDocument = {
    ...publishedFooter.documents[0],
    content: { blocks: [] },
};

describe("footer store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        vi.stubGlobal("fetch", vi.fn());
    });

    test("builds the public footer URLs", () => {
        expect(buildPublishedFooterUrl().toString()).toBe(
            "http://localhost:8000/api/v1/footer/"
        );
        expect(buildPublishedFooterDocumentUrl("privacy policy").toString()).toBe(
            "http://localhost:8000/api/v1/footer/documents/privacy%20policy/"
        );
    });

    test("loads the published footer and handles an empty publication", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify(publishedFooter), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ footer: null }), { status: 200 }));
        const store = useFooterStore();

        await expect(store.loadFooter()).resolves.toEqual(publishedFooter);
        expect(store.footer?.documents[0]?.slug).toBe("privacy");
        expect(store.footer?.documents[0]).not.toHaveProperty("content");

        await expect(store.loadFooter()).resolves.toBeNull();
        expect(store.footer).toBeNull();
    });

    test("returns null only when the published document endpoint returns 404", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 404 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(privacyDocument), { status: 200 }));
        const store = useFooterStore();

        await expect(store.loadDocument("missing")).resolves.toBeNull();
        await expect(store.loadDocument("privacy")).resolves.toEqual(privacyDocument);
    });
});
