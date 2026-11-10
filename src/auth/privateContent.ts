import { onBeforeUnmount } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import { useI18n } from "vue-i18n";
import { authFetch, shouldSendToken } from "./authFetch";
import { authSession, type SessionChangeReason } from "./session";
import { resolveBackendUrl } from "../store/backend";
import { useToast } from "../core/helpers/toast";
import {
    buildCatalogResourceUrl,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
} from "../store/geoserver";
import { buildComparisonDetailUrl, buildRunDetailUrl } from "../store/geosimulation";
import { type LayerObjectWithAttributes, useMapStore } from "../store/map";

/*
 * What happens to private content when the user logs out (or the session
 * expires): only what an anonymous visitor may not read goes away. Public
 * layers, filters and open public items stay as they are.
 */

type LayerDetail = GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail;

/**
 * Backend URLs that decide whether a layer may stay: every inner list must
 * have at least one URL an anonymous visitor can read. `"keep"` means the
 * layer's data does not depend on the user (drawings, buffers, public
 * third-party services); `"remove"` means its origin is unknown, so it is
 * removed to be safe.
 */
export type LayerAccessChecks = URL[][] | "keep" | "remove";

function catalogResourceUrl(detail: LayerDetail | undefined): URL | undefined {
    if (detail?.catalog === undefined) return undefined;
    const name = "featureType" in detail ? detail.featureType?.name : detail.coverage?.name;
    if (name === undefined || name === "") return undefined;
    return buildCatalogResourceUrl(detail.catalog.provider.id, detail.catalog.workspace_name, name);
}

export function layerAccessChecks(layer: LayerObjectWithAttributes): LayerAccessChecks {
    if (layer.externalSource !== undefined) return "keep";
    if (layer.simulationOutput !== undefined) {
        // Output layers are keyed by a run id or, for difference layers, a comparison id.
        const ownerId = layer.simulationOutput.runId;
        return [[buildRunDetailUrl(ownerId), buildComparisonDetailUrl(ownerId)]];
    }
    if (layer.logicalKind === "group" && layer.groupManifest !== undefined) {
        const members = layer.groupManifest.members.map((member) => member.resource_href
            ? resolveBackendUrl(member.resource_href)
            : catalogResourceUrl(member.details));
        if (members.length === 0 || members.some((url) => url === undefined)) return "remove";
        return members.map((url) => [url as URL]);
    }
    if (layer.details !== undefined) {
        const url = catalogResourceUrl(layer.details);
        return url === undefined ? "remove" : [[url]];
    }
    if (layer.tilesetUrl !== undefined) return shouldSendToken(layer.tilesetUrl) ? "remove" : "keep";
    // GeoJSON the user drew or derived on the page (drawings, buffers,
    // participation sketches): not loaded with the user's rights.
    return "keep";
}

/** True when an anonymous request to `url` succeeds; errors count as "no" (fail safe). */
async function readableAnonymously(url: URL, cache: Map<string, Promise<boolean>>): Promise<boolean> {
    const key = url.toString();
    let pending = cache.get(key);
    if (pending === undefined) {
        pending = authFetch(url, { method: "GET", headers: { Accept: "application/json" } })
            .then((response) => {
                void response.body?.cancel().catch(() => undefined);
                return response.ok;
            })
            .catch(() => false);
        cache.set(key, pending);
    }
    return await pending;
}

/** The layers among `layers` that an anonymous visitor may not see. */
export async function layersHiddenFromAnonymous(layers: LayerObjectWithAttributes[]): Promise<LayerObjectWithAttributes[]> {
    const cache = new Map<string, Promise<boolean>>();
    const verdicts = await Promise.all(layers.map(async (layer) => {
        const checks = layerAccessChecks(layer);
        if (checks === "keep") return false;
        if (checks === "remove") return true;
        const results = await Promise.all(checks.map(async (alternatives) => {
            for (const url of alternatives) {
                if (await readableAnonymously(url, cache)) return true;
            }
            return false;
        }));
        return results.some((readable) => !readable);
    }));
    return layers.filter((_, index) => verdicts[index]);
}

function isLoss(reason: SessionChangeReason): boolean {
    return reason === "logout" || reason === "expired";
}

/**
 * After logout, removes the map layers that were added while signed in and
 * that an anonymous visitor may not read. Call once at start-up.
 */
export function installPrivateLayerGuard(): () => void {
    return authSession.onSessionChange((reason) => {
        if (!isLoss(reason)) return;
        const sessionKey = authSession.currentSessionKey();
        const mapStore = useMapStore();
        const candidates = mapStore.layersOnMap.filter((layer) => layer.addedWhileSignedIn === true);
        if (candidates.length === 0) return;
        void layersHiddenFromAnonymous(candidates).then(async (hidden) => {
            // Signed in again meanwhile: the layers are readable again.
            if (sessionKey !== authSession.currentSessionKey()) return;
            const stillOnMap = hidden.filter((layer) => mapStore.layersOnMap.some((item) => item.id === layer.id));
            await mapStore.removeLayers(stillOnMap, { notifyPrivate: true });
        });
    });
}

/**
 * For a detail view (story, event, simulation run…): when the user logs out
 * while it is open and an anonymous visitor may not read the item, show a
 * notice and go back to the list. Public items stay open.
 */
export function useCloseWhenPrivateAfterLogout(
    itemUrl: () => URL | undefined,
    listRoute: RouteLocationRaw
): void {
    const router = useRouter();
    const toast = useToast();
    const { t } = useI18n();
    const stop = authSession.onSessionChange((reason) => {
        if (!isLoss(reason)) return;
        const url = itemUrl();
        if (url === undefined) return;
        const sessionKey = authSession.currentSessionKey();
        void readableAnonymously(url, new Map()).then((readable) => {
            if (readable || sessionKey !== authSession.currentSessionKey()) return;
            toast.add({ severity: "info", summary: t("auth.privateItemClosedTitle"), detail: t("auth.privateItemClosedDetail"), life: 6000 });
            void router.replace(listRoute);
        });
    });
    onBeforeUnmount(stop);
}
