import { CompositeLayer, type DefaultProps, type GetPickingInfoParams, type Layer, type PickingInfo } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import { STOP_COLORS, STOP_KINDS, tripProperties, type ReplayData, type Rgba } from "./simulationReplay";

export interface SimulationReplayLayerProps {
    replay: ReplayData | null;
    /** Seconds since the run's start. */
    currentTime: number;
    /** Seconds of trail behind each agent. */
    trailLength: number;
    /** One colour per trip. */
    tripColors: Rgba[];
    /** Bump to recolour without changing `tripColors`' identity. */
    colorVersion: number;
    showStops: boolean;
}

const defaultProps: DefaultProps<SimulationReplayLayerProps> = {
    replay: { type: "object", value: null, compare: true },
    currentTime: { type: "number", value: 0 },
    trailLength: { type: "number", value: 120 },
    tripColors: { type: "array", value: [], compare: true },
    colorVersion: { type: "number", value: 0 },
    showStops: { type: "boolean", value: true },
};

const stopFilter = new DataFilterExtension({ filterSize: 2 });
const STOP_LABELS: Record<(typeof STOP_KINDS)[number], string> = {
    red_wait: "red light",
    queued: "queued",
    discharging: "crossing",
};

/**
 * Animated agents for a GeoSimulation replay: trips as fading trails, plus the
 * signal stops that are active at `currentTime` (filtered on the GPU, so a
 * frame only updates two uniforms).
 */
export class SimulationReplayLayer extends CompositeLayer<SimulationReplayLayerProps> {
    static layerName = "SimulationReplayLayer";
    static defaultProps = defaultProps;

    renderLayers(): Layer[] {
        const { replay, currentTime, trailLength, tripColors, colorVersion, showStops } = this.props;
        if (replay === null) return [];
        const layers: Layer[] = [
            new TripsLayer(this.getSubLayerProps({
                id: "trips",
                data: {
                    length: replay.tripCount,
                    startIndices: replay.startIndices,
                    attributes: {
                        getPath: { value: replay.positions, size: 2 },
                        getTimestamps: { value: replay.timestamps, size: 1 },
                    },
                },
                _pathType: "open",
                positionFormat: "XY",
                getColor: (_: unknown, { index }: { index: number }) => tripColors[index] ?? [37, 99, 235, 255],
                updateTriggers: { getColor: colorVersion },
                currentTime,
                trailLength,
                fadeTrail: true,
                widthUnits: "pixels",
                widthMinPixels: 2.5,
                getWidth: 3,
                capRounded: true,
                jointRounded: true,
                pickable: true,
            })),
        ];
        if (showStops && replay.stopCount > 0) {
            layers.push(new ScatterplotLayer(this.getSubLayerProps({
                id: "stops",
                data: {
                    length: replay.stopCount,
                    attributes: {
                        getPosition: { value: replay.stopPositions, size: 2 },
                        getFilterValue: { value: replay.stopTimes, size: 2 },
                    },
                },
                getFillColor: (_: unknown, { index }: { index: number }) => STOP_COLORS[STOP_KINDS[replay.stopKinds[index]]],
                getRadius: 6,
                radiusUnits: "pixels",
                stroked: true,
                getLineColor: [255, 255, 255, 230],
                lineWidthMinPixels: 1,
                // Show a stop while t0 <= currentTime <= t1.
                extensions: [stopFilter],
                filterRange: [[-1, currentTime], [currentTime, replay.timeEnd + 1]],
                pickable: true,
            })));
        }
        return layers;
    }

    getPickingInfo({ info, sourceLayer }: GetPickingInfoParams): PickingInfo {
        const replay = this.props.replay;
        if (replay === null || info.index < 0) return info;
        const sublayer = (sourceLayer ?? info.sourceLayer)?.id ?? "";
        if (sublayer.endsWith("-trips")) {
            info.object = { properties: tripProperties(replay, info.index) };
        } else if (sublayer.endsWith("-stops")) {
            const trip = replay.stopTrips[info.index];
            info.object = {
                properties: {
                    ...(trip >= 0 ? tripProperties(replay, trip) : {}),
                    stop: STOP_LABELS[STOP_KINDS[replay.stopKinds[info.index]]],
                    seconds: Math.round(replay.stopTimes[info.index * 2 + 1] - replay.stopTimes[info.index * 2]),
                },
            };
        }
        return info;
    }
}
