import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import type { CollabChannel } from "../helpers/collabChannel";
import { useCollabSessionStore } from "./collabSession";
import { COLLAB_SNAPSHOT_STORAGE_KEY, useCollabSyncStore, type CollabSyncMessage } from "./collabSync";

/** Deterministic in-memory {@link CollabChannel} pair for testing, standing in for `BroadcastChannel`. */
class PairedTestChannel<TMessage> implements CollabChannel<TMessage> {
    private listeners: Array<(message: TMessage) => void> = [];
    private peer: PairedTestChannel<TMessage> | undefined;

    static createPair<T>(): [PairedTestChannel<T>, PairedTestChannel<T>] {
        const a = new PairedTestChannel<T>();
        const b = new PairedTestChannel<T>();
        a.peer = b;
        b.peer = a;
        return [a, b];
    }

    publish(message: TMessage): void {
        this.peer?.deliver(message);
    }

    private deliver(message: TMessage): void {
        for (const listener of this.listeners) {
            listener(message);
        }
    }

    subscribe(listener: (message: TMessage) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((candidate) => candidate !== listener);
        };
    }

    close(): void {
        this.listeners = [];
    }
}

describe("collabSync store", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("table applies Control's initial snapshot and later patches", async () => {
        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();

        controlSession.base.objects = [{ id: "b1" }];

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        expect(tableSession.base.objects).toEqual([{ id: "b1" }]);

        controlSession.tableRender.visibleLayerIds.push("collabTrackedFootprints-fill");
        await nextTick();

        expect(tableSession.tableRender.visibleLayerIds).toEqual(["collabTrackedFootprints-fill"]);
        expect(tableSession.base.objects).toEqual([{ id: "b1" }]);

        controlSync.stop();
        tableSync.stop();
    });

    test("table never writes to Control's session (pure subscriber)", async () => {
        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        tableSession.tableRender.visibleLayerIds.push("table-only");
        await nextTick();

        expect(controlSession.tableRender.visibleLayerIds).toEqual([]);

        controlSync.stop();
        tableSync.stop();
    });

    test("Control mirrors its snapshot to localStorage and a fresh Table recovers it before syncing", async () => {
        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();
        controlSession.base.objects = [{ id: "persisted" }];

        const [controlChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        await nextTick();

        expect(localStorage.getItem(COLLAB_SNAPSHOT_STORAGE_KEY)).not.toBeNull();

        setActivePinia(createPinia());
        const reopenedTableSession = useCollabSessionStore();
        const reopenedTableSync = useCollabSyncStore();
        const disconnectedChannel = new PairedTestChannel<CollabSyncMessage>();
        reopenedTableSync.startAsTable(disconnectedChannel);

        expect(reopenedTableSession.base.objects).toEqual([{ id: "persisted" }]);

        controlSync.stop();
        reopenedTableSync.stop();
    });

    test("Table's tableStatus reaches Control via onTableStatus, without ever landing in session.calibration (grilling doc Q1)", async () => {
        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();

        setActivePinia(createPinia());
        const tableSync = useCollabSyncStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        const received: Array<{ ready: boolean; markerPositions: Record<number, [number, number]> }> = [];
        controlSync.onTableStatus((ready, markerPositions) => received.push({ ready, markerPositions }));

        tableSync.publishTableStatus(false, { 200: [10, 20] });
        expect(received).toEqual([{ ready: false, markerPositions: { 200: [10, 20] } }]);

        tableSync.publishTableStatus(true, { 200: [10, 20], 201: [30, 40], 202: [50, 60], 203: [70, 80] });
        expect(received).toHaveLength(2);
        expect(received[1]).toEqual({ ready: true, markerPositions: { 200: [10, 20], 201: [30, 40], 202: [50, 60], 203: [70, 80] } });

        // Never written into the broadcast session slice — Control is its only writer (CollabCalibrationState's contract).
        expect(controlSession.calibration.mapCalibrationMarkerIdsSeen).toEqual([]);

        controlSync.stop();
        tableSync.stop();
    });

    test("resetPositionsToken syncs Control -> Table like any other calibration field (grilling doc Q2)", async () => {
        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        controlSession.calibration.resetPositionsToken += 1;
        await nextTick();

        expect(tableSession.calibration.resetPositionsToken).toBe(1);

        controlSync.stop();
        tableSync.stop();
    });

    test("table reports disconnected once the heartbeat goes quiet", () => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        const tableSync = useCollabSyncStore();
        const channel = new PairedTestChannel<CollabSyncMessage>();

        tableSync.startAsTable(channel);
        expect(tableSync.connected).toBe(true);

        vi.advanceTimersByTime(10_000);

        expect(tableSync.connected).toBe(false);

        tableSync.stop();
    });
});
