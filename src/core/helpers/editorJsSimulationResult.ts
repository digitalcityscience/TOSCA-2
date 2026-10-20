/** Class of the host element populated by the Vue simulation-result renderer. */
export const SIMULATION_RESULT_CLASS = "geostory-simulation-result";

interface SimulationResultData { presentation_id?: unknown }

export default class EditorJsSimulationResult {
    static readonly isReadOnlySupported = true;
    private readonly presentationId: string;

    constructor({ data = {} }: { data?: SimulationResultData }) {
        this.presentationId = typeof data.presentation_id === "string" ? data.presentation_id : "";
    }

    render(): HTMLElement {
        const host = document.createElement("div");
        host.className = SIMULATION_RESULT_CLASS;
        host.dataset.presentationId = this.presentationId;
        return host;
    }

    save(): { presentation_id: string } {
        return { presentation_id: this.presentationId };
    }
}
