import { sanitizeDescriptionInlineHtml } from "./editorJsDescription";

interface ReadonlyListItem {
    content?: unknown;
    text?: unknown;
    checked?: unknown;
    items?: unknown;
}

interface ReadonlyListData {
    style?: unknown;
    items?: unknown;
}

interface ReadonlyListToolOptions {
    data?: ReadonlyListData;
}

/**
 * A deliberately small Editor.js list tool for public read-only content.
 *
 * @editorjs/list has changed its saved-data contract between releases. This
 * renderer accepts both the old string/checklist formats and the newer nested
 * format so published stories remain readable after frontend upgrades.
 */
export default class EditorJsReadonlyList {
    static readonly isReadOnlySupported = true;

    private readonly data: ReadonlyListData;

    constructor({ data = {} }: ReadonlyListToolOptions) {
        this.data = data;
    }

    render(): HTMLElement {
        return renderList(this.data.items, this.data.style);
    }

    save(): Record<string, unknown> {
        return { ...this.data };
    }
}

function renderList(items: unknown, style: unknown): HTMLElement {
    const ordered = style === "ordered";
    const checklist = style === "checklist";
    const list = document.createElement(ordered ? "ol" : "ul");
    list.className = [
        "editorjs-readonly-list",
        ordered ? "editorjs-readonly-list--ordered" : "editorjs-readonly-list--unordered",
        checklist ? "editorjs-readonly-list--checklist" : "",
    ].filter(Boolean).join(" ");

    asItems(items).forEach((item) => {
        const element = document.createElement("li");
        element.className = "editorjs-readonly-list__item";

        if (checklist) {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.disabled = true;
            checkbox.checked = itemChecked(item);
            checkbox.className = "editorjs-readonly-list__checkbox";
            element.appendChild(checkbox);
        }

        const content = document.createElement("span");
        content.className = "editorjs-readonly-list__content";
        content.innerHTML = sanitizeDescriptionInlineHtml(itemContent(item));
        element.appendChild(content);

        const children = itemChildren(item);
        if (children.length > 0) {
            element.appendChild(renderList(children, style));
        }
        list.appendChild(element);
    });

    return list;
}

function asItems(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    // Some older integrations serialized the items field independently.
    if (typeof value === "string") {
        try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return [];
}

function itemContent(item: unknown): string {
    if (typeof item === "string" || typeof item === "number") {
        return String(item);
    }
    if (!isListItem(item)) {
        return "";
    }
    const value = item.content ?? item.text ?? "";
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function itemChildren(item: unknown): unknown[] {
    return isListItem(item) ? asItems(item.items) : [];
}

function itemChecked(item: unknown): boolean {
    if (!isListItem(item)) {
        return false;
    }
    if (typeof item.checked === "boolean") {
        return item.checked;
    }
    if (isListItem(item.meta) && typeof item.meta.checked === "boolean") {
        return item.meta.checked;
    }
    return false;
}

function isListItem(value: unknown): value is ReadonlyListItem & { meta?: unknown } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
