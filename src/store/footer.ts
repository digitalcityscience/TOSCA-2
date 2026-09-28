import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import type { EditorJsContent } from "@components/Base/EditorJsReadonly.vue";
import { reportDeveloperError, serviceUnavailableMessage } from "@helpers/userFacingError";
import { fetchBackendJson, getBackendRootUrl } from "./backend";

const FOOTER_API_PATH = "/api/v1/footer/";

export interface PublishedFooterLogo {
    id: string;
    url: string;
    alt_text: string;
    destination_url: string;
    display_order: number;
}

export interface PublishedFooterDocument {
    id: string;
    title: string;
    slug: string;
    path: string;
    content: EditorJsContent;
    display_order: number;
}

export interface PublishedFooter {
    id: string;
    name: string;
    version: number;
    published_at: string;
    logos: PublishedFooterLogo[];
    documents: PublishedFooterDocument[];
}

interface EmptyFooterResponse {
    footer: null;
}

export function buildPublishedFooterUrl(): URL {
    return new URL(FOOTER_API_PATH, getBackendRootUrl());
}

export function buildPublishedFooterDocumentUrl(slug: string): URL {
    return new URL(
        `${FOOTER_API_PATH}documents/${encodeURIComponent(slug)}/`,
        getBackendRootUrl()
    );
}

export const useFooterStore = defineStore("footer", () => {
    const footer = ref<PublishedFooter | null>(null);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref("");

    async function loadFooter(): Promise<PublishedFooter | null> {
        if (loading.value) {
            return footer.value;
        }

        loading.value = true;
        error.value = "";
        try {
            const response = await fetchBackendJson<PublishedFooter | EmptyFooterResponse>(
                buildPublishedFooterUrl(),
                "Footer"
            );
            footer.value = "footer" in response ? null : response;
            loaded.value = true;
            return footer.value;
        } catch (cause) {
            error.value = serviceUnavailableMessage("Footer");
            reportDeveloperError("Loading the published footer", cause);
            throw cause;
        } finally {
            loading.value = false;
        }
    }

    async function loadDocument(slug: string): Promise<PublishedFooterDocument | null> {
        const response = await fetch(buildPublishedFooterDocumentUrl(slug), {
            method: "GET",
            redirect: "follow",
            headers: new Headers({
                Accept: "application/json",
            }),
        });
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            const body = await response.text();
            const message = body === "" ? response.statusText : body;
            throw new Error(
                `Footer document request failed (${response.status} ${response.statusText}): ${message}`
            );
        }
        return await response.json() as PublishedFooterDocument;
    }

    return {
        footer,
        loading,
        loaded,
        error,
        loadFooter,
        loadDocument,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useFooterStore, import.meta.hot));
}
