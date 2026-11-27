import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import { authSession } from "../auth/session";
import { createMapBridge, readBridgeUrl, type BridgeState, type MapBridge } from "../mcp/bridge";
import { startSelectionTracking, stopSelectionTracking } from "../mcp/selection";

/**
 * "Connect AI assistant": lets an assistant the user added in ChatGPT or Claude
 * (TOSCA MCP server) work on the map in this tab. Off unless the deployment
 * sets `VITE_MCP_BRIDGE_URL`, and only for signed-in users.
 */
export const useAiBridgeStore = defineStore("aiBridge", () => {
    const url = readBridgeUrl();
    const state = ref<BridgeState>({ status: "off", commandCount: 0 });
    let bridge: MapBridge | undefined;

    /** The deployment has an MCP server to connect to. */
    const available = computed(() => url !== undefined);
    const active = computed(() => state.value.status !== "off" && state.value.status !== "error");

    function ensureBridge(): MapBridge | undefined {
        if (url === undefined) return undefined;
        if (bridge === undefined) {
            bridge = createMapBridge({
                url,
                getAccessToken: () => authSession.getAccessToken(),
                onState: (next) => {
                    state.value = next;
                    // Map clicks are remembered (for get_selected_features) only while the connection is on.
                    if (next.status === "off" || next.status === "error") stopSelectionTracking();
                    else startSelectionTracking();
                },
            });
            // Another user (or nobody) is signed in now: the pairing belonged to the old session.
            authSession.onSessionChange(() => bridge?.disconnect());
        }
        return bridge;
    }

    function connect(): void {
        ensureBridge()?.connect();
    }

    function disconnect(): void {
        bridge?.disconnect();
    }

    function unpair(): void {
        bridge?.unpair();
    }

    function requestNewCode(): void {
        bridge?.requestNewCode();
    }

    return { available, active, state, connect, disconnect, unpair, requestNewCode };
});

/* eslint-disable */
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useAiBridgeStore, import.meta.hot));
}
