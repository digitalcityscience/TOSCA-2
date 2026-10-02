import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { MqttClient } from "mqtt";
import type { ExternalDataSourceConfig } from "../config/externalDataSources";
import { useExternalDataSourcesStore } from "./externalDataSources";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import type { Feature } from "@helpers/geojson";
import { setExternalLayerFeatures } from "@helpers/externalLayers";
import { reportDeveloperError } from "@helpers/userFacingError";

export type LiveConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline" | "error";

export interface LiveObservation {
    phenomenonTime: string;
    result: unknown;
}

/** Topics per SUBSCRIBE packet, to stay well below broker packet limits. */
const SUBSCRIBE_BATCH_SIZE = 500;
/** Map layers are redrawn at most this often while observations stream in. */
const LAYER_FLUSH_INTERVAL_MS = 1000;

export function liveKey(sourceId: string, datastreamId: unknown): string {
    return `${sourceId}|${String(datastreamId)}`;
}

/** SensorThings MQTT topic for new observations of one datastream. */
export function datastreamTopic(version: string, datastreamId: number | string): string {
    const id = typeof datastreamId === "number" || /^\d+$/.test(datastreamId)
        ? String(datastreamId)
        : `'${datastreamId.replace(/'/g, "''")}'`;
    return `${version}/Datastreams(${id})/Observations`;
}

export function datastreamIdFromTopic(topic: string): string | undefined {
    const match = /\/Datastreams\((.+)\)\/Observations$/.exec(topic);
    if (match === null) return undefined;
    const raw = match[1];
    return raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
}

function isLiveSensorThingsLayer(layer: LayerObjectWithAttributes): boolean {
    return layer.externalSource?.type === "sensorthings" && layer.externalSource.sourceId !== undefined;
}

function featureDatastreamId(feature: Feature): string {
    return String(feature.properties?.datastream_id ?? feature.id);
}

/** Same encoding as the initial feature so popups/tables stay consistent. */
function displayResult(result: unknown): unknown {
    return typeof result === "object" && result !== null ? JSON.stringify(result) : result ?? null;
}

/**
 * Live observation updates for SensorThings datastreams that are on the map.
 *
 * One MQTT-over-WebSocket client per configured source (`mqttUrl`), with one
 * topic subscription per datastream on the map (servers commonly disable
 * collection-wide topics). Subscriptions follow the map: added with the
 * streams, removed with the layer. Incoming observations update the shared
 * `latest` values (shown in the sidebar) and the map features, batched to one
 * redraw per second.
 */
export const useSensorThingsLiveStore = defineStore("sensorThingsLive", () => {
    const mapStore = useMapStore();
    const externalSources = useExternalDataSourcesStore();

    const status = ref<Record<string, LiveConnectionStatus>>({});
    const subscribedCount = ref<Record<string, number>>({});
    const lastMessageAt = ref<Record<string, number>>({});
    const latest = ref<Record<string, LiveObservation>>({});

    const connections = new Map<string, { client: MqttClient, version: string, topics: Set<string> }>();
    const pendingConnections = new Map<string, Promise<void>>();
    const pendingLayerUpdates = new Set<string>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    function sourceById(sourceId: string): ExternalDataSourceConfig | undefined {
        return externalSources.sources.find((source) => source.id === sourceId);
    }

    /** Datastream ids on the map, grouped by source. */
    const desiredDatastreams = computed(() => {
        const bySource = new Map<string, Set<string>>();
        for (const layer of mapStore.layersOnMap) {
            if (!isLiveSensorThingsLayer(layer)) continue;
            const sourceId = layer.externalSource!.sourceId!;
            const ids = bySource.get(sourceId) ?? new Set<string>();
            for (const feature of layer.layerData?.features ?? []) ids.add(featureDatastreamId(feature));
            bySource.set(sourceId, ids);
        }
        return bySource;
    });
    /** Changes only when the set of datastreams changes, not on value updates. */
    const desiredSignature = computed(() => [...desiredDatastreams.value.entries()]
        .map(([sourceId, ids]) => `${sourceId}:${[...ids].sort().join(",")}`)
        .sort()
        .join(";"));

    function setStatus(sourceId: string, next: LiveConnectionStatus): void {
        status.value = { ...status.value, [sourceId]: next };
    }

    function onMessage(sourceId: string, topic: string, payload: Uint8Array): void {
        const datastreamId = datastreamIdFromTopic(topic);
        if (datastreamId === undefined) return;
        let observation: { phenomenonTime?: string, result?: unknown };
        try {
            observation = JSON.parse(new TextDecoder().decode(payload)) as typeof observation;
        } catch (error) {
            reportDeveloperError(`Parsing SensorThings MQTT message on ${topic}`, error);
            return;
        }
        if (typeof observation.phenomenonTime !== "string") return;
        latest.value[liveKey(sourceId, datastreamId)] = {
            phenomenonTime: observation.phenomenonTime,
            result: observation.result,
        };
        lastMessageAt.value = { ...lastMessageAt.value, [sourceId]: Date.now() };
        for (const layer of mapStore.layersOnMap) {
            if (layer.externalSource?.sourceId === sourceId && isLiveSensorThingsLayer(layer)) {
                pendingLayerUpdates.add(layer.id);
            }
        }
        flushTimer ??= setTimeout(flushLayerUpdates, LAYER_FLUSH_INTERVAL_MS);
    }

    /** Writes the latest values into the map features of the affected layers. */
    function flushLayerUpdates(): void {
        flushTimer = undefined;
        for (const layerId of pendingLayerUpdates) {
            const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
            const sourceId = record?.externalSource?.sourceId;
            if (record?.layerData === undefined || sourceId === undefined) continue;
            let changed = false;
            const features = record.layerData.features.map((feature) => {
                const observation = latest.value[liveKey(sourceId, featureDatastreamId(feature))];
                if (observation === undefined || feature.properties?.observed_at === observation.phenomenonTime) {
                    return feature;
                }
                changed = true;
                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        latest_value: displayResult(observation.result),
                        observed_at: observation.phenomenonTime,
                    },
                };
            });
            if (changed) {
                try {
                    setExternalLayerFeatures(mapStore, layerId, { type: "FeatureCollection", features });
                } catch (error) {
                    reportDeveloperError(`Applying live observations to ${layerId}`, error);
                }
            }
        }
        pendingLayerUpdates.clear();
    }

    async function connect(source: ExternalDataSourceConfig): Promise<void> {
        const baseUrl = await externalSources.getSensorThingsBaseUrl(source);
        const version = new URL(baseUrl).pathname.split("/").filter(Boolean).pop() ?? "v1.1";
        setStatus(source.id, "connecting");
        // Loaded on first use: most sessions never stream live values.
        const { default: mqtt } = await import("mqtt");
        const client = mqtt.connect(source.mqttUrl!, {
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 15000,
            clientId: `tosca-${Math.random().toString(16).slice(2, 10)}`,
        });
        client.on("connect", () => setStatus(source.id, "connected"));
        client.on("reconnect", () => setStatus(source.id, "reconnecting"));
        client.on("offline", () => setStatus(source.id, "offline"));
        client.on("error", (error) => {
            setStatus(source.id, "error");
            reportDeveloperError(`SensorThings MQTT connection to ${source.mqttUrl}`, error);
        });
        client.on("message", (topic, payload) => onMessage(source.id, topic, payload));
        connections.set(source.id, { client, version, topics: new Set() });
    }

    function updateSubscriptions(sourceId: string, datastreamIds: Set<string>): void {
        const connection = connections.get(sourceId);
        if (connection === undefined) return;
        const desired = new Set([...datastreamIds].map((id) => datastreamTopic(connection.version, id)));
        const toAdd = [...desired].filter((topic) => !connection.topics.has(topic));
        const toRemove = [...connection.topics].filter((topic) => !desired.has(topic));
        for (let index = 0; index < toAdd.length; index += SUBSCRIBE_BATCH_SIZE) {
            connection.client.subscribe(toAdd.slice(index, index + SUBSCRIBE_BATCH_SIZE), { qos: 0 });
        }
        if (toRemove.length > 0) connection.client.unsubscribe(toRemove);
        toAdd.forEach((topic) => connection.topics.add(topic));
        toRemove.forEach((topic) => {
            connection.topics.delete(topic);
            const id = datastreamIdFromTopic(topic);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            if (id !== undefined) delete latest.value[liveKey(sourceId, id)];
        });
        subscribedCount.value = { ...subscribedCount.value, [sourceId]: connection.topics.size };
    }

    function disconnect(sourceId: string): void {
        connections.get(sourceId)?.client.end(true);
        connections.delete(sourceId);
        const { [sourceId]: _status, ...restStatus } = status.value;
        const { [sourceId]: _count, ...restCount } = subscribedCount.value;
        status.value = restStatus;
        subscribedCount.value = restCount;
        latest.value = Object.fromEntries(
            Object.entries(latest.value).filter(([key]) => !key.startsWith(`${sourceId}|`))
        );
    }

    async function reconcile(): Promise<void> {
        const desired = desiredDatastreams.value;
        for (const sourceId of [...connections.keys()]) {
            if (!desired.has(sourceId)) disconnect(sourceId);
        }
        for (const sourceId of desired.keys()) {
            const source = sourceById(sourceId);
            if (source?.mqttUrl === undefined) continue;
            if (!connections.has(sourceId)) {
                let pending = pendingConnections.get(sourceId);
                if (pending === undefined) {
                    pending = connect(source).finally(() => pendingConnections.delete(sourceId));
                    pendingConnections.set(sourceId, pending);
                }
                try {
                    await pending;
                } catch (error) {
                    setStatus(sourceId, "error");
                    reportDeveloperError(`Starting live updates for ${source.title}`, error);
                    continue;
                }
            }
            // Re-read: the map may have changed while connecting.
            updateSubscriptions(sourceId, desiredDatastreams.value.get(sourceId) ?? new Set());
        }
    }

    watch(desiredSignature, () => {
        void reconcile();
    }, { immediate: true });

    /** Whether a source streams live values at all (has an `mqttUrl`). */
    function isLiveEnabled(sourceId: string): boolean {
        return sourceById(sourceId)?.mqttUrl !== undefined;
    }

    function latestFor(sourceId: string, datastreamId: number | string): LiveObservation | undefined {
        return latest.value[liveKey(sourceId, datastreamId)];
    }

    return {
        status,
        subscribedCount,
        lastMessageAt,
        latest,
        isLiveEnabled,
        latestFor,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSensorThingsLiveStore, import.meta.hot));
}
