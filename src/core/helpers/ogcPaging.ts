/**
 * Paging helpers for OGC API Features `items` responses, shared by the
 * main thread and the feature-loading worker.
 */

export interface OgcLinkLike {
    href: string;
    rel?: string;
    type?: string;
}

const GEOJSON_TYPES = ["application/geo+json", "application/json"];

export function nextPageLink(links: OgcLinkLike[] | undefined): string | undefined {
    const candidates = (links ?? []).filter((link) => link.rel === "next");
    for (const type of GEOJSON_TYPES) {
        const match = candidates.find((link) => link.type === type);
        if (match !== undefined) return match.href;
    }
    return candidates[0]?.href;
}

/**
 * When the server pages by `offset` (as ldproxy does), derives the URLs of
 * every remaining page from the first `next` link so they can be fetched in
 * parallel. Returns undefined when the link carries no offset, in which case
 * the caller has to follow `next` links one by one.
 *
 * @param nextLink - The `next` link of the first page.
 * @param pageSize - Features the server actually returned on the first page
 *   (servers may cap the requested `limit`).
 * @param total - `numberMatched` of the query.
 */
export function remainingPageUrls(nextLink: string, pageSize: number, total: number): string[] | undefined {
    const template = new URL(nextLink);
    const firstOffset = Number(template.searchParams.get("offset"));
    if (!template.searchParams.has("offset") || !Number.isFinite(firstOffset) || pageSize <= 0) {
        return undefined;
    }
    template.searchParams.set("limit", String(pageSize));
    const urls: string[] = [];
    for (let offset = firstOffset; offset < total; offset += pageSize) {
        template.searchParams.set("offset", String(offset));
        urls.push(template.toString());
    }
    return urls;
}

export function isSameOrigin(link: string, reference: string): boolean {
    return new URL(link).origin === new URL(reference).origin;
}
