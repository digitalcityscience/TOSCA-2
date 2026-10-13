import {
    getStoryAnchors,
    isMapSceneBlock,
    sortedScenes,
    type GeoStoryDetail,
    type GeoStoryEditorBlock,
} from "@store/geostory";
import type { StoryChapter } from "../../config/urbanStories/types";

export interface ChapterSlice {
    sceneId: string;
    /** The narrative blocks between this scene's anchor and the next anchor (anchor blocks excluded). */
    blocks: GeoStoryEditorBlock[];
}

export interface StoryChapterSplit {
    /** Blocks before the first anchor. */
    intro: GeoStoryEditorBlock[];
    /** One slice per scene, in scene order. A scene without an anchor gets an empty slice. */
    chapters: ChapterSlice[];
}

/**
 * Slice a story's Editor.js blocks into one narrative per scene.
 *
 * @remarks
 * Slices follow content order, scenes follow scene order, so a story whose anchors are not in
 * scene order still gives every scene the text that sits under its own anchor. Blocks after the
 * last anchor belong to the last anchored chapter. Repeat anchors for one scene are ignored
 * (`getStoryAnchors` keeps the first).
 */
export function splitStoryIntoChapters(
    detail: Pick<GeoStoryDetail, "content" | "scenes">
): StoryChapterSplit {
    const blocks = detail.content?.blocks ?? [];
    const anchors = getStoryAnchors(detail);
    const narrative = (from: number, to: number): GeoStoryEditorBlock[] => (
        blocks.slice(from, to).filter((block) => !isMapSceneBlock(block))
    );
    const intro = narrative(0, anchors[0]?.blockIndex ?? blocks.length);
    const slices = new Map<string, GeoStoryEditorBlock[]>();
    anchors.forEach((anchor, index) => {
        slices.set(anchor.sceneId, narrative(anchor.blockIndex + 1, anchors[index + 1]?.blockIndex ?? blocks.length));
    });
    return {
        intro,
        chapters: sortedScenes(detail).map((scene) => ({ sceneId: scene.id, blocks: slices.get(scene.id) ?? [] })),
    };
}

export interface ChapterMatch {
    sceneId: string;
    /** The configured chapter for this scene, if any. */
    chapter?: StoryChapter;
}

export interface ChapterMatching {
    matches: ChapterMatch[];
    /** Developer-facing mismatches (never shown to users). */
    warnings: string[];
}

/**
 * Pair backend scenes with the configured chapters.
 *
 * @remarks
 * A chapter claims a scene by `scene.id` when set. Remaining chapters claim a scene by
 * `scene.order`, which is the 1-based position in the story's scene order (backend `order`
 * values are not guaranteed to start at 1, see the scene fixture). One chapter matches one scene.
 */
export function matchChapters(
    detail: Pick<GeoStoryDetail, "scenes">,
    chapters: readonly StoryChapter[]
): ChapterMatching {
    const scenes = sortedScenes(detail);
    const warnings: string[] = [];
    const claimed = new Set<string>();
    const byScene = new Map<string, StoryChapter>();

    for (const chapter of chapters) {
        if (chapter.scene.id === null) continue;
        const scene = scenes.find((candidate) => candidate.id === chapter.scene.id);
        if (scene === undefined) {
            warnings.push(`Chapter "${chapter.chapterKey}" names scene ${chapter.scene.id}, which the story does not contain`);
            continue;
        }
        if (byScene.has(scene.id)) {
            warnings.push(`Scene ${scene.id} is claimed by more than one chapter`);
            continue;
        }
        byScene.set(scene.id, chapter);
        claimed.add(chapter.chapterKey);
    }
    for (const chapter of chapters) {
        if (claimed.has(chapter.chapterKey) || chapter.scene.id !== null) continue;
        const scene = scenes[chapter.scene.order - 1];
        if (scene === undefined || byScene.has(scene.id)) {
            warnings.push(`Chapter "${chapter.chapterKey}" (order ${chapter.scene.order}) has no free scene`);
            continue;
        }
        byScene.set(scene.id, chapter);
        claimed.add(chapter.chapterKey);
    }
    if (scenes.length !== chapters.length) {
        warnings.push(`Story has ${scenes.length} scenes but ${chapters.length} chapters are configured`);
    }
    return {
        matches: scenes.map((scene) => ({ sceneId: scene.id, chapter: byScene.get(scene.id) })),
        warnings,
    };
}
