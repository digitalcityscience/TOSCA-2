/** Class of the invisible element a `mapScene` block renders to. */
export const SCENE_ANCHOR_CLASS = "geostory-scene-anchor";

interface MapSceneAnchorData {
    scene_id?: unknown;
}

interface MapSceneAnchorToolOptions {
    data?: MapSceneAnchorData;
}

/**
 * Read-only Editor.js tool for GeoStory `mapScene` blocks.
 *
 * @remarks
 * The block marks where the story map switches to a scene; it has no visible
 * output. It renders a zero-height element carrying `data-scene-id`, which the
 * scroll observer uses as its trigger. Registering this tool also keeps Editor.js
 * from drawing its "can't display this block" stub for the block.
 */
export default class EditorJsMapSceneAnchor {
    static readonly isReadOnlySupported = true;

    private readonly sceneId: string;

    constructor({ data = {} }: MapSceneAnchorToolOptions) {
        this.sceneId = typeof data.scene_id === "string" ? data.scene_id : "";
    }

    render(): HTMLElement {
        const anchor = document.createElement("div");
        anchor.className = SCENE_ANCHOR_CLASS;
        anchor.dataset.sceneId = this.sceneId;
        anchor.setAttribute("aria-hidden", "true");
        return anchor;
    }

    save(): { scene_id: string } {
        return { scene_id: this.sceneId };
    }
}
