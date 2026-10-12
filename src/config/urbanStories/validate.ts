import { FRONTEND_STYLE_PREFIX } from "./styles/fifteenMinute/types";
import { EQUITY_STYLE_PREFIX } from "./styles/transitEquity/constants";
import { isBezirkeLayer, isHeavyLayer } from "./layers";
import { URBAN_STORY_KEYS, type ExploreEntry, type UrbanStoryConfig } from "./types";

const MVT_STATUSES: readonly string[] = ["verified", "pending", "unavailable"];

/** Review columns that exist only on the legacy Stadtteile/units tables, never on Bezirke. */
const BEZIRKE_FORBIDDEN_ATTRIBUTE = /^ptr_(.+_flag|.+_reviewable|review_basis|review_status)$/;

function duplicates(values: string[]): string[] {
    return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function validateEntry(story: string, entry: ExploreEntry): string[] {
    const at = `${story}/${entry.key}`;
    const errors: string[] = [];
    // Config objects are plain data, so fields can still be wrong at runtime; check them explicitly.
    if ((entry.rendering as string) !== "vector-tiles") {
        errors.push(`${at}: rendering must be "vector-tiles", got "${String(entry.rendering)}"`);
    }
    if (!MVT_STATUSES.includes(entry.mvt as string)) {
        errors.push(`${at}: missing or invalid mvt status`);
    }
    if (isHeavyLayer(entry.layer) && entry.minZoom === undefined) {
        errors.push(`${at}: heavy layer ${entry.layer.workspace}:${entry.layer.layerName} needs a minZoom`);
    }
    const metricKeys = entry.metrics.map((option) => option.key);
    for (const key of duplicates(metricKeys)) errors.push(`${at}: duplicate metric key "${key}"`);
    if (entry.defaultMetric !== undefined && !metricKeys.includes(entry.defaultMetric)) {
        errors.push(`${at}: defaultMetric "${entry.defaultMetric}" is not among the metrics`);
    }
    if (entry.metrics.length > 0 && entry.defaultMetric === undefined) {
        errors.push(`${at}: entries with metrics need a defaultMetric`);
    }
    for (const option of entry.metrics) {
        if (entry.styleSource === "frontend") {
            const prefix = ["walkability-safety", "building-walking"].includes(story) ? "frontend:walkability:" : story === "transit-equity" ? EQUITY_STYLE_PREFIX : FRONTEND_STYLE_PREFIX;
            if (option.styleName === null || !option.styleName.startsWith(prefix) || option.styleVerifiedOn !== undefined) {
                errors.push(`${at}: metric "${option.key}" of a frontend-styled entry needs a local "${FRONTEND_STYLE_PREFIX}" style name and no catalog verification`);
            }
        } else if (option.styleName !== null && option.styleVerifiedOn === undefined) {
            errors.push(`${at}: metric "${option.key}" has style "${option.styleName}" that is not marked verified`);
        }
        if (!entry.requiredAttributes.includes(option.attribute)) {
            errors.push(`${at}: metric attribute "${option.attribute}" is missing from requiredAttributes`);
        }
        if (isBezirkeLayer(entry.layer) && BEZIRKE_FORBIDDEN_ATTRIBUTE.test(option.attribute)) {
            errors.push(`${at}: Bezirke have no review column "${option.attribute}"`);
        }
    }
    return errors;
}

/** Returns every contract violation in the given story configs (empty = valid). */
export function findStoryConfigErrors(stories: readonly UrbanStoryConfig[]): string[] {
    const errors: string[] = [];
    for (const key of duplicates(stories.map((story) => story.key))) errors.push(`duplicate story key "${key}"`);
    for (const story of stories) {
        if (!(URBAN_STORY_KEYS as readonly string[]).includes(story.key)) {
            errors.push(`unknown story key "${story.key}"`);
        }
        const entryKeys = story.explore.map((entry) => entry.key);
        for (const key of duplicates(entryKeys)) errors.push(`${story.key}: duplicate explore entry key "${key}"`);
        for (const key of duplicates(story.chapters.map((chapter) => chapter.chapterKey))) {
            errors.push(`${story.key}: duplicate chapter key "${key}"`);
        }
        for (const chapter of story.chapters) {
            for (const related of chapter.relatedExploreEntries) {
                if (!entryKeys.includes(related)) {
                    errors.push(`${story.key}/${chapter.chapterKey}: unknown related explore entry "${related}"`);
                }
            }
        }
        for (const chapter of story.chapters) {
            for (const shown of chapter.show ?? []) {
                const entry = story.explore.find((candidate) => candidate.key === shown.entryKey);
                const at = `${story.key}/${chapter.chapterKey}`;
                if (entry === undefined) errors.push(`${at}: unknown shown explore entry "${shown.entryKey}"`);
                else if (shown.metricKey !== undefined && !entry.metrics.some((option) => option.key === shown.metricKey)) {
                    errors.push(`${at}: shown entry "${shown.entryKey}" has no metric "${shown.metricKey}"`);
                }
            }
        }
        for (const entry of story.explore) errors.push(...validateEntry(story.key, entry));
    }
    return errors;
}

/** Throws with every violation listed when the configs break the contract. */
export function validateStoryConfigs(stories: readonly UrbanStoryConfig[]): void {
    const errors = findStoryConfigErrors(stories);
    if (errors.length > 0) {
        throw new Error(`Invalid Urban Stories config:\n- ${errors.join("\n- ")}`);
    }
}
