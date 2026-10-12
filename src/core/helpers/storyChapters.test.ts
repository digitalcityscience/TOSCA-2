import { describe, expect, test } from "vitest";
import type { StoryChapter } from "../../config/urbanStories";
import { matchChapters, splitStoryIntoChapters } from "./storyChapters";
import { storyDetail } from "../../components/UrbanStories/__fixtures__/runHarness";

const chapter = (chapterKey: string, order: number, id: string | null = null): StoryChapter => ({
    chapterKey,
    title: { en: chapterKey, de: chapterKey },
    scene: { id, order },
    relatedExploreEntries: [],
});

const texts = (blocks: Array<{ data?: Record<string, unknown> }>): unknown[] => blocks.map((block) => block.data?.text);

describe("splitStoryIntoChapters", () => {
    test("separates the introduction and slices narrative per scene in anchor order", () => {
        const split = splitStoryIntoChapters(storyDetail(3));

        expect(texts(split.intro)).toEqual(["Intro text"]);
        expect(split.chapters.map((slice) => slice.sceneId)).toEqual(["scene-1", "scene-2", "scene-3"]);
        expect(split.chapters.map((slice) => texts(slice.blocks))).toEqual([["Narrative 1"], ["Narrative 2"], ["Narrative 3"]]);
    });

    test("a story with no anchors is introduction only and gives every scene an empty slice", () => {
        const detail = storyDetail(2);
        detail.content.blocks = detail.content.blocks.filter((block) => block.type !== "mapScene");

        const split = splitStoryIntoChapters(detail);

        expect(split.intro).toHaveLength(3);
        expect(split.chapters.every((slice) => slice.blocks.length === 0)).toBe(true);
    });

    test("a scene without an anchor gets an empty slice (caption fallback)", () => {
        const detail = storyDetail(3);
        detail.content.blocks = detail.content.blocks.filter((block) => !(block.type === "mapScene" && block.data?.scene_id === "scene-2"));

        const split = splitStoryIntoChapters(detail);

        expect(split.chapters.find((slice) => slice.sceneId === "scene-2")?.blocks).toEqual([]);
        // The text that followed the removed anchor now belongs to the previous chapter.
        expect(texts(split.chapters[0].blocks)).toEqual(["Narrative 1", "Narrative 2"]);
    });

    test("blocks after the last anchor belong to the last chapter, and a repeat anchor is ignored", () => {
        const detail = storyDetail(2);
        detail.content.blocks.push(
            { type: "mapScene", data: { scene_id: "scene-1" } },
            { type: "paragraph", data: { text: "Closing" } }
        );

        const split = splitStoryIntoChapters(detail);

        expect(texts(split.chapters[1].blocks)).toEqual(["Narrative 2", "Closing"]);
        expect(texts(split.chapters[0].blocks)).toEqual(["Narrative 1"]);
    });

    test("anchors out of scene order still give each scene its own text", () => {
        const detail = storyDetail(2);
        const [intro, a1, p1, a2, p2] = detail.content.blocks;
        detail.content.blocks = [intro, a2, p2, a1, p1];

        const split = splitStoryIntoChapters(detail);

        expect(split.chapters.map((slice) => [slice.sceneId, texts(slice.blocks)])).toEqual([
            ["scene-1", ["Narrative 1"]],
            ["scene-2", ["Narrative 2"]],
        ]);
    });
});

describe("matchChapters", () => {
    test("matches by scene id first", () => {
        const { matches, warnings } = matchChapters(storyDetail(2), [chapter("b", 1, "scene-2"), chapter("a", 2, "scene-1")]);

        expect(matches.map((match) => [match.sceneId, match.chapter?.chapterKey])).toEqual([["scene-1", "a"], ["scene-2", "b"]]);
        expect(warnings).toEqual([]);
    });

    test("falls back to the 1-based scene position, whatever the backend order values are", () => {
        const { matches } = matchChapters(storyDetail(3), [chapter("a", 1), chapter("b", 2), chapter("c", 3)]);

        expect(matches.map((match) => match.chapter?.chapterKey)).toEqual(["a", "b", "c"]);
    });

    test("warns on a count mismatch and an unknown scene id, leaving surplus scenes unmatched", () => {
        const { matches, warnings } = matchChapters(storyDetail(3), [chapter("a", 1), chapter("ghost", 2, "nope")]);

        expect(matches.map((match) => match.chapter?.chapterKey)).toEqual(["a", undefined, undefined]);
        expect(warnings.join("\n")).toContain("does not contain");
        expect(warnings.join("\n")).toContain("3 scenes but 2 chapters");
    });

    test("an id match is never taken over by an order match", () => {
        const { matches } = matchChapters(storyDetail(2), [chapter("by-id", 2, "scene-1"), chapter("by-order", 1)]);

        // "by-order" wants position 1, which "by-id" already holds: it stays unmatched with a warning.
        expect(matches[0].chapter?.chapterKey).toBe("by-id");
        expect(matches[1].chapter).toBeUndefined();
    });
});
