import { type EventTaxonomyChipGroup } from "@store/events";

export interface TaxonomyChipPreview {
    visible: string[];
    hiddenCount: number;
}

export function taxonomyChipLabels(value: unknown): string[] {
    return normalizeTaxonomyAssignments(value).flatMap((assignment) => {
        return assignment.terms.map((term) => term.label);
    });
}

export function previewTaxonomyChips(value: unknown, limit: number): TaxonomyChipPreview {
    const labels = taxonomyChipLabels(value);
    return {
        visible: labels.slice(0, limit),
        hiddenCount: Math.max(labels.length - limit, 0),
    };
}

function normalizeTaxonomyAssignments(value: unknown): EventTaxonomyChipGroup[] {
    if (Array.isArray(value)) {
        return value.filter(isTaxonomyChipGroup);
    }
    if (typeof value !== "string" || value === "") {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(isTaxonomyChipGroup) : [];
    } catch {
        return [];
    }
}

function isTaxonomyChipGroup(value: unknown): value is EventTaxonomyChipGroup {
    if (typeof value !== "object" || value === null || !("terms" in value)) {
        return false;
    }
    const terms = (value as { terms: unknown }).terms;
    return Array.isArray(terms);
}
