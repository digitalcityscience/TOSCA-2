export interface EditorJsDescriptionListItem {
    content: string;
    items?: EditorJsDescriptionListItem[];
}

export interface EditorJsDescriptionBlock {
    type: "paragraph" | "header" | "list" | string;
    data?: {
        text?: string;
        level?: number;
        style?: "ordered" | "unordered";
        items?: EditorJsDescriptionListItem[];
    };
}

export interface EditorJsDescriptionContent {
    blocks?: EditorJsDescriptionBlock[];
}

const ALLOWED_INLINE_TAGS = new Set(["A", "STRONG", "EM", "CODE", "BR"]);
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** Render the constrained backend description format without booting Editor.js. */
export function descriptionDocumentToHtml(
    content?: EditorJsDescriptionContent | null
): string {
    return (content?.blocks ?? []).map((block) => {
        const data = block.data ?? {};
        if (block.type === "paragraph") {
            return `<p>${sanitizeDescriptionInlineHtml(data.text ?? "")}</p>`;
        }
        if (block.type === "header" && [2, 3, 4].includes(data.level ?? 0)) {
            const level = data.level as 2 | 3 | 4;
            return `<h${level}>${sanitizeDescriptionInlineHtml(data.text ?? "")}</h${level}>`;
        }
        if (block.type === "list") {
            return renderList(data.items ?? [], data.style === "ordered");
        }
        return "";
    }).join("");
}

/** Keep only the inline tags and link schemes accepted by the backend. */
export function sanitizeDescriptionInlineHtml(value: string): string {
    if (typeof document === "undefined") {
        return escapeHtml(value);
    }

    const input = document.createElement("template");
    input.innerHTML = value;
    const output = document.createElement("div");
    appendSafeChildren(input.content, output);
    return output.innerHTML;
}

function renderList(items: EditorJsDescriptionListItem[], ordered: boolean): string {
    const tag = ordered ? "ol" : "ul";
    const entries = items.map((item) => {
        const nested = item.items?.length
            ? renderList(item.items, ordered)
            : "";
        return `<li><span>${sanitizeDescriptionInlineHtml(item.content ?? "")}</span>${nested}</li>`;
    }).join("");
    return `<${tag}>${entries}</${tag}>`;
}

function appendSafeChildren(source: ParentNode, target: HTMLElement): void {
    source.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            target.appendChild(document.createTextNode(node.textContent ?? ""));
            return;
        }
        if (!(node instanceof HTMLElement)) return;

        if (!ALLOWED_INLINE_TAGS.has(node.tagName)) {
            appendSafeChildren(node, target);
            return;
        }

        const clean = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === "A") {
            const href = node.getAttribute("href");
            if (href !== null && isSafeHref(href)) clean.setAttribute("href", href);
            const title = node.getAttribute("title");
            if (title !== null) clean.setAttribute("title", title);
        }
        appendSafeChildren(node, clean);
        target.appendChild(clean);
    });
}

function isSafeHref(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    try {
        const parsed = new URL(trimmed, window.location.origin);
        return trimmed.startsWith("/")
      || trimmed.startsWith("#")
      || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      || SAFE_LINK_SCHEMES.has(parsed.protocol);
    } catch {
        return false;
    }
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}
